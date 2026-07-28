import type { GatewayEvent } from "~~/shared/types";
import { isAppServerSubAgentThread, parseAppServerThread } from "~~/shared/runtime/app-server";
import { threadMetadataStore } from "../state/thread-metadata";
import type { ThreadMetadataResolver } from "../runtime/thread-runtime-events";
import { recordFromUnknown } from "~~/shared/utils/records";

export async function shouldNotifyMainThread(
  event: GatewayEvent,
  resolveThread: ThreadMetadataResolver | undefined,
) {
  if (resolveThread === undefined) {
    return false;
  }

  try {
    const result = await resolveThread();
    const record = recordFromUnknown(result);
    const thread = parseAppServerThread(record?.thread ?? result);
    // Notifications for a thread opened outside Gateway still need its real title
    // and cwd. This is a volatile index only; app-server remains authoritative.
    threadMetadataStore.record(event.hostId, null, thread);
    return !isAppServerSubAgentThread(thread);
  } catch (error) {
    console.error("[gateway] failed to inspect thread scope before notification", {
      hostId: event.hostId,
      threadId: event.threadId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Unknown scope is treated as notifiable=false to avoid child-agent false positives.
  return false;
}
