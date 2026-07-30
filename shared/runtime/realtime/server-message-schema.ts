import { z } from "zod";
import type { RealtimeServerMessage } from "../../types";
import { threadTimelineItemTypes } from "../../thread-history/types";
import { gatewayThreadSchema, rpcEnvelopeSchema, threadGoalSchema } from "../app-server";
import { realtimeClientMessageSchema } from "./client-message-schema";
import {
  nonEmptyString,
  nonNegativeId,
  nullableString,
  positiveId,
  requestIdField,
  threadScopeFields,
} from "./common";

const projectedHistoryItemSchema = z
  .object({
    id: z.union([z.string(), z.number()]).nullish(),
    type: z.enum(threadTimelineItemTypes),
  })
  .loose();
const projectedHistoryTurnSchema = z
  .object({
    id: nonEmptyString,
    status: z.union([z.string(), z.object({ type: z.unknown().optional() }).loose()]).nullish(),
    items: z.array(projectedHistoryItemSchema),
    itemsView: z.enum(["notLoaded", "summary", "full"]).optional(),
    startedAt: z.union([z.number(), z.string()]).nullish(),
    completedAt: z.union([z.number(), z.string()]).nullish(),
    durationMs: z.number().nullish(),
  })
  .loose();
const threadHistorySchema = z
  .object({
    thread: z
      .object({
        id: nonEmptyString,
        // This is Gateway's reducer projection, not the official Thread.turns DTO. Items retain
        // event-specific fields and partially materialized turns are valid while streaming. The
        // strict 0.146 schema belongs at the app-server RPC boundary; reusing it here would reject
        // Gateway state such as active context compaction and paginated history.
        turns: z.array(projectedHistoryTurnSchema),
      })
      .strict(),
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
const tmuxPaneSnapshotSchema = z
  .object({
    sessionName: z.string(),
    sessionId: nonEmptyString,
    sessionCreated: z.number(),
    windowIndex: z.number().int().nonnegative(),
    windowName: z.string(),
    paneIndex: z.number().int().nonnegative(),
    paneId: nonEmptyString,
    panePid: positiveId,
    currentCommand: z.string(),
    running: z.boolean(),
  })
  .strict();
const tmuxSessionsSnapshotFields = {
  hostId: positiveId,
  sessions: z.array(
    z
      .object({
        name: z.string(),
        sessionId: nonEmptyString,
        sessionCreated: z.number(),
        panes: z.array(tmuxPaneSnapshotSchema),
      })
      .strict(),
  ),
  error: z.string().nullable(),
  scannedAt: nonEmptyString,
};
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
  thread: gatewayThreadSchema,
  history: threadHistorySchema,
  lastEventId: nonNegativeId,
  eventEpoch: nonEmptyString,
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
const hostMetricsStatusSchema = z.enum([
  "waiting",
  "collecting",
  "disconnected",
  "unsupported",
  "error",
]);
const nullableMetric = z.number().nullable();
const filesystemMetricsSchema = z
  .object({
    device: z.string(),
    filesystemType: z.string(),
    mountPoint: z.string(),
    totalBytes: z.number().nonnegative(),
    usedBytes: z.number().nonnegative(),
    availableBytes: z.number().nonnegative(),
    usagePercent: z.number(),
  })
  .strict();
const hostMetricsSampleSchema = z
  .object({
    sampledAt: nonEmptyString,
    cpu: z
      .object({
        usagePercent: nullableMetric,
        loadAverage: z.tuple([z.number(), z.number(), z.number()]),
      })
      .strict(),
    memory: z
      .object({
        totalBytes: z.number().nonnegative(),
        usedBytes: z.number().nonnegative(),
        availableBytes: z.number().nonnegative(),
        usagePercent: z.number(),
      })
      .strict(),
    network: z
      .object({
        receiveBytesPerSecond: nullableMetric,
        transmitBytesPerSecond: nullableMetric,
        interfaces: z.array(z.string()),
      })
      .strict(),
    disk: z
      .object({
        readBytesPerSecond: nullableMetric,
        writeBytesPerSecond: nullableMetric,
        filesystems: z.array(filesystemMetricsSchema),
      })
      .strict(),
    gpus: z.array(
      z
        .object({
          index: z.number().int().nonnegative(),
          uuid: z.string(),
          name: z.string(),
          utilizationPercent: nullableMetric,
          memoryUsedBytes: z.number().nonnegative(),
          memoryTotalBytes: z.number().nonnegative(),
          memoryUsagePercent: z.number(),
          temperatureCelsius: nullableMetric,
        })
        .strict(),
    ),
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
    z
      .object({
        type: z.literal("host.metrics.snapshot"),
        ...requestIdField,
        hostId: positiveId,
        status: hostMetricsStatusSchema,
        message: z.string().nullable(),
        samples: z.array(hostMetricsSampleSchema),
      })
      .strict(),
    z
      .object({
        type: z.literal("host.metrics.sample"),
        hostId: positiveId,
        sample: hostMetricsSampleSchema,
      })
      .strict(),
    z
      .object({
        type: z.literal("host.metrics.status"),
        hostId: positiveId,
        status: hostMetricsStatusSchema,
        message: z.string().nullable(),
      })
      .strict(),
    z
      .object({
        type: z.literal("tmux.sessions.snapshot"),
        ...requestIdField,
        ...tmuxSessionsSnapshotFields,
      })
      .strict(),
    z.object({ type: z.literal("tmux.sessions.updated"), ...tmuxSessionsSnapshotFields }).strict(),
    z.object({ type: z.literal("thread.event"), event: gatewayEventSchema }).strict(),
    z
      .object({
        type: z.literal("thread.events.gap"),
        ...threadScopeFields,
        afterId: nonNegativeId,
        lastEventId: nonNegativeId,
        eventEpoch: nonEmptyString,
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
