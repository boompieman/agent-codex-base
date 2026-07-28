import type { HostWithSecret } from "../infra/ssh-types";
import { appServerThreadFromUnknown } from "~~/shared/runtime/app-server";
import { bindGatewayUser } from "../state/memory";
import { projectStore } from "../state/projects";
import { threadMetadataStore } from "../state/thread-metadata";
import { threadBroker } from "./broker";
import type { ThreadListPage } from "./thread-catalog";

export class ThreadProjectDiscoveryService {
  private readonly pending = new Map<string, Promise<void>>();

  indexPage(hostId: number, page: ThreadListPage) {
    for (const value of page.data) {
      const thread = appServerThreadFromUnknown(value);
      if (thread === null || typeof thread.cwd !== "string" || thread.cwd.trim() === "") continue;
      try {
        const project = projectStore.ensureForPath(hostId, thread.cwd);
        threadMetadataStore.record(hostId, project.id, thread);
      } catch (error) {
        console.warn("[gateway] failed to index thread project", {
          hostId,
          threadId: thread.id,
          cwd: thread.cwd,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  schedule(
    userId: number,
    host: HostWithSecret,
    firstPage: ThreadListPage,
    params: Record<string, unknown>,
  ) {
    const key = `${userId}:${host.id}`;
    if (
      this.pending.has(key) ||
      firstPage.nextCursor === null ||
      firstPage.nextCursor === undefined ||
      firstPage.nextCursor === ""
    )
      return;
    const discover = bindGatewayUser(async () => {
      let cursor = firstPage.nextCursor ?? null;
      const seen = new Set<string>();
      while (cursor !== null && !seen.has(cursor)) {
        seen.add(cursor);
        const page = await threadBroker.listThreads(host, {
          ...params,
          cursor,
          useStateDbOnly: false,
        });
        this.indexPage(host.id, page);
        cursor = page.nextCursor ?? null;
      }
    });
    const request = discover()
      .catch((error) => {
        console.warn("[gateway] background thread project discovery failed", {
          hostId: host.id,
          hostName: host.name,
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        if (this.pending.get(key) === request) this.pending.delete(key);
      });
    this.pending.set(key, request);
  }
}

export const threadProjectDiscovery = new ThreadProjectDiscoveryService();
