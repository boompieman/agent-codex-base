import type { GatewayEvent } from "~~/shared/types";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { useAuthStore } from "@/stores/auth";
import { appendEventsToThreadView } from "@/stores/gateway/thread-open/thread-view-cache";
import { pinnedKey } from "@/stores/gateway/thread-utils/identity";
import { gatewayDomainEvents } from "@/stores/gateway/domain-events";

export function createThreadLiveEventActions() {
  const pendingEvents: GatewayEvent[] = [];
  const pendingLastEventIds = new Map<string, number>();
  let flushHandle: number | null = null;
  let queuedSessionEpoch: number | null = null;

  function queueThreadEvent(event: GatewayEvent) {
    const sessionEpoch = useAuthStore().sessionEpoch;
    if (queuedSessionEpoch !== null && queuedSessionEpoch !== sessionEpoch) resetLiveEvents();
    queuedSessionEpoch = sessionEpoch;
    pendingEvents.push(event);
    const key = pinnedKey(event.hostId, event.threadId);
    pendingLastEventIds.set(key, Math.max(pendingLastEventIds.get(key) ?? 0, event.id));
    if (flushHandle !== null) return;
    // Reduce high-frequency app-server deltas to one reactive commit per paint. Applying every
    // delta synchronously repeatedly copied the event arrays and thread-view cache before the
    // browser had a chance to render the streamed text.
    flushHandle = requestAnimationFrame(flushQueuedEvents);
  }

  function flushQueuedEvents() {
    flushHandle = null;
    const auth = useAuthStore();
    if (queuedSessionEpoch === null || !auth.isCurrentSession(queuedSessionEpoch)) {
      resetLiveEvents();
      return;
    }
    const events = pendingEvents.splice(0).sort((left, right) => left.id - right.id);
    queuedSessionEpoch = null;
    pendingLastEventIds.clear();
    const byThread = new Map<string, GatewayEvent[]>();
    for (const event of events) {
      const key = pinnedKey(event.hostId, event.threadId);
      const threadEvents = byThread.get(key) ?? [];
      threadEvents.push(event);
      byThread.set(key, threadEvents);
    }

    const navigation = useGatewayNavigationStore();
    const views = useGatewayThreadViewStore();
    for (const threadEvents of byThread.values()) {
      const first = threadEvents[0]!;
      const selected =
        first.hostId === navigation.selectedHostId &&
        first.threadId === navigation.selectedThreadId;
      if (selected) {
        const fresh = threadEvents.filter((event) => event.id > views.lastEventId);
        if (fresh.length) {
          views.events = [...views.events, ...fresh].slice(-500);
          views.lastEventId = fresh.at(-1)!.id;
        }
      } else {
        appendEventsToThreadView(threadEvents);
      }
      // App-server deltas must still be interpreted in order, but their history reducers are
      // committed once per thread. Otherwise one animation frame still copies the same timeline
      // and view cache once for every token-sized delta.
      gatewayDomainEvents.emit("history-events-project", { events: threadEvents });
    }
  }

  function resetLiveEvents() {
    if (flushHandle !== null) cancelAnimationFrame(flushHandle);
    flushHandle = null;
    pendingEvents.length = 0;
    pendingLastEventIds.clear();
    queuedSessionEpoch = null;
  }

  return {
    applyLiveEvent(event: GatewayEvent) {
      gatewayDomainEvents.emit("history-events-project", { events: [event] });
    },
    applyLiveEvents(events: GatewayEvent[]) {
      if (events.length) gatewayDomainEvents.emit("history-events-project", { events });
    },
    queueThreadEvent,
    resetLiveEvents,
    lastAppliedThreadEventId(hostId: number, threadId: string) {
      const navigation = useGatewayNavigationStore();
      const views = useGatewayThreadViewStore();
      const applied =
        hostId === navigation.selectedHostId && threadId === navigation.selectedThreadId
          ? views.lastEventId
          : (views.threadViews[pinnedKey(hostId, threadId)]?.lastEventId ?? 0);
      return Math.max(applied, pendingLastEventIds.get(pinnedKey(hostId, threadId)) ?? 0);
    },
  };
}
