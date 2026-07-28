import type { GatewayConfig } from "~~/shared/types";
import { userStore } from "../auth/users";
import { sshConnections } from "../infra/host-services";
import { hostResourceLifecycle } from "../runtime/host-resource-lifecycle";
import { hostRuntimeFingerprint } from "../runtime/host-runtime-fingerprint";
import { hostRuntimeSupervisor } from "../runtime/host-runtime-supervisor";
import {
  currentGatewayMemoryState,
  replaceCurrentGatewayMemoryState,
  type StoredHostRecord,
} from "../state/memory";
import { runtimeConfigFromMemory } from "../http/errors";
import { pinnedThreadEvents } from "./pinned-thread-events";

export class UserConfigMutationService {
  commit<T>(userId: number, mutateDraft: () => T): T {
    const previousState = currentGatewayMemoryState();
    const previousConfig = runtimeConfigFromMemory();
    const draftState = structuredClone(previousState);
    replaceCurrentGatewayMemoryState(draftState);
    let result: T;
    let nextConfig: GatewayConfig;
    try {
      result = mutateDraft();
      pruneDanglingHostRelations(draftState);
      nextConfig = runtimeConfigFromMemory();
    } catch (error) {
      replaceCurrentGatewayMemoryState(previousState);
      throw error;
    }

    // SQLite is the durable source of truth. Never expose the draft to subsequent requests when
    // encryption or persistence fails.
    replaceCurrentGatewayMemoryState(previousState);
    userStore.saveConfig(userId, nextConfig);
    replaceCurrentGatewayMemoryState(draftState);
    try {
      this.reconcileCommittedConfig(
        userId,
        previousState.hosts,
        draftState.hosts,
        previousState.pinnedThreads,
        draftState.pinnedThreads,
      );
    } catch (cause) {
      this.rollbackCommit(userId, previousState, draftState, previousConfig, cause);
    }
    return result;
  }

  private rollbackCommit(
    userId: number,
    previousState: ReturnType<typeof currentGatewayMemoryState>,
    draftState: ReturnType<typeof currentGatewayMemoryState>,
    previousConfig: GatewayConfig,
    cause: unknown,
  ): never {
    replaceCurrentGatewayMemoryState(previousState);
    const rollbackErrors: unknown[] = [cause];
    try {
      userStore.saveConfig(userId, previousConfig);
    } catch (error) {
      rollbackErrors.push(error);
    }
    try {
      // Resource reconciliation may have closed only part of the old Host graph. Running the
      // same domain transition in reverse makes lazy SSH/RPC resources converge on the restored
      // durable configuration instead of preserving a half-committed runtime.
      this.reconcileCommittedConfig(
        userId,
        draftState.hosts,
        previousState.hosts,
        draftState.pinnedThreads,
        previousState.pinnedThreads,
      );
    } catch (error) {
      rollbackErrors.push(error);
    }
    if (rollbackErrors.length > 1) {
      throw new AggregateError(
        rollbackErrors,
        "Configuration reconciliation failed and rollback was incomplete",
      );
    }
    throw cause;
  }

  private reconcileCommittedConfig(
    userId: number,
    previousHosts: StoredHostRecord[],
    nextHosts: StoredHostRecord[],
    previousPinnedThreads: unknown,
    nextPinnedThreads: unknown,
  ) {
    const nextById = new Map(nextHosts.map((host) => [host.id, host]));
    for (const previous of previousHosts) {
      const next = nextById.get(previous.id);
      if (!next) hostResourceLifecycle.deleted(userId, previous.id);
      else hostResourceLifecycle.changed(userId, previous, next);
    }
    if (hostsChanged(previousHosts, nextHosts)) {
      sshConnections.syncHosts(nextHosts);
      hostRuntimeSupervisor.syncCurrentUserConfig();
    }
    if (JSON.stringify(previousPinnedThreads) !== JSON.stringify(nextPinnedThreads)) {
      pinnedThreadEvents.publish(userId);
    }
  }
}

function hostsChanged(previous: StoredHostRecord[], next: StoredHostRecord[]) {
  if (previous.length !== next.length) return true;
  const nextById = new Map(next.map((host) => [host.id, host]));
  return previous.some((host) => {
    const candidate = nextById.get(host.id);
    return !candidate || hostRuntimeFingerprint(host) !== hostRuntimeFingerprint(candidate);
  });
}

export const userConfigMutationService = new UserConfigMutationService();

function pruneDanglingHostRelations(state: ReturnType<typeof currentGatewayMemoryState>) {
  const hostIds = new Set(state.hosts.map((host) => host.id));

  // Relation cleanup belongs to the draft transaction, before SQLite is written. Resource
  // lifecycle callbacks run after commit and must never mutate durable configuration: doing so
  // would make memory look correct until the next restart restores orphaned rows from SQLite.
  state.projects = state.projects.filter((project) => hostIds.has(project.hostId));
  state.configuredProjectIds = new Set(
    [...state.configuredProjectIds].filter((projectId) =>
      state.projects.some((project) => project.id === projectId),
    ),
  );
  state.pinnedThreads = state.pinnedThreads.filter((thread) => hostIds.has(thread.hostId));
}
