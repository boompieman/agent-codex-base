<script setup lang="ts">
import {
  AtSignIcon,
  CheckIcon,
  Loader2Icon,
  PlusIcon,
  SendIcon,
  Settings2Icon,
  ShieldAlertIcon,
  SquareIcon,
  TerminalSquareIcon,
  WandSparklesIcon,
} from "@lucide/vue";
import { ref } from "vue";
import type {
  ApprovalPolicy,
  ModelRecord,
  ReasoningEffort,
  ThreadRuntimeStatus,
  ThreadTokenUsageState,
} from "~~/shared/types";
import { Button } from "@codex-gateway/ui/button";
import ApprovalPolicyPicker from "@/components/chat/composer/ApprovalPolicyPicker.vue";
import ContextUsageMeter from "@/components/chat/composer/ContextUsageMeter.vue";
import ModelEffortPicker from "@/components/chat/composer/ModelEffortPicker.vue";

defineProps<{
  uploadingAttachments: boolean;
  selectedThreadId: string | null;
  selectedProjectId: number | null;
  selectedApprovalMode: ApprovalPolicy | "custom";
  selectedThreadTokenUsage: ThreadTokenUsageState | null;
  models: ModelRecord[];
  loadingModels: boolean;
  activeModel: string;
  activeModelLabel: string;
  activeEffortValue: string;
  activeEffortCompactLabel: string;
  effortOptions: Array<{ value: ReasoningEffort; label?: string }>;
  labelEffortOption: (option: { value: ReasoningEffort; label?: string }) => string;
  modelOptionValue: (modelOption: { model?: string; id: string }) => string;
  hasComposerInput: boolean;
  isThreadRunning: boolean;
  canInterruptTurn: boolean;
  canUsePrimaryAction: boolean;
  interruptingTurn: boolean;
  selectedThreadStatus: ThreadRuntimeStatus;
  sendButtonLabel: string;
}>();

const emit = defineEmits<{
  attach: [];
  insertTrigger: [trigger: "@" | "$" | "/"];
  primaryAction: [];
  selectModel: [model: string];
  selectEffort: [effort: ReasoningEffort];
  updateSelectedApprovalMode: [mode: ApprovalPolicy | "custom"];
}>();

const optionsOpen = ref(false);
</script>

<template>
  <div class="pt-1.5">
    <div
      v-if="optionsOpen"
      data-testid="composer-options"
      class="mb-1.5 flex min-w-0 flex-wrap items-center gap-1 rounded-xl bg-canvas-soft p-1.5"
    >
      <Button
        data-testid="composer-trigger-file"
        type="button"
        variant="ghost"
        size="sm"
        class="h-11 gap-2 px-3 text-ink-muted"
        :disabled="selectedProjectId === null"
        @click="emit('insertTrigger', '@')"
      >
        <AtSignIcon class="size-4" />
        {{ $t("app.filesTab") }}
      </Button>
      <Button
        data-testid="composer-trigger-skill"
        type="button"
        variant="ghost"
        size="sm"
        class="h-11 gap-2 px-3 text-ink-muted"
        :disabled="selectedProjectId === null"
        @click="emit('insertTrigger', '$')"
      >
        <WandSparklesIcon class="size-4" />
        {{ $t("app.skills") }}
      </Button>
      <Button
        data-testid="composer-trigger-command"
        type="button"
        variant="ghost"
        size="sm"
        class="h-11 gap-2 px-3 text-ink-muted"
        :disabled="selectedProjectId === null"
        @click="emit('insertTrigger', '/')"
      >
        <TerminalSquareIcon class="size-4" />
        {{ $t("app.commands") }}
      </Button>
      <ApprovalPolicyPicker
        :model-value="selectedApprovalMode"
        @update:model-value="emit('updateSelectedApprovalMode', $event)"
      />
      <div class="ml-auto flex min-w-0 items-center gap-1">
        <ContextUsageMeter :token-usage="selectedThreadTokenUsage" />
        <ModelEffortPicker
          :models="models"
          :loading-models="loadingModels"
          :active-model="activeModel"
          :active-model-label="activeModelLabel"
          :active-effort-value="activeEffortValue"
          :active-effort-compact-label="activeEffortCompactLabel"
          :effort-options="effortOptions"
          :label-effort-option="labelEffortOption"
          :model-option-value="modelOptionValue"
          @select-model="emit('selectModel', $event)"
          @select-effort="emit('selectEffort', $event)"
        />
      </div>
    </div>

    <div class="flex min-w-0 items-center gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        class="size-11 shrink-0 rounded-xl text-ink-muted hover:bg-canvas-soft hover:text-ink-secondary"
        :disabled="uploadingAttachments || !selectedThreadId"
        :aria-label="$t('app.attachFile')"
        @click="emit('attach')"
      >
        <Loader2Icon v-if="uploadingAttachments" class="size-5 animate-spin" />
        <PlusIcon v-else class="size-5" />
      </Button>
      <Button
        data-testid="composer-options-toggle"
        type="button"
        variant="ghost"
        size="sm"
        class="h-11 shrink-0 gap-2 rounded-xl px-3 text-ink-muted hover:bg-canvas-soft hover:text-ink-secondary"
        :aria-expanded="optionsOpen"
        :aria-label="$t('app.composerOptions')"
        @click="optionsOpen = !optionsOpen"
      >
        <ShieldAlertIcon v-if="selectedApprovalMode === 'never'" class="size-5 text-status-error" />
        <Settings2Icon v-else class="size-5" />
        <span class="hidden sm:inline">{{ $t("app.options") }}</span>
        <span v-if="selectedApprovalMode === 'never'" class="hidden text-status-error sm:inline">
          · {{ $t("app.approvalFullAccessShort") }}
        </span>
      </Button>
      <div class="ml-auto" />
      <Button
        data-testid="send-turn-button"
        class="h-11 shrink-0 bg-primary text-primary-foreground hover:bg-primary-active"
        :class="isThreadRunning ? 'gap-1.5 rounded-full px-3' : 'w-11 rounded-full p-0'"
        :aria-label="sendButtonLabel"
        :disabled="!canUsePrimaryAction || interruptingTurn"
        @click="emit('primaryAction')"
      >
        <Loader2Icon v-if="uploadingAttachments || interruptingTurn" class="size-5 animate-spin" />
        <SendIcon v-else-if="hasComposerInput" class="size-5" />
        <SquareIcon v-else-if="canInterruptTurn" class="size-5 fill-current" />
        <CheckIcon v-else-if="selectedThreadStatus === 'completed'" class="size-5" />
        <SendIcon v-else class="size-5 opacity-60" />
        <span v-if="isThreadRunning" class="text-sm font-medium">{{ sendButtonLabel }}</span>
      </Button>
    </div>
  </div>
</template>
