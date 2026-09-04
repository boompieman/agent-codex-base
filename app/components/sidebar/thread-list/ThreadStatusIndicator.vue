<script setup lang="ts">
import {
  BellDotIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  CirclePauseIcon,
  MessageCircleQuestionIcon,
  Loader2Icon,
  ShieldAlertIcon,
} from "@lucide/vue";
import { computed } from "vue";
import type { AppServerThreadActiveFlag, ThreadRuntimeStatus } from "~~/shared/types";
import { statusClass, statusLabelKey } from "../sidebar-utils";

const props = defineProps<{
  status: ThreadRuntimeStatus;
  completionAttention?: boolean;
  activeFlags?: AppServerThreadActiveFlag[];
}>();

const { t } = useI18n();
const statusIconByStatus = {
  waitingApproval: ShieldAlertIcon,
  needsInput: MessageCircleQuestionIcon,
  running: Loader2Icon,
  completedUnviewed: BellDotIcon,
  completed: CheckCircle2Icon,
  failed: CircleAlertIcon,
  interrupted: CirclePauseIcon,
} as const;
const displayStatus = computed(() => {
  if (props.activeFlags?.includes("waitingOnUserInput")) return "needsInput";
  if (props.activeFlags?.includes("waitingOnApproval")) return "waitingApproval";
  return props.completionAttention ? "completedUnviewed" : props.status;
});
const label = computed(() => t(statusLabelKey(displayStatus.value)));
const icon = computed(
  () => statusIconByStatus[displayStatus.value as keyof typeof statusIconByStatus] ?? null,
);
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center gap-1 text-xs font-medium"
    :class="statusClass(displayStatus)"
    :aria-label="label"
    :title="label"
  >
    <component
      :is="icon"
      v-if="icon"
      class="size-3.5"
      :class="{ 'animate-spin': displayStatus === 'running' }"
    />
    <span v-else class="size-2 rounded-full bg-current opacity-50" />
    <span v-if="displayStatus !== 'idle'" class="whitespace-nowrap">{{ label }}</span>
  </span>
</template>
