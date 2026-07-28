import { z } from "zod";
import type { RealtimeServerMessage } from "../../types";
import {
  appServerThreadSchema,
  rpcEnvelopeSchema,
  threadGoalSchema,
  threadTurnSchema,
} from "../app-server";
import { realtimeClientMessageSchema } from "./client-message-schema";
import {
  nonEmptyString,
  nonNegativeId,
  nullableString,
  positiveId,
  requestIdField,
  threadScopeFields,
} from "./common";

const threadHistorySchema = z
  .object({
    thread: appServerThreadSchema.extend({ turns: z.array(threadTurnSchema) }),
  })
  .strict();
const gatewayEventSchema = z
  .object({
    id: nonNegativeId,
    hostId: positiveId,
    threadId: nonEmptyString,
    method: nonEmptyString,
    payload: rpcEnvelopeSchema,
    createdAt: nonEmptyString,
  })
  .strict();
const turnsPageStateSchema = z
  .object({
    nextCursor: z.string().nullable(),
    backwardsCursor: z.string().nullable(),
  })
  .strict();
const threadSettingsSchema = z
  .object({
    model: nullableString,
    effort: nullableString,
    approvalPolicy: z.enum(["untrusted", "on-request", "never"]).nullable().optional(),
  })
  .strict();
const tokenUsageBreakdownSchema = z
  .object({
    totalTokens: nonNegativeId,
    inputTokens: nonNegativeId,
    cachedInputTokens: nonNegativeId,
    cacheWriteInputTokens: nonNegativeId,
    outputTokens: nonNegativeId,
    reasoningOutputTokens: nonNegativeId,
  })
  .strict();
const tokenUsageSchema = z
  .object({
    total: tokenUsageBreakdownSchema,
    last: tokenUsageBreakdownSchema,
    modelContextWindow: nonNegativeId.nullable(),
  })
  .strict();
const projectSchema = z
  .object({
    id: positiveId,
    hostId: positiveId,
    name: z.string(),
    remotePath: z.string(),
    createdAt: nonEmptyString,
    updatedAt: nonEmptyString,
  })
  .strict();
const threadOpenResultFields = {
  hostId: positiveId,
  thread: appServerThreadSchema,
  history: threadHistorySchema,
  lastEventId: nonNegativeId,
  runtimeStatus: z
    .enum(["idle", "running", "completed", "failed", "interrupted"])
    .nullable()
    .optional(),
  threadSettings: threadSettingsSchema.nullable().optional(),
  tokenUsage: tokenUsageSchema.nullable().optional(),
  projectId: positiveId.nullable().optional(),
  project: projectSchema.nullable().optional(),
  turnsPage: turnsPageStateSchema,
  recentEvents: z.array(gatewayEventSchema),
};
const terminalSessionSchema = z
  .object({
    sessionId: nonEmptyString,
    hostId: positiveId,
    projectId: positiveId.nullable(),
    threadId: z.string().nullable(),
    cwd: z.string().nullable(),
    title: z.string(),
    scope: z.enum(["host", "project", "thread"]),
    cols: positiveId,
    rows: positiveId,
    createdAt: nonEmptyString,
    lastActiveAt: nonEmptyString,
    status: z.enum(["open", "closed"]),
    output: z.string(),
  })
  .strict();
const browserSessionSchema = z
  .object({
    sessionId: nonEmptyString,
    hostId: positiveId,
    projectId: positiveId.nullable().optional(),
    threadId: z.string().nullable().optional(),
    panelId: nonEmptyString,
    targetUrl: nonEmptyString,
    allowInsecureTls: z.boolean().optional(),
    previewOrigin: nonEmptyString,
    bootstrapUrl: nonEmptyString,
    status: z.enum(["open", "closed"]),
  })
  .strict();
const notificationTargetSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("thread"),
      hostId: positiveId,
      projectId: positiveId.nullable(),
      threadId: nonEmptyString,
    })
    .strict(),
  z
    .object({
      kind: z.literal("tmuxMonitor"),
      hostId: positiveId,
      monitorId: positiveId,
      projectId: positiveId.nullable(),
      threadId: z.string().nullable(),
    })
    .strict(),
]);
const notificationSchema = z
  .object({
    key: nonEmptyString,
    title: z.string(),
    body: z.string(),
    group: z.string().nullable().optional(),
    target: notificationTargetSchema,
  })
  .strict();

// Top-level Gateway messages are closed protocol objects. Nested app-server thread/envelope
// records intentionally remain extensible because upstream adds fields between releases; their
// required identity and lifecycle fields are still parsed by the shared app-server schemas.
export const realtimeServerMessageSchema: z.ZodType<RealtimeServerMessage> = z.discriminatedUnion(
  "type",
  [
    z.object({ type: z.literal("ready"), connectionId: nonEmptyString }).strict(),
    z
      .object({ type: z.literal("notification.published"), notification: notificationSchema })
      .strict(),
    z.object({ type: z.literal("config.pinnedThreads.changed") }).strict(),
    z
      .object({
        type: z.literal("host.lifecycle"),
        event: z
          .object({
            hostId: positiveId,
            status: z.enum([
              "checkingVersion",
              "upgrading",
              "restarting",
              "connecting",
              "connected",
              "failed",
            ]),
            message: z.string(),
            createdAt: z.string().optional(),
          })
          .strict(),
      })
      .strict(),
    z.object({ type: z.literal("thread.event"), event: gatewayEventSchema }).strict(),
    z
      .object({
        type: z.literal("thread.events.gap"),
        ...threadScopeFields,
        afterId: nonNegativeId,
        lastEventId: nonNegativeId,
      })
      .strict(),
    z
      .object({
        type: z.literal("thread.snapshot"),
        ...requestIdField,
        ...threadScopeFields,
        ...threadOpenResultFields,
      })
      .strict(),
    z
      .object({
        type: z.literal("thread.started"),
        ...requestIdField,
        ...threadScopeFields,
        ...threadOpenResultFields,
      })
      .strict(),
    z
      .object({
        type: z.literal("thread.turns.page"),
        ...requestIdField,
        ...threadScopeFields,
        history: threadHistorySchema,
        turnsPage: turnsPageStateSchema,
      })
      .strict(),
    z
      .object({
        type: z.literal("turn.start.accepted"),
        ...requestIdField,
        ...threadScopeFields,
        turn: z.unknown().optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal("turn.steer.accepted"),
        ...requestIdField,
        ...threadScopeFields,
        turnId: z.string().optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal("turn.interrupt.accepted"),
        ...requestIdField,
        ...threadScopeFields,
      })
      .strict(),
    z
      .object({
        type: z.literal("thread.goal.updated"),
        ...requestIdField,
        ...threadScopeFields,
        goal: threadGoalSchema,
      })
      .strict(),
    z
      .object({
        type: z.literal("thread.goal.cleared"),
        ...requestIdField,
        ...threadScopeFields,
        cleared: z.boolean(),
      })
      .strict(),
    z
      .object({
        type: z.literal("thread.goal.snapshot"),
        ...requestIdField,
        ...threadScopeFields,
        goal: threadGoalSchema.nullable(),
      })
      .strict(),
    z
      .object({
        type: z.literal("serverRequest.respond.accepted"),
        ...requestIdField,
        ...threadScopeFields,
        serverRequestId: z.union([z.string(), z.number()]),
      })
      .strict(),
    z
      .object({
        type: z.literal("terminal.opened"),
        ...requestIdField,
        session: terminalSessionSchema,
      })
      .strict(),
    z
      .object({
        type: z.literal("terminal.snapshot"),
        ...requestIdField,
        sessions: z.array(terminalSessionSchema),
      })
      .strict(),
    z
      .object({ type: z.literal("terminal.closed"), ...requestIdField, sessionId: nonEmptyString })
      .strict(),
    z.object({ type: z.literal("terminal.closed.event"), sessionId: nonEmptyString }).strict(),
    z
      .object({
        type: z.literal("terminal.output"),
        sessionId: nonEmptyString,
        data: z.string(),
        seq: nonNegativeId,
        createdAt: nonEmptyString,
      })
      .strict(),
    z
      .object({
        type: z.literal("terminal.exited"),
        sessionId: nonEmptyString,
        code: z.number().int().nullable(),
        signal: z.string().nullable(),
        createdAt: nonEmptyString,
      })
      .strict(),
    z
      .object({
        type: z.literal("terminal.error"),
        sessionId: z.string().optional(),
        message: z.string(),
        requestId: z.string().optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal("browser.opened"),
        ...requestIdField,
        session: browserSessionSchema,
      })
      .strict(),
    z
      .object({ type: z.literal("browser.closed"), ...requestIdField, sessionId: nonEmptyString })
      .strict(),
    z
      .object({
        type: z.literal("browser.error"),
        requestId: z.string().optional(),
        sessionId: z.string().optional(),
        message: z.string(),
      })
      .strict(),
    z
      .object({
        type: z.literal("browser.framePolicyWarning"),
        sessionId: nonEmptyString,
        policy: z.enum(["x-frame-options", "content-security-policy"]),
        value: z.string(),
      })
      .strict(),
    z
      .object({
        type: z.literal("error"),
        message: z.string(),
        requestId: z.string().optional(),
        request: realtimeClientMessageSchema.optional(),
        code: z.string().optional(),
        details: z.record(z.string(), z.unknown()).optional(),
      })
      .strict(),
    z.object({ type: z.literal("pong"), nonce: z.string().optional() }).strict(),
  ],
);
