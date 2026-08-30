export type McpServerConnectionStatus =
  | "notStarted"
  | "starting"
  | "connected"
  | "authenticationRequired"
  | "failed"
  | "cancelled"
  | "disabled";

export type McpAuthStatus = "unknown" | "unsupported" | "notLoggedIn" | "bearerToken" | "oAuth";

export interface GatewayMcpServerStatus {
  name: string;
  runtimeStatus: McpServerConnectionStatus | null;
  pluginId: string | null;
  authStatus: McpAuthStatus;
  toolCount: number;
}

export interface McpServerEvent {
  subscriptionId: string;
  method: string;
  params: unknown;
}
