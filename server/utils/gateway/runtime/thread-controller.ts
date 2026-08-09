import type { HostRecord, RpcEnvelope } from "~~/shared/types";
import { isAppServerSubAgentThread, parseThreadResumeResult } from "~~/shared/runtime/app-server";
import {
  runtimeStatusFromAppThreadStatus,
  runtimeStatusFromSnapshotState,
} from "~~/shared/thread-runtime-status";
import { recordFromUnknown } from "~~/shared/utils/records";
import { CodexRpcClient } from "../infra/rpc/rpc";
import { bindGatewayUser } from "../state/memory";
import { threadSnapshotStore } from "../state/thread-snapshots";
import { threadRuntimeEvents } from "./thread-runtime-events";
import type { ThreadOpenSnapshot } from "./types";
import { createThreadNotificationResolvers } from "./notification-rpc-resolvers";
import { extractThreadSettings } from "../protocol/thread-payload";

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
    private readonly onMaterialized?: () => void,
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
    if (method === "turn/started") this.onMaterialized?.();
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
      // acquire the same explicit lease in one tick; checking before enqueue would make both send
      // thread/resume even though the RPC operations themselves execute sequentially.
      // A subscription inherited from the background monitor proves only that notifications are
      // attached; it has no ThreadResumeResponse. Existing threads must still resume once when
      // their materialized snapshot does not yet contain model/effort. This is the app-server's
      // authoritative settings read, not a presentation fallback.
      if (this.subscribed && this.getOpenSnapshot()?.threadSettings != null) return;
      // Fresh threads never enter this branch: ControllerRegistry keeps thread/start's implicit
      // subscription under a bootstrap owner until turn/started. Calling thread/resume before that
      // point is invalid because app-server has not materialized a rollout yet.
      await this.requestResume({ threadId: this.threadId, excludeTurns: true });
    });
  }

  async resumeWithInitialTurnsPage(limit: number) {
    await this.ensureConnected();
    return this.enqueue(() =>
      this.requestResume({
        threadId: this.threadId,
        excludeTurns: true,
        initialTurnsPage: {
          limit,
          sortDirection: "desc",
          itemsView: "full",
        },
      }),
    );
  }

  isSubscribed() {
    return this.subscribed;
  }

  adoptExistingSubscription() {
    if (this.closed) throw new Error("Thread controller is closed");
    this.subscribed = true;
  }

  shouldTransferSubscriptionToMonitor() {
    return this.subscribed && this.activeMainThread && !this.subAgentThread;
  }

  markActiveMainThread() {
    this.activeMainThread = !this.subAgentThread;
  }

  setOpenSnapshot(snapshot: ThreadOpenSnapshot) {
    this.updateMonitoringStateFromSnapshot(snapshot);
    threadSnapshotStore.set(this.host.id, this.threadId, snapshot);
  }

  getOpenSnapshot() {
    return threadSnapshotStore.get(this.host.id, this.threadId);
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
    if (this.connected && this.subscribed) {
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
    // turn/completed precedes final rollout persistence and the authoritative idle status. Keeping
    // active ownership until thread/status/changed prevents the zero-lease cleanup from issuing an
    // early thread/unsubscribe while app-server is still finalizing the Turn.
    if (method === "turn/completed") return;
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

  private publishResumedSettings(resumed: unknown) {
    this.publish("thread/settings/updated", {
      method: "thread/settings/updated",
      params: {
        threadId: this.threadId,
        threadSettings: extractThreadSettings(resumed),
      },
    });
  }

  private async requestResume(params: Record<string, unknown>) {
    const resumed = await this.client.request(
      "thread/resume",
      params,
      120_000,
      parseThreadResumeResult,
    );
    this.subscribed = true;
    // App-server exposes persisted model/effort in thread/resume but emits no settings event for
    // the response itself. Publish it through the ordinary event path so snapshots and all browser
    // peers converge on one authoritative value instead of maintaining a second settings cache.
    this.publishResumedSettings(resumed);
    return resumed;
  }
}
