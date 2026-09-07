import type { HostRecord, ThreadSettingsState } from "~~/shared/types";
import type { ControllerRegistry } from "./controller-registry";
import { buildAppServerCollaborationMode } from "../protocol/thread-payload";
import {
  parseTurnSettingsUpdateResponse,
  threadSettingsFromAppServer,
} from "~~/shared/runtime/app-server";
import { recordFromUnknown } from "~~/shared/utils/records";
import { threadRuntimeEvents } from "./thread-runtime-events";

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
    if ("permissions" in input) params.permissions = input.permissions;
    if (input.collaborationMode !== null && input.collaborationMode !== undefined) {
      params.collaborationMode = buildAppServerCollaborationMode(input.collaborationMode);
    }
    return this.registry.withScopedSubscription(host, threadId, (controller) =>
      controller.enqueue(async () => {
        const current = controller.getOpenSnapshot()?.threadSettings;
        if (
          input.permissions == null ||
          (current?.permissions === input.permissions &&
            (input.approvalPolicy == null || current.approvalPolicy === input.approvalPolicy))
        ) {
          return controller.client.request("thread/settings/update", params);
        }
        // The RPC acknowledges a queued update. Idle browser views release their upstream lease,
        // so keep this scoped lease until the native notification confirms the permission change.
        let resolveApplied = () => {};
        let timer: ReturnType<typeof setTimeout>;
        const applied = new Promise<void>((resolve, reject) => {
          resolveApplied = resolve;
          timer = setTimeout(
            () => reject(new Error("Timed out confirming thread permissions")),
            30_000,
          );
        });
        const unsubscribe = threadRuntimeEvents.subscribe(host.id, threadId, (event) => {
          if (event.method !== "thread/settings/updated") return;
          const settings = threadSettingsFromAppServer(
            recordFromUnknown(event.payload.params)?.threadSettings,
          );
          if (
            settings !== null &&
            settings.permissions === input.permissions &&
            (input.approvalPolicy == null || settings.approvalPolicy === input.approvalPolicy)
          )
            resolveApplied();
        });
        try {
          const [result] = await Promise.all([
            controller.client.request("thread/settings/update", params),
            applied,
          ]);
          return result;
        } finally {
          clearTimeout(timer!);
          unsubscribe();
        }
      }),
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
