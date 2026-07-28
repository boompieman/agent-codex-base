import type { GatewayEvent, RealtimeServerMessage } from "~~/shared/types";
import type { RealtimeRequestError } from "../request-errors";

export type RealtimeServerMessageMap = {
  [K in RealtimeServerMessage["type"]]: Extract<RealtimeServerMessage, { type: K }>;
};

export type RealtimeResponseMessage = Extract<RealtimeServerMessage, { requestId: string }>;
export type RealtimeMessageHandler<K extends keyof RealtimeServerMessageMap> = (
  message: RealtimeServerMessageMap[K],
) => void;

export interface RealtimeServerMessageHandlerContext {
  t: (key: string) => string;
  readyCount: () => number;
  markReady: () => void;
  resubscribe: () => void;
  resolveRequest: (message: RealtimeResponseMessage) => void;
  rejectRequest: (requestId: string, error: RealtimeRequestError | Error) => void;
  acknowledgePong: (nonce?: string) => void;
  restoreTerminalSessions: () => Promise<void>;
  advanceThreadSubscriptionCursor: (event: GatewayEvent) => void;
}

export type RealtimeHandlers = {
  [K in keyof RealtimeServerMessageMap]?: RealtimeMessageHandler<K>;
};
