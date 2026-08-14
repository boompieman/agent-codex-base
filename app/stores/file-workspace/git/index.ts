import { defineStore } from "pinia";
import { reactive, shallowRef } from "vue";
import { MAX_EDITABLE_FILE_BYTES } from "~~/shared/file-preview";
import type { FilePreviewDocument, RemoteGitFileComparison } from "~~/shared/types";
import { compareRemoteGitFile } from "./transport";
import type { FileGitComparisonState } from "./types";

export const useFileGitComparisonStore = defineStore("file-git-comparisons", () => {
  const states = shallowRef<Record<string, FileGitComparisonState>>({});
  const owners = new Map<string, FilePreviewDocument>();
  const requestTokens = new Map<string, symbol>();
  const pendingLoads = new Map<string, Promise<FileGitComparisonState>>();

  function register(document: FilePreviewDocument): FileGitComparisonState {
    if (owners.get(document.key) === document) return stateFor(document);
    supersede(document.key);
    pendingLoads.delete(document.key);
    owners.set(document.key, document);
    const state = createState(document.key);
    states.value = { ...states.value, [document.key]: state };
    return state;
  }

  function stateFor(document: FilePreviewDocument): FileGitComparisonState {
    const owner = owners.get(document.key);
    if (owner === undefined) return register(document);
    const existing = states.value[document.key];
    if (existing === undefined) return register(document);
    return existing;
  }

  function load(document: FilePreviewDocument, force = false): Promise<FileGitComparisonState> {
    const state = stateFor(document);
    // File keys are stable across close/reopen, but each document object is one lifecycle
    // generation. Late save/load continuations from a closed generation must never invalidate or
    // replace the comparison owned by the reopened editor.
    if (owners.get(document.key) !== document) return Promise.resolve(state);
    if (force) invalidate(document.key);
    if (!canCompare(document)) {
      supersede(document.key);
      clearResult(state);
      state.stale = false;
      state.loading = false;
      return Promise.resolve(state);
    }
    if (!force && state.loaded && !state.stale) return Promise.resolve(state);
    const pending = pendingLoads.get(document.key);
    if (pending !== undefined) {
      // A save or remote file event can invalidate an in-flight request. Wait for its SSH channel
      // to close, then start one fresh comparison instead of opening competing exec channels.
      return pending.then(() => (state.stale ? load(document) : state));
    }

    const token = Symbol(document.key);
    requestTokens.set(document.key, token);
    state.loading = true;
    state.error = null;
    const operation = performLoad(document, state, token);
    let tracked: Promise<FileGitComparisonState>;
    tracked = operation.finally(() => {
      if (pendingLoads.get(document.key) === tracked) pendingLoads.delete(document.key);
    });
    pendingLoads.set(document.key, tracked);
    return tracked;
  }

  async function performLoad(
    document: FilePreviewDocument,
    state: FileGitComparisonState,
    token: symbol,
  ) {
    try {
      const comparison = await compareRemoteGitFile({
        hostId: document.hostId,
        projectId: document.projectId!,
        path: document.path,
      });
      if (requestTokens.get(document.key) !== token) return state;
      state.comparison = comparison;
      state.baselineText = baselineText(comparison);
      state.loaded = true;
      state.stale = false;
      return state;
    } catch (error: unknown) {
      if (requestTokens.get(document.key) !== token) return state;
      state.error = error instanceof Error ? error.message : String(error);
      state.stale = true;
      return state;
    } finally {
      if (requestTokens.get(document.key) === token) {
        requestTokens.delete(document.key);
        state.loading = false;
      }
    }
  }

  function invalidate(key: string) {
    const state = states.value[key];
    if (state !== undefined) state.stale = true;
    supersede(key);
  }

  function supersede(key: string) {
    requestTokens.delete(key);
  }

  function remove(document: FilePreviewDocument) {
    if (owners.get(document.key) !== document) return;
    owners.delete(document.key);
    supersede(document.key);
    // Closing a file ends the UI lifecycle of its request. The WebSocket response may still arrive,
    // but a quick reopen must create a loading state and a fresh generation instead of waiting on
    // an invisible promise owned by the removed document. Server-side singleflight deduplicates the
    // underlying SSH comparison while both generations overlap.
    pendingLoads.delete(document.key);
    if (states.value[document.key] === undefined) return;
    const next = { ...states.value };
    delete next[document.key];
    states.value = next;
  }

  function reset() {
    owners.clear();
    requestTokens.clear();
    pendingLoads.clear();
    states.value = {};
  }

  return { states, register, stateFor, load, invalidate, remove, reset };
});

function createState(key: string) {
  return reactive<FileGitComparisonState>({
    key,
    loading: false,
    loaded: false,
    stale: true,
    error: null,
    comparison: null,
    baselineText: null,
  });
}

function canCompare(document: FilePreviewDocument) {
  return (
    document.projectId !== null &&
    document.previewKind === "text" &&
    document.objectUrl !== "" &&
    !document.stale &&
    (document.size ?? 0) <= MAX_EDITABLE_FILE_BYTES
  );
}

function baselineText(comparison: RemoteGitFileComparison) {
  if (comparison.availability !== "available") return null;
  switch (comparison.baseline.kind) {
    case "head":
      return comparison.baseline.text;
    case "empty":
      return "";
    case "unavailable":
      return null;
  }
}

function clearResult(state: FileGitComparisonState) {
  state.loaded = false;
  state.error = null;
  state.comparison = null;
  state.baselineText = null;
}
