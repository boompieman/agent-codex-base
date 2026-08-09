import type { AppServerThread, GatewayThread } from "~~/shared/types";
import { gatewayMemoryState } from "../state/memory";

/**
 * The browser boundary is the only place that enriches an official app-server Thread. Runtime
 * snapshots must retain the exact upstream DTO so user-scoped Gateway pins can never leak back
 * into RPC state or be mistaken for Codex's app-server-global section membership.
 */
export function gatewayThreadFromAppServer(
  hostId: number,
  projectId: number | null,
  thread: AppServerThread,
): GatewayThread {
  const pinned = gatewayMemoryState.pinnedThreads.find(
    (candidate) => candidate.hostId === hostId && candidate.threadId === thread.id,
  );
  return {
    ...thread,
    hostId,
    projectId,
    pinned: pinned !== undefined,
    title: pinned?.title ?? thread.name,
  };
}
