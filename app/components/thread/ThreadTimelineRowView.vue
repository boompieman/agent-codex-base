<script setup lang="ts">
import IntermediateStepsToggle from "@/components/thread/IntermediateStepsToggle.vue";
import ThreadItemView from "@/components/thread/ThreadItemView.vue";
import type { ThreadTimelineRow } from "@/components/thread/timeline-rows";

defineProps<{
  row: ThreadTimelineRow;
  hostId: number | null;
  threadId: string | null;
}>();

const emit = defineEmits<{
  intermediateToggle: [turnId: string, open: boolean];
}>();
</script>

<template>
  <IntermediateStepsToggle
    v-if="row.type === 'intermediateHeader'"
    :open="row.open"
    :count="row.count"
    @toggle="emit('intermediateToggle', row.turnId, $event)"
  />
  <ThreadItemView
    v-else
    :item="row.item"
    :host-id="hostId"
    :thread-id="threadId"
    :user-message-variant="row.userMessageVariant"
  />
</template>
