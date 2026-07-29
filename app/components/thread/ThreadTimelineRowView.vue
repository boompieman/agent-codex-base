<script setup lang="ts">
import { computed } from "vue";
import IntermediateStepsToggle from "@/components/thread/IntermediateStepsToggle.vue";
import ThreadItemView from "@/components/thread/ThreadItemView.vue";
import {
  createThreadTimelinePresentationRow,
  type ThreadTimelineRow,
} from "@/components/thread/timeline-rows";

const props = defineProps<{
  row: ThreadTimelineRow;
  presentationRevision: number;
  hostId: number | null;
  threadId: string | null;
}>();

const emit = defineEmits<{
  intermediateToggle: [turnId: string, open: boolean];
}>();

// The revision is the explicit render clock owned by VirtualTimelineViewport. Keeping it in the
// computed input replaces implicit subscriptions to mutable Pinia item proxies and therefore lets
// active scrolling hold the current DOM snapshot even when the row identity itself is unchanged.
const presentationSource = computed(() => ({
  row: props.row,
  revision: props.presentationRevision,
}));
const presentationRow = computed(() =>
  createThreadTimelinePresentationRow(presentationSource.value.row),
);
</script>

<template>
  <IntermediateStepsToggle
    v-if="presentationRow.type === 'intermediateHeader'"
    :open="presentationRow.open"
    :count="presentationRow.count"
    @toggle="emit('intermediateToggle', presentationRow.turnId, $event)"
  />
  <ThreadItemView
    v-else
    :item="presentationRow.item"
    :host-id="hostId"
    :thread-id="threadId"
    :user-message-variant="presentationRow.userMessageVariant"
  />
</template>
