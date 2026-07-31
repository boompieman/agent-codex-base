import { useResizeObserver } from "@vueuse/core";
import type { DockviewApi } from "dockview-vue";
import type { Ref } from "vue";
import { nextTick, onBeforeUnmount } from "vue";

const SIZE_TOLERANCE_PX = 1;

/**
 * Keeps Dockview's internal grid aligned with the flex item that owns it.
 *
 * Dockview already observes its root element. The extra observer here is deliberate: during a
 * keyed Host/Project/Thread switch, `fromJSON()` can run while the surrounding flex tree is still
 * committing. In that window Dockview may snapshot a smaller height, while the outer flex item
 * reaches its final height immediately afterwards. We only repair a detected mismatch through
 * Dockview's public `layout()` API; Agent and Files must not maintain a second, competing height.
 */
export function useDockviewGeometryGuard(options: {
  host: Readonly<Ref<HTMLElement | null>>;
  api: Readonly<Ref<DockviewApi | null>>;
  scopeKey: () => string;
}) {
  let repairQueued = false;
  let disposed = false;

  async function repair(reason: "restore" | "host-resize") {
    if (repairQueued || disposed) return;
    repairQueued = true;
    await nextTick();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    repairQueued = false;

    const host = options.host.value;
    const api = options.api.value;
    if (disposed || !host || !api || host.clientWidth === 0 || host.clientHeight === 0) return;

    const widthDelta = Math.abs(api.width - host.clientWidth);
    const heightDelta = Math.abs(api.height - host.clientHeight);
    if (widthDelta <= SIZE_TOLERANCE_PX && heightDelta <= SIZE_TOLERANCE_PX) return;

    // Do not write CSS dimensions or touch panel content here. Dockview owns group proportions;
    // re-running its official layout transaction preserves those proportions and repairs only the
    // stale outer geometry observed after a scope restore.
    console.warn("[workspace] repaired Dockview geometry", {
      reason,
      scopeKey: options.scopeKey(),
      hostWidth: host.clientWidth,
      hostHeight: host.clientHeight,
      dockviewWidth: api.width,
      dockviewHeight: api.height,
    });
    api.layout(host.clientWidth, host.clientHeight, true);
  }

  const resizeObserver = useResizeObserver(options.host, () => {
    void repair("host-resize");
  });

  onBeforeUnmount(() => {
    disposed = true;
    resizeObserver.stop();
  });

  return { repair };
}
