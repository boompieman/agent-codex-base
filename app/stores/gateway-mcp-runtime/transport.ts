import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import {
  expectMcpEventStreamAccepted,
  expectMcpStatusSnapshot,
} from "@/stores/gateway-realtime/response-parsers";

export function requestMcpStatuses(hostId: number, threadId: string) {
  return useGatewayRealtimeStore().request(
    (requestId) => ({ type: "mcp.status.list", requestId, hostId, threadId }),
    expectMcpStatusSnapshot,
    // Status discovery is background decoration, not the user's foreground action. A reconnect or
    // an MCP startup failure must preserve the last snapshot without producing a Sonner overlay
    // that can block the Agent, Files, or mobile sheet controls.
    { errorMode: "return" },
  );
}

export function requestMcpEventStreamStart(input: {
  hostId: number;
  threadId: string;
  server: string;
  subscriptionId: string;
  name: string;
  arguments: unknown;
  meta?: unknown;
}) {
  return useGatewayRealtimeStore().request(
    (requestId) => ({ type: "mcp.event.stream.start", requestId, ...input }),
    expectMcpEventStreamAccepted,
  );
}

export function requestMcpEventStreamStop(input: {
  hostId: number;
  threadId: string;
  subscriptionId: string;
}) {
  return useGatewayRealtimeStore().request(
    (requestId) => ({ type: "mcp.event.stream.stop", requestId, ...input }),
    expectMcpEventStreamAccepted,
  );
}
