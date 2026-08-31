import type { AppServerThread, HostRecord } from "~~/shared/types";
import { parseThreadItemsPage, parseTurnsPage } from "~~/shared/runtime/app-server";
import {
  asThreadTimelineItem,
  projectThreadTimelineHistory,
} from "~~/shared/thread-history/timeline";
import { threadSnapshotStore } from "../state/thread-snapshots";
import type { ControllerRegistry } from "./controller-registry";
import { pageCursorState, pageToFullHistory } from "./thread-history-pages";
import { DEFAULT_TURN_PAGE_LIMIT, type TurnsPage } from "./types";

export interface ThreadTurnsListInput {
  cursor?: string | null;
  limit?: number;
  sortDirection?: "asc" | "desc";
}

export class ThreadHistoryReader {
  constructor(private readonly registry: ControllerRegistry) {}

  async loadInitialTurnsPage(
    host: HostRecord,
    thread: AppServerThread,
    limit: number,
    resumedPage?: TurnsPage,
  ) {
    // Keep the two upstream history contracts separate at this boundary. Paginated histories can
    // reuse thread/resume's bounded summary page and fetch items on demand. Legacy histories have
    // no stable item-page API, so their Turn pages are requested with full items and are never
    // exposed to the browser as lazily expandable rows. Mixing both contracts behind page locators
    // previously let a newly-started live Turn trigger a read before it existed in the rollout.
    if (resumedPage !== undefined) {
      return resumedPage;
    }
    return this.fetchTurnsPage(host, thread.id, thread.historyMode, {
      cursor: null,
      limit,
      sortDirection: "desc",
    });
  }

  async listThreadTurns(host: HostRecord, threadId: string, input: ThreadTurnsListInput) {
    const snapshot = this.requireSnapshot(host.id, threadId);
    const page = await this.fetchTurnsPage(host, threadId, snapshot.thread.historyMode, input);
    return {
      history: projectThreadTimelineHistory(pageToFullHistory({ id: threadId }, page)),
      turnsPage: pageCursorState(page),
    };
  }

  async listThreadItems(
    host: HostRecord,
    threadId: string,
    input: {
      turnId: string;
      cursor?: string | null;
      limit?: number;
      sortDirection?: "asc" | "desc";
    },
  ) {
    const snapshot = this.requireSnapshot(host.id, threadId);
    if (snapshot.thread.historyMode === "legacy") {
      // This is an invariant violation rather than a compatibility path: legacy pages already
      // contain full items, so a browser item request means projection logic regressed.
      throw new Error("Legacy Turn items are loaded with their Turn page");
    }
    const client = await this.registry.getHostClient(host);
    const page = await client.request(
      "thread/items/list",
      {
        threadId,
        turnId: input.turnId,
        cursor: input.cursor ?? null,
        limit: input.limit ?? 100,
        sortDirection: input.sortDirection ?? "asc",
      },
      120_000,
      parseThreadItemsPage,
    );
    return {
      turnId: input.turnId,
      items: page.data.flatMap((entry) => {
        const item = asThreadTimelineItem(entry.item);
        return item === null ? [] : [item];
      }),
      nextCursor: page.nextCursor,
      backwardsCursor: page.backwardsCursor,
    };
  }

  private async fetchTurnsPage(
    host: HostRecord,
    threadId: string,
    historyMode: AppServerThread["historyMode"],
    input: ThreadTurnsListInput,
  ) {
    const client = await this.registry.getHostClient(host);
    return client.request(
      "thread/turns/list",
      {
        threadId,
        cursor: input.cursor ?? null,
        limit: input.limit ?? DEFAULT_TURN_PAGE_LIMIT,
        sortDirection: input.sortDirection ?? "desc",
        itemsView: historyMode === "paginated" ? "summary" : "full",
      },
      120_000,
      parseTurnsPage,
    );
  }

  private requireSnapshot(hostId: number, threadId: string) {
    const snapshot = threadSnapshotStore.get(hostId, threadId);
    if (snapshot === null) throw new Error("Thread snapshot is unavailable while paging history");
    return snapshot;
  }
}
