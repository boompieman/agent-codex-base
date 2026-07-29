import type { ThreadTimelineItem, ThreadTimelineTurn } from "~~/shared/types";
import { markRaw, toRaw } from "vue";
import { itemKey, userMessageVariant, type ThreadTurnSections } from "./thread-turn-sections";

export type { ThreadTimelineTurn } from "~~/shared/types";

type ThreadTimelineItemSection = "user" | "intermediate" | "final";

const estimatedItemHeights: Partial<Record<ThreadTimelineItem["type"], number>> = {
  commandExecution: 48,
  fileChange: 440,
  agentMessage: 144,
  reasoning: 128,
  userMessage: 160,
};

export type ThreadTimelineRow =
  | {
      key: string;
      type: "intermediateHeader";
      turnId: string;
      count: number;
      open: boolean;
    }
  | {
      key: string;
      type: "item";
      turnId: string;
      section: ThreadTimelineItemSection;
      item: ThreadTimelineItem;
      userMessageVariant: "normal" | "steer";
    };

export interface ThreadTimelineTurnState {
  turn: ThreadTimelineTurn;
  sections: ThreadTurnSections;
  intermediateOpen: boolean;
}

// Every visible entry is a direct row of the Agent timeline. Do not wrap intermediate items in a
// second virtualizer: two height caches sharing one scroll element can leave stale blank space on
// WebKit. Collapsing is represented only by omitting intermediate item rows from this flat model.
export function buildThreadTimelineRows(input: {
  threadId: string | null;
  turns: ThreadTimelineTurnState[];
}) {
  return input.turns.flatMap(({ turn, sections, intermediateOpen }) => {
    const rows: ThreadTimelineRow[] = [];
    appendItemRows(rows, input.threadId, turn.id, "user", sections.userItems, sections);

    if (sections.intermediateItems.length) {
      rows.push({
        key: `${input.threadId}:turn-${turn.id}:intermediate-header`,
        type: "intermediateHeader",
        turnId: turn.id,
        count: sections.intermediateItems.length,
        open: intermediateOpen,
      });
      if (intermediateOpen) {
        appendItemRows(
          rows,
          input.threadId,
          turn.id,
          "intermediate",
          sections.intermediateItems,
          sections,
        );
      }
    }

    appendItemRows(rows, input.threadId, turn.id, "final", sections.finalItems, sections);
    return rows;
  });
}

export function reuseUnchangedTimelineRows(
  previous: ThreadTimelineRow[] | undefined,
  next: ThreadTimelineRow[],
) {
  if (previous === undefined || previous.length === 0) return next;
  const previousByKey = new Map(previous.map((row) => [row.key, row]));
  return next.map((row) => {
    const candidate = previousByKey.get(row.key);
    return candidate !== undefined && sameTimelineRow(candidate, row) ? candidate : row;
  });
}

export function estimateThreadTimelineRow(row: ThreadTimelineRow | undefined) {
  if (row === undefined) return 96;
  if (row.type === "intermediateHeader") return 48;
  return estimatedItemHeights[row.item.type] ?? 96;
}

export function createThreadTimelinePresentationRow(row: ThreadTimelineRow) {
  if (row.type === "intermediateHeader") return row;

  // App-server deltas mutate the reactive item retained by the history store. Passing that proxy
  // directly into a row component lets it update independently of the virtual viewport, so an
  // outer `v-memo` cannot freeze presentation during native scrolling. A shallow immutable view
  // model snapshots scalar stream fields (notably Agent text and command output) without copying
  // their potentially large string payloads. Nested values come from Vue's raw target and remain
  // non-reactive; the next committed presentation revision creates the next view model.
  //
  // Keep this conversion beside the timeline row model rather than in the generic virtualizer:
  // only this layer knows which field is the app-server proxy, while file trees and other virtual
  // lists must not pay for chat-specific snapshots.
  const rawItem = toRaw(row.item);
  return markRaw({
    ...row,
    item: markRaw({ ...rawItem }) as ThreadTimelineItem,
  }) satisfies ThreadTimelineRow;
}

function appendItemRows(
  rows: ThreadTimelineRow[],
  threadId: string | null,
  turnId: string,
  section: ThreadTimelineItemSection,
  items: ThreadTimelineItem[],
  sections: ThreadTurnSections,
) {
  items.forEach((item, index) => {
    rows.push({
      key: `${threadId}:turn-${turnId}:${section}:${itemKey(item, section, index)}`,
      type: "item",
      turnId,
      section,
      item,
      userMessageVariant: userMessageVariant(item, sections),
    });
  });
}

function sameTimelineRow(left: ThreadTimelineRow, right: ThreadTimelineRow) {
  if (left.type !== right.type) return false;
  if (left.type === "intermediateHeader" && right.type === "intermediateHeader") {
    return left.count === right.count && left.open === right.open && left.turnId === right.turnId;
  }
  if (left.type === "item" && right.type === "item") {
    // App-server reducers preserve reactive item proxies for output deltas and replace the item for
    // structural updates. Reusing the wrapper in the first case still reacts to nested text/output,
    // while preventing every unrelated Markdown row from receiving a fresh prop on each token.
    return (
      left.item === right.item &&
      left.turnId === right.turnId &&
      left.section === right.section &&
      left.userMessageVariant === right.userMessageVariant
    );
  }
  return false;
}
