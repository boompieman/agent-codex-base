import { z } from "zod";
import type {
  AppServerThread,
  RpcEnvelope,
  ThreadGoal,
  ThreadHistoryItem,
  ThreadHistoryTurn,
} from "../types";

const rpcIdSchema = z.union([z.string(), z.number()]);
const rpcErrorSchema = z
  .object({
    code: z.number(),
    message: z.string(),
    data: z.unknown().optional(),
  })
  .strict();
const rpcTraceSchema = z
  .object({
    traceparent: z.string().nullable().optional(),
    tracestate: z.string().nullable().optional(),
  })
  .strict()
  .nullable()
  .optional();

// Codex app-server uses four JSONL envelope shapes: request, notification, success response and
// error response. Keeping their discriminants required rejects `{}` and unrelated objects at the
// transport boundary instead of silently routing them as notifications.
export const rpcEnvelopeSchema = z.union([
  z
    .object({
      id: rpcIdSchema,
      method: z.string().min(1),
      params: z.unknown().optional(),
      trace: rpcTraceSchema,
    })
    .strict(),
  z
    .object({
      method: z.string().min(1),
      params: z.unknown().optional(),
      emittedAtMs: z.number().optional(),
    })
    .strict(),
  z.object({ id: rpcIdSchema, result: z.unknown() }).strict(),
  z.object({ id: rpcIdSchema, error: rpcErrorSchema }).strict(),
]);

export function parseRpcEnvelope(value: unknown): RpcEnvelope {
  return rpcEnvelopeSchema.parse(value);
}

const threadItemSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
  })
  .loose();

export const threadTurnSchema = z
  .object({
    id: z.string().min(1),
    items: z.array(threadItemSchema),
    status: z.union([z.string(), z.object({ type: z.unknown().optional() }), z.null()]).optional(),
  })
  .loose();

export const turnsPageSchema = z
  .object({
    data: z.array(threadTurnSchema),
    nextCursor: z.string().nullable().optional(),
    backwardsCursor: z.string().nullable().optional(),
  })
  .loose();

export function parseTurnsPage(value: unknown) {
  return turnsPageSchema.parse(value);
}

export const appServerThreadSchema = z
  .object({
    id: z.string().min(1),
    cwd: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    preview: z.string().nullable().optional(),
    parentThreadId: z.string().nullable().optional(),
    source: z
      .union([
        z.enum(["cli", "vscode", "exec", "appServer", "unknown"]),
        z.object({ custom: z.string() }).strict(),
        z.object({ subAgent: z.unknown() }).strict(),
      ])
      .optional(),
    agentNickname: z.string().nullable().optional(),
    agentRole: z.string().nullable().optional(),
    projectId: z.number().nullable().optional(),
    status: z.union([z.string(), z.object({ type: z.unknown().optional() }), z.null()]).optional(),
    pinned: z.boolean().optional(),
    recencyAt: z.number().nullable().optional(),
    updatedAt: z.number().optional(),
    createdAt: z.number().optional(),
    canAcceptDirectInput: z.boolean().nullable().optional(),
    turns: z.array(threadTurnSchema).optional(),
  })
  .loose();

export function parseAppServerThread(value: unknown): AppServerThread {
  return appServerThreadSchema.parse(value);
}

export function appServerThreadFromUnknown(value: unknown): AppServerThread | null {
  const result = appServerThreadSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function isAppServerSubAgentThread(thread: AppServerThread) {
  const parentThreadId = thread.parentThreadId?.trim();
  return (
    (parentThreadId !== undefined && parentThreadId !== "") ||
    (typeof thread.source === "object" && "subAgent" in thread.source)
  );
}

const threadListPageSchema = z
  .object({
    data: z.array(appServerThreadSchema),
    nextCursor: z.string().nullable(),
  })
  .loose();

export interface AppServerThreadListPage {
  data: AppServerThread[];
  nextCursor: string | null;
}

export function parseThreadListPage(value: unknown): AppServerThreadListPage {
  const page = threadListPageSchema.parse(value);
  return { data: page.data, nextCursor: page.nextCursor };
}

export function threadHistoryItemFromUnknown(value: unknown): ThreadHistoryItem | null {
  const result = threadItemSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function threadHistoryTurnFromUnknown(value: unknown): ThreadHistoryTurn | null {
  const result = threadTurnSchema.safeParse(value);
  return result.success ? result.data : null;
}

export const threadGoalSchema = z
  .object({
    threadId: z.string().min(1),
    objective: z.string(),
    status: z.enum(["active", "paused", "blocked", "usageLimited", "budgetLimited", "complete"]),
    tokenBudget: z.number().nullable(),
    tokensUsed: z.number(),
    timeUsedSeconds: z.number(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .loose();

export function parseThreadGoalSetResponse(value: unknown) {
  return z.object({ goal: threadGoalSchema }).loose().parse(value);
}

export function parseThreadGoalGetResponse(value: unknown) {
  return z.object({ goal: threadGoalSchema.nullable() }).loose().parse(value);
}

export function parseThreadGoalClearResponse(value: unknown) {
  return z.object({ cleared: z.boolean() }).loose().parse(value);
}

export function parseTurnStartResponse(value: unknown) {
  return z.object({ turn: threadTurnSchema.optional() }).loose().parse(value);
}

export function parseTurnSteerResponse(value: unknown) {
  return z.object({ turnId: z.string().optional() }).loose().parse(value);
}

export function parseInitializeResponse(value: unknown) {
  return z.object({ userAgent: z.string().optional() }).loose().parse(value);
}

export interface LoadedThreadsPage {
  data: string[];
  nextCursor?: string | null;
}

export function parseLoadedThreadsPage(value: unknown): LoadedThreadsPage {
  return z
    .object({
      data: z.array(z.string()).default([]),
      nextCursor: z.string().nullable().optional(),
    })
    .loose()
    .parse(value);
}

export function threadGoalFromUnknown(value: unknown): ThreadGoal | null {
  const result = threadGoalSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function parseThreadStartResult(value: unknown) {
  const result = z.object({ thread: appServerThreadSchema }).loose().parse(value);
  return { raw: result, thread: result.thread };
}

export function parseThreadResumeResult(value: unknown) {
  const result = z
    .object({
      thread: appServerThreadSchema,
      initialTurnsPage: turnsPageSchema,
    })
    .loose()
    .parse(value);
  return {
    ...result,
    thread: result.thread,
    initialTurnsPage: {
      ...result.initialTurnsPage,
      data: result.initialTurnsPage.data,
    },
  };
}
