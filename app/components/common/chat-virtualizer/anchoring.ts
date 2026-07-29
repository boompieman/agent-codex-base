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
  const measuredEnd = item.end + delta;

  // TanStack's default first-measurement policy compensates whenever the estimated row starts
  // above the fold. During upward scrolling, an estimated row can still span the fold; replacing
  // that estimate and adjusting scrollTop moves the text currently under the reader. The public
  // size-change hook exists for this chat-specific distinction, so only rows whose measured box
  // is entirely above the viewport may move the outer timeline anchor.
  //
  // Do not disable this compensation while scrolling backward. Upward scrolling is precisely when
  // estimated rows mount above the viewport; ignoring their estimate-to-measurement delta makes
  // every newly mounted row displace the text under the reader. The fully-above-fold condition is
  // what separates safe anchor compensation from growth in a visible streaming row.
  //
  // Do not broaden this to item.start < scrollOffset or add another gesture state machine here.
  // Diff and command output own bounded inner scrollports and never participate in this outer
  // timeline adjustment. Keeping the policy at the virtualizer boundary also prevents individual
  // message renderers from applying competing scrollTop writes.
  return measuredEnd <= (scrollOffset ?? 0);
}
