import { gatewayDomainEvents } from "@/stores/gateway/domain-events";
import type { RealtimeHandlers, RealtimeServerMessageHandlerContext } from "./types";

export function createHostMetricsRealtimeHandlers(ctx: RealtimeServerMessageHandlerContext) {
  return {
    "host.metrics.snapshot": (message) => {
      gatewayDomainEvents.emit("realtime-host-metrics-snapshot", message);
      ctx.resolveRequest(message);
    },
    "host.metrics.sample": ({ hostId, sample }) =>
      gatewayDomainEvents.emit("realtime-host-metrics-sample", { hostId, sample }),
    "host.metrics.status": ({ hostId, status, message }) =>
      gatewayDomainEvents.emit("realtime-host-metrics-status", { hostId, status, message }),
  } satisfies RealtimeHandlers;
}
