<script setup lang="ts">
import type { ThreadHistoryItem } from "~~/shared/types";
import { computed } from "vue";
import MarkdownContent from "@/components/common/MarkdownContent.vue";
import AgentMessageActions from "@/components/thread/items/AgentMessageActions.vue";
import { isItemInProgress, threadItemText } from "@/utils/thread-items";
import type { DisplayedTurnTiming } from "@/utils/turn-timing";

const props = defineProps<{
  item: ThreadHistoryItem;
  turnTiming?: DisplayedTurnTiming | null;
}>();

const text = computed(() => threadItemText(props.item));
const inProgress = computed(() => isItemInProgress(props.item));
</script>

<template>
  <div class="group min-w-0 max-w-full text-[0.9375rem] leading-8 text-ink lg:max-w-4xl">
    <MarkdownContent :content="text" :streaming="inProgress" />
    <AgentMessageActions v-if="text" :text="text" :turn-timing="turnTiming" />
  </div>
</template>
