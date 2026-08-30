import { useGatewayMcpRuntimeStore } from "@/stores/gateway-mcp-runtime";
import { recordFromUnknown, stringFromUnknown } from "~~/shared/utils/records";
import type { GatewayEventHandlerRegistry } from "./types";

export const mcpRuntimeEventHandlers: GatewayEventHandlerRegistry = {
  "mcpServer/startupStatus/updated": (event, _params, threadId) => {
    void useGatewayMcpRuntimeStore().refreshStatuses(event.hostId, threadId);
  },
  "mcpServer/event/stream/notification": (_event, params) => {
    const subscriptionId = stringFromUnknown(params.subscriptionId);
    const notification = recordFromUnknown(params.notification);
    const method = stringFromUnknown(notification?.method);
    if (subscriptionId === null || method === null) return;
    useGatewayMcpRuntimeStore().recordEvent({
      subscriptionId,
      method,
      params: notification?.params,
    });
  },
};
