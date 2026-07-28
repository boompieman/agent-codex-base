import http, {
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { text as consumeText } from "node:stream/consumers";
import { z } from "zod";
import { browserPreviewEvents } from "./browser-preview-events";
import { BrowserPreviewHttpAgent } from "./browser-preview-http-agent";
import { browserPreviewManager, type BrowserPreviewSession } from "./browser-preview-manager";
import {
  browserPreviewTargetPort,
  browserPreviewUpstreamConnector,
} from "./browser-preview-upstream-connector";

const BOOTSTRAP_PATH = "/_gateway/preview/bootstrap";
const SESSION_PATH = "/_gateway/preview/session";
const ticketRequestSchema = z.object({ ticket: z.string().min(1) });

export async function handleBrowserPreviewRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  try {
    const hostname = requestHostname(request);
    if (request.url === BOOTSTRAP_PATH && request.method === "GET") {
      serveBootstrap(response);
      return;
    }
    if (request.url === SESSION_PATH && request.method === "POST") {
      await exchangeTicket(request, response, hostname);
      return;
    }
    const session = browserPreviewManager.resolve(hostname, readCookie(request, authCookieName()));
    if (!session) {
      sendText(response, 401, "Browser preview session expired. Reopen the Browser panel.");
      return;
    }
    await proxyHttpRequest(session, request, response);
  } catch (error) {
    sendText(response, 502, errorMessage(error));
  }
}

async function proxyHttpRequest(
  session: BrowserPreviewSession,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const headers = upstreamHeaders(session, request.headers);
  const agent = browserPreviewManager.agentFor(
    session,
    () => new BrowserPreviewHttpAgent(() => browserPreviewUpstreamConnector.openSocket(session)),
  );
  await new Promise<void>((resolve) => {
    const upstream = http.request(
      {
        method: request.method,
        path: request.url,
        headers,
        agent,
        host: session.target.hostname,
        port: String(browserPreviewTargetPort(session)),
      },
      (upstreamResponse) => {
        const responseHeaders = { ...upstreamResponse.headers };
        rewriteLocation(session, responseHeaders);
        stripCookieDomains(responseHeaders);
        publishFramePolicy(session, responseHeaders);
        response.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders);
        upstreamResponse.pipe(response);
        upstreamResponse.once("close", resolve);
      },
    );
    upstream.on("error", (error) => {
      if (!response.headersSent) sendText(response, 502, `Remote preview failed: ${error.message}`);
      else response.destroy(error);
      resolve();
    });
    if (request.method === "GET" || request.method === "HEAD") upstream.end();
    else request.pipe(upstream);
  });
}

function upstreamHeaders(session: BrowserPreviewSession, incoming: IncomingMessage["headers"]) {
  const headers: IncomingHttpHeaders = { ...incoming, host: session.target.host };
  delete headers["x-forwarded-host"];
  delete headers["x-forwarded-proto"];
  if (typeof headers.origin === "string" && headers.origin !== "") {
    headers.origin = session.target.origin;
  }
  if (typeof headers.referer === "string" && headers.referer !== "") {
    headers.referer = translatePreviewUrl(session, headers.referer);
  }
  headers.cookie = withoutPreviewCookie(headers.cookie);
  if (headers.cookie === undefined || headers.cookie === "") delete headers.cookie;
  return headers;
}

function withoutPreviewCookie(value: string | undefined) {
  return value
    ?.split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) => !cookie.startsWith(`${authCookieName()}=`))
    .join("; ");
}

function translatePreviewUrl(session: BrowserPreviewSession, value: string) {
  try {
    const url = new URL(value);
    return `${session.target.origin}${url.pathname}${url.search}`;
  } catch {
    return value;
  }
}

function rewriteLocation(session: BrowserPreviewSession, headers: http.OutgoingHttpHeaders) {
  if (typeof headers.location !== "string") return;
  try {
    const location = new URL(headers.location, session.target);
    if (location.origin === session.target.origin) {
      headers.location = `${session.previewOrigin}${location.pathname}${location.search}${location.hash}`;
    }
  } catch {}
}

function stripCookieDomains(headers: http.OutgoingHttpHeaders) {
  const cookies = headers["set-cookie"];
  if (cookies === undefined) return;
  const values = Array.isArray(cookies) ? cookies : [cookies];
  headers["set-cookie"] = values.map((cookie) => cookie.replace(/;\s*domain=[^;]+/gi, ""));
}

function publishFramePolicy(session: BrowserPreviewSession, headers: http.OutgoingHttpHeaders) {
  const xFrame = headers["x-frame-options"];
  if (typeof xFrame === "string" && !/^allowall$/i.test(xFrame)) {
    browserPreviewEvents.publish({
      userId: session.userId,
      sessionId: session.sessionId,
      policy: "x-frame-options",
      value: xFrame,
    });
  }
  const csp = headers["content-security-policy"];
  if (typeof csp === "string" && /(?:^|;)\s*frame-ancestors\s+/i.test(csp)) {
    browserPreviewEvents.publish({
      userId: session.userId,
      sessionId: session.sessionId,
      policy: "content-security-policy",
      value: csp,
    });
  }
}

async function exchangeTicket(
  request: IncomingMessage,
  response: ServerResponse,
  hostname: string,
) {
  const body = ticketRequestSchema.parse(JSON.parse(await consumeText(request)));
  const result = browserPreviewManager.exchangeTicket(hostname, body.ticket);
  if (result === null) {
    sendText(response, 401, "Invalid or expired browser preview ticket");
    return;
  }
  response.setHeader(
    "set-cookie",
    `${authCookieName()}=${result.cookieToken}; Path=/; HttpOnly;${
      process.env.BROWSER_PREVIEW_SCHEME === "http" ? "" : " Secure;"
    } SameSite=Lax`,
  );
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({ path: result.path }));
}

function serveBootstrap(response: ServerResponse) {
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(`<!doctype html><meta charset="utf-8"><title>Opening preview</title><script>
const ticket=location.hash.slice(1);location.hash='';fetch('${SESSION_PATH}',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ticket})}).then(async r=>{if(!r.ok)throw new Error(await r.text());return r.json()}).then(({path})=>location.replace(path)).catch(error=>document.body.textContent=error.message)
</script>`);
}

function requestHostname(request: IncomingMessage) {
  return (String(request.headers.host ?? "").split(":", 1)[0] ?? "").toLowerCase();
}

export function readPreviewCookie(value: string | undefined) {
  return readCookieValue(value, authCookieName());
}

function readCookie(request: IncomingMessage, name: string) {
  return readCookieValue(request.headers.cookie, name);
}

function readCookieValue(value: string | undefined, name: string) {
  const match = value?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1];
}

export function authCookieName() {
  return process.env.BROWSER_PREVIEW_SCHEME === "http"
    ? "gateway-preview"
    : "__Host-gateway-preview";
}

function sendText(response: ServerResponse, status: number, message: string) {
  if (response.headersSent) return;
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(message);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
