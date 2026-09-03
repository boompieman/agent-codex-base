<script setup lang="ts">
import { CheckIcon, Loader2Icon, PlusIcon, SendIcon, SquareIcon } from "@lucide/vue";
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
</script>

<template>
  <div class="flex min-w-0 items-center gap-1.5 pt-1.5 sm:flex-wrap sm:justify-between sm:gap-2">
    <div class="flex min-w-0 items-center gap-1 text-base text-ink-muted">
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        class="text-ink-muted hover:bg-canvas-soft hover:text-ink-secondary"
        :disabled="uploadingAttachments || !selectedThreadId"
        :aria-label="$t('app.attachFile')"
        @click="emit('attach')"
      >
        <Loader2Icon v-if="uploadingAttachments" class="size-5 animate-spin" />
        <PlusIcon v-else class="size-5" />
      </Button>
      <Button
        data-testid="composer-trigger-file"
        type="button"
        variant="ghost"
        size="sm"
        class="h-8 gap-1 px-2 font-mono text-ink-muted hover:bg-canvas-soft hover:text-ink-secondary"
        :disabled="selectedProjectId === null"
        :title="$t('app.projectFiles')"
        @click="emit('insertTrigger', '@')"
      >
        @ <span class="hidden font-sans md:inline">{{ $t("app.filesTab") }}</span>
      </Button>
      <Button
        data-testid="composer-trigger-skill"
        type="button"
        variant="ghost"
        size="sm"
        class="h-8 gap-1 px-2 font-mono text-ink-muted hover:bg-canvas-soft hover:text-ink-secondary"
        :disabled="selectedProjectId === null"
        :title="$t('app.skills')"
        @click="emit('insertTrigger', '$')"
      >
        $ <span class="hidden font-sans md:inline">{{ $t("app.skills") }}</span>
      </Button>
      <Button
        data-testid="composer-trigger-command"
        type="button"
        variant="ghost"
        size="sm"
        class="h-8 gap-1 px-2 font-mono text-ink-muted hover:bg-canvas-soft hover:text-ink-secondary"
        :disabled="selectedProjectId === null"
        :title="$t('app.slashCommands')"
        @click="emit('insertTrigger', '/')"
      >
        / <span class="hidden font-sans md:inline">{{ $t("app.commands") }}</span>
      </Button>
      <div class="hidden sm:block">
        <ApprovalPolicyPicker
          :model-value="selectedApprovalMode"
          @update:model-value="emit('updateSelectedApprovalMode', $event)"
        />
      </div>
    </div>
    <div class="ml-auto flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
      <ContextUsageMeter :token-usage="selectedThreadTokenUsage" />
      <div class="min-w-0">
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
      <Button
        data-testid="send-turn-button"
        class="h-11 shrink-0 bg-primary text-primary-foreground hover:bg-primary-active"
        :class="isThreadRunning ? 'gap-1.5 rounded-full px-3' : 'w-11 rounded-full p-0'"
        :aria-label="sendButtonLabel"
        :disabled="!canUsePrimaryAction || interruptingTurn"
        @click="emit('primaryAction')"
      >
        <Loader2Icon v-if="uploadingAttachments" class="size-5 animate-spin" />
        <Loader2Icon v-else-if="interruptingTurn" class="size-5 animate-spin" />
        <SendIcon v-else-if="hasComposerInput" class="size-5" />
        <SquareIcon v-else-if="canInterruptTurn" class="size-5 fill-current" />
        <CheckIcon v-else-if="selectedThreadStatus === 'completed'" class="size-5" />
        <SendIcon v-else class="size-5 opacity-60" />
        <span v-if="isThreadRunning" class="text-sm font-medium">{{ sendButtonLabel }}</span>
      </Button>
    </div>
  </div>
</template>
