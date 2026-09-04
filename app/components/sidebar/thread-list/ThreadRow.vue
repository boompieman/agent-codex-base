<script setup lang="ts">
import { GitBranchIcon, MoreHorizontalIcon, StarIcon } from "@lucide/vue";
import { computed } from "vue";
import { Button } from "@codex-gateway/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@codex-gateway/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@codex-gateway/ui/dropdown-menu";
import type { AppServerThreadActiveFlag, ThreadRuntimeStatus } from "~~/shared/types";
import { titleForThread } from "@/stores/gateway/thread-utils/identity";
import { selectedRowClass } from "../sidebar-utils";
import SidebarRowLabel from "../SidebarRowLabel.vue";
import ThreadStatusIndicator from "./ThreadStatusIndicator.vue";
import type { SidebarThreadRow } from "../sidebar-types";

const props = defineProps<{
  thread: SidebarThreadRow;
  testId: string;
  selected: boolean;
  status: ThreadRuntimeStatus;
  completionAttention?: boolean;
  activeFlags?: AppServerThreadActiveFlag[];
  subtitle?: string;
  worktree?: boolean;
  branch?: string | null;
  pinLabel: string;
  showPinnedIcon?: boolean;
  longPressHandlers?: Record<string, unknown>;
}>();

const emit = defineEmits<{
  open: [];
  togglePin: [];
  rename: [];
}>();

const pressHandlers = computed(() => props.longPressHandlers ?? {});
const { t } = useI18n();
const worktreeLabel = computed(() => (props.worktree ? props.branch || t("app.worktree") : null));
const subtitle = computed(() => [worktreeLabel.value, props.subtitle].filter(Boolean).join(" · "));
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <div class="flex min-w-0 items-center rounded-lg">
        <Button
          :data-testid="testId"
          v-bind="pressHandlers"
          :data-selected="selected ? 'true' : 'false'"
          variant="ghost"
          class="h-auto min-h-9 min-w-0 flex-1 justify-start overflow-hidden rounded-lg px-3 py-2 text-sm font-normal hover:bg-surface"
          :class="selectedRowClass(selected)"
          @click="emit('open')"
        >
          <SidebarRowLabel :title="titleForThread(thread)" :subtitle="subtitle">
            <template #title-prefix>
              <StarIcon
                v-if="showPinnedIcon"
                class="size-3.5 shrink-0 fill-current text-accent-orange"
              />
              <GitBranchIcon
                v-if="worktree"
                class="size-3.5 shrink-0 text-ink-muted"
                :aria-label="$t('app.worktree')"
              />
            </template>
            <template #trailing>
              <ThreadStatusIndicator
                :status="status"
                :completion-attention="completionAttention"
                :active-flags="activeFlags"
              />
            </template>
          </SidebarRowLabel>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              :data-testid="`thread-actions-${testId}`"
              size="icon"
              variant="ghost"
              class="size-8 shrink-0 text-ink-muted"
              :aria-label="$t('app.threadActions')"
            >
              <MoreHorizontalIcon class="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" :collision-padding="12" class="w-40">
            <DropdownMenuItem @select="emit('togglePin')">
              {{ pinLabel }}
            </DropdownMenuItem>
            <DropdownMenuItem @select="emit('rename')">
              {{ $t("app.renameThread") }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </ContextMenuTrigger>
    <ContextMenuContent :collision-padding="12" prioritize-position class="w-40">
      <ContextMenuItem @select="emit('togglePin')">
        {{ pinLabel }}
      </ContextMenuItem>
      <ContextMenuItem @select="emit('rename')">
        {{ $t("app.renameThread") }}
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>
