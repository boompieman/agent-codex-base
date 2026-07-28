import {
  elementScroll,
  type VirtualItem,
  type Virtualizer,
  type VirtualizerOptions,
} from "@tanstack/virtual-core";

type ChatVirtualizerBehavior = Pick<
  VirtualizerOptions<HTMLElement, Element>,
  "anchorTo" | "followOnAppend" | "initialOffset" | "scrollEndThreshold" | "scrollToFn"
>;

export function createChatVirtualizerBehavior(options: {
  followLatest: boolean;
  scrollEndThreshold: number;
}): ChatVirtualizerBehavior {
  // This config owns only the outer, unbounded Agent timeline. Diff and command
  // output use independent max-height viewports; their input events stay inside
  // those components and must never toggle or drive this outer scroll instance.
  //
  // End anchoring is only valid while following. During dynamic measurement TanStack can report
  // an end-distance sentinel that still satisfies even a negative-infinity threshold; leaving
  // anchorTo="end" would then run the core's wasAtEnd resize branch before our custom predicate
  // and pull a detached reader downward. Detached history prepends are preserved by the keyed DOM
  // anchor in direct-dom-virtualizer instead, so using start anchoring here is intentional.
  const scrollEndThreshold = options.followLatest
    ? options.scrollEndThreshold
    : Number.NEGATIVE_INFINITY;
  return {
    anchorTo: options.followLatest ? "end" : "start",
    followOnAppend: options.followLatest,
    initialOffset: () => 1_000_000_000,
    scrollEndThreshold,
    scrollToFn: (
      offset: number,
      scrollOptions: Parameters<VirtualizerOptions<HTMLElement, Element>["scrollToFn"]>[1],
      instance: Parameters<VirtualizerOptions<HTMLElement, Element>["scrollToFn"]>[2],
    ) => {
      elementScroll(offset, scrollOptions, instance);
    },
  };
}

export function shouldAdjustChatScrollForSizeChange(
  item: VirtualItem,
  delta: number,
  instance: Virtualizer<HTMLElement, Element>,
  followLatest: boolean,
) {
  if (followLatest) return true;

  const viewport = instance.scrollElement;
  const scrollOffset = viewport instanceof HTMLElement ? viewport.scrollTop : instance.scrollOffset;
  const isFirstMeasurement = !instance.itemSizeCache.has(item.key);
  const measuredEnd = item.end + delta;
  // Dynamic rows enter the overscan window with estimated heights. Replacing an estimate for a
  // row that is entirely above the viewport must move scrollTop by the same delta or every visible
  // row drifts. This is the standard TanStack chat predicate used by Vibe Kanban and NextClaw.
  //
  // Use the measured end, not item.end: item still contains the old estimate when this callback
  // runs. A row can shrink from an estimate that crosses the fold to a real box entirely above it;
  // checking the stale end skips the required correction and shifts the viewport by that row's
  // full estimate delta. Do not broaden this to item.start < scrollOffset: a row that remains
  // visible across the top edge must not move content under the reader.
  //
  // For rows TanStack has already measured, retain Virtual Core's backward direction guard.
  // Otherwise iOS queues those remeasurement deltas during touch/momentum and replays a stale
  // aggregate after touchend. TanStack still owns correction timing and its iOS deferral; this
  // predicate only decides which deltas are valid. Diff and command output use separate bounded
  // scrollports and never enter this rule.
  return (
    measuredEnd <= (scrollOffset ?? 0) &&
    (isFirstMeasurement || instance.scrollDirection !== "backward")
  );
}
