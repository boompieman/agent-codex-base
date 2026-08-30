import { LRUCache } from "lru-cache";

const MAX_CACHED_IMAGE_COUNT = 40;
const MAX_CACHED_IMAGE_BYTES = 32 * 1024 * 1024;
const MAX_CACHED_IMAGE_ENTRY_BYTES = 12 * 1024 * 1024;
const CACHED_IMAGE_TTL_MS = 10 * 60 * 1000;

interface AuthorizedImageCacheEntry {
  blob: Blob;
}

interface AuthorizedImageFetchContext {
  source: string;
  token: string;
}

let activeSessionEpoch: number | undefined;

const authorizedImageCache = new LRUCache<
  string,
  AuthorizedImageCacheEntry,
  AuthorizedImageFetchContext
>({
  max: MAX_CACHED_IMAGE_COUNT,
  maxSize: MAX_CACHED_IMAGE_BYTES,
  maxEntrySize: MAX_CACHED_IMAGE_ENTRY_BYTES,
  sizeCalculation: ({ blob }) => Math.max(blob.size, 1),
  ttl: CACHED_IMAGE_TTL_MS,
  ttlAutopurge: true,
  updateAgeOnGet: true,
  fetchMethod: async (_key, _staleValue, { context, signal }) => {
    const response = await fetch(context.source, {
      headers: context.token === "" ? {} : { authorization: `Bearer ${context.token}` },
      signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) {
      throw new Error("Response is not an image");
    }
    return { blob };
  },
});

export async function loadAuthorizedImage(input: {
  source: string;
  token: string;
  sessionEpoch: number;
}) {
  synchronizeImageCacheSession(input.sessionEpoch);
  // The auth epoch is part of the key as a second isolation boundary. Clearing handles memory;
  // keying prevents an in-flight result from an old account being reused after a session switch.
  const key = `${input.sessionEpoch}:${input.source}`;
  const entry = await authorizedImageCache.forceFetch(key, {
    context: { source: input.source, token: input.token },
  });
  return entry.blob;
}

function synchronizeImageCacheSession(sessionEpoch: number) {
  if (activeSessionEpoch === sessionEpoch) {
    return;
  }
  // Images are private remote files. A login/logout or cross-tab account change must evict both
  // settled entries and lru-cache's coalesced in-flight requests before the new session can read.
  authorizedImageCache.clear();
  activeSessionEpoch = sessionEpoch;
}
