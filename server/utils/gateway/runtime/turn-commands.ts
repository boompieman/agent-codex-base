import type { HostRecord } from "~~/shared/types";
import { INITIAL_TURN_PAGE_LIMIT } from "~~/shared/config";
import { randomUUID } from "node:crypto";
import type { ServerRequestResponseInput, TurnStartInput, TurnSteerInput } from "./types";
import type { ControllerRegistry } from "./controller-registry";
import { buildTurnStartParams, buildUserInput } from "../protocol/thread-payload";
import { runtimeLog } from "./runtime-log";
import type { ThreadOpenService } from "./thread-open-service";
import { recordFromUnknown, stringFromUnknown } from "~~/shared/utils/records";
import { trimmedOrFallback } from "~~/shared/utils/strings";
import { parseTurnStartResponse, parseTurnSteerResponse } from "~~/shared/runtime/app-server";

export class ThreadTurnCommandService {
  constructor(
    private readonly registry: ControllerRegistry,
    private readonly openService: ThreadOpenService,
  ) {}

  async startTurn(host: HostRecord, threadId: string, input: TurnStartInput) {
    const controller = await this.registry.getController(host, threadId);
    await controller.ensureSubscribed();
    await controller.ensureConnected();
    const clientUserMessageId = trimmedOrFallback(
      input.clientUserMessageId,
      `gateway-${randomUUID()}`,
    );
    return controller.enqueue(() =>
      controller.client.request(
        "turn/start",
        buildTurnStartParams(threadId, clientUserMessageId, input),
        120_000,
        parseTurnStartResponse,
      ),
    );
  }

  async steerTurn(host: HostRecord, threadId: string, input: TurnSteerInput) {
    const controller = await this.registry.getController(host, threadId);
    await controller.ensureSubscribed();
    await controller.ensureConnected();
    const clientUserMessageId = trimmedOrFallback(
      input.clientUserMessageId,
      `gateway-steer-${randomUUID()}`,
    );
    return controller
      .enqueue(() =>
        controller.client.request(
          "turn/steer",
          {
            threadId,
            expectedTurnId: input.expectedTurnId,
            clientUserMessageId,
            input: buildUserInput(input),
          },
          120_000,
          parseTurnSteerResponse,
        ),
      )
      .catch(async (error) => {
        if (isNoActiveTurnToSteer(error)) {
          runtimeLog("refreshing thread after stale steer state", {
            hostId: host.id,
            threadId,
            expectedTurnId: input.expectedTurnId,
          });
          await this.openService.refreshThreadState(host, threadId, null, INITIAL_TURN_PAGE_LIMIT);
        }
        throw error;
      });
  }

  async interruptTurn(host: HostRecord, threadId: string, turnId: string) {
    const controller = await this.registry.getController(host, threadId);
    await controller.ensureSubscribed();
    await controller.ensureConnected();
    return controller.enqueue(() =>
      controller.client.request("turn/interrupt", {
        threadId,
        turnId,
      }),
    );
  }

  async respondToServerRequest(
    host: HostRecord,
    threadId: string,
    input: ServerRequestResponseInput,
  ) {
    const controller = await this.registry.getController(host, threadId);
    await controller.ensureConnected();
    if (input.error) {
      controller.client.respondError(
        input.requestId,
        input.error.code,
        input.error.message,
        input.error.data,
      );
    } else {
      controller.client.respond(input.requestId, input.result ?? {});
    }
  }
}

function isNoActiveTurnToSteer(error: unknown) {
  const record = recordFromUnknown(error);
  const message = stringFromUnknown(record?.message);
  return (
    record?.rpcMethod === "turn/steer" &&
    message !== null &&
    message.toLowerCase().includes("no active turn")
  );
}
