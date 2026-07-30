import type { DockviewApi, DockviewReadyEvent, SerializedDockview } from "dockview-vue";

import type { ComputedRef } from "vue";
import { nextTick, onBeforeUnmount, shallowRef, watch } from "vue";
import { useGatewayFileWorkspaceStore } from "@/stores/file-workspace";
import { useGatewayWorkspaceLayoutStore } from "@/stores/gateway-workspace-layout";
import {
  AGENT_WORKSPACE_PANEL_ID,
  FILES_WORKSPACE_PANEL_ID,
} from "@/stores/gateway/workspace-panels";
import { notifyPopoutBlocked } from "./actions";
import { useDockLayoutPersistence } from "./useDockLayoutPersistence";

export function useWorkspaceDockLifecycle(options: {
  scopeKey: ComputedRef<string>;
  fileRequestScopeKey: ComputedRef<string | null>;
  reconcile: (api: DockviewApi) => void;
  defaultLayout: (api: DockviewApi) => SerializedDockview;
  panelIds: ComputedRef<unknown>;
}) {
  const { t } = useI18n();
  const workspaceLayout = useGatewayWorkspaceLayoutStore();
  const fileWorkspace = useGatewayFileWorkspaceStore();
  const api = shallowRef<DockviewApi | null>(null);
  // ChatWorkspace keys this composable's owner by scope. Capture the key once so unmount always
  // persists the layout being left, even after navigation refs already point at the next thread.
  const activeScopeKey = options.scopeKey.value;
  let disposables: Array<{ dispose(): void }> = [];
  const persistence = useDockLayoutPersistence({
    api,
    activeScopeKey: () => activeScopeKey,
  });

  function activate(panelId: string) {
    const panel = api.value?.getPanel(panelId);
    if (!panel) return;
    panel.api.setActive();
    panel.api.group.api.setActive();
  }

  function ready(event: DockviewReadyEvent) {
    api.value = event.api;
    initializeScope(activeScopeKey);
    disposables = [
      event.api.onDidLayoutChange(persistence.scheduleLayoutSave),
      event.api.onWillMutateLayout((mutation) => {
        // Popouts are runtime windows. Capture the docked layout before Dockview removes the group.
        if (mutation.kind === "popout") persistence.captureBeforePopout();
      }),
      event.api.onDidMovePanel(({ panel }) => {
        if (
          panel.id === FILES_WORKSPACE_PANEL_ID &&
          panel.api.group.panels.some(({ id }) => id === AGENT_WORKSPACE_PANEL_ID)
        ) {
          activate(AGENT_WORKSPACE_PANEL_ID);
        }
      }),
      event.api.onDidActivePanelChange(({ panel }) => {
        if (!panel) return;
        const request = workspaceLayout.panelActivationRequest;
        if (request) {
          if (panel.id === request.panelId) {
            workspaceLayout.consumePanelActivation(request.sequence);
          } else if (event.api.getPanel(request.panelId)) {
            activate(request.panelId);
            return;
          }
        }
        workspaceLayout.setActivePanel(activeScopeKey, panel.id);
      }),
      event.api.onDidRemovePanel((panel) => {
        if (panel.id === AGENT_WORKSPACE_PANEL_ID || panel.id === FILES_WORKSPACE_PANEL_ID) {
          void restorePermanentPanels();
        } else {
          void restoreRequestedPanel();
        }
      }),
      event.api.onDidOpenPopoutWindowFail(() =>
        notifyPopoutBlocked({
          title: t("app.popupBlocked"),
          description: t("app.popupBlockedDescription"),
        }),
      ),
    ];
  }

  function initializeScope(scopeKey: string) {
    if (!api.value) return;
    const saved = workspaceLayout.layoutFor(scopeKey);
    if (saved) {
      restoreScope(scopeKey);
      return;
    }

    // During DockviewVue's ready callback the Vue renderer registry is initialized, but content
    // adapters created through fromJSON are not yet attached by the wrapper. The documented
    // addPanel path used by reconcile performs that first mount for a new unsaved scope.
    persistence.setDockedLayout(null);
    options.reconcile(api.value);
    activate(workspaceLayout.activePanelFor(scopeKey));
  }

  function restoreScope(scopeKey: string) {
    if (!api.value) return;
    const saved = workspaceLayout.layoutFor(scopeKey);
    const dockedLayoutState = saved ? dockedLayout(saved) : null;
    persistence.setDockedLayout(dockedLayoutState);
    try {
      // Every scope owns a fresh Dockview API, so deserialization cannot reuse an overlay from a
      // different thread. Store-backed editor/terminal data survives independently of panel DOM.
      api.value.fromJSON(dockedLayoutState ?? options.defaultLayout(api.value));
    } catch (error) {
      console.error("[workspace] failed to restore dock layout", error);
      api.value.fromJSON(options.defaultLayout(api.value));
    }
    options.reconcile(api.value);
    activate(workspaceLayout.activePanelFor(scopeKey));
  }

  async function restoreRequestedPanel() {
    await nextTick();
    const request = workspaceLayout.panelActivationRequest;
    if (request) activate(request.panelId);
    const activePanel = api.value?.activePanel;
    if (api.value && (!activePanel || !api.value.getPanel(activePanel.id))) {
      activate(AGENT_WORKSPACE_PANEL_ID);
    }
  }

  async function restorePermanentPanels() {
    await nextTick();
    if (!api.value) return;
    const hasAgent = Boolean(api.value.getPanel(AGENT_WORKSPACE_PANEL_ID));
    const needsFiles = Boolean(options.fileRequestScopeKey.value);
    const hasFiles = Boolean(api.value.getPanel(FILES_WORKSPACE_PANEL_ID));
    if (hasAgent && (!needsFiles || hasFiles)) {
      await restoreRequestedPanel();
      return;
    }
    options.reconcile(api.value);
    await restoreRequestedPanel();
  }

  watch(
    options.panelIds,
    async () => {
      if (!api.value) return;
      options.reconcile(api.value);
      const request = workspaceLayout.panelActivationRequest;
      if (request) activate(request.panelId);
      await nextTick();
      const activePanel = api.value.activePanel;
      if (!activePanel || !api.value.getPanel(activePanel.id)) activate(AGENT_WORKSPACE_PANEL_ID);
    },
    { deep: true },
  );
  watch(
    () => workspaceLayout.panelActivationRequest,
    (request) => request && activate(request.panelId),
  );
  watch(
    () => fileWorkspace.workspaceOpenRequest,
    (request) => {
      if (request?.scopeKey === options.fileRequestScopeKey.value)
        activate(FILES_WORKSPACE_PANEL_ID);
    },
  );

  onBeforeUnmount(() => {
    persistence.persistLayout(activeScopeKey);
    for (const popout of api.value?.getPopouts() ?? []) popout.window.close();
    disposables.forEach((disposable) => disposable.dispose());
    disposables = [];
    api.value = null;
  });

  return { ready };
}

function dockedLayout(layout: SerializedDockview): SerializedDockview {
  if (layout.popoutGroups === undefined || layout.popoutGroups.length === 0) return layout;
  const { popoutGroups: _runtimeWindows, ...docked } = layout;
  return docked;
}
