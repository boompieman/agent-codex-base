<script setup lang="ts">
import { computed } from "vue";
import type { ThreadTokenUsageState } from "~~/shared/types";

const props = defineProps<{
  tokenUsage: ThreadTokenUsageState | null;
}>();

const { t } = useI18n();
const contextUsedPercent = computed(() => {
  const usage = props.tokenUsage;
  const totalTokens = usage?.last?.totalTokens;
  const contextWindow = usage?.modelContextWindow;
  if (!totalTokens || !contextWindow) {
    return null;
  }
  return Math.min(100, Math.max(0, Math.ceil((totalTokens / contextWindow) * 100)));
});
const contextUsageStyle = computed(() => {
  const percent = contextUsedPercent.value ?? 0;
  return {
    background: `conic-gradient(var(--primary) ${percent}%, var(--border) 0)`,
  };
});
const contextUsageLabel = computed(() =>
  contextUsedPercent.value == null ? null : `${contextUsedPercent.value}%`,
);
const accessibleLabel = computed(() =>
  contextUsedPercent.value === null
    ? t("app.contextUsageUnavailable")
    : t("app.contextUsage", { percent: contextUsedPercent.value }),
);
</script>

<template>
  <div
    v-if="contextUsageLabel"
    data-testid="context-usage-meter"
    class="flex shrink-0 items-center gap-2 text-base text-ink-muted"
    :title="accessibleLabel"
    role="img"
    :aria-label="accessibleLabel"
  >
    <div class="flex size-6 items-center justify-center rounded-full" :style="contextUsageStyle">
      <div class="size-3.5 rounded-full bg-surface" />
    </div>
    <span class="hidden sm:inline">{{ contextUsageLabel }}</span>
  </div>
</template>
