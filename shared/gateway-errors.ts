import { recordFromUnknown } from "./utils/records";

export const STALE_THREAD_CURSOR_ERROR_CODE = "staleThreadCursor";
export const STALE_THREAD_CURSOR_ERROR_MESSAGE = "invalid cursor: anchor turn is no longer present";

export function isStaleThreadCursorErrorLike(error: unknown) {
  const candidate = recordFromUnknown(error);
  // Error.message is intentionally non-enumerable, so Zod's object parser cannot carry it into
  // the plain record. Keep Zod for the transport-specific enumerable fields and use the standard
  // Error contract for the built-in message instead of weakening the RPC discriminator.
  const message = error instanceof Error ? error.message : candidate?.message;
  return (
    candidate?.rpcMethod === "thread/turns/list" &&
    candidate?.rpcCode === -32600 &&
    message === STALE_THREAD_CURSOR_ERROR_MESSAGE
  );
}
