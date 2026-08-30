<script setup lang="ts">
import { CircleDollarSignIcon } from "@lucide/vue";
import { computed } from "vue";
import type { ThreadResponseUsage } from "~~/shared/thread-history/types";
import { totalResponseUsageAmount } from "@/utils/response-usage";

const props = defineProps<{ usage?: ThreadResponseUsage[] }>();
const { t } = useI18n();
const amount = computed(() => totalResponseUsageAmount(props.usage));
</script>

<template>
  <span v-if="amount !== null" class="inline-flex items-center gap-1.5 text-xs text-ink-faint">
    <CircleDollarSignIcon class="size-3.5" />
    <span>{{ t("app.turnUsageAmount", { amount }) }}</span>
  </span>
</template>
