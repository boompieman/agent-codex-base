<script setup lang="ts">
import { computed } from "vue";
import type { ThreadTimelineItem } from "~~/shared/types";
import { componentForThreadItem } from "@/utils/thread-item-registry";
import type { DisplayedTurnTiming } from "@/utils/turn-timing";

const props = defineProps<{
  item: ThreadTimelineItem;
  hostId: number | null;
  threadId: string | null;
  userMessageVariant?: "normal" | "steer";
  turnTiming?: DisplayedTurnTiming | null;
}>();

const itemComponent = computed(() => componentForThreadItem(props.item.type));
</script>

<template>
  <component
    :is="itemComponent"
    :item="item"
    :host-id="hostId"
    :thread-id="threadId"
    :variant="userMessageVariant"
    :turn-timing="item.type === 'agentMessage' ? turnTiming : undefined"
  />
</template>
