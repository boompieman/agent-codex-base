import type { GatewayEvent, HostRecord, RealtimeClientMessage } from "~~/shared/types";
import { requireRecord } from "../../http/validation/common";
import { threadOpenSchema, threadStartSchema } from "../../http/validation/threads";
import { threadBroker } from "../../runtime/broker";
import { threadRuntimeEvents } from "../../runtime/thread-runtime-events";
import { gatewayEventStore } from "../../state/gateway-events";
import { hostStore } from "../../state/hosts";
import { bindGatewayUser } from "../../state/memory";
import {
  runPeerScoped,
  sendRealtimePeerMessage,
  stateFor,
  threadTopicKey,
  type RealtimePeer,
} from "../peer-state";

export async function subscribeThread(
  peer: RealtimePeer,
  message: Extract<RealtimeClientMessage, { type: "thread.subscribe" }>,
) {
  const hostId = Number(message.hostId);
  const threadId =
    message.threadId === null || message.threadId === undefined ? "" : String(message.threadId);
  if (!Number.isInteger(hostId) || hostId <= 0 || threadId === "") {
    throw new Error("Invalid thread subscription");
  }

  const state = stateFor(peer);
  const key = threadTopicKey(hostId, threadId);
  state.threadUnsubscribers.get(key)?.();

  const host = requireRecord(hostStore.getWithSecret(hostId), "Host not found");
  const afterId = Number(message.afterId ?? 0);
  subscribeThreadEvents(peer, host, threadId, afterId);
}

export async function activateThread(
  peer: RealtimePeer,
  message: Extract<RealtimeClientMessage, { type: "thread.activate" }>,
) {
  const input = threadOpenSchema.parse(message);

  const host = requireRecord(hostStore.getWithSecret(input.hostId), "Host not found");
  const result = await threadBroker.openThread(
    host,
    input.threadId,
    input.projectId ?? null,
    input.limit,
  );
  const lastEventId = gatewayEventStore.latestId(input.hostId, input.threadId);
  sendRealtimePeerMessage(peer, {
    type: "thread.snapshot",
    requestId: message.requestId,
    hostId: input.hostId,
    threadId: input.threadId,
    lastEventId,
    ...result,
  });
  subscribeThreadEvents(peer, host, input.threadId, lastEventId);
}

export async function startThread(
  peer: RealtimePeer,
  message: Extract<RealtimeClientMessage, { type: "thread.start" }>,
) {
  const input = threadStartSchema.parse(message);
  const host = requireRecord(hostStore.getWithSecret(input.hostId), "Host not found");
  const result = await threadBroker.startThread(
    host,
    {
      cwd: input.cwd === "" ? undefined : input.cwd,
      model: input.model === "" ? undefined : input.model,
      effort: input.effort === "" ? undefined : input.effort,
      approvalPolicy: input.approvalPolicy ?? undefined,
    },
    input.projectId ?? null,
  );
  const threadId = String(result.thread.id);
  const lastEventId = gatewayEventStore.latestId(input.hostId, threadId);
  sendRealtimePeerMessage(peer, {
    ...result,
    type: "thread.started",
    requestId: message.requestId,
    hostId: input.hostId,
    threadId,
    lastEventId,
  });
  subscribeThreadEvents(peer, host, threadId, lastEventId);
}

export function unsubscribeThread(
  peer: RealtimePeer,
  message: Extract<RealtimeClientMessage, { type: "thread.unsubscribe" }>,
) {
  const hostId = Number(message.hostId);
  const threadId =
    message.threadId === null || message.threadId === undefined ? "" : String(message.threadId);
  if (!Number.isInteger(hostId) || hostId <= 0 || threadId === "") {
    return;
  }
  const state = stateFor(peer);
  const key = threadTopicKey(hostId, threadId);
  state.threadUnsubscribers.get(key)?.();
  state.threadUnsubscribers.delete(key);
}

function subscribeThreadEvents(
  peer: RealtimePeer,
  host: HostRecord,
  threadId: string,
  afterId: number,
) {
  const hostId = host.id;
  const state = stateFor(peer);
  const key = threadTopicKey(hostId, threadId);
  state.threadUnsubscribers.get(key)?.();
  let sentThroughId = afterId;
  const sendOnce = (event: GatewayEvent) => {
    if (event.id <= sentThroughId) return;
    // Gateway event ids are monotonic within a user's in-memory event store. A high-water cursor
    // provides the same replay/live de-duplication as an ever-growing Set without retaining one
    // allocation for every token emitted during a long-running turn.
    sentThroughId = event.id;
    sendRealtimePeerMessage(peer, { type: "thread.event", event });
  };

  let replaying = true;
  const liveQueue: GatewayEvent[] = [];
  const unsubscribe = threadRuntimeEvents.subscribe(
    hostId,
    threadId,
    bindGatewayUser((event) => {
      if (replaying) {
        liveQueue.push(event);
        return;
      }
      sendOnce(event);
    }),
  );
  const upstreamLease = threadBroker.retainUpstreamSubscription(host, threadId);
  state.threadUnsubscribers.set(key, () => {
    unsubscribe();
    upstreamLease.release();
  });

  const replayGap = gatewayEventStore.hasReplayGap(hostId, threadId, afterId);
  if (replayGap) {
    // A bounded event cache cannot reconstruct a cursor older than its pruned prefix. Explicitly
    // request one authoritative snapshot instead of applying a plausible-looking partial replay.
    sendRealtimePeerMessage(peer, {
      type: "thread.events.gap",
      hostId,
      threadId,
      afterId,
      lastEventId: gatewayEventStore.latestId(hostId, threadId),
    });
  }

  void runPeerScoped(peer, () =>
    upstreamLease.ready.catch((error: unknown) => {
      threadRuntimeEvents.record(hostId, threadId, "gateway/error", {
        method: "gateway/error",
        params: {
          message: error instanceof Error ? error.message : "Failed to subscribe thread upstream",
        },
      });
    }),
  );

  // Each thread cache is bounded to 500 events. Replay the complete retained window rather than
  // silently stopping at an arbitrary first 200; selected views refresh their authoritative
  // snapshot on reconnect and cached views refresh when activated if an older gap was pruned.
  if (!replayGap) {
    for (const event of gatewayEventStore.list(hostId, threadId, afterId, 500)) {
      sendOnce(event);
    }
  }
  replaying = false;
  for (const event of liveQueue) {
    sendOnce(event);
  }
  liveQueue.length = 0;
}
