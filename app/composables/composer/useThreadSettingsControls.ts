import { computed, ref } from "vue";

import { storeToRefs } from "pinia";
import type { ApprovalPolicy, ReasoningEffort } from "~~/shared/types";
import { firstNonEmptyString, trimmedOrFallback, trimmedOrNull } from "~~/shared/utils/strings";
import { useGatewayCatalogStore } from "@/stores/gateway-catalog";
import { useGatewayComposerStore } from "@/stores/gateway-composer";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";

export function useThreadSettingsControls() {
  const gateway = useGatewayCatalogStore();
  const composer = useGatewayComposerStore();
  const navigation = useGatewayNavigationStore();
  const { models, defaultModel } = storeToRefs(gateway);
  const { selectedThreadSettings } = storeToRefs(composer);
  const { selectedThreadId } = storeToRefs(navigation);
  const { t } = useI18n();
  const newThreadModel = ref("");
  const newThreadEffort = ref<ReasoningEffort>("default");
  const newThreadApprovalMode = ref<ApprovalPolicy | "custom">("custom");

  // Existing-thread controls are computed proxies over the per-thread Pinia state. Do not mirror
  // them into local refs with bidirectional watchers: thread selection, snapshot hydration, and the
  // model catalog arrive independently, and a transient model default can otherwise be written
  // back as the thread's setting. Local refs are retained only for the pre-thread composer, where
  // no app-server thread identity exists yet.
  const selectedModel = computed({
    get: () =>
      selectedThreadId.value === null
        ? (firstNonEmptyString([
            newThreadModel.value,
            defaultModel.value?.model,
            defaultModel.value?.id,
          ]) ?? "")
        : (trimmedOrNull(selectedThreadSettings.value.model) ?? ""),
    set: (model: string) => {
      if (selectedThreadId.value === null) {
        newThreadModel.value = model;
        return;
      }
      void composer.saveSelectedThreadSettings({ model: trimmedOrNull(model) });
    },
  });
  const selectedEffort = computed<ReasoningEffort>({
    get: () =>
      selectedThreadId.value === null
        ? newThreadEffort.value
        : (selectedThreadSettings.value.effort ?? "default"),
    set: (effort) => {
      if (selectedThreadId.value === null) {
        newThreadEffort.value = effort;
        return;
      }
      void composer.saveSelectedThreadSettings({ effort: effort === "default" ? null : effort });
    },
  });
  const selectedApprovalMode = computed<ApprovalPolicy | "custom">({
    get: () =>
      selectedThreadId.value === null
        ? newThreadApprovalMode.value
        : (selectedThreadSettings.value.approvalPolicy ?? "custom"),
    set: (approvalPolicy) => {
      if (selectedThreadId.value === null) {
        newThreadApprovalMode.value = approvalPolicy;
        return;
      }
      void composer.saveSelectedThreadSettings({
        approvalPolicy: approvalPolicy === "custom" ? null : approvalPolicy,
      });
    },
  });

  const activeModel = computed(
    // This fallback is presentation-only for an existing thread whose metadata-only read cannot
    // expose persisted settings. Turn submission uses selectedModel instead, because explicitly
    // sending this catalog default makes app-server discard the thread's persisted model/effort.
    () =>
      firstNonEmptyString([
        selectedModel.value,
        defaultModel.value?.model,
        defaultModel.value?.id,
      ]) ?? "",
  );
  const activeModelRecord = computed(() =>
    models.value.find(
      (candidate) => candidate.model === activeModel.value || candidate.id === activeModel.value,
    ),
  );
  const activeModelLabel = computed(() => {
    const model = activeModelRecord.value;
    return firstNonEmptyString([model?.displayName, model?.model, activeModel.value]) ?? "模型";
  });
  const activeEffortValue = computed(() => {
    if (selectedEffort.value !== "default") return selectedEffort.value;
    // A new thread genuinely inherits the selected model's default. For an existing thread,
    // "default" can also mean that a metadata-only thread/read could not expose persisted effort;
    // displaying the catalog default as if it were authoritative is what produced the false Light
    // state on mobile.
    return selectedThreadId.value === null
      ? (activeModelRecord.value?.defaultReasoningEffort ?? "")
      : "";
  });
  const effortOptions = computed(() => {
    const supportedEfforts = activeModelRecord.value?.supportedReasoningEfforts ?? [];
    const options = supportedEfforts.map((option) => ({
      value: option.reasoningEffort,
      label: option.reasoningEffort,
    }));
    if (
      selectedEffort.value !== "default" &&
      !options.some((option) => option.value === selectedEffort.value)
    ) {
      options.unshift({ value: selectedEffort.value, label: selectedEffort.value });
    }
    return options;
  });
  const activeEffortLabel = computed(() =>
    labelEffortOption(effortOptions.value.find((option) => option.value === selectedEffort.value)),
  );
  const activeEffortCompactLabel = computed(() =>
    activeEffortValue.value === ""
      ? t("app.reasoningDefault")
      : compactEffortLabel(activeEffortValue.value),
  );

  function compactEffortLabel(value: string) {
    if (value === "") return "";
    const normalized = value.toLowerCase().replaceAll("_", "-");
    const knownLabels: Record<string, string> = {
      low: "Light",
      light: "Light",
      medium: "Medium",
      high: "High",
      "extra-high": "Extra High",
      xhigh: "Extra High",
    };
    const knownLabel = knownLabels[normalized];
    if (knownLabel !== undefined) return knownLabel;
    return value
      .split(/[-_\s]+/)
      .filter((part) => part !== "")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function labelEffortOption(option: { value: ReasoningEffort; label?: string } | undefined) {
    if (option === undefined) {
      return trimmedOrFallback(activeEffortCompactLabel.value, t("app.reasoningDefault"));
    }
    return compactEffortLabel(trimmedOrFallback(option.label, option.value));
  }

  function modelOptionValue(modelOption: { model?: string; id: string }) {
    return trimmedOrFallback(modelOption.model, modelOption.id);
  }

  function setSelectedModel(model: string) {
    selectedModel.value = model;
  }

  function setSelectedEffort(effort: ReasoningEffort) {
    selectedEffort.value = effort;
  }

  function setSelectedApprovalMode(value: ApprovalPolicy | "custom") {
    selectedApprovalMode.value = value;
  }

  return {
    selectedModel,
    selectedEffort,
    selectedApprovalMode,
    activeModel,
    activeModelLabel,
    activeEffortValue,
    activeEffortLabel,
    activeEffortCompactLabel,
    effortOptions,
    labelEffortOption,
    modelOptionValue,
    setSelectedModel,
    setSelectedEffort,
    setSelectedApprovalMode,
  };
}
