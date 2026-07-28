import type { ThreadHistoryItem, ThreadHistoryState, ThreadSettingsState } from "~~/shared/types";
import { gatewayApi } from "@/utils/gateway-api";
import { useGatewayComposerStore } from "@/stores/gateway-composer";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { useGatewayBootstrapStore } from "@/stores/gateway-bootstrap";
import {
  messageFromError,
  pinnedKey,
  selectedThreadScope,
} from "@/stores/gateway/thread-utils/identity";
import { idFromUnknown } from "~~/shared/utils/records";
import {
  mergeThreadSettings,
  normalizeThreadSettings,
} from "@/stores/gateway/thread-utils/settings";
import { statusValue } from "@/utils/thread-items";
import { captureSessionEpoch } from "@/utils/session-epoch";

export function createThreadSettingsActions() {
  return {
    setThreadSettings(
      hostId: number,
      threadId: string,
      settings: ThreadSettingsState | null | undefined,
    ) {
      const composer = useGatewayComposerStore();
      composer.threadSettingsByKey = {
        ...composer.threadSettingsByKey,
        [pinnedKey(hostId, threadId)]: normalizeThreadSettings(settings),
      };
    },

    updateSelectedThreadSettings(settings: ThreadSettingsState) {
      const composer = useGatewayComposerStore();
      const navigation = useGatewayNavigationStore();
      const scope = selectedThreadScope(navigation.selectedHostId, navigation.selectedThreadId);
      if (scope === null) return;
      this.setThreadSettings(scope.hostId, scope.threadId, {
        ...mergeThreadSettings(composer.selectedThreadSettings, settings),
      });
    },

    setSelectedThreadCollaborationMode(mode: "default" | "plan") {
      const navigation = useGatewayNavigationStore();
      const scope = selectedThreadScope(navigation.selectedHostId, navigation.selectedThreadId);
      if (scope === null) return;
      this.setThreadCollaborationMode(scope.hostId, scope.threadId, mode);
    },

    setThreadCollaborationMode(hostId: number, threadId: string, mode: "default" | "plan") {
      const composer = useGatewayComposerStore();
      composer.threadCollaborationModesByKey = {
        ...composer.threadCollaborationModesByKey,
        [pinnedKey(hostId, threadId)]: mode,
      };
    },

    dismissPlanImplementationPrompt(hostId: number, threadId: string, planItemId: string) {
      const composer = useGatewayComposerStore();
      const key = pinnedKey(hostId, threadId);
      composer.dismissedPlanPromptIdsByKey = {
        ...composer.dismissedPlanPromptIdsByKey,
        [key]: { ...composer.dismissedPlanPromptIdsByKey[key], [planItemId]: true },
      };
    },

    dismissLatestSelectedPlanPrompt() {
      const navigation = useGatewayNavigationStore();
      const planItem = latestCompletedPlanItem(useGatewayThreadViewStore().history);
      const scope = selectedThreadScope(navigation.selectedHostId, navigation.selectedThreadId);
      const planItemId = idFromUnknown(planItem?.id);
      if (scope === null || planItemId === null) return;
      this.dismissPlanImplementationPrompt(scope.hostId, scope.threadId, String(planItemId));
    },

    async saveSelectedThreadSettings(settings: ThreadSettingsState) {
      const sessionIsCurrent = captureSessionEpoch();
      const gateway = useGatewayBootstrapStore();
      const navigation = useGatewayNavigationStore();
      const scope = selectedThreadScope(navigation.selectedHostId, navigation.selectedThreadId);
      if (scope === null) return;
      const { hostId, threadId } = scope;
      const projectId = navigation.selectedProjectId;
      this.updateSelectedThreadSettings(settings);
      try {
        await gatewayApi("/api/threads/settings", {
          method: "POST",
          body: { hostId, threadId, ...settings },
        });
      } catch (error: unknown) {
        if (!sessionIsCurrent()) return;
        gateway.setError(
          messageFromError(error, gateway.t("app.updateThreadSettingsFailed"), gateway.errorLabels),
          { hostId, projectId, threadId },
        );
      }
    },
  };
}

function latestCompletedPlanItem(history: ThreadHistoryState | null): ThreadHistoryItem | null {
  const turns = history?.thread.turns ?? [];
  for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const turn = turns[turnIndex];
    const items = turn?.items ?? [];
    for (let itemIndex = items.length - 1; itemIndex >= 0; itemIndex -= 1) {
      const item = items[itemIndex];
      if (
        item?.type === "plan" &&
        (statusValue(item.status) === "completed" || statusValue(turn?.status) === "completed")
      ) {
        return item;
      }
    }
  }
  return null;
}
