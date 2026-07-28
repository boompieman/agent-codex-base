import type { HostRecord } from "~~/shared/types";
import { currentGatewayUserId } from "../state/memory";
import { activeMainThreadMonitor } from "./active-main-thread-monitor";
import { HostRpcSession } from "./host-rpc-session";
import { hostSessionEvents } from "./host-session-events";
import { ThreadController } from "./thread-controller";

export class ControllerRegistry {
  private readonly controllers = new Map<string, ThreadController>();
  private readonly pendingControllers = new Map<string, Promise<ThreadController>>();
  private readonly controllerGenerations = new Map<string, number>();
  private readonly hostSessions = new Map<string, HostRpcSession>();
  private readonly subscriptionLeaseCounts = new Map<string, number>();

  async getController(host: HostRecord, threadId: string) {
    const userId = this.userKey();
    const key = this.key(userId, host.id, threadId);
    let controller = this.controllers.get(key);
    if (!controller) {
      let pending = this.pendingControllers.get(key);
      if (!pending) {
        const generation = this.controllerGeneration(key);
        pending = this.createController(userId, host, threadId, key, generation).finally(() => {
          if (this.pendingControllers.get(key) === pending) {
            this.pendingControllers.delete(key);
          }
          this.deleteUnusedControllerGeneration(key);
        });
        this.pendingControllers.set(key, pending);
      }
      controller = await pending;
    }
    await controller.ensureConnected();
    return controller;
  }

  async attachStartedThread(
    host: HostRecord,
    threadId: string,
    client: Awaited<ReturnType<HostRpcSession["connect"]>>,
  ) {
    const userId = this.userKey();
    const key = this.key(userId, host.id, threadId);
    this.invalidateController(key);
    this.pendingControllers.delete(key);
    this.controllers.get(key)?.close();
    const controller = new ThreadController(host, threadId, client, true, true, false, () => {
      if (this.controllers.get(key) === controller) {
        this.controllers.delete(key);
        this.deleteUnusedControllerGeneration(key);
      }
    });
    this.controllers.set(key, controller);
    return controller;
  }

  async getHostClient(host: HostRecord) {
    return this.getHostClientForUser(this.userKey(), host);
  }

  retainSubscription(host: HostRecord, threadId: string) {
    const userId = this.userKey();
    const key = this.key(userId, host.id, threadId);
    this.subscriptionLeaseCounts.set(key, (this.subscriptionLeaseCounts.get(key) ?? 0) + 1);
    const ready = this.getController(host, threadId).then((controller) =>
      controller.ensureSubscribed(),
    );
    let released = false;
    return {
      ready,
      release: () => {
        if (released) return;
        released = true;
        const remaining = Math.max(0, (this.subscriptionLeaseCounts.get(key) ?? 1) - 1);
        if (remaining > 0) {
          this.subscriptionLeaseCounts.set(key, remaining);
          return;
        }
        this.subscriptionLeaseCounts.delete(key);
        // Replacing a peer subscription releases the old callback before retaining the new one.
        // Deferring zero-count disposal by one microtask coalesces that handoff without keeping
        // abandoned controllers alive indefinitely.
        queueMicrotask(() => {
          if ((this.subscriptionLeaseCounts.get(key) ?? 0) === 0) {
            this.releaseUnleasedController(key);
          }
        });
      },
    };
  }

  controllersForHost(hostId: number) {
    return this.controllersForUserHost(this.userKey(), hostId);
  }

  hasController(hostId: number, threadId: string) {
    return this.controllers.has(this.key(this.userKey(), hostId, threadId));
  }

  close(hostId: number, threadId: string) {
    const key = this.key(this.userKey(), hostId, threadId);
    this.subscriptionLeaseCounts.delete(key);
    this.closeByKey(key);
  }

  closeHost(hostId: number) {
    const userId = this.userKey();
    for (const controller of this.controllersForUserHost(userId, hostId)) {
      const key = this.key(userId, hostId, controller.threadId);
      this.subscriptionLeaseCounts.delete(key);
      this.invalidateController(key);
      controller.close();
      this.controllers.delete(key);
    }
    this.deletePendingForHost(userId, hostId);
    const key = this.hostKey(userId, hostId);
    const session = this.hostSessions.get(key);
    this.hostSessions.delete(key);
    session?.close();
  }

  status() {
    const userId = this.userKey();
    return this.controllersForUser(userId).map((controller) => ({
      hostId: controller.host.id,
      threadId: controller.threadId,
    }));
  }

  private async createController(
    userId: number,
    host: HostRecord,
    threadId: string,
    key: string,
    generation: number,
  ) {
    const client = await this.getHostClientForUser(userId, host);
    if (this.controllerGeneration(key) !== generation) {
      throw new Error("Thread controller creation was superseded");
    }
    const inheritedSubscription = activeMainThreadMonitor.reclaimSubscribedThread(
      host.id,
      threadId,
    );
    const controller = new ThreadController(
      host,
      threadId,
      client,
      true,
      inheritedSubscription,
      false,
      () => {
        if (this.controllers.get(key) === controller) {
          this.controllers.delete(key);
          this.deleteUnusedControllerGeneration(key);
        }
      },
    );
    this.controllers.set(key, controller);
    return controller;
  }

  private async getHostClientForUser(userId: number, host: HostRecord) {
    const key = this.hostKey(userId, host.id);
    let session = this.hostSessions.get(key);
    if (!session) {
      session = new HostRpcSession(
        host,
        (hostId, threadId) => this.controllers.get(this.key(userId, hostId, threadId)) ?? null,
        (hostId) => this.controllersForUserHost(userId, hostId),
        () => this.disposeHostSession(userId, host.id, session),
      );
      this.hostSessions.set(key, session);
    }
    return session.connect();
  }

  private controllersForUserHost(userId: number, hostId: number) {
    return Array.from(this.controllers.values()).filter(
      (controller) =>
        controller.host.id === hostId &&
        this.controllers.get(this.key(userId, hostId, controller.threadId)) === controller,
    );
  }

  private controllersForUser(userId: number) {
    const prefix = `${userId}:`;
    return Array.from(this.controllers.entries())
      .filter(([key]) => key.startsWith(prefix))
      .map(([, controller]) => controller);
  }

  private disposeHostSession(userId: number, hostId: number, session: HostRpcSession | undefined) {
    const hostKey = this.hostKey(userId, hostId);
    if (session && this.hostSessions.get(hostKey) === session) {
      this.hostSessions.delete(hostKey);
    }
    for (const controller of this.controllersForUserHost(userId, hostId)) {
      const key = this.key(userId, hostId, controller.threadId);
      this.invalidateController(key);
      controller.disposeAfterTransportClose();
      this.controllers.delete(key);
    }
    this.deletePendingForHost(userId, hostId);
    hostSessionEvents.emitClosed(userId, hostId);
  }

  private deletePendingForHost(userId: number, hostId: number) {
    const prefix = `${userId}:${hostId}:`;
    for (const key of this.pendingControllers.keys()) {
      if (key.startsWith(prefix)) {
        this.subscriptionLeaseCounts.delete(key);
        this.invalidateController(key);
        this.pendingControllers.delete(key);
      }
    }
  }

  private closeByKey(key: string) {
    this.invalidateController(key);
    this.pendingControllers.delete(key);
    this.controllers.get(key)?.close();
    this.controllers.delete(key);
    this.deleteUnusedControllerGeneration(key);
  }

  private releaseUnleasedController(key: string) {
    const controller = this.controllers.get(key);
    if (controller?.shouldTransferSubscriptionToMonitor() !== true) {
      this.closeByKey(key);
      return;
    }

    activeMainThreadMonitor.adoptSubscribedThread(
      {
        host: controller.host,
        client: controller.client,
        hasController: (threadId) =>
          this.controllers.has(this.key(this.userKey(), controller.host.id, threadId)),
      },
      controller.threadId,
    );
    this.invalidateController(key);
    this.pendingControllers.delete(key);
    controller.disposeKeepingUpstreamSubscription();
    this.controllers.delete(key);
    this.deleteUnusedControllerGeneration(key);
  }

  private controllerGeneration(key: string) {
    return this.controllerGenerations.get(key) ?? 0;
  }

  private invalidateController(key: string) {
    this.controllerGenerations.set(key, this.controllerGeneration(key) + 1);
  }

  private deleteUnusedControllerGeneration(key: string) {
    if (!this.controllers.has(key) && !this.pendingControllers.has(key)) {
      this.controllerGenerations.delete(key);
    }
  }

  private key(userId: number, hostId: number, threadId: string) {
    return `${userId}:${hostId}:${threadId}`;
  }

  private hostKey(userId: number, hostId: number) {
    return `${userId}:${hostId}`;
  }

  private userKey() {
    const userId = currentGatewayUserId();
    if (userId === null) {
      throw new Error("Gateway runtime requires an authenticated user scope");
    }
    return userId;
  }
}
