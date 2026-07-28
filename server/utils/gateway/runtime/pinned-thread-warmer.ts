import type { HostRecord, PinnedThreadRecord } from "~~/shared/types";
import { INITIAL_TURN_PAGE_LIMIT } from "~~/shared/config";
import { projectStore } from "../state/projects";
import { threadBroker } from "./broker";
import { runtimeLog } from "./runtime-log";
import { trimmedOrNull } from "~~/shared/utils/strings";

interface WarmPinnedThreadsInput {
  host: HostRecord;
  pinnedThreads: PinnedThreadRecord[];
}

export async function warmPinnedThreads({ host, pinnedThreads }: WarmPinnedThreadsInput) {
  const threads = pinnedThreads.filter((thread) => thread.hostId === host.id);
  if (threads.length === 0) {
    return;
  }

  runtimeLog("warming pinned threads", {
    hostId: host.id,
    count: threads.length,
  });
  const results = await Promise.allSettled(
    threads.map((thread) =>
      threadBroker.openThread(
        host,
        thread.threadId,
        resolvePinnedProjectId(thread),
        INITIAL_TURN_PAGE_LIMIT,
      ),
    ),
  );
  const failed = results.filter((result) => result.status === "rejected").length;
  runtimeLog("warmed pinned threads", {
    hostId: host.id,
    count: threads.length,
    failed,
  });
}

function resolvePinnedProjectId(thread: PinnedThreadRecord) {
  if (thread.projectId !== null) {
    return thread.projectId;
  }
  const remotePath = trimmedOrNull(thread.subtitle);
  if (remotePath !== null) {
    return projectStore.ensureForPath(thread.hostId, remotePath).id;
  }
  return null;
}
