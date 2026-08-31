import type { HostRecord, LegacyTurnPageLocator } from "~~/shared/types";
import type { ControllerRegistry } from "./controller-registry";
import { pageCursorState, pageToFullHistory } from "./thread-history-pages";
import { DEFAULT_TURN_PAGE_LIMIT, type TurnsPage } from "./types";
import { parseThreadItemsPage, parseTurnsPage } from "~~/shared/runtime/app-server";
import { projectThreadTimelineHistory } from "~~/shared/thread-history/timeline";
import { asThreadTimelineItem } from "~~/shared/thread-history/timeline";
import { threadSnapshotStore } from "../state/thread-snapshots";
import { LegacyTurnItemsReader } from "./legacy-turn-items-reader";

export interface ThreadTurnsListInput {
  cursor?: string | null;
  limit?: number;
  sortDirection?: "asc" | "desc";
}

export class ThreadHistoryReader {
  constructor(
    private readonly registry: ControllerRegistry,
    private readonly legacyItems = new LegacyTurnItemsReader(),
  ) {}

  async listThreadTurns(host: HostRecord, threadId: string, input: ThreadTurnsListInput) {
    const client = await this.registry.getHostClient(host);
    const page = await client.request(
      "thread/turns/list",
      {
        threadId,
        cursor: input.cursor ?? null,
        limit: input.limit ?? DEFAULT_TURN_PAGE_LIMIT,
        sortDirection: input.sortDirection ?? "desc",
        // Summary pages keep cold history reads bounded even when one Turn contains thousands of
        // tool items. The browser requests that Turn's items only when the reader expands it.
        itemsView: "summary",
      },
      120_000,
      parseTurnsPage,
    );
    const snapshot = threadSnapshotStore.get(host.id, threadId);
    if (snapshot === null) {
      throw new Error("Thread snapshot is unavailable while paging history");
    }
    const legacyTurnPageLocators = this.recordTurnsPage(
      host.id,
      threadId,
      snapshot.thread.historyMode,
      {
        cursor: input.cursor ?? null,
        limit: input.limit ?? DEFAULT_TURN_PAGE_LIMIT,
        sortDirection: input.sortDirection ?? "desc",
      },
      page,
    );

    return {
      history: projectThreadTimelineHistory(pageToFullHistory({ id: threadId }, page)),
      turnsPage: pageCursorState(page),
      legacyTurnPageLocators,
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
      legacyPageLocator?: LegacyTurnPageLocator;
    },
  ) {
    const client = await this.registry.getHostClient(host);
    const snapshot = threadSnapshotStore.get(host.id, threadId);
    if (input.legacyPageLocator !== undefined || snapshot?.thread.historyMode === "legacy") {
      return {
        turnId: input.turnId,
        items: await this.legacyItems.read(
          client,
          host,
          threadId,
          input.turnId,
          input.legacyPageLocator ?? snapshot?.legacyTurnPageLocators[input.turnId],
        ),
        nextCursor: null,
        backwardsCursor: null,
      };
    }
    if (snapshot === null) {
      throw new Error("Thread snapshot is unavailable while loading Turn items");
    }
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

  recordTurnsPage(
    hostId: number,
    threadId: string,
    historyMode: "legacy" | "paginated",
    locator: { cursor: string | null; limit: number; sortDirection: "asc" | "desc" },
    page: TurnsPage,
  ) {
    const locators = this.legacyItems.locatorsForPage(historyMode, locator, page);
    if (Object.keys(locators).length === 0) return locators;
    threadSnapshotStore.update(hostId, threadId, (snapshot) =>
      snapshot === null
        ? null
        : {
            ...snapshot,
            legacyTurnPageLocators: {
              ...snapshot.legacyTurnPageLocators,
              ...locators,
            },
          },
    );
    return locators;
  }

  locatorsForPage(
    historyMode: "legacy" | "paginated",
    locator: { cursor: string | null; limit: number; sortDirection: "asc" | "desc" },
    page: TurnsPage,
  ) {
    return this.legacyItems.locatorsForPage(historyMode, locator, page);
  }
}
