import type { HostRecord, ThreadSettingsState } from "~~/shared/types";
import type { ControllerRegistry } from "./controller-registry";

export class ThreadSettingsService {
  constructor(private readonly registry: ControllerRegistry) {}

  async resolveThreadSettings(host: HostRecord, threadId: string) {
    // Acquiring a scoped lease performs the only authoritative settings read exposed by
    // app-server: `thread/resume`. The controller projects its response into the snapshot/event
    // stream; no second settings state is kept here.
    await this.registry.withScopedSubscription(host, threadId, async () => undefined);
  }

  async updateThreadSettings(host: HostRecord, threadId: string, input: ThreadSettingsState) {
    const params: Record<string, unknown> = { threadId };
    if ("model" in input) params.model = input.model;
    if ("effort" in input) params.effort = input.effort;
    if ("approvalPolicy" in input) params.approvalPolicy = input.approvalPolicy;
    return this.registry.withScopedSubscription(host, threadId, (controller) =>
      controller.enqueue(() => controller.client.request("thread/settings/update", params)),
    );
  }

  async renameThread(host: HostRecord, threadId: string, name: string) {
    const client = await this.registry.getHostClient(host);
    return client.request("thread/name/set", { threadId, name });
  }
}
