import type { ThreadTimelineItem, ThreadTimelineTurn } from "~~/shared/types";
import { recordFromUnknown } from "~~/shared/utils/records";
import { firstNonEmptyString, trimmedOrNull } from "~~/shared/utils/strings";

const ACTIVE_AGENT_STATUSES = new Set(["inProgress"]);

export interface ActiveSubAgent {
  threadId: string;
  agentPath: string | null;
  status: string;
}

export function activeSubAgentsFromTurns(turns: ThreadTimelineTurn[]): ActiveSubAgent[] {
  const agents = new Map<string, ActiveSubAgent>();
  // Activity items provide the stable thread/path identity, while collab tool
  // state is app-server's latest lifecycle snapshot. Fold both chronologically;
  // do not keep a second client-side agent registry that can outlive the thread.
  for (const turn of turns) {
    for (const item of Array.isArray(turn.items) ? turn.items : []) {
      if (item?.type === "subAgentActivity") applyActivity(agents, item);
      if (item?.type === "collabAgentToolCall") applyCollabState(agents, item);
    }
  }
  return [...agents.values()];
}

function applyActivity(agents: Map<string, ActiveSubAgent>, item: ThreadTimelineItem) {
  const threadId = text(item.agentThreadId);
  if (threadId === "") return;
  if (item.kind === "interrupted" || item.kind === "completed") {
    // App Server V2 emits a terminal activity independently of the latest collab tool snapshot.
    // Remove it here so a completed child cannot remain in the user-level active-agent bar.
    agents.delete(threadId);
    return;
  }
  const existing = agents.get(threadId);
  agents.set(threadId, {
    threadId,
    agentPath: firstNonEmptyString([text(item.agentPath), existing?.agentPath]),
    status: existing?.status ?? "inProgress",
  });
}

function applyCollabState(agents: Map<string, ActiveSubAgent>, item: ThreadTimelineItem) {
  const receiverIds = Array.isArray(item.receiverThreadIds)
    ? item.receiverThreadIds.map(String)
    : [];
  const states = recordFromUnknown(item.agentsStates) ?? {};
  for (const threadId of new Set([...receiverIds, ...Object.keys(states)])) {
    const state = recordFromUnknown(states[threadId]);
    const status = text(state?.status);
    if (status !== "" && !ACTIVE_AGENT_STATUSES.has(status)) {
      agents.delete(threadId);
      continue;
    }
    if (status === "" && item.tool !== "spawnAgent") continue;
    const existing = agents.get(threadId);
    agents.set(threadId, {
      threadId,
      agentPath: existing?.agentPath ?? null,
      status: status === "" ? "inProgress" : status,
    });
  }
}

function text(value: unknown) {
  return typeof value === "string" ? (trimmedOrNull(value) ?? "") : "";
}
