import type { GatewayMcpServerStatus, HostRecord } from "~~/shared/types";
import {
  parseEmptyAppServerResponse,
  parseMcpServerStatusPage,
} from "~~/shared/runtime/app-server";
import type { ControllerRegistry } from "./controller-registry";
import { mcpEventSubscriptions } from "./mcp-event-subscriptions";

export class McpRuntimeService {
  constructor(private readonly registry: ControllerRegistry) {}

  async listStatuses(host: HostRecord, threadId: string) {
    const client = await this.registry.getHostClient(host);
    const servers: GatewayMcpServerStatus[] = [];
    let cursor: string | null = null;
    do {
      const page: ReturnType<typeof parseMcpServerStatusPage> = await client.request(
        "mcpServerStatus/list",
        { threadId, cursor, limit: 100, detail: "toolsAndAuthOnly" },
        120_000,
        parseMcpServerStatusPage,
      );
      servers.push(
        ...page.data.map((server) => ({
          name: server.name,
          runtimeStatus: server.runtimeStatus,
          pluginId: server.pluginId,
          authStatus: server.authStatus,
          toolCount: Object.keys(server.tools).length,
        })),
      );
      cursor = page.nextCursor;
    } while (cursor !== null);
    return servers;
  }

  async startEventStream(
    host: HostRecord,
    input: {
      threadId: string;
      server: string;
      subscriptionId: string;
      name: string;
      arguments: unknown;
      meta?: unknown;
    },
  ) {
    const client = await this.registry.getHostClient(host);
    const response = await client.request(
      "mcpServer/event/stream/start",
      {
        threadId: input.threadId,
        server: input.server,
        subscriptionId: input.subscriptionId,
        name: input.name,
        arguments: input.arguments,
        _meta: input.meta,
      },
      120_000,
      parseEmptyAppServerResponse,
    );
    mcpEventSubscriptions.register(host.id, input.subscriptionId, input.threadId);
    return response;
  }

  async stopEventStream(host: HostRecord, subscriptionId: string) {
    const client = await this.registry.getHostClient(host);
    const response = await client.request(
      "mcpServer/event/stream/stop",
      { subscriptionId },
      120_000,
      parseEmptyAppServerResponse,
    );
    mcpEventSubscriptions.unregister(host.id, subscriptionId);
    return response;
  }
}
