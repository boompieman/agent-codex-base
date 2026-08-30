import type { DockviewApi, DockviewReadyEvent, IDockviewPanel } from "dockview-vue";
import { settingsPanelKinds, settingsPanelRegistry } from "./panel-registry";

const DEFAULT_SETTINGS_PANEL = "config";

export function useSettingsDock() {
  const { locale, t } = useI18n();
  const dockApi = shallowRef<DockviewApi | null>(null);

  function syncPanelTitles() {
    const api = dockApi.value;
    if (api === null) return;

    for (const kind of settingsPanelKinds) {
      const panel = api.getPanel(kind);
      if (panel !== undefined) panel.api.setTitle(t(settingsPanelRegistry[kind].titleKey));
    }
  }

  watch(locale, syncPanelTitles);

  function ready({ api }: DockviewReadyEvent) {
    dockApi.value = api;
    let groupAnchor: IDockviewPanel | null = null;
    let defaultPanel: IDockviewPanel | null = null;

    for (const kind of settingsPanelKinds) {
      const policy = settingsPanelRegistry[kind];
      const panel: IDockviewPanel = api.addPanel({
        id: kind,
        component: policy.component,
        tabComponent: "SettingsDockTab",
        title: t(policy.titleKey),
        params: { kind },
        renderer: "always",
        // An inactive first panel does not establish api.activeGroup. Anchoring every later
        // panel to the first concrete panel keeps settings as one tab group rather than
        // accidentally creating a second column while the default tab is initialized.
        inactive: groupAnchor !== null,
        position: groupAnchor ? { referencePanel: groupAnchor, direction: "within" } : undefined,
      });
      groupAnchor ??= panel;
      if (kind === DEFAULT_SETTINGS_PANEL) defaultPanel = panel;
    }

    defaultPanel?.api.setActive();
    // The custom tab renders translated text reactively, while Dockview owns the tab's ARIA
    // label through its panel title. Keep both sources synchronized so a locale switch does not
    // leave assistive technology reading the previous language.
    syncPanelTitles();
  }

  return { ready };
}
