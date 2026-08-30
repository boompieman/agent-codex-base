import { rawResponseCompletedFromUnknown } from "~~/shared/runtime/app-server/raw-response";
import { gatewayDomainEvents } from "../domain-events";
import type { GatewayEventHandlerRegistry } from "./types";

export const rawResponseEventHandlers = {
  "rawResponse/completed": (event, params, threadId) => {
    const completed = rawResponseCompletedFromUnknown(params);
    const amount = completed?.usageMetadata?.amount;
    if (completed === null || amount === null || amount === undefined) return;
    gatewayDomainEvents.emit("history-response-usage-upsert", {
      hostId: event.hostId,
      threadId,
      turnId: completed.turnId,
      responseId: completed.responseId,
      amount,
    });
  },
} satisfies GatewayEventHandlerRegistry;
