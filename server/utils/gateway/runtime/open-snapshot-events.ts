import { SERVER_TURN_CACHE_LIMIT } from "~~/shared/config";
import { applyAppServerEventToHistory } from "~~/shared/thread-history/app-server-events";
import { normalizeTokenUsage } from "~~/shared/token-usage";
import type { ApprovalPolicy, RpcEnvelope, ThreadHistoryState } from "~~/shared/types";
import { idFromUnknown, recordFromUnknown } from "~~/shared/utils/records";
import type { ThreadOpenSnapshot } from "./types";

type SnapshotEventReducer = (
  snapshot: ThreadOpenSnapshot,
  params: Record<string, unknown>,
) => ThreadOpenSnapshot;

const snapshotEventReducers: Record<string, SnapshotEventReducer> = {
  "thread/status/changed": (snapshot, params) =>
    updateSnapshotThreadStatus(snapshot, params.status),
  "thread/settings/updated": (snapshot, params) => ({
    ...snapshot,
    threadSettings: {
      model: fieldFromRecord(params.threadSettings, "model"),
      effort: fieldFromRecord(params.threadSettings, "effort"),
      approvalPolicy: approvalPolicyFromRecord(params.threadSettings),
    },
  }),
  "thread/tokenUsage/updated": (snapshot, params) => ({
    ...snapshot,
    tokenUsage: normalizeTokenUsage(params.tokenUsage) ?? snapshot.tokenUsage,
  }),
};

export function applyEventToOpenSnapshot(
  snapshot: ThreadOpenSnapshot | null,
  method: string,
  payload: RpcEnvelope,
  createdAt?: string | null,
) {
  if (snapshot === null) {
    return snapshot;
  }

  const params = eventParams(payload.params);
  const eventThreadId =
    idFromUnknown(params.threadId) ?? idFromUnknown(snapshotThread(snapshot).id);
  const reducedHistory = applyAppServerEventToHistory({
    history: snapshot.history,
    currentThread: snapshot.thread,
    threadId: eventThreadId === null ? "" : String(eventThreadId),
    method,
    payload: { id: payload.id, params },
    createdAt,
  });
  const history = trimSnapshotHistory(reducedHistory ?? snapshot.history);
  let nextSnapshot = withSnapshotHistory(snapshot, history);
  nextSnapshot = snapshotEventReducers[method]?.(nextSnapshot, params) ?? nextSnapshot;
  return nextSnapshot;
}

function eventParams(value: unknown): Record<string, unknown> {
  return recordFromUnknown(value) ?? {};
}

function trimSnapshotHistory(history: ThreadHistoryState): ThreadHistoryState {
  return {
    ...history,
    thread: {
      ...history.thread,
      turns: history.thread.turns.slice(-SERVER_TURN_CACHE_LIMIT),
    },
  };
}

function updateSnapshotThreadStatus(snapshot: ThreadOpenSnapshot, status: unknown) {
  const value = statusValue(status);
  if (value === null) {
    return snapshot;
  }
  return withSnapshotHistory(snapshot, {
    ...snapshot.history,
    thread: {
      ...snapshot.history.thread,
      status: value,
    },
  });
}

function withSnapshotHistory(
  snapshot: ThreadOpenSnapshot,
  history: ThreadHistoryState,
): ThreadOpenSnapshot {
  return {
    ...snapshot,
    history,
    thread: {
      ...snapshot.thread,
      ...history.thread,
    },
  };
}

function snapshotThread(snapshot: ThreadOpenSnapshot) {
  return snapshot.history.thread;
}

function statusValue(status: unknown) {
  if (typeof status === "string") {
    return status;
  }
  const record = recordFromUnknown(status);
  if (record !== null) {
    const type = record.type;
    return typeof type === "string" ? type : null;
  }
  return null;
}

function fieldFromRecord(value: unknown, key: string) {
  const record = recordFromUnknown(value);
  if (record === null) return null;
  const field = record[key];
  return typeof field === "string" ? field : null;
}

function approvalPolicyFromRecord(value: unknown): ApprovalPolicy | null {
  const policy = fieldFromRecord(value, "approvalPolicy");
  return policy === "untrusted" || policy === "on-request" || policy === "never" ? policy : null;
}
