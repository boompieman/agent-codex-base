import { defineStore } from "pinia";
import { ref } from "vue";
import type { MisalignmentErrorDetails } from "~~/shared/types";
import { pinnedKey } from "@/stores/gateway/thread-utils/identity";

export interface TurnRecoveryRequest extends MisalignmentErrorDetails {
  hostId: number;
  threadId: string;
  turnId: string | null;
}

export const useGatewayTurnRecoveryStore = defineStore("gateway-turn-recovery", () => {
  const requestsByKey = ref<Record<string, TurnRecoveryRequest>>({});

  function setRequest(request: TurnRecoveryRequest) {
    requestsByKey.value = {
      ...requestsByKey.value,
      [pinnedKey(request.hostId, request.threadId)]: request,
    };
  }

  function clearRequest(hostId: number, threadId: string) {
    const key = pinnedKey(hostId, threadId);
    const { [key]: _removed, ...remaining } = requestsByKey.value;
    requestsByKey.value = remaining;
  }

  function resetState() {
    requestsByKey.value = {};
  }

  return { requestsByKey, setRequest, clearRequest, resetState };
});
