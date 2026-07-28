import { getValidatedQuery } from "h3";
import { threadBroker } from "../../utils/gateway/runtime/broker";
import {
  defineGatewayEventHandler,
  hostLogContext,
  setGatewayRequestLogContext,
} from "../../utils/gateway/http/errors";
import { requireRecord } from "../../utils/gateway/http/validation/common";
import { threadListSchema } from "../../utils/gateway/http/validation/threads";
import { hostStore } from "../../utils/gateway/state/hosts";
import { projectStore } from "../../utils/gateway/state/projects";
import { threadMetadataStore } from "../../utils/gateway/state/thread-metadata";
import { remoteFiles } from "../../utils/gateway/infra/host-services";
import { withAllThreadSources } from "../../utils/gateway/protocol/thread-list";
import { threadProjectDiscovery } from "../../utils/gateway/runtime/thread-project-discovery";
import type { AppServerThread } from "~~/shared/types";
import type { HostWithSecret } from "../../utils/gateway/infra/ssh-types";
import { appServerThreadFromUnknown } from "~~/shared/runtime/app-server";
import { trimmedOrNull } from "~~/shared/utils/strings";

export default defineGatewayEventHandler(async (event) => {
  const query = await getValidatedQuery(event, (body) => threadListSchema.parse(body));
  const host = requireRecord(hostStore.getWithSecret(query.hostId), "Host not found");
  setGatewayRequestLogContext(event, "threads/list", {
    ...hostLogContext(host),
    projectId: query.projectId ?? null,
    cwd: query.cwd ?? null,
    limit: query.limit,
    cursor: query.cursor ?? null,
    searchTerm: query.searchTerm ?? null,
    useRemoteStateIndexOnly: query.useRemoteStateIndexOnly ?? false,
  });

  const listParams = withAllThreadSources({
    limit: query.limit,
    cursor: trimmedOrNull(query.cursor),
    cwd: trimmedOrNull(query.cwd) ?? undefined,
    searchTerm: trimmedOrNull(query.searchTerm) ?? undefined,
    useStateDbOnly: query.useRemoteStateIndexOnly ?? false,
  });
  const page = await threadBroker.listThreads(host, listParams);
  const threads = page.data
    .map(appServerThreadFromUnknown)
    .filter((thread): thread is AppServerThread => thread !== null);
  threadProjectDiscovery.indexPage(host.id, page);

  const userId = event.context.auth?.user.id;
  if (userId !== undefined && shouldDiscoverHostProjects(query)) {
    threadProjectDiscovery.schedule(userId, host, page, listParams);
  }
  const mergedThreads = mergeThreads(
    threads,
    threadMetadataStore.list(host.id, {
      projectId: query.projectId ?? null,
      cwd: query.cwd ?? null,
    }),
    query.searchTerm ?? null,
  );
  const projects = projectStore.list(host.id);
  const projectDirectoryAvailability = await inspectProjectAvailability(host, projects);
  return {
    ...page,
    data: mergedThreads,
    projects,
    projectDirectoryAvailability,
  };
});

async function inspectProjectAvailability(
  host: HostWithSecret,
  projects: Array<{ id: number; remotePath: string }>,
) {
  try {
    const byPath = await remoteFiles.inspectProjectDirectories(
      host,
      projects.map((project) => project.remotePath),
    );
    return Object.fromEntries(
      projects.flatMap((project) => {
        const availability = byPath.get(project.remotePath.trim());
        return availability === undefined ? [] : [[project.id, availability]];
      }),
    );
  } catch (error) {
    // Availability is advisory; an SFTP outage must not hide projects or fail thread listing.
    console.warn("[gateway] project directory inspection failed", {
      hostId: host.id,
      hostName: host.name,
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

function shouldDiscoverHostProjects(query: {
  projectId?: number | null;
  cwd?: string | null;
  searchTerm?: string | null;
  cursor?: string | null;
}) {
  return (
    (query.projectId === null || query.projectId === undefined) &&
    trimmedOrNull(query.cwd) === null &&
    trimmedOrNull(query.searchTerm) === null &&
    trimmedOrNull(query.cursor) === null
  );
}

function mergeThreads(
  remoteThreads: AppServerThread[],
  indexedThreads: AppServerThread[],
  searchTerm: string | null,
) {
  const byId = new Map<string, AppServerThread>();
  for (const thread of indexedThreads) {
    byId.set(String(thread.id), thread);
  }
  for (const thread of remoteThreads) {
    const id = String(thread.id);
    byId.set(id, {
      ...byId.get(id),
      ...thread,
    });
  }

  const normalizedSearch = searchTerm?.trim().toLowerCase() ?? "";
  return Array.from(byId.values())
    .filter((thread) => {
      if (!normalizedSearch) {
        return true;
      }
      return [thread.id, thread.title, thread.name, thread.preview, thread.cwd]
        .filter((value): value is string => typeof value === "string")
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
    })
    .sort(
      (left, right) =>
        Number(right.recencyAt ?? right.updatedAt ?? 0) -
        Number(left.recencyAt ?? left.updatedAt ?? 0),
    );
}
