<script setup lang="ts">
import { computed } from "vue";
import type { ThreadTimelineItem } from "~~/shared/types";
import { componentForThreadItem } from "@/utils/thread-item-registry";

const props = defineProps<{
  item: ThreadTimelineItem;
  hostId: number | null;
  threadId: string | null;
  userMessageVariant?: "normal" | "steer";
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
  />
</template>
