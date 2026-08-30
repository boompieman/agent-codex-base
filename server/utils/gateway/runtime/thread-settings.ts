import type { HostRecord, ThreadSettingsState } from "~~/shared/types";
import type { ControllerRegistry } from "./controller-registry";
import { buildAppServerCollaborationMode } from "../protocol/thread-payload";
import { parseTurnSettingsUpdateResponse } from "~~/shared/runtime/app-server";

export class ThreadSettingsService {
  constructor(private readonly registry: ControllerRegistry) {}

  async resolveThreadSettings(host: HostRecord, threadId: string) {
    // Acquiring a scoped lease invokes the controller's unified subscription/settings hydration.
    // The controller may skip thread/resume only when both the upstream subscription and the
    // materialized settings are already present.
    await this.registry.withScopedSubscription(host, threadId, async () => undefined);
  }

  async updateThreadSettings(host: HostRecord, threadId: string, input: ThreadSettingsState) {
    const params: Record<string, unknown> = { threadId };
    if ("model" in input) params.model = input.model;
    if ("effort" in input) params.effort = input.effort;
    if ("approvalPolicy" in input) params.approvalPolicy = input.approvalPolicy;
    if (input.collaborationMode !== null && input.collaborationMode !== undefined) {
      params.collaborationMode = buildAppServerCollaborationMode(input.collaborationMode);
    }
    return this.registry.withScopedSubscription(host, threadId, (controller) =>
      controller.enqueue(() => controller.client.request("thread/settings/update", params)),
    );
  }

  async updateTurnSettings(
    host: HostRecord,
    threadId: string,
    turnId: string,
    input: Pick<ThreadSettingsState, "model" | "effort">,
  ) {
    const params: Record<string, unknown> = { threadId, turnId };
    if ("model" in input) params.model = input.model;
    if ("effort" in input) params.effort = input.effort;
    return this.registry.withScopedSubscription(host, threadId, (controller) =>
      controller.enqueue(() =>
        controller.client.request(
          "turn/settings/update",
          params,
          120_000,
          parseTurnSettingsUpdateResponse,
        ),
      ),
    );
  }

  async renameThread(host: HostRecord, threadId: string, name: string) {
    const client = await this.registry.getHostClient(host);
    return client.request("thread/name/set", { threadId, name });
  }
}
