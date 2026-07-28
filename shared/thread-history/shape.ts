import type { AppServerThread } from "../types/thread";
import type { ThreadHistoryState, ThreadHistoryTurn } from "./types";

export function threadTurnsFromHistory(history: ThreadHistoryState | null): ThreadHistoryTurn[] {
  return history?.thread.turns ?? [];
}

export function ensureHistoryThread(
  history: ThreadHistoryState | null,
  currentThread: AppServerThread | null,
  threadId: string,
): ThreadHistoryState {
  const existingThread = history?.thread ?? currentThread ?? { id: threadId };
  const thread = {
    ...existingThread,
    id: existingThread.id || threadId,
    turns: [...(existingThread.turns ?? [])],
  };
  return { thread };
}
