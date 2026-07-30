<script setup lang="ts">
import { CheckIcon, CopyIcon } from "@lucide/vue";
import { useClipboard } from "@vueuse/core";
import { toRef } from "vue";
import { toast } from "vue-sonner";
import TurnDurationLabel from "@/components/thread/TurnDurationLabel.vue";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { DisplayedTurnTiming } from "@/utils/turn-timing";

const props = defineProps<{
  text: string;
  turnTiming?: DisplayedTurnTiming | null;
}>();

const { t } = useI18n();
const { copy, copied, isSupported } = useClipboard({
  source: toRef(props, "text"),
  copiedDuring: 1200,
});

async function copyText() {
  if (!props.text || !isSupported.value) {
    toast.error(t("app.copyAgentOutputFailed"));
    return;
  }
  try {
    await copy();
    toast.success(t("app.agentOutputCopied"));
  } catch {
    toast.error(t("app.copyAgentOutputFailed"));
  }
}
</script>

<template>
  <div data-testid="agent-message-actions" class="mt-2 flex items-center gap-2">
    <span
      class="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="size-8 p-0 text-ink-muted hover:bg-canvas-soft hover:text-ink"
              :aria-label="t('app.copyAgentOutput')"
              @click="copyText"
            >
              <CheckIcon v-if="copied" class="size-4 text-accent-green" />
              <CopyIcon v-else class="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{ t("app.copyAgentOutput") }}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
    <TurnDurationLabel v-if="turnTiming" :timing="turnTiming" />
  </div>
</template>
