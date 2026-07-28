import type { ThreadSettingsState } from "~~/shared/types";
import { trimmedOrNull } from "~~/shared/utils/strings";

export function normalizeThreadSettings(
  settings: ThreadSettingsState | null | undefined,
): ThreadSettingsState {
  return {
    model: trimmedOrNull(settings?.model),
    effort: trimmedOrNull(settings?.effort),
    approvalPolicy:
      settings?.approvalPolicy === "untrusted" ||
      settings?.approvalPolicy === "on-request" ||
      settings?.approvalPolicy === "never"
        ? settings.approvalPolicy
        : null,
  };
}

export function mergeThreadSettings(
  current: ThreadSettingsState,
  next: ThreadSettingsState,
): ThreadSettingsState {
  return {
    model: "model" in next ? (next.model ?? null) : (current.model ?? null),
    effort: "effort" in next ? (next.effort ?? null) : (current.effort ?? null),
    approvalPolicy:
      "approvalPolicy" in next ? (next.approvalPolicy ?? null) : (current.approvalPolicy ?? null),
  };
}
