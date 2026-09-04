<script setup lang="ts">
import { ChevronDownIcon, PlusIcon, ServerCogIcon, SettingsIcon } from "@lucide/vue";
import { computed, nextTick, ref } from "vue";
import { Button } from "@codex-gateway/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@codex-gateway/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@codex-gateway/ui/dialog";
import SettingsPanel from "@/components/settings/SettingsPanel.vue";
import { useLongPressContextMenu } from "@/composables/interactions/useLongPressContextMenu";
import { useWorkspaceLaunchActions } from "@/composables/workspace/useWorkspaceLaunchActions";
import { useGatewayCatalogStore } from "@/stores/gateway-catalog";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import AddProjectDialog from "./AddProjectDialog.vue";
import HostTree from "./host-tree/HostTree.vue";
import PinnedThreadList from "./thread-list/PinnedThreadList.vue";
import RecentThreadList from "./thread-list/RecentThreadList.vue";
import ThreadRenameDialog from "./thread-list/ThreadRenameDialog.vue";
import SidebarScrollArea from "./SidebarScrollArea.vue";
import { SidebarFooter } from "@codex-gateway/ui/sidebar";
import { useSidebarTree } from "./host-tree/useSidebarTree";
import { useThreadRename } from "./thread-list/useThreadRename";
import { useRecentThreadActivity } from "./thread-list/useRecentThreadActivity";
import type { HostTreeController } from "./host-tree/controller";
import type { HostRecord, ProjectRecord } from "./sidebar-types";

const catalog = useGatewayCatalogStore();
const navigation = useGatewayNavigationStore();
const { t } = useI18n();
const showSettings = ref(false);
const connectionsOpen = ref(false);
const projectEditor = ref<{ host: HostRecord; project: ProjectRecord | null } | null>(null);
const { longPressTriggered, longPressContextMenuHandlers } = useLongPressContextMenu();
const sidebarTree = useSidebarTree(longPressTriggered);
const threadRename = useThreadRename();
const recentActivity = useRecentThreadActivity();
const workspaceActions = useWorkspaceLaunchActions();
const {
  hosts,
  projects,
  pinnedThreads,
  selectedHostId,
  selectedProjectId,
  selectedThreadId,
  openPinnedThread,
  pinnedRuntimeStatus,
  pinnedCompletionAttention,
  pinnedActiveFlags,
  pinnedWorktree,
  pinnedBranch,
} = sidebarTree;
const { recentThreads } = recentActivity;
const selectedProject = computed(() =>
  projects.value.find((project) => project.id === selectedProjectId.value),
);
const hostTreeController = computed<HostTreeController>(() => ({
  hosts: sidebarTree.hosts.value,
  availableProjectsByHost: sidebarTree.availableProjectsByHost.value,
  missingProjectsByHost: sidebarTree.missingProjectsByHost.value,
  projectThreads: sidebarTree.projectThreads.value,
  expandedHostIds: sidebarTree.expandedHostIds.value,
  expandedProjectIds: sidebarTree.expandedProjectIds.value,
  expandedMissingProjectHostIds: sidebarTree.expandedMissingProjectHostIds.value,
  selectedHostId: sidebarTree.selectedHostId.value,
  selectedProjectId: sidebarTree.selectedProjectId.value,
  selectedThreadId: sidebarTree.selectedThreadId.value,
  hostConnectionStatuses: sidebarTree.hostConnectionStatuses.value,
  longPressHandlers: longPressContextMenuHandlers,
  selectHost: sidebarTree.selectHost,
  addProject: openAddProject,
  deleteHost: catalog.deleteHost,
  monitorHost: openHostMonitor,
  selectProject: sidebarTree.selectProject,
  toggleMissingProjects: sidebarTree.toggleMissingProjects,
  editProject: openEditProject,
  deleteProject: catalog.deleteProject,
  startThreadInProject: sidebarTree.startThreadInProject,
  openThread: sidebarTree.openThread,
  toggleThreadPin: navigation.setThreadPinned,
  rename: threadRename.startRename,
  threadRuntimeStatus: sidebarTree.threadRuntimeStatus,
  threadCompletionAttention: sidebarTree.threadCompletionAttention,
  threadActiveFlags: sidebarTree.threadActiveFlags,
}));

defineOptions({
  inheritAttrs: false,
});

function openAddProject(host: HostRecord) {
  projectEditor.value = { host, project: null };
}

function openEditProject(project: ProjectRecord) {
  const host = hosts.value.find((item) => item.id === project.hostId);
  if (!host) {
    return;
  }
  projectEditor.value = { host, project };
}

async function openHostMonitor(hostId: number) {
  if (selectedHostId.value !== hostId) await catalog.selectHost(hostId);
  await nextTick();
  workspaceActions.openHostMonitor();
}

function startTask() {
  if (selectedProject.value) {
    sidebarTree.startThreadInProject(selectedProject.value);
    return;
  }
  connectionsOpen.value = true;
}
</script>

<template>
  <aside
    v-bind="$attrs"
    class="relative flex h-full min-h-0 flex-col border-r border-hairline bg-canvas-soft"
  >
    <div class="shrink-0 border-b border-hairline px-3 py-3">
      <div class="mb-3 flex min-h-11 items-center px-2 text-[0.9375rem] font-semibold">
        Agent Codex
      </div>
      <Button
        data-testid="new-task-button"
        class="h-11 w-full justify-start gap-2 rounded-xl px-3"
        @click="startTask"
      >
        <PlusIcon class="size-5" />
        {{ t("app.newTask") }}
      </Button>
    </div>
    <div class="flex min-h-0 flex-1 overflow-hidden px-3 py-3">
      <SidebarScrollArea>
        <div class="min-w-0 max-w-full space-y-4 overflow-hidden pr-1">
          <PinnedThreadList
            v-if="pinnedThreads.length"
            :threads="pinnedThreads"
            :hosts="hosts"
            :selected-host-id="selectedHostId"
            :selected-thread-id="selectedThreadId"
            :long-press-handlers="longPressContextMenuHandlers"
            :runtime-status="pinnedRuntimeStatus"
            :completion-attention="pinnedCompletionAttention"
            :active-flags="pinnedActiveFlags"
            :worktree="pinnedWorktree"
            :branch="pinnedBranch"
            @open="openPinnedThread"
            @unpin="navigation.setPinnedThread($event, false)"
            @rename="threadRename.startRename"
          />

          <RecentThreadList
            :threads="recentThreads"
            :selected-host-id="selectedHostId"
            :selected-thread-id="selectedThreadId"
            :long-press-handlers="longPressContextMenuHandlers"
            @open="recentActivity.openRecentThread"
            @pin="recentActivity.pinRecentThread"
            @rename="threadRename.startRename"
          />

          <Collapsible v-model:open="connectionsOpen" class="pt-2">
            <CollapsibleTrigger as-child>
              <Button
                data-testid="connections-toggle"
                variant="ghost"
                class="h-11 w-full justify-start gap-3 rounded-lg px-3 text-[0.9375rem] font-normal text-ink-muted hover:bg-surface hover:text-ink"
              >
                <ServerCogIcon class="size-4" />
                <span class="min-w-0 flex-1 text-left">{{ t("app.connections") }}</span>
                <ChevronDownIcon
                  class="size-4 transition-transform"
                  :class="connectionsOpen ? 'rotate-180' : ''"
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent class="pt-2">
              <HostTree :controller="hostTreeController" />
            </CollapsibleContent>
          </Collapsible>
        </div>
      </SidebarScrollArea>
    </div>

    <SidebarFooter class="shrink-0 border-t border-hairline p-3">
      <Button
        data-testid="settings-toggle"
        variant="ghost"
        class="h-11 w-full justify-start gap-3 rounded-lg px-3 text-[0.9375rem] font-normal hover:bg-surface"
        @click="showSettings = !showSettings"
      >
        <SettingsIcon class="size-4" />
        {{ t("app.settings") }}
      </Button>
    </SidebarFooter>

    <Dialog v-model:open="showSettings">
      <DialogContent
        class="flex h-[min(54rem,calc(100vh-3rem))] w-[min(70rem,calc(100vw-3rem))] !max-w-[min(70rem,calc(100vw-3rem))] flex-col overflow-hidden p-0"
        data-testid="settings-dialog"
        close-button-test-id="settings-close-button"
      >
        <DialogHeader class="border-b border-hairline px-6 py-5">
          <DialogTitle class="text-lg">{{ t("app.settings") }}</DialogTitle>
          <DialogDescription>{{ t("app.settingsDescription") }}</DialogDescription>
        </DialogHeader>
        <div class="flex min-h-0 flex-1 overflow-hidden">
          <SettingsPanel @close="showSettings = false" />
        </div>
      </DialogContent>
    </Dialog>

    <AddProjectDialog
      :open="Boolean(projectEditor)"
      :host="projectEditor?.host ?? null"
      :project="projectEditor?.project ?? null"
      @update:open="projectEditor = $event ? projectEditor : null"
    />

    <!-- Rename is a single modal workflow for desktop context-click and mobile long-press. Keep
         it outside row renderers: context menus unmount after selection, and an inline input inside
         that subtree loses focus or disappears when a mobile sidebar Sheet updates. -->
    <ThreadRenameDialog
      v-model:open="threadRename.open.value"
      v-model="threadRename.renameValue.value"
      :submitting="threadRename.submitting.value"
      @submit="threadRename.submitRename"
    />
  </aside>
</template>
