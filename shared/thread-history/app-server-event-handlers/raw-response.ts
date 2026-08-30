import { rawResponseCompletedFromUnknown } from "../../runtime/app-server/raw-response";
import { upsertTurnResponseUsage } from "../response-usage";
import type { AppServerHistoryReducerRegistry } from "./types";

export const rawResponseReducers = {
  "rawResponse/completed": (input, params) => {
    const completed = rawResponseCompletedFromUnknown(params);
    const amount = completed?.usageMetadata?.amount;
    if (completed === null || amount === null || amount === undefined) return input.history;
    return upsertTurnResponseUsage(
      input.history,
      input.currentThread,
      input.threadId,
      completed.turnId,
      completed.responseId,
      amount,
    );
  },
} satisfies AppServerHistoryReducerRegistry;
