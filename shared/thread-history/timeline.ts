import {
  threadTimelineItemTypes,
  type ThreadHistoryItem,
  type ThreadHistoryTurn,
  type ThreadTimelineItem,
  type ThreadTimelineItemType,
  type ThreadTimelineTurn,
} from "./types";

const timelineItemTypes = new Set<string>(threadTimelineItemTypes);

export function isThreadTimelineItemType(value: unknown): value is ThreadTimelineItemType {
  return typeof value === "string" && timelineItemTypes.has(value);
}

export function asThreadTimelineItem(item: ThreadHistoryItem): ThreadTimelineItem | null {
  return isThreadTimelineItem(item) ? item : null;
}

function isThreadTimelineItem(item: ThreadHistoryItem): item is ThreadTimelineItem {
  return isThreadTimelineItemType(item.type);
}

/**
 * The timeline only accepts typed rows. Unknown future protocol items remain in the history store,
 * but are deliberately excluded here until a presenter is registered for them.
 */
export function asThreadTimelineTurn(turn: ThreadHistoryTurn): ThreadTimelineTurn | null {
  if (typeof turn.id !== "string") return null;
  return {
    ...turn,
    id: turn.id,
    items: (turn.items ?? []).flatMap((item) => {
      const timelineItem = asThreadTimelineItem(item);
      return timelineItem ? [timelineItem] : [];
    }),
  };
}
