import type { HostRecord, RpcEnvelope } from "~~/shared/types";
import { INITIAL_TURN_PAGE_LIMIT } from "~~/shared/config";
import { isAppServerSubAgentThread } from "~~/shared/runtime/app-server";
import {
  runtimeStatusFromAppThreadStatus,
  runtimeStatusFromSnapshotState,
} from "~~/shared/thread-runtime-status";
import { recordFromUnknown } from "~~/shared/utils/records";
import { CodexRpcClient } from "../infra/rpc";
import { bindGatewayUser } from "../state/memory";
import { threadSnapshotStore } from "../state/thread-snapshots";
import { threadRuntimeEvents } from "./thread-runtime-events";
import type { ThreadOpenSnapshot } from "./types";
import { createThreadNotificationResolvers } from "./notification-rpc-resolvers";

export class ThreadController {
  readonly client: CodexRpcClient;
  private operationQueue: Promise<unknown> = Promise.resolve();
  private connected = false;
  private subscribed = false;
  private closed = false;
  private activeMainThread = false;
  private subAgentThread = false;

  constructor(
    readonly host: HostRecord,
    readonly threadId: string,
    client?: CodexRpcClient,
    connected = false,
    subscribed = false,
    private readonly ownsClient = true,
    private readonly onClose?: () => void,
  ) {
    this.client = client ?? new CodexRpcClient(host);
    this.connected = connected;
    this.subscribed = subscribed;
    const cachedSnapshot = threadSnapshotStore.get(host.id, threadId);
    if (cachedSnapshot !== null) this.updateMonitoringStateFromSnapshot(cachedSnapshot);
    if (this.ownsClient) {
      this.client.on(
        "notification",
        bindGatewayUser((message: RpcEnvelope) => this.handleNotification(message)),
      );
      this.client.on(
        "stderr",
        bindGatewayUser((text: string) => this.handleStderr(text)),
      );
      this.client.on(
        "close",
        bindGatewayUser(() => this.handleClose()),
      );
    }
  }

  publish(method: string, payload: RpcEnvelope) {
    return threadRuntimeEvents.record(this.host.id, this.threadId, method, payload);
  }

  async ensureConnected() {
    if (this.closed) {
      throw new Error("Thread controller is closed");
    }
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
  }

  markConnected() {
    this.connected = true;
  }

  handleNotification(message: RpcEnvelope) {
    const method =
      message.method === undefined || message.method === "" ? "notification" : message.method;
    this.updateMonitoringState(method, message);
    threadRuntimeEvents.record(
      this.host.id,
      this.threadId,
      method,
      message,
      createThreadNotificationResolvers(this.client, this.threadId),
    );
  }

  handleStderr(text: string) {
    threadRuntimeEvents.record(this.host.id, this.threadId, "gateway/stderr", {
      method: "gateway/stderr",
      params: { text },
    });
  }

  handleClose() {
    this.connected = false;
    this.subscribed = false;
  }

  async ensureSubscribed() {
    await this.ensureConnected();
    await this.enqueue(async () => {
      // Check and mutation must share the serialized critical section. Two browser peers can
      // subscribe in the same tick; checking before enqueue would make both send thread/resume
      // even though the RPC operations themselves execute sequentially.
      if (this.subscribed) return;
      if (!this.isFreshUnmaterializedThread()) {
        await this.client.request("thread/resume", { threadId: this.threadId });
      }
      this.subscribed = true;
    });
  }

  isSubscribed() {
    return this.subscribed;
  }

  shouldTransferSubscriptionToMonitor() {
    return this.subscribed && this.activeMainThread && !this.subAgentThread;
  }

  async resumeWithInitialTurns(limit = INITIAL_TURN_PAGE_LIMIT) {
    await this.ensureConnected();
    const resume = await this.enqueue(() =>
      this.client.request("thread/resume", {
        threadId: this.threadId,
        excludeTurns: true,
        initialTurnsPage: {
          limit,
          sortDirection: "desc",
          itemsView: "full",
        },
      }),
    );
    this.subscribed = true;
    return resume;
  }

  setOpenSnapshot(snapshot: ThreadOpenSnapshot) {
    this.updateMonitoringStateFromSnapshot(snapshot);
    threadSnapshotStore.set(this.host.id, this.threadId, snapshot);
  }

  getOpenSnapshot() {
    return threadSnapshotStore.get(this.host.id, this.threadId);
  }

  private isFreshUnmaterializedThread() {
    const snapshot = this.getOpenSnapshot();
    return Boolean(snapshot && snapshot.history.thread.turns.length === 0);
  }

  enqueue<T>(operation: () => Promise<T>) {
    const run = this.operationQueue.then(operation, operation);
    this.operationQueue = run.catch(() => {});
    return run;
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    if (this.connected) {
      void this.client
        .request("thread/unsubscribe", { threadId: this.threadId }, 5_000)
        .catch(() => {});
    }
    this.subscribed = false;
    if (this.ownsClient) {
      this.client.close();
    }
    this.onClose?.();
  }

  disposeKeepingUpstreamSubscription() {
    if (this.closed) return;
    // The Host session owns the shared RPC transport. When the final browser closes during an
    // active main turn, the background monitor adopts that existing app-server subscription.
    // Disposing only this local controller avoids both a redundant thread/resume and the brief
    // unsubscribe gap that could otherwise lose turn/completed and its notification.
    this.closed = true;
    this.connected = false;
    this.subscribed = false;
    this.onClose?.();
  }

  disposeAfterTransportClose() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.connected = false;
    this.subscribed = false;
    this.onClose?.();
  }

  private updateMonitoringState(method: string, message: RpcEnvelope) {
    if (method === "turn/started") {
      this.activeMainThread = !this.subAgentThread;
      return;
    }
    if (method === "turn/completed") {
      this.activeMainThread = false;
      return;
    }
    if (method !== "thread/status/changed") return;
    const params = recordFromUnknown(message.params);
    this.activeMainThread = runtimeStatusFromAppThreadStatus(params?.status) === "running";
  }

  private updateMonitoringStateFromSnapshot(snapshot: ThreadOpenSnapshot) {
    this.subAgentThread = isAppServerSubAgentThread(snapshot.thread);
    this.activeMainThread =
      !this.subAgentThread &&
      runtimeStatusFromSnapshotState(snapshot.thread, snapshot.history) === "running";
  }
}
