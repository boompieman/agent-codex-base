import { useEventListener } from "@vueuse/core";
import {
  computed,
  nextTick,
  ref,
  toValue,
  type ComponentPublicInstance,
  type MaybeRefOrGetter,
} from "vue";
import { createChatVirtualizerBehavior } from "./anchoring";
import { useDirectDomVirtualizer } from "./direct-dom-virtualizer";

interface ChatVirtualizerOptions {
  count: MaybeRefOrGetter<number>;
  getViewport: () => HTMLElement | null;
  getItemKey: (index: number) => string | number;
  estimateSize: (index: number) => number;
  threshold?: MaybeRefOrGetter<number>;
  overscan?: MaybeRefOrGetter<number>;
  onViewportScroll?: (viewport: HTMLElement) => void;
}

export function useChatVirtualizer(options: ChatVirtualizerOptions) {
  const threshold = () => toValue(options.threshold) ?? 120;
  // Mirror core's at-end result only from real scroll transactions. Reading isAtEnd from a
  // computed during setOptions can observe core's eagerly resolved anchor against Vue's previous
  // DOM height; that transient geometry must not drive UI policy such as intermediate collapse.
  // This ref does not infer input intent or write scrollTop: TanStack remains the sole authority.
  const followLatest = ref(true);
  const viewportElement = computed(options.getViewport);
  const directVirtualizer = useDirectDomVirtualizer(
    computed(() => ({
      count: toValue(options.count),
      getScrollElement: options.getViewport,
      getItemKey: options.getItemKey,
      estimateSize: options.estimateSize,
      overscan: toValue(options.overscan) ?? 0,
      ...createChatVirtualizerBehavior(threshold()),
    })),
  );
  const virtualizer = directVirtualizer.virtualizer;
  const virtualItems = computed(() => virtualizer.value.getVirtualItems());
  const isScrolling = computed(() => virtualizer.value.isScrolling);
  const userDetached = computed(() => !followLatest.value);

  // Virtual Core intentionally coalesces onChange by range/isScrolling. A single very tall Agent
  // row can scroll without changing either value, so onChange is not an offset event stream. Use
  // VueUse's passive native listener only to project actual viewport geometry into UI state; core
  // still owns measurements, end following, iOS deferral, prepend anchors, and every scroll write.
  useEventListener(
    viewportElement,
    "scroll",
    (event) => {
      const viewport = event.currentTarget;
      if (!(viewport instanceof HTMLElement)) return;
      const distanceFromEnd = Math.max(
        0,
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight,
      );
      followLatest.value = distanceFromEnd <= threshold();
      options.onViewportScroll?.(viewport);
    },
    { passive: true },
  );

  function elementFromRef(refValue: Element | ComponentPublicInstance | null) {
    return refValue instanceof Element ? refValue : null;
  }

  function measureElement(refValue: Element | ComponentPublicInstance | null) {
    const element = elementFromRef(refValue);
    if (element === null) return null;

    const index = element instanceof HTMLElement ? Number(element.dataset.index) : Number.NaN;
    if (Number.isFinite(index)) directVirtualizer.measureElement(element);
    return element;
  }

  function refresh() {
    // Dockview can keep a panel mounted while its viewport is temporarily hidden. Reconnect the
    // official observer and reapply core-computed transforms when it becomes visible again, but do
    // not restore a DOM anchor or write scrollTop here. TanStack's measurement cache and Chat
    // anchoring remain the only source of scroll geometry.
    directVirtualizer.refresh({ forceStyles: true, remeasure: false });
  }

  async function scrollToLatest() {
    await nextTick();
    refresh();
    // The official Chat guide recommends an imperative initial scroll after the viewport mounts.
    // Later appends and streaming growth are owned by followOnAppend/end anchoring; repeatedly
    // calling this method for content updates would override a reader who intentionally scrolled up.
    virtualizer.value.scrollToEnd({ behavior: "auto" });
    followLatest.value = true;
  }

  return {
    containerRef: directVirtualizer.containerRef,
    followLatest,
    isScrolling,
    measureElement,
    refresh,
    scrollToLatest,
    userDetached,
    virtualItems,
    virtualizer,
  };
}
