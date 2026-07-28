import { storeToRefs } from "pinia";
import { computed, nextTick, ref } from "vue";
import { useGatewayPinnedThreads } from "@/stores/gateway-config";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { titleForThread } from "@/stores/gateway/thread-utils/identity";
import type { SidebarThreadRow } from "../sidebar-types";

export function useThreadRename() {
  const navigation = useGatewayNavigationStore();
  const pinnedThreads = useGatewayPinnedThreads();
  const { threads } = storeToRefs(navigation);
  const renameTarget = ref<{ hostId: number; threadId: string } | null>(null);
  const renameValue = ref("");
  const renamingThreadKey = computed(() => {
    const target = renameTarget.value;
    return target ? `${target.hostId}:${target.threadId}` : null;
  });
  const renameKeyHandlers: Record<string, (event: KeyboardEvent) => void> = {
    Escape: (event) => {
      event.preventDefault();
      cancelRename();
    },
  };

  function startInlineRename(thread: SidebarThreadRow) {
    const hostId = "hostId" in thread ? Number(thread.hostId) : Number(navigation.selectedHostId);
    const threadIdValue =
      "threadId" in thread &&
      (typeof thread.threadId === "string" || typeof thread.threadId === "number")
        ? thread.threadId
        : "id" in thread
          ? thread.id
          : null;
    const threadId = threadIdValue === null ? "" : String(threadIdValue);
    if (!hostId || !threadId) return;
    renameTarget.value = { hostId, threadId };
    renameValue.value = titleForThread(thread);
    void nextTick(() => {
      document.querySelector<HTMLInputElement>('[data-testid="rename-thread-input"]')?.focus();
    });
  }

  async function submitRename() {
    const target = renameTarget.value;
    const name = renameValue.value.trim();
    if (!target || !name) {
      cancelRename();
      return;
    }
    const thread =
      threads.value.find(
        (candidate) =>
          navigation.selectedHostId === target.hostId && String(candidate.id) === target.threadId,
      ) ||
      pinnedThreads.value.find(
        (candidate) =>
          candidate.hostId === target.hostId && String(candidate.threadId) === target.threadId,
      );
    if (thread && titleForThread(thread) === name) {
      cancelRename();
      return;
    }
    await navigation.renameThread(target.hostId, target.threadId, name);
    renameTarget.value = null;
    renameValue.value = "";
  }

  function cancelRename() {
    renameTarget.value = null;
    renameValue.value = "";
  }

  function handleRenameKeydown(event: KeyboardEvent) {
    renameKeyHandlers[event.key]?.(event);
  }

  return {
    renamingThreadKey,
    renameValue,
    startInlineRename,
    submitRename,
    handleRenameKeydown,
  };
}
