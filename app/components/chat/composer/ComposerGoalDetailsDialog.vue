<script setup lang="ts">
import { LoaderCircleIcon, PencilIcon, SaveIcon, SquareIcon, Trash2Icon } from "@lucide/vue";
import { computed, ref, watch } from "vue";
import type { ThreadGoal } from "~~/shared/types";
import MarkdownContent from "@/components/common/MarkdownContent.vue";
import type { ComposerGoalPendingAction } from "@/composables/composer/useComposerGoalControls";
import { Button } from "@codex-gateway/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@codex-gateway/ui/dialog";
import { ScrollArea } from "@codex-gateway/ui/scroll-area";
import { Textarea } from "@codex-gateway/ui/textarea";

const props = defineProps<{
  goal: ThreadGoal;
  elapsedLabel: string;
  tokensLabel: string;
  budgetLabel: string;
  pendingAction: ComposerGoalPendingAction | null;
}>();

const emit = defineEmits<{
  save: [objective: string];
  stop: [];
  clear: [];
}>();

const open = ref(false);
const editing = ref(false);
const objectiveDraft = ref("");
const normalizedObjective = computed(() => objectiveDraft.value.trim());
const canSave = computed(
  () =>
    props.pendingAction === null &&
    normalizedObjective.value.length > 0 &&
    normalizedObjective.value !== props.goal.objective.trim(),
);

function beginEditing() {
  objectiveDraft.value = props.goal.objective;
  editing.value = true;
}

function cancelEditing() {
  objectiveDraft.value = props.goal.objective;
  editing.value = false;
}

function saveGoal() {
  if (!canSave.value) return;
  emit("save", normalizedObjective.value);
}

watch(open, (isOpen) => {
  if (isOpen) objectiveDraft.value = props.goal.objective;
  else editing.value = false;
});

watch(
  () => props.goal.objective,
  (objective) => {
    objectiveDraft.value = objective;
    // The store updates the Goal while the shared mutation guard still reports `set`. Closing the
    // editor on that semantic commit keeps a failed request editable and avoids timing assumptions.
    if (props.pendingAction === "set") editing.value = false;
  },
);
</script>

<template>
  <Dialog v-model:open="open">
    <DialogTrigger as-child>
      <button
        type="button"
        data-testid="composer-goal-summary"
        class="flex w-full min-w-0 items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-3 py-2 text-left text-sm text-ink shadow-sm shadow-ink/5 transition hover:border-primary/40 hover:bg-primary/10 md:text-base"
      >
        <span class="shrink-0 font-medium text-primary">{{ $t("app.goalModeActive") }}</span>
        <span class="min-w-0 flex-1 truncate text-ink-secondary">{{ goal.objective }}</span>
        <span
          class="flex shrink-0 flex-col items-end gap-0.5 font-mono text-xs text-ink-muted sm:flex-row sm:items-center sm:gap-2"
        >
          <span>{{ elapsedLabel }}</span>
          <span>{{ tokensLabel }}</span>
        </span>
      </button>
    </DialogTrigger>

    <DialogContent
      class="flex h-[min(54rem,calc(100dvh-3rem))] w-[min(70rem,calc(100vw-3rem))] !max-w-[min(70rem,calc(100vw-3rem))] flex-col overflow-hidden p-0"
    >
      <DialogHeader class="shrink-0 border-b border-hairline px-6 py-5">
        <DialogTitle class="text-lg">{{ $t("app.goalDetailsTitle") }}</DialogTitle>
        <DialogDescription>{{ $t("app.goalDetailsDescription") }}</DialogDescription>
      </DialogHeader>

      <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 py-5">
        <div
          class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-hairline bg-canvas-soft"
        >
          <div
            class="shrink-0 border-b border-hairline px-4 py-3 text-xs font-medium uppercase tracking-wide text-ink-muted"
          >
            {{ $t("app.goalObjective") }}
          </div>
          <Textarea
            v-if="editing"
            v-model="objectiveDraft"
            data-testid="goal-details-objective-input"
            :aria-label="$t('app.goalObjective')"
            class="h-full min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent p-4 text-sm shadow-none focus-visible:ring-0"
            :disabled="pendingAction !== null"
          />
          <ScrollArea v-else class="min-h-0 flex-1">
            <div class="p-4 pr-6">
              <MarkdownContent :content="goal.objective" compact />
            </div>
          </ScrollArea>
        </div>

        <dl class="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-3">
          <div class="rounded-2xl border border-hairline bg-surface p-3">
            <dt class="text-xs text-ink-muted">{{ $t("app.goalElapsed") }}</dt>
            <dd class="mt-1 font-mono text-sm text-ink">{{ elapsedLabel }}</dd>
          </div>
          <div class="rounded-2xl border border-hairline bg-surface p-3">
            <dt class="text-xs text-ink-muted">{{ $t("app.goalTokensUsed") }}</dt>
            <dd class="mt-1 font-mono text-sm text-ink">{{ tokensLabel }}</dd>
          </div>
          <div class="rounded-2xl border border-hairline bg-surface p-3">
            <dt class="text-xs text-ink-muted">{{ $t("app.goalTokenBudget") }}</dt>
            <dd class="mt-1 font-mono text-sm text-ink">{{ budgetLabel }}</dd>
          </div>
        </dl>
      </div>

      <DialogFooter
        class="shrink-0 border-t border-hairline px-6 py-4 sm:items-center sm:justify-between"
      >
        <Button
          type="button"
          variant="destructive"
          data-testid="goal-details-clear"
          :disabled="pendingAction !== null"
          @click="emit('clear')"
        >
          <LoaderCircleIcon v-if="pendingAction === 'clear'" class="size-4 animate-spin" />
          <Trash2Icon v-else class="size-4" />
          {{ $t("app.slashGoalClearTitle") }}
        </Button>
        <div class="flex flex-col-reverse gap-2 sm:flex-row">
          <template v-if="editing">
            <Button
              type="button"
              variant="outline"
              data-testid="goal-details-edit-cancel"
              :disabled="pendingAction !== null"
              @click="cancelEditing"
            >
              {{ $t("app.cancel") }}
            </Button>
            <Button
              type="button"
              data-testid="goal-details-edit-save"
              :disabled="!canSave"
              @click="saveGoal"
            >
              <LoaderCircleIcon v-if="pendingAction === 'set'" class="size-4 animate-spin" />
              <SaveIcon v-else class="size-4" />
              {{ $t("app.save") }}
            </Button>
          </template>
          <template v-else>
            <Button
              type="button"
              variant="outline"
              data-testid="goal-details-stop"
              :disabled="pendingAction !== null"
              @click="emit('stop')"
            >
              <LoaderCircleIcon v-if="pendingAction === 'pause'" class="size-4 animate-spin" />
              <SquareIcon v-else class="size-4" />
              {{ $t("app.goalStop") }}
            </Button>
            <Button
              type="button"
              data-testid="goal-details-edit"
              :disabled="pendingAction !== null"
              @click="beginEditing"
            >
              <PencilIcon class="size-4" />
              {{ $t("app.slashGoalEditTitle") }}
            </Button>
          </template>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
