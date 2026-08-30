import type { RealtimeClientMessage } from "~~/shared/types";
import { requireRecord } from "../../http/validation/common";
import { threadBroker } from "../../runtime/broker";
import { hostStore } from "../../state/hosts";
import { sendRealtimePeerMessage, type RealtimePeer } from "../peer-state";

export async function listMcpStatuses(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "mcp.status.list" }>,
) {
  const host = requireRecord(hostStore.getWithSecret(request.hostId), "Host not found");
  const servers = await threadBroker.listMcpStatuses(host, request.threadId);
  sendRealtimePeerMessage(peer, {
    type: "mcp.status.snapshot",
    requestId: request.requestId,
    hostId: request.hostId,
    threadId: request.threadId,
    servers,
  });
}

export async function startMcpEventStream(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "mcp.event.stream.start" }>,
) {
  const host = requireRecord(hostStore.getWithSecret(request.hostId), "Host not found");
  await threadBroker.startMcpEventStream(host, request);
  sendRealtimePeerMessage(peer, {
    type: "mcp.event.stream.accepted",
    requestId: request.requestId,
    hostId: request.hostId,
    threadId: request.threadId,
    subscriptionId: request.subscriptionId,
    action: "started",
  });
}

export async function stopMcpEventStream(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "mcp.event.stream.stop" }>,
) {
  const host = requireRecord(hostStore.getWithSecret(request.hostId), "Host not found");
  await threadBroker.stopMcpEventStream(host, request.subscriptionId);
  sendRealtimePeerMessage(peer, {
    type: "mcp.event.stream.accepted",
    requestId: request.requestId,
    hostId: request.hostId,
    threadId: request.threadId,
    subscriptionId: request.subscriptionId,
    action: "stopped",
  });
}
