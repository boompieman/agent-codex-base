import { deltaEventHandlers } from "./delta-events";
import { errorEventHandlers } from "./error-events";
import { goalEventHandlers } from "./goal-events";
import { itemEventHandlers } from "./item-events";
import { notificationEventHandlers } from "./notification-events";
import { requestEventHandlers } from "./request-events";
import { rawResponseEventHandlers } from "./raw-response-events";
import { threadEventHandlers } from "./thread-events";
import { turnEventHandlers } from "./turn-events";
import { mcpRuntimeEventHandlers } from "./mcp-events";
import { AppServerEventDispatcher } from "./dispatcher";
import type { GatewayEventHandlerRegistry } from "./types";

const appServerEventHandlers: GatewayEventHandlerRegistry = {
  ...threadEventHandlers,
  ...goalEventHandlers,
  ...turnEventHandlers,
  ...itemEventHandlers,
  ...deltaEventHandlers,
  ...requestEventHandlers,
  ...errorEventHandlers,
  ...notificationEventHandlers,
  ...mcpRuntimeEventHandlers,
  ...rawResponseEventHandlers,
};

export const appServerEventDispatcher = new AppServerEventDispatcher(appServerEventHandlers);
