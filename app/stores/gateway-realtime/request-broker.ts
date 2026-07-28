import type { RealtimeClientMessage, RealtimeServerMessage } from "~~/shared/types";
import { createUuid } from "@/lib/uuid";
import { RealtimeRequestError } from "./request-errors";

type RealtimeRequestMessage = Extract<RealtimeClientMessage, { requestId: string }>;
type RealtimeResponseMessage = Extract<RealtimeServerMessage, { requestId: string }>;

interface PendingRealtimeRequest {
  resolve: (value: RealtimeResponseMessage) => void;
  reject: (error: Error) => void;
  timer: number;
  request: RealtimeRequestMessage;
}

interface RealtimeRequestBrokerOptions {
  waitForReady: (timeoutMs: number) => Promise<void>;
  send: (message: RealtimeClientMessage) => boolean;
  unavailableMessage: () => string;
  timeoutMessage: () => string;
  requestContext: (request: RealtimeRequestMessage) => Record<string, unknown>;
}

const REALTIME_READY_TIMEOUT_MS = 15_000;
// SSH reconnect and a remote Codex upgrade can precede app-server RPC work.
// Keep the browser deadline beyond the backend's 30-minute operation cap.
const REALTIME_REQUEST_TIMEOUT_MS = 31 * 60_000;

export function createRealtimeRequestBroker(options: RealtimeRequestBrokerOptions) {
  const pendingRequests = new Map<string, PendingRealtimeRequest>();

  function request(
    buildMessage: (requestId: string) => RealtimeRequestMessage,
    timeoutMs?: number,
  ): Promise<RealtimeResponseMessage>;
  function request<T>(
    buildMessage: (requestId: string) => RealtimeRequestMessage,
    parse: (message: RealtimeResponseMessage) => T,
    timeoutMs?: number,
  ): Promise<T>;
  async function request<T>(
    buildMessage: (requestId: string) => RealtimeRequestMessage,
    parseOrTimeout?: ((message: RealtimeResponseMessage) => T) | number,
    configuredTimeoutMs?: number,
  ): Promise<RealtimeResponseMessage | T> {
    await options.waitForReady(REALTIME_READY_TIMEOUT_MS);
    const requestId = `gateway-ws-${createUuid()}`;
    const requestMessage = buildMessage(requestId);
    const parse = typeof parseOrTimeout === "function" ? parseOrTimeout : undefined;
    const timeoutMs =
      typeof parseOrTimeout === "number"
        ? parseOrTimeout
        : (configuredTimeoutMs ?? REALTIME_REQUEST_TIMEOUT_MS);

    const response = await new Promise<RealtimeResponseMessage>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(
          new RealtimeRequestError(options.timeoutMessage(), requestMessage, "timeout", {
            requestId,
            timeoutMs,
            ...options.requestContext(requestMessage),
          }),
        );
      }, timeoutMs);

      pendingRequests.set(requestId, {
        resolve,
        reject,
        timer,
        request: requestMessage,
      });
      if (!options.send(requestMessage)) {
        rejectRequest(
          requestId,
          new RealtimeRequestError(options.unavailableMessage(), requestMessage, "unavailable", {
            requestId,
            ...options.requestContext(requestMessage),
          }),
        );
      }
    });
    return parse === undefined ? response : parse(response);
  }

  function resolveRequest(message: RealtimeResponseMessage) {
    const pending = pendingRequests.get(message.requestId);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingRequests.delete(message.requestId);
    pending.resolve(message);
  }

  function rejectRequest(requestId: string, error: Error) {
    const pending = pendingRequests.get(requestId);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingRequests.delete(requestId);
    pending.reject(error);
  }

  function rejectAllRequests(error: Error) {
    for (const [requestId, pending] of pendingRequests) {
      rejectRequest(
        requestId,
        new RealtimeRequestError(error.message, pending.request, "disconnected", {
          requestId,
          ...options.requestContext(pending.request),
        }),
      );
    }
  }

  return { request, resolveRequest, rejectRequest, rejectAllRequests };
}
