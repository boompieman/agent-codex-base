import type { BrowserPreviewTarget } from "~~/shared/types";
import { useGatewayBrowserStore } from "./index";
import { useGatewayRealtimeStore } from "../gateway-realtime";
import { expectBrowserOpened } from "../gateway-realtime/response-parsers";
import { captureSessionEpoch } from "@/utils/session-epoch";

export async function openBrowserPreview(input: BrowserPreviewTarget) {
  const sessionIsCurrent = captureSessionEpoch();
  // Browser panels also carry UI-only fields such as `title`. TypeScript's structural typing
  // permits those objects at this call site, so project the official wire target explicitly.
  // Do not loosen the realtime parser: strict protocol boundaries are what catch accidental UI
  // state leakage before it reaches the server.
  const target = browserPreviewWireTarget(input);
  const response = await useGatewayRealtimeStore().request(
    (requestId) => ({ type: "browser.open", requestId, ...target }),
    expectBrowserOpened,
    30_000,
  );
  if (sessionIsCurrent()) useGatewayBrowserStore().upsertSession(response.session);
  return response.session;
}

function browserPreviewWireTarget(input: BrowserPreviewTarget): BrowserPreviewTarget {
  return {
    hostId: input.hostId,
    projectId: input.projectId,
    threadId: input.threadId,
    panelId: input.panelId,
    targetUrl: input.targetUrl,
    allowInsecureTls: input.allowInsecureTls,
  };
}

export async function closeBrowserPreview(sessionId: string) {
  useGatewayBrowserStore().removeSession(sessionId);
  await useGatewayRealtimeStore()
    .request((requestId) => ({ type: "browser.close", requestId, sessionId }))
    .catch(() => null);
}

export async function setBrowserPreviewInsecureTls(sessionId: string, allowInsecureTls: boolean) {
  const sessionIsCurrent = captureSessionEpoch();
  const response = await useGatewayRealtimeStore().request(
    (requestId) => ({
      type: "browser.allowInsecureTls",
      requestId,
      sessionId,
      allowInsecureTls,
    }),
    expectBrowserOpened,
  );
  if (sessionIsCurrent()) useGatewayBrowserStore().upsertSession(response.session);
  return response.session;
}
