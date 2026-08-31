import type { HostRecord, LegacyTurnPageLocator, ThreadHistoryItem } from "~~/shared/types";
import { parseTurnsPage } from "~~/shared/runtime/app-server";
import { asThreadTimelineTurn } from "~~/shared/thread-history/timeline";
import type { CodexRpcClient } from "../infra/rpc/rpc";
import { currentGatewayUserId } from "../state/memory";
import type { TurnsPage } from "./types";

const pendingReads = new Map<string, Promise<ThreadHistoryItem[]>>();

export class LegacyTurnItemsReader {
  locatorsForPage(
    historyMode: "legacy" | "paginated",
    locator: LegacyTurnPageLocator,
    page: TurnsPage,
  ) {
    if (historyMode !== "legacy") return {};
    const locators: Record<string, LegacyTurnPageLocator> = {};
    for (const turn of page.data ?? []) {
      if (typeof turn.id === "string") {
        locators[turn.id] = locator;
      }
    }
    return locators;
  }

  async read(
    client: CodexRpcClient,
    host: HostRecord,
    threadId: string,
    turnId: string,
    locator: LegacyTurnPageLocator | undefined,
  ) {
    const key = turnKey(host.id, threadId, turnId);
    const pending = pendingReads.get(key);
    if (pending !== undefined) return pending;

    const promise = this.readLocatedPage(client, threadId, turnId, locator);
    pendingReads.set(key, promise);
    try {
      return await promise;
    } finally {
      if (pendingReads.get(key) === promise) pendingReads.delete(key);
    }
  }

  private async readLocatedPage(
    client: CodexRpcClient,
    threadId: string,
    turnId: string,
    locator: LegacyTurnPageLocator | undefined,
  ) {
    if (locator === undefined) {
      throw new Error(
        "Legacy Turn items require a current thread page; reopen the thread and retry",
      );
    }

    // Legacy rollouts expose bounded Turn pages but do not implement thread/items/list. Reuse the
    // exact opaque page cursor stored with the snapshot that produced this summary row. Do not
    // parse or synthesize the cursor: rollback and compaction can change its anchor semantics, and
    // app-server remains the only owner of that protocol detail.
    const page = await client.request(
      "thread/turns/list",
      {
        threadId,
        cursor: locator.cursor,
        limit: locator.limit,
        sortDirection: locator.sortDirection,
        itemsView: "full",
      },
      120_000,
      parseTurnsPage,
    );
    const turn = page.data.find((candidate) => candidate.id === turnId);
    if (turn === undefined) {
      throw new Error("Legacy Turn is no longer present in its source page; reopen the thread");
    }
    return asThreadTimelineTurn(turn)?.items ?? [];
  }
}

function turnKey(hostId: number, threadId: string, turnId: string) {
  const userId = currentGatewayUserId();
  if (userId === null) throw new Error("Legacy Turn paging requires an authenticated user scope");
  return `${userId}:${hostId}:${threadId}:${turnId}`;
}
