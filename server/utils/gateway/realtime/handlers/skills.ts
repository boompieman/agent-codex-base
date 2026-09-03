import type { RealtimeClientMessage } from "~~/shared/types";
import { requireRecord } from "../../http/validation/common";
import { threadBroker } from "../../runtime/broker";
import { hostStore } from "../../state/hosts";
import { projectStore } from "../../state/projects";
import { sendRealtimePeerMessage, type RealtimePeer } from "../peer-state";

export async function listSkills(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "skill.list" }>,
) {
  const host = requireRecord(hostStore.getWithSecret(request.hostId), "Host not found");
  const project = requireRecord(projectStore.get(request.projectId), "Project not found");
  if (project.hostId !== host.id) {
    throw new Error(`Project ${project.id} does not belong to host ${host.id}`);
  }
  const skills = await threadBroker.listSkills(host, project.remotePath);
  sendRealtimePeerMessage(peer, {
    type: "skill.list.results",
    requestId: request.requestId,
    hostId: host.id,
    projectId: project.id,
    skills,
  });
}
