import type { GatewayEvent, ProjectRecord } from "./records";
import type { ThreadHistoryState, ThreadHistoryTurn } from "../thread-history/types";

export type ThreadRuntimeStatus = "idle" | "running" | "completed" | "failed" | "interrupted";
export type ThreadGoalStatus =
  | "active"
  | "paused"
  | "blocked"
  | "usageLimited"
  | "budgetLimited"
  | "complete";

export interface ThreadGoal {
  threadId: string;
  objective: string;
  status: ThreadGoalStatus;
  tokenBudget: number | null;
  tokensUsed: number;
  timeUsedSeconds: number;
  createdAt: number;
  updatedAt: number;
}

export interface ThreadGoalTimelineItem extends Record<string, unknown> {
  type: "threadGoal";
  id: string;
  turnId?: string | null;
  threadId: string;
  objective: string;
  status: ThreadGoalStatus;
  tokenBudget: number | null;
  tokensUsed: number;
  timeUsedSeconds: number;
  createdAt: number;
  updatedAt: number;
}

export interface ThreadOpenResult {
  hostId: number;
  thread: AppServerThread;
  history: ThreadHistoryState;
  lastEventId: number;
  runtimeStatus?: ThreadRuntimeStatus | null;
  threadSettings?: ThreadSettingsState | null;
  tokenUsage?: ThreadTokenUsageState | null;
  projectId?: number | null;
  project?: ProjectRecord | null;
  turnsPage: {
    nextCursor: string | null;
    backwardsCursor: string | null;
  };
  recentEvents: GatewayEvent[];
}

export interface ThreadTurnsPageResult {
  history: ThreadHistoryState;
  turnsPage: {
    nextCursor: string | null;
    backwardsCursor: string | null;
  };
}

export type ApprovalPolicy = "untrusted" | "on-request" | "never";
export type ReasoningEffort = string;

export interface ThreadSettingsState {
  model?: string | null;
  effort?: ReasoningEffort | null;
  approvalPolicy?: ApprovalPolicy | null;
}

export interface TokenUsageBreakdown {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}

export interface AppServerThread extends Record<string, unknown> {
  id: string;
  title?: string | null;
  name?: string | null;
  preview?: string | null;
  projectId?: number | null;
  cwd?: string | null;
  status?: import("../thread-history/types").ThreadHistoryStatus;
  pinned?: boolean;
  recencyAt?: number | null;
  updatedAt?: number;
  createdAt?: number;
  parentThreadId?: string | null;
  source?:
    | "cli"
    | "vscode"
    | "exec"
    | "appServer"
    | "unknown"
    | { custom: string }
    | { subAgent: unknown };
  /** Human-readable identity assigned by AgentControl for a spawned sub-agent. */
  agentNickname?: string | null;
  /** Functional role paired with agentNickname, for example `explorer`. */
  agentRole?: string | null;
  /** False for parent-managed sub-agents that cannot accept direct turns. */
  canAcceptDirectInput?: boolean | null;
  /** Populated by resume/read responses; list/start responses may omit persisted turns. */
  turns?: ThreadHistoryTurn[];
}

export interface ThreadTokenUsageState {
  total: TokenUsageBreakdown;
  last: TokenUsageBreakdown;
  modelContextWindow: number | null;
}

export interface ComposerTurnOptions {
  model?: string | null;
  effort?: ReasoningEffort | null;
  approvalPolicy?: ApprovalPolicy | null;
  collaborationMode?: {
    mode: "default" | "plan";
    settings: {
      model: string;
      reasoningEffort?: ReasoningEffort | null;
      developerInstructions?: string | null;
    };
  } | null;
  images?: Array<{
    path?: string;
    url?: string;
    detail?: "low" | "high" | "auto" | "original";
  }>;
  files?: Array<{
    path: string;
    name: string;
    mimeType?: string | null;
    size: number;
    isImage: boolean;
  }>;
}
