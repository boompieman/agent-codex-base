import type { GatewayConfig, GatewayNotificationSettings } from "./types";

// Load the complete initial viewport in one thread activation. Do not reintroduce a smaller
// first page followed by a client-side prepend: dynamic Agent rows are measured after paint, so
// that two-phase path makes an already visible viewport move while the background page settles.
export const INITIAL_TURN_PAGE_LIMIT = 5;
export const OLDER_TURN_PAGE_LIMIT = 5;
export const SERVER_TURN_CACHE_LIMIT = 50;
export const SERVER_THREAD_CACHE_LIMIT = 100;
export const CLIENT_THREAD_CACHE_LIMIT = 24;
export const DEFAULT_BARK_SERVER_URL = "https://api.day.app";
export const DEFAULT_BARK_GROUP = "Codex Gateway";

export function defaultNotificationSettings(): GatewayNotificationSettings {
  return {
    bark: {
      enabled: false,
      serverUrl: DEFAULT_BARK_SERVER_URL,
      deviceKey: "",
      group: DEFAULT_BARK_GROUP,
    },
  };
}

export function normalizeNotificationSettings(
  settings?: Partial<GatewayNotificationSettings> | null,
): GatewayNotificationSettings {
  const defaults = defaultNotificationSettings();
  const serverUrl = settings?.bark?.serverUrl?.trim();
  const deviceKey = settings?.bark?.deviceKey?.trim();
  const group = settings?.bark?.group?.trim();
  return {
    bark: {
      ...defaults.bark,
      ...settings?.bark,
      serverUrl:
        serverUrl === "" ? defaults.bark.serverUrl : (serverUrl ?? defaults.bark.serverUrl),
      deviceKey: deviceKey ?? "",
      group: group === "" ? defaults.bark.group : (group ?? defaults.bark.group),
    },
  };
}

export function defaultGatewayConfig(): GatewayConfig {
  return {
    version: 1,
    hosts: [],
    projects: [],
    pinnedThreads: [],
    notifications: defaultNotificationSettings(),
  };
}
