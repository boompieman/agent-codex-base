import { itemKey, userMessageVariant, type ThreadTurnSections } from "./thread-turn-sections";

export type ThreadTimelineTurn = Record<string, any> & {
  id: string;
};

type ThreadTimelineItemSection = "user" | "intermediate" | "final";

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
      item: any;
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

export function estimateThreadTimelineRow(row: ThreadTimelineRow | undefined) {
  if (!row) return 96;
  if (row.type === "intermediateHeader") return 48;
  switch (row.item?.type) {
    case "commandExecution":
      return 48;
    case "fileChange":
      return 440;
    case "agentMessage":
      return 144;
    case "reasoning":
      return 128;
    case "userMessage":
      return 160;
    default:
      return 96;
  }
}

function appendItemRows(
  rows: ThreadTimelineRow[],
  threadId: string | null,
  turnId: string,
  section: ThreadTimelineItemSection,
  items: any[],
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
