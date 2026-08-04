import { ref, type Ref } from "vue";
import { useGatewayComposerStore } from "@/stores/gateway-composer";

export type ComposerGoalPendingAction = "pause" | "resume" | "clear";

export function useComposerGoalControls(text: Ref<string>) {
  const composer = useGatewayComposerStore();
  const pendingAction = ref<ComposerGoalPendingAction | null>(null);

  function edit() {
    text.value = `/goal ${composer.selectedThreadGoal?.objective ?? ""}`.trimEnd();
  }

  async function pause() {
    await runMutation("pause", () => composer.setSelectedThreadGoalStatus("paused"));
  }

  async function resume() {
    await runMutation("resume", () => composer.setSelectedThreadGoalStatus("active"));
  }

  async function clear() {
    await runMutation("clear", () => composer.clearSelectedThreadGoal());
  }

  async function runMutation(action: ComposerGoalPendingAction, mutation: () => Promise<void>) {
    if (pendingAction.value !== null) return;
    pendingAction.value = action;
    try {
      await mutation();
    } finally {
      pendingAction.value = null;
    }
  }

  return { pendingAction, edit, pause, resume, clear };
}
