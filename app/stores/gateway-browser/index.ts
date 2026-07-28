import { defineStore, skipHydrate } from "pinia";
import type { BrowserPreviewSessionSnapshot, BrowserPreviewTarget } from "~~/shared/types";
import { useAccountLocalStorage } from "@/composables/storage/useAccountLocalStorage";

export interface BrowserPanelState extends BrowserPreviewTarget {
  title: string;
}

export const useGatewayBrowserStore = defineStore("gateway-browser", () => {
  const panels = useAccountLocalStorage<Record<string, BrowserPanelState>>("browser-panels", {});
  const sessions = ref<Record<string, BrowserPreviewSessionSnapshot>>({});
  const frameWarnings = ref<Record<string, string>>({});

  function addPanel(panel: BrowserPanelState) {
    panels.value = { ...panels.value, [panel.panelId]: panel };
  }

  function removePanel(panelId: string) {
    const panel = panels.value[panelId];
    const sessionId = Object.values(sessions.value).find(
      (session) => session.panelId === panelId,
    )?.sessionId;
    const { [panelId]: _panel, ...remainingPanels } = panels.value;
    panels.value = remainingPanels;
    if (sessionId !== undefined) removeSession(sessionId);
    return { panel, sessionId };
  }

  function upsertSession(session: BrowserPreviewSessionSnapshot) {
    const previous = Object.values(sessions.value).find(
      (candidate) => candidate.panelId === session.panelId,
    );
    const next = { ...sessions.value };
    if (previous !== undefined) delete next[previous.sessionId];
    next[session.sessionId] = session;
    sessions.value = next;
  }

  function removeSession(sessionId: string) {
    const { [sessionId]: _session, ...remaining } = sessions.value;
    sessions.value = remaining;
    const { [sessionId]: _warning, ...warnings } = frameWarnings.value;
    frameWarnings.value = warnings;
  }

  function setFrameWarning(sessionId: string, value: string) {
    frameWarnings.value = { ...frameWarnings.value, [sessionId]: value };
  }

  function sessionForPanel(panelId: string) {
    return Object.values(sessions.value).find((session) => session.panelId === panelId) ?? null;
  }

  function resetRuntime() {
    sessions.value = {};
    frameWarnings.value = {};
  }

  return {
    panels: skipHydrate(panels),
    sessions,
    frameWarnings,
    addPanel,
    removePanel,
    upsertSession,
    removeSession,
    setFrameWarning,
    sessionForPanel,
    resetRuntime,
  };
});
