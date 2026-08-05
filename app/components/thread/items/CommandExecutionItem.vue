<script setup lang="ts">
import type { ThreadHistoryItem } from "~~/shared/types";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  LoaderCircleIcon,
  TerminalIcon,
  XCircleIcon,
} from "@lucide/vue";
import { computed } from "vue";
import { Badge } from "@codex-gateway/ui/badge";
import { Button } from "@codex-gateway/ui/button";
import { Collapsible, CollapsibleTrigger } from "@codex-gateway/ui/collapsible";
import HighlightedCode from "@/components/common/HighlightedCode.vue";
import DeferredCollapsibleContent from "@/components/common/DeferredCollapsibleContent.vue";
import { ChatStickToBottomScrollArea } from "@/components/common/chat-virtualizer";
import { useServerRequestResponder } from "@/composables/thread/useServerRequestResponder";
import { commandDisplayLabel } from "@/utils/thread-item-display";
import { threadItemResultText } from "@/utils/thread-items";

const props = defineProps<{
  item: ThreadHistoryItem;
  hostId: number | null;
  threadId: string | null;
}>();
const { t } = useI18n();
const title = computed(() => commandDisplayLabel(props.item.command));
const rawOutput = computed(() => props.item.aggregatedOutput || threadItemResultText(props.item));
const output = computed(() => rawOutput.value);
const commandStatus = computed(() =>
  typeof props.item.status === "string" ? props.item.status : props.item.status?.type,
);
const pendingApproval = computed(() => props.item.pendingApproval || null);
const requestId = computed(() => pendingApproval.value?.requestId);
const {
  canRespond,
  responding,
  respond: respondToRequest,
} = useServerRequestResponder({
  hostId: computed(() => props.hostId),
  threadId: computed(() => props.threadId),
  requestId,
});
const isInProgress = computed(() => {
  const value = commandStatus.value;
  return value === "inProgress" || value === "running" || value === "active";
});
const visualStatus = computed<"running" | "completed" | "failed" | null>(() => {
  if (isInProgress.value) return "running";
  if (
    commandStatus.value === "failed" ||
    commandStatus.value === "interrupted" ||
    (typeof props.item.exitCode === "number" && props.item.exitCode !== 0)
  ) {
    return "failed";
  }
  if (commandStatus.value === "completed" || props.item.exitCode === 0) return "completed";
  return null;
});

async function respond(decision: "accept" | "decline") {
  await respondToRequest({ decision });
}
</script>

<template>
  <Collapsible v-slot="{ open }" class="max-w-4xl text-ink-muted">
    <CollapsibleTrigger
      class="flex w-full items-center gap-2 rounded-md py-1 text-left text-[0.9375rem] hover:bg-canvas-soft"
    >
      <TerminalIcon class="size-4 shrink-0" />
      <span class="min-w-0 flex-1 truncate">{{ title }}</span>
      <Badge v-if="pendingApproval" variant="outline">{{ t("app.waitingApproval") }}</Badge>
      <!-- The icon is the complete command lifecycle indicator. Do not add a status badge beside
           it: app-server's raw status repeats the same information and needlessly truncates long
           commands. Keep the translated label available to assistive technology and hover. -->
      <LoaderCircleIcon
        v-if="visualStatus === 'running'"
        data-testid="command-status-running"
        class="size-4 shrink-0 animate-spin text-accent"
        role="img"
        :aria-label="t('app.running')"
        :title="t('app.running')"
      />
      <CheckCircle2Icon
        v-else-if="visualStatus === 'completed'"
        data-testid="command-status-completed"
        class="size-4 shrink-0 text-accent-green"
        role="img"
        :aria-label="t('app.completed')"
        :title="t('app.completed')"
      />
      <XCircleIcon
        v-else-if="visualStatus === 'failed'"
        data-testid="command-status-failed"
        class="size-4 shrink-0 text-destructive"
        role="img"
        :aria-label="t('app.failed')"
        :title="t('app.failed')"
      />
      <span class="rounded-full p-0.5">
        <ChevronDownIcon v-if="open" class="size-4 shrink-0 text-ink-faint" />
        <ChevronRightIcon v-else class="size-4 shrink-0 text-ink-faint" />
      </span>
    </CollapsibleTrigger>
    <DeferredCollapsibleContent :open="open">
      <div
        v-if="pendingApproval"
        class="mt-2 rounded-lg border border-accent-orange/30 bg-accent-orange/10 px-3 py-2 text-sm text-accent-orange-deep"
      >
        <div class="font-medium">{{ t("app.commandApprovalRequired") }}</div>
        <div v-if="pendingApproval.params?.reason" class="mt-1 text-accent-orange-deep">
          {{ pendingApproval.params.reason }}
        </div>
        <div v-if="canRespond" class="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            :disabled="responding"
            data-testid="command-approval-accept"
            @click="respond('accept')"
          >
            {{ t("app.approve") }}
          </Button>
          <Button
            size="sm"
            variant="outline"
            :disabled="responding"
            data-testid="command-approval-decline"
            @click="respond('decline')"
          >
            {{ t("app.decline") }}
          </Button>
        </div>
        <div v-else class="mt-2 text-xs text-accent-orange-deep">
          {{ t("app.serverRequestResolved") }}
        </div>
      </div>
      <ChatStickToBottomScrollArea
        v-if="output"
        class="mt-2 max-h-56 rounded-lg border border-hairline bg-canvas-soft"
        viewport-class="max-h-56"
        allow-horizontal-overflow
        :threshold="48"
        :follow-key="rawOutput.length"
      >
        <HighlightedCode
          :code="output"
          language="shell"
          :streaming="isInProgress"
          pre-class="syntax-highlight min-w-max whitespace-pre p-3 text-xs leading-5 text-ink-secondary"
        />
      </ChatStickToBottomScrollArea>
      <div
        v-else
        class="mt-2 rounded-lg border border-hairline bg-canvas-soft px-3 py-2 text-sm text-ink-faint"
      >
        {{ t("app.waitingCommandOutput") }}
      </div>
    </DeferredCollapsibleContent>
  </Collapsible>
</template>
