import type { HostRecord } from "~~/shared/types";
import type { ControllerRegistry } from "./controller-registry";
import { pageCursorState, pageToFullHistory } from "./thread-history-pages";
import { DEFAULT_TURN_PAGE_LIMIT } from "./types";
import { parseThreadItemsPage, parseTurnsPage } from "~~/shared/runtime/app-server";
import { projectThreadTimelineHistory } from "~~/shared/thread-history/timeline";
import { asThreadTimelineItem } from "~~/shared/thread-history/timeline";

export interface ThreadTurnsListInput {
  cursor?: string | null;
  limit?: number;
  sortDirection?: "asc" | "desc";
}

export class ThreadHistoryReader {
  constructor(private readonly registry: ControllerRegistry) {}

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
}
