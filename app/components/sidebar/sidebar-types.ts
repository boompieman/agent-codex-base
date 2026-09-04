import type { HostRecord, PinnedThreadRecord, ProjectRecord } from "~~/shared/types";

export type { HostRecord, PinnedThreadRecord, ProjectRecord };

/** App-server thread list fields vary by Codex release. Keep the UI boundary explicit without
 * leaking `any` through the Host/Project tree. */
export interface SidebarThread extends Record<string, unknown> {
  id: string | number;
  cwd?: string | null;
  gitInfo?: { branch?: string | null } | null;
  updatedAt?: number | null;
  pinned?: boolean;
}

export type SidebarThreadRow = SidebarThread | PinnedThreadRecord;
