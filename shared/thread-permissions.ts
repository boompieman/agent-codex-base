import type { ApprovalPolicy } from "./types/thread";

export const THREAD_PERMISSION_PROFILES: Record<ApprovalPolicy, string> = {
  untrusted: ":read-only",
  "on-request": ":workspace",
  never: ":danger-full-access",
};
