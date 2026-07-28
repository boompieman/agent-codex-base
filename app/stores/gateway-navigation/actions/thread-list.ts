import { gatewayApi } from "@/utils/gateway-api";
import type { AppServerThread } from "~~/shared/types";
import { useGatewayCatalogStore } from "@/stores/gateway-catalog";
import { projectById } from "@/stores/gateway-catalog/selectors";
import { useGatewayConfigStore } from "@/stores/gateway-config";
import { useGatewayBootstrapStore } from "@/stores/gateway-bootstrap";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadActivityStore } from "@/stores/gateway-thread-activity";
import { useGatewayThreadRuntimeStore } from "@/stores/gateway-thread-runtime";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import type { ThreadListResponse } from "@/stores/gateway/types";
import { messageFromError, pinnedKey, sortThreads } from "@/stores/gateway/thread-utils/identity";
import { runtimeStatusFromAppThreadStatus } from "@/stores/gateway/thread-utils/status";
import { isAppServerSubAgentThread } from "~~/shared/runtime/app-server";
import { captureSessionEpoch } from "@/utils/session-epoch";

export function createThreadListActions() {
  async function loadHostOverview(hostId: number) {
    const catalog = useGatewayCatalogStore();
    const sessionIsCurrent = captureSessionEpoch();
    const response = await gatewayApi<ThreadListResponse>("/api/threads", {
      query: { hostId, limit: 50 },
    });
    if (!sessionIsCurrent()) return false;
    if (response.projects !== undefined) catalog.mergeProjects(response.projects);
    applyProjectDirectoryAvailability(response);
    useGatewayThreadActivityStore().ingestThreads(hostId, response.data ?? [], catalog.projects);
    syncThreadStatusesFromList(hostId, response.data ?? []);
    return true;
  }

  function decorateThreads(threads: AppServerThread[]) {
    const config = useGatewayConfigStore();
    const navigation = useGatewayNavigationStore();
    const pinned = new Set(
      config.gatewayConfig.pinnedThreads.map((thread) => pinnedKey(thread.hostId, thread.threadId)),
    );
    return threads.map((thread) => ({
      ...thread,
      pinned:
        navigation.selectedHostId !== null
          ? pinned.has(pinnedKey(navigation.selectedHostId, String(thread.id)))
          : false,
    }));
  }

  return {
    async connectAllHosts() {
      const catalog = useGatewayCatalogStore();
      const config = useGatewayConfigStore();
      const bootstrap = useGatewayBootstrapStore();
      const sessionIsCurrent = captureSessionEpoch();
      await Promise.all(
        catalog.hosts.map(async (host) => {
          catalog.setHostConnectionStatus(host.id, "connecting");
          try {
            if (!(await loadHostOverview(host.id)) || !sessionIsCurrent()) return;
            catalog.setHostConnectionStatus(host.id, "connected");
          } catch (error: unknown) {
            if (!sessionIsCurrent()) return;
            catalog.setHostConnectionStatus(
              host.id,
              "failed",
              messageFromError(error, bootstrap.t("app.connectHostFailed"), bootstrap.errorLabels),
            );
          }
        }),
      );
      if (!sessionIsCurrent()) return;
      config.setCatalog(catalog.hosts, catalog.projects);
    },
    refreshHostProjects: loadHostOverview,
    async listThreads(searchTerm = "") {
      const catalog = useGatewayCatalogStore();
      const config = useGatewayConfigStore();
      const bootstrap = useGatewayBootstrapStore();
      const navigation = useGatewayNavigationStore();
      const views = useGatewayThreadViewStore();
      const hostId = navigation.selectedHostId;
      const projectId = navigation.selectedProjectId;
      const projectCwd = projectById(catalog.projects, projectId)?.remotePath;
      if (hostId === null) return;
      const sessionIsCurrent = captureSessionEpoch();
      views.loading = true;
      bootstrap.clearError();
      try {
        const query: Record<string, unknown> = { hostId, limit: 50 };
        if (projectId !== null) query.projectId = projectId;
        if (projectCwd !== undefined && projectCwd !== "") query.cwd = projectCwd;
        if (searchTerm !== "") query.searchTerm = searchTerm;
        const response = await gatewayApi<ThreadListResponse>("/api/threads", { query });
        if (!sessionIsCurrent()) return;
        if (navigation.selectedHostId !== hostId || navigation.selectedProjectId !== projectId)
          return;
        if (response.projects !== undefined) catalog.mergeProjects(response.projects);
        applyProjectDirectoryAvailability(response);
        useGatewayThreadActivityStore().ingestThreads(
          hostId,
          response.data ?? [],
          catalog.projects,
        );
        catalog.setHostConnectionStatus(hostId, "connected");
        syncThreadStatusesFromList(hostId, response.data ?? []);
        // Sub-agent threads remain addressable by their explicit panel links, but they are not
        // top-level navigation entries. Filter once at the catalog boundary so every sidebar
        // projection cannot accidentally reintroduce them with a slightly different predicate.
        const mainThreads = (response.data ?? []).filter(
          (thread) => !isAppServerSubAgentThread(thread),
        );
        navigation.threads = sortThreads(decorateThreads(mainThreads));
        config.setCatalog(catalog.hosts, catalog.projects);
      } catch (error: unknown) {
        if (!sessionIsCurrent()) return;
        if (navigation.selectedHostId !== hostId || navigation.selectedProjectId !== projectId)
          return;
        const message = messageFromError(
          error,
          bootstrap.t("app.listThreadsFailed"),
          bootstrap.errorLabels,
        );
        catalog.setHostConnectionStatus(hostId, "failed", message);
        bootstrap.setError(message, { hostId, projectId, threadId: navigation.selectedThreadId });
      } finally {
        if (
          sessionIsCurrent() &&
          navigation.selectedHostId === hostId &&
          navigation.selectedProjectId === projectId
        ) {
          views.loading = false;
        }
      }
    },
    decorateThreads,
  };
}

function applyProjectDirectoryAvailability(response: ThreadListResponse) {
  if (response.projectDirectoryAvailability === undefined) return;
  const catalog = useGatewayCatalogStore();
  catalog.projectDirectoryAvailability = {
    ...catalog.projectDirectoryAvailability,
    ...response.projectDirectoryAvailability,
  };
}

function syncThreadStatusesFromList(hostId: number, threads: AppServerThread[]) {
  const runtime = useGatewayThreadRuntimeStore();
  for (const thread of threads) {
    if (
      thread.id === null ||
      thread.id === undefined ||
      thread.status === null ||
      thread.status === undefined
    ) {
      continue;
    }
    runtime.setThreadStatus(
      hostId,
      String(thread.id),
      runtimeStatusFromAppThreadStatus(thread.status),
    );
  }
}
