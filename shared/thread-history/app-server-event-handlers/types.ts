export interface AppServerEventPayload {
  id?: unknown;
  params?: AppServerEventParams;
}

export interface ApplyAppServerEventInput {
  history: ThreadHistoryState | null;
  currentThread: AppServerThread | null;
  threadId: string;
  method: string;
  payload?: AppServerEventPayload | null;
  createdAt?: string | null;
}

export type AppServerEventParams = Record<string, unknown>;
export type AppServerRequestId = string | number | undefined;

export type AppServerHistoryReducer = (
  input: ApplyAppServerEventInput,
  params: AppServerEventParams,
  requestId: AppServerRequestId,
) => ThreadHistoryState | null;

export type AppServerHistoryReducerRegistry = Record<string, AppServerHistoryReducer>;
import type { AppServerThread } from "../../types/thread";
import type { ThreadHistoryState } from "../types";
