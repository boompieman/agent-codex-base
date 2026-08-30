import { ensureHistoryThread } from "./shape";
import type { ThreadHistorySeed, ThreadHistoryState } from "./types";

export function upsertTurnResponseUsage(
  history: ThreadHistoryState | null,
  currentThread: ThreadHistorySeed | null,
  threadId: string,
  turnId: string,
  responseId: string,
  amount: string,
): ThreadHistoryState {
  const nextHistory = ensureHistoryThread(history, currentThread, threadId);
  const index = nextHistory.thread.turns.findIndex((turn) => String(turn.id) === turnId);
  if (index < 0) return nextHistory;

  const turn = nextHistory.thread.turns[index];
  if (turn === undefined) return nextHistory;
  const responseUsage = [...(turn.responseUsage ?? [])];
  const existingIndex = responseUsage.findIndex((usage) => usage.responseId === responseId);
  const usage = { responseId, amount };
  if (existingIndex < 0) responseUsage.push(usage);
  else responseUsage[existingIndex] = usage;
  nextHistory.thread.turns[index] = { ...turn, responseUsage };
  return nextHistory;
}
