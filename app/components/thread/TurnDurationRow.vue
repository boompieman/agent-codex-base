<script setup lang="ts">
import { Clock3Icon } from "@lucide/vue";
import { useTimestamp } from "@vueuse/core";
import { computed, watch, type PropType } from "vue";
import { formatDurationMs } from "@/utils/item-timing";
import { resolvedTurnDurationMs } from "@/utils/turn-timing";

const props = defineProps({
  startedAt: { type: Number as PropType<number | null>, default: null },
  completedAt: { type: Number as PropType<number | null>, default: null },
  durationMs: { type: Number as PropType<number | null>, default: null },
  active: Boolean,
});
const { t } = useI18n();
const { timestamp: now, pause, resume } = useTimestamp({ controls: true, interval: 1000 });
const duration = computed(() => resolvedTurnDurationMs(props, now.value));
const label = computed(() => (duration.value === null ? null : formatDurationMs(duration.value)));

// App-server owns the start/end instants. VueUse only advances the wall clock while a Turn is
// active; it never invents a start timestamp when the protocol has not supplied one.
watch(
  () => props.active,
  (active) => (active ? resume() : pause()),
  { immediate: true },
);
</script>

<template>
  <div v-if="label !== null" class="flex items-center gap-1.5 text-xs text-ink-faint">
    <Clock3Icon class="size-3.5" />
    <span>{{ t("app.turnDuration", { duration: label }) }}</span>
  </div>
</template>
