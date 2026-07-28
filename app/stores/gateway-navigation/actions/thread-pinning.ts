import type { AppServerThread, PinnedThreadRecord } from "~~/shared/types";
import { gatewayApi } from "@/utils/gateway-api";
import { useGatewayCatalogStore } from "@/stores/gateway-catalog";
import { useGatewayConfigStore } from "@/stores/gateway-config";
import { useGatewayBootstrapStore } from "@/stores/gateway-bootstrap";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadActivityStore } from "@/stores/gateway-thread-activity";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { pinnedKey, sortThreads, titleForThread } from "@/stores/gateway/thread-utils/identity";

export function createThreadPinningActions() {
  return {
    async setThreadPinned(threadId: string, pinned: boolean) {
      const gateway = useGatewayConfigStore();
      const catalog = useGatewayCatalogStore();
      const navigation = useGatewayNavigationStore();
      if (navigation.selectedHostId === null) return;
      const project = catalog.projects.find(
        (candidate) => candidate.id === navigation.selectedProjectId,
      );
      const thread = navigation.threads.find((candidate) => String(candidate.id) === threadId);
      const key = pinnedKey(navigation.selectedHostId, threadId);
      gateway.gatewayConfig.pinnedThreads = gateway.gatewayConfig.pinnedThreads.filter(
        (item) => pinnedKey(item.hostId, item.threadId) !== key,
      );
      if (pinned) {
        gateway.gatewayConfig.pinnedThreads.unshift({
          hostId: navigation.selectedHostId,
          projectId: navigation.selectedProjectId,
          threadId,
          title: titleForThread(thread),
          subtitle: project?.remotePath ?? null,
          projectName: project?.name ?? null,
          updatedAt: Number(thread?.recencyAt ?? thread?.updatedAt ?? Date.now() / 1000),
        });
      }
      navigation.threads = sortThreads(
        navigation.threads.map((item) =>
          String(item.id) === threadId ? { ...item, pinned } : item,
        ),
      );
      await gateway.syncConfigToServer();
    },

    async setPinnedThread(thread: PinnedThreadRecord, pinned: boolean) {
      const gateway = useGatewayConfigStore();
      const navigation = useGatewayNavigationStore();
      const key = pinnedKey(thread.hostId, thread.threadId);
      gateway.gatewayConfig.pinnedThreads = gateway.gatewayConfig.pinnedThreads.filter(
        (item) => pinnedKey(item.hostId, item.threadId) !== key,
      );
      if (pinned) gateway.gatewayConfig.pinnedThreads.unshift(thread);
      if (thread.hostId === navigation.selectedHostId) {
        navigation.threads = sortThreads(
          navigation.threads.map((candidate) =>
            String(candidate.id) === thread.threadId ? { ...candidate, pinned } : candidate,
          ),
        );
      }
      await gateway.syncConfigToServer();
    },

    async openPinnedThread(thread: PinnedThreadRecord) {
      const navigation = useGatewayNavigationStore();
      navigation.openingPinnedThreadKey = pinnedKey(thread.hostId, thread.threadId);
      try {
        await useGatewayThreadViewStore().openThread(thread.threadId, {
          hostId: thread.hostId,
          projectId: thread.projectId,
        });
      } finally {
        navigation.openingPinnedThreadKey = null;
      }
    },

    upsertPinnedMetadataFromThread(thread: AppServerThread) {
      const gateway = useGatewayConfigStore();
      const catalog = useGatewayCatalogStore();
      const navigation = useGatewayNavigationStore();
      if (navigation.selectedHostId === null || thread.id === null || thread.id === undefined)
        return;
      const key = pinnedKey(navigation.selectedHostId, String(thread.id));
      const index = gateway.gatewayConfig.pinnedThreads.findIndex(
        (item) => pinnedKey(item.hostId, item.threadId) === key,
      );
      const pinnedThread = gateway.gatewayConfig.pinnedThreads[index];
      if (!pinnedThread) return;
      const project = catalog.projects.find(
        (candidate) => candidate.id === navigation.selectedProjectId,
      );
      gateway.gatewayConfig.pinnedThreads[index] = {
        ...pinnedThread,
        title: titleForThread(thread),
        projectName: project?.name ?? pinnedThread.projectName,
        subtitle: project?.remotePath ?? pinnedThread.subtitle,
        updatedAt: Number(
          thread.recencyAt ?? thread.updatedAt ?? pinnedThread.updatedAt ?? Date.now() / 1000,
        ),
      };
      void gateway.syncConfigToServer().catch((error: unknown) => {
        const bootstrap = useGatewayBootstrapStore();
        bootstrap.setError(
          error instanceof Error ? error.message : bootstrap.t("app.configSyncFailed"),
        );
      });
    },

    async renameThread(hostId: number, threadId: string, name: string) {
      const gateway = useGatewayConfigStore();
      const navigation = useGatewayNavigationStore();
      const views = useGatewayThreadViewStore();
      await gatewayApi("/api/threads/rename", { method: "POST", body: { hostId, threadId, name } });
      if (hostId === navigation.selectedHostId) {
        navigation.threads = navigation.threads.map((thread) =>
          String(thread.id) === threadId ? { ...thread, name } : thread,
        );
      }
      const key = pinnedKey(hostId, threadId);
      gateway.gatewayConfig.pinnedThreads = gateway.gatewayConfig.pinnedThreads.map((thread) =>
        pinnedKey(thread.hostId, thread.threadId) === key ? { ...thread, title: name } : thread,
      );
      useGatewayThreadActivityStore().updateTitle(hostId, threadId, name);
      await gateway.syncConfigToServer();
      if (
        hostId === navigation.selectedHostId &&
        navigation.selectedThreadId === threadId &&
        views.currentThread &&
        typeof views.currentThread === "object"
      ) {
        views.currentThread = { ...views.currentThread, name };
      }
      if (hostId === navigation.selectedHostId) await navigation.listThreads();
    },
  };
}
