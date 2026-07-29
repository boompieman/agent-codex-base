import { toValue, watch, type MaybeRefOrGetter, type ShallowRef } from "vue";

interface ScrollBufferedPresentationOptions<T> {
  source: MaybeRefOrGetter<readonly T[]>;
  sourceRevision: MaybeRefOrGetter<unknown>;
  frozen: MaybeRefOrGetter<boolean>;
  presented: ShallowRef<T[]>;
  presentationRevision: ShallowRef<number>;
  commitPreservingViewport: (commit: () => void) => Promise<void> | void;
}

/**
 * Keeps a virtual list's data source stable while its detached viewport is moving.
 *
 * TanStack must still change the mounted range during a scroll, so this does not pause the
 * virtualizer. It only delays source/content commits and keeps the latest source instead of
 * queueing every stream delta. The caller pairs `presentationRevision` with Vue `v-memo` because
 * a shallow row snapshot alone cannot stop nested reactive item proxies from patching mounted DOM.
 */
export function useScrollBufferedPresentation<T>(options: ScrollBufferedPresentationOptions<T>) {
  let committedSource = toValue(options.source);
  let committedSourceRevision = toValue(options.sourceRevision);
  let pending = false;

  function commit(source: readonly T[], sourceRevision: unknown) {
    options.presented.value = [...source];
    options.presentationRevision.value += 1;
    committedSource = source;
    committedSourceRevision = sourceRevision;
  }

  watch(
    [
      () => toValue(options.source),
      () => toValue(options.sourceRevision),
      () => toValue(options.frozen),
    ],
    ([source, sourceRevision, frozen]) => {
      const changed =
        source !== committedSource || !Object.is(sourceRevision, committedSourceRevision);
      if (!changed) return;

      if (frozen) {
        // Store only the fact that a newer source exists. Reading `source` again at scroll end
        // collapses an arbitrary number of token/item updates into one DOM transaction.
        pending = true;
        return;
      }

      if (pending) {
        pending = false;
        void options.commitPreservingViewport(() => commit(source, sourceRevision));
        return;
      }

      commit(source, sourceRevision);
    },
    { flush: "sync" },
  );
}
