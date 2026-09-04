<script setup lang="ts">
import ThreadRow from "./ThreadRow.vue";
import { formatRelative, pinnedThreadId, pinnedThreadKey } from "../sidebar-utils";
import type { HostRecord, PinnedThreadRecord } from "../sidebar-types";
import type { AppServerThreadActiveFlag, ThreadRuntimeStatus } from "~~/shared/types";

const props = defineProps<{
  threads: PinnedThreadRecord[];
  hosts: HostRecord[];
  selectedHostId: number | null;
  selectedThreadId: string | null;
  longPressHandlers?: Record<string, unknown>;
  runtimeStatus: (thread: PinnedThreadRecord) => ThreadRuntimeStatus;
  completionAttention: (thread: PinnedThreadRecord) => boolean;
  activeFlags: (thread: PinnedThreadRecord) => AppServerThreadActiveFlag[];
  worktree: (thread: PinnedThreadRecord) => boolean;
  branch: (thread: PinnedThreadRecord) => string | null;
}>();

const emit = defineEmits<{
  open: [thread: PinnedThreadRecord];
  unpin: [thread: PinnedThreadRecord];
  rename: [thread: PinnedThreadRecord];
}>();

function subtitleForPinnedThread(thread: PinnedThreadRecord) {
  return formatRelative(thread.updatedAt);
}

function isSelectedPinnedThread(thread: PinnedThreadRecord) {
  return (
    pinnedThreadId(thread) === String(props.selectedThreadId) &&
    thread.hostId === props.selectedHostId
  );
}
</script>

<template>
  <section class="flex min-w-0 max-w-full flex-col overflow-hidden">
    <div class="flex h-8 items-center justify-between gap-2 px-2 pb-2 text-sm text-ink-muted">
      <span>{{ $t("app.pinned") }}</span>
      <slot name="header-action" />
    </div>
    <div v-if="threads.length" class="space-y-1">
      <ThreadRow
        v-for="thread in threads"
        :key="pinnedThreadKey(thread)"
        :thread="thread"
        :test-id="`pinned-thread-button-${pinnedThreadId(thread)}`"
        :selected="isSelectedPinnedThread(thread)"
        :status="runtimeStatus(thread)"
        :completion-attention="completionAttention(thread)"
        :active-flags="activeFlags(thread)"
        :subtitle="subtitleForPinnedThread(thread)"
        :pin-label="$t('app.unpinThread')"
        :long-press-handlers="longPressHandlers"
        show-pinned-icon
        @open="emit('open', thread)"
        @toggle-pin="emit('unpin', thread)"
        @rename="emit('rename', thread)"
      />
    </div>
  </section>
</template>
