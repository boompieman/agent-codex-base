import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { klona } from "klona";
import { toast } from "vue-sonner";
import { useGatewayTranslator } from "@/composables/i18n/useGatewayTranslator";
import type { GatewayConfig, GatewayNotificationSettings } from "~~/shared/types";
import { useAuthStore } from "@/stores/auth";
import { gatewayApi } from "@/utils/gateway-api";
import { defaultGatewayConfig, normalizeNotificationSettings } from "@/stores/gateway/config";
import { gatewayDomainEvents } from "@/stores/gateway/domain-events";
import { createPinnedThreadSync } from "./pinned-thread-sync";
import { recordFromUnknown } from "~~/shared/utils/records";

export const useGatewayConfigStore = defineStore("gateway-config", () => {
  const t = useGatewayTranslator();
  const gatewayConfig = ref<GatewayConfig>(defaultGatewayConfig());
  let syncQueue: Promise<void> = Promise.resolve();
  let syncGeneration = 0;
  const pinnedThreadSync = createPinnedThreadSync({ apply: applyPinnedThreads });

  function applyPinnedThreads(pinnedThreads: GatewayConfig["pinnedThreads"]) {
    gatewayConfig.value = { ...gatewayConfig.value, pinnedThreads };
    gatewayDomainEvents.emit("gateway-config-applied", { config: gatewayConfig.value });
  }

  function setCatalog(hosts: GatewayConfig["hosts"], projects: GatewayConfig["projects"]) {
    gatewayConfig.value = {
      version: 1,
      hosts: [...hosts],
      projects: [...projects],
      pinnedThreads: gatewayConfig.value.pinnedThreads,
      notifications: normalizeNotificationSettings(gatewayConfig.value.notifications),
    };
  }

  function applyConfig(config: GatewayConfig) {
    gatewayConfig.value = { ...defaultGatewayConfig(), ...config };
    gatewayDomainEvents.emit("gateway-config-applied", { config: gatewayConfig.value });
  }

  async function syncConfigToServer() {
    const config = klona(gatewayConfig.value);
    const generation = ++syncGeneration;
    const auth = useAuthStore();
    const sessionEpoch = auth.sessionEpoch;
    const sync = async () => {
      const result = await gatewayApi<GatewayConfig>("/api/config/sync", {
        method: "POST",
        body: config,
      });
      if (generation === syncGeneration && auth.isCurrentSession(sessionEpoch)) applyConfig(result);
    };
    const result = syncQueue.then(sync, sync);
    syncQueue = result.catch(() => {});
    return result;
  }

  async function loadConfigFromServer() {
    const auth = useAuthStore();
    const epoch = auth.sessionEpoch;
    const config = await gatewayApi<GatewayConfig>("/api/config/export");
    if (!auth.isCurrentSession(epoch)) return false;
    applyConfig(config);
    return true;
  }

  function exportConfigText() {
    return JSON.stringify(gatewayConfig.value, null, 2);
  }

  async function importConfigText(text: string) {
    const auth = useAuthStore();
    const epoch = auth.sessionEpoch;
    const result = await gatewayApi<GatewayConfig>("/api/config/sync", {
      method: "POST",
      body: { ...defaultGatewayConfig(), ...recordFromUnknown(JSON.parse(text)) },
    });
    if (!auth.isCurrentSession(epoch)) return false;
    applyConfig(result);
    return true;
  }

  async function saveNotificationSettings(notifications: GatewayNotificationSettings) {
    gatewayConfig.value.notifications = normalizeNotificationSettings(notifications);
    await syncConfigToServer();
    if (import.meta.client) toast.success(t("app.notificationSettingsSaved"));
  }

  function resetState() {
    gatewayConfig.value = defaultGatewayConfig();
    syncGeneration += 1;
    syncQueue = Promise.resolve();
    pinnedThreadSync.reset();
  }

  return {
    gatewayConfig,
    setCatalog,
    applyConfig,
    syncConfigToServer,
    loadConfigFromServer,
    exportConfigText,
    importConfigText,
    saveNotificationSettings,
    refreshPinnedThreads: pinnedThreadSync.refresh,
    resetState,
  };
});

export function useGatewayPinnedThreads() {
  const config = useGatewayConfigStore();
  return computed(() => config.gatewayConfig.pinnedThreads);
}
