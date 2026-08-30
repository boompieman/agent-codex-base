import { defineStore } from "pinia";
import { ref } from "vue";
import type { GatewayMcpServerStatus, McpServerEvent } from "~~/shared/types";
import { pinnedKey } from "@/stores/gateway/thread-utils/identity";
import {
  requestMcpEventStreamStart,
  requestMcpEventStreamStop,
  requestMcpStatuses,
} from "./transport";

export const useGatewayMcpRuntimeStore = defineStore("gateway-mcp-runtime", () => {
  const serversByThreadKey = ref<Record<string, GatewayMcpServerStatus[]>>({});
  const eventsBySubscriptionId = ref<Record<string, McpServerEvent[]>>({});
  const pendingStatusKeys = new Set<string>();

  async function refreshStatuses(hostId: number, threadId: string) {
    const key = pinnedKey(hostId, threadId);
    if (pendingStatusKeys.has(key)) return;
    pendingStatusKeys.add(key);
    try {
      const response = await requestMcpStatuses(hostId, threadId);
      serversByThreadKey.value = { ...serversByThreadKey.value, [key]: response.servers };
    } catch {
      // The request broker owns user-visible transport errors. Retain the last good snapshot so a
      // slow MCP inventory call never clears status or interferes with the Agent timeline.
    } finally {
      pendingStatusKeys.delete(key);
    }
  }

  function recordEvent(event: McpServerEvent) {
    eventsBySubscriptionId.value = {
      ...eventsBySubscriptionId.value,
      [event.subscriptionId]: [
        ...(eventsBySubscriptionId.value[event.subscriptionId] ?? []),
        event,
      ].slice(-100),
    };
  }

  function resetState() {
    serversByThreadKey.value = {};
    eventsBySubscriptionId.value = {};
    pendingStatusKeys.clear();
  }

  return {
    serversByThreadKey,
    eventsBySubscriptionId,
    refreshStatuses,
    startEventStream: requestMcpEventStreamStart,
    stopEventStream: requestMcpEventStreamStop,
    recordEvent,
    resetState,
  };
});
