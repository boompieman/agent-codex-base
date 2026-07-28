import type { BarkNotificationSettings } from "~~/shared/types";
import type { ServerNotification } from "~~/shared/types";
import { firstNonEmptyString } from "~~/shared/utils/strings";

const BARK_REQUEST_TIMEOUT_MS = 10_000;

export class BarkRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "BarkRequestError";
  }
}

export async function sendBarkNotification(
  settings: BarkNotificationSettings,
  notification: ServerNotification,
) {
  const url = buildBarkUrl(settings, notification);
  await sendBarkRequest(url);
}

async function sendBarkRequest(url: URL) {
  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(BARK_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    throw new BarkRequestError(`Bark notification failed with HTTP ${response.status}`, retryable);
  }
}

function buildBarkUrl(settings: BarkNotificationSettings, notification: ServerNotification) {
  const base = settings.serverUrl.replace(/\/+$/, "");
  const url = new URL(
    `${base}/${encodeURIComponent(settings.deviceKey)}/${encodeURIComponent(notification.title)}/${encodeURIComponent(notification.body)}`,
  );
  const group = firstNonEmptyString([notification.group, settings.group]);
  if (group !== null) {
    url.searchParams.set("group", group);
  }
  // Bark 1.5.2+/server 2.2.5+ replaces a notification with the same id. The Gateway key is
  // already stable across retries and process restarts, so provider-level retries remain
  // at-least-once without producing duplicate alerts after an ambiguous timeout.
  url.searchParams.set("id", notification.key);
  return url;
}
