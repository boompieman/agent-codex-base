import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/remote-workspace";
import { authenticatedFetch, openApp, reloadApp } from "./helpers/app";
import { sendRealtimeRequest } from "./helpers/realtime";
import { execRemoteSsh } from "./helpers/remote-codex";
import { codexRemoteBootstrapPayload } from "../../server/utils/gateway/infra/ssh/remote-command";
import { shellQuote } from "../../server/utils/gateway/infra/ssh/shell";

test("full access applies native permissions, permits network commands, and synchronizes clients", async ({
  page,
  browser,
  remoteWorkspace,
}) => {
  await openApp(page);
  const { host, project } = await remoteWorkspace.provision();
  const { stdout: nodePath } = await execRemoteSsh(
    remoteWorkspace.remote,
    codexRemoteBootstrapPayload("command -v node", { requireCodex: false }),
  );
  expect(nodePath.trim()).toMatch(/^\//);
  const threadId = await remoteWorkspace.startThread(project.id);
  await openOptions(page);

  // Reproduce the production mismatch: never ask, but keep the network-restricted profile.
  await authenticatedFetch(
    page,
    {
      url: "/api/threads/settings",
      method: "POST",
      body: { hostId: host.id, threadId, approvalPolicy: "never", permissions: ":read-only" },
    },
    () => undefined,
  );
  await expect
    .poll(() => readPermissions(page))
    .toEqual({
      approvalPolicy: "never",
      permissions: ":read-only",
    });
  await expect(page.getByTestId("permission-mode-trigger")).toContainText("自定义");

  await selectMode(page, "never");
  await expect
    .poll(() => readPermissions(page))
    .toEqual({
      approvalPolicy: "never",
      permissions: ":danger-full-access",
    });
  await expect(page.getByTestId("permission-mode-trigger")).toContainText("完全访问");
  await page
    .getByPlaceholder("輸入你想完成的事")
    .fill(
      "Execute exactly this shell command once, then report its output: " +
        `${shellQuote(nodePath.trim())} -e "const r=require('node:https').get('https://example.com',r=>{console.log('PERMISSION_NETWORK_'+r.statusCode);r.resume()});r.setTimeout(20000,()=>r.destroy());r.on('error',e=>{console.error(e.message);process.exit(1)})"`,
    );
  await page.getByTestId("send-turn-button").click();
  // Inspect actual tool output, not the prompt or the model's claim that it ran the command.
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.__codexGatewayE2e?.views.history?.thread.turns
            .flatMap((turn) => turn.items ?? [])
            .some(
              (item) =>
                item.type === "commandExecution" &&
                item.exitCode === 0 &&
                String(item.aggregatedOutput).includes("PERMISSION_NETWORK_200"),
            ),
        ),
      { timeout: 120_000 },
    )
    .toBe(true);
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "已完成", {
    timeout: 120_000,
  });
  await reloadApp(page);
  await openOptions(page);
  await expect(page.getByTestId("permission-mode-trigger")).toContainText("完全访问");

  const secondContext = await browser.newContext({
    storageState: await page.context().storageState(),
  });
  try {
    const secondPage = await secondContext.newPage();
    await openApp(secondPage, { resetConfig: false });
    await openOptions(secondPage);
    await expect(secondPage.getByTestId("permission-mode-trigger")).toContainText("完全访问");
    await selectMode(page, "on-request");
    await expect
      .poll(() => readPermissions(secondPage))
      .toEqual({
        approvalPolicy: "on-request",
        permissions: ":workspace",
      });
    await expect(secondPage.getByTestId("permission-mode-trigger")).toContainText("工作区访问");
    await selectMode(page, "untrusted");
    await expect
      .poll(() => readPermissions(secondPage))
      .toEqual({
        approvalPolicy: "untrusted",
        permissions: ":read-only",
      });
  } finally {
    await secondContext.close();
  }

  const rejected = await page.evaluate(() =>
    window.__codexGatewayE2e?.composer.saveSelectedThreadSettings({
      approvalPolicy: "never",
      permissions: "e2e-nonexistent-profile",
    }),
  );
  expect(rejected).toBe(false);
  expect(await readPermissions(page)).toEqual({
    approvalPolicy: "untrusted",
    permissions: ":read-only",
  });
  await expect(page.getByTestId("permission-mode-trigger")).toContainText("请求审批");

  // Native start and turn overrides must carry the profile as well as settings updates.
  const started = await sendRealtimeRequest(page, {
    type: "thread.start",
    requestId: "permission-thread-start",
    hostId: host.id,
    projectId: project.id,
    cwd: project.remotePath,
    model: remoteWorkspace.remote.testModel,
    approvalPolicy: "never",
    permissions: ":danger-full-access",
  });
  expect(started.type).toBe("thread.started");
  if (started.type !== "thread.started") throw new Error("Expected a real thread/start response");
  expect(started.threadSettings?.permissions).toBe(":danger-full-access");
  await page.goto(`/?hostId=${host.id}&projectId=${project.id}&threadId=${started.threadId}`);
  await openOptions(page);
  await expect(page.getByTestId("permission-mode-trigger")).toContainText("完全访问");
  await sendRealtimeRequest(page, {
    type: "turn.start",
    requestId: "permission-turn-start",
    hostId: host.id,
    projectId: project.id,
    threadId: started.threadId,
    text: "Reply with READY. Do not run any tools.",
    approvalPolicy: "never",
    permissions: ":read-only",
  });
  await expect
    .poll(() => readPermissions(page))
    .toEqual({
      approvalPolicy: "never",
      permissions: ":read-only",
    });
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "已完成", {
    timeout: 120_000,
  });
  await reloadApp(page);
  await openOptions(page);
  await expect(page.getByTestId("permission-mode-trigger")).toContainText("自定义");
});

async function readPermissions(page: Page) {
  return page.evaluate(() => {
    const settings = window.__codexGatewayE2e?.composer.selectedThreadSettings;
    return { approvalPolicy: settings?.approvalPolicy, permissions: settings?.permissions };
  });
}

async function selectMode(page: Page, mode: "never" | "on-request" | "untrusted") {
  await openOptions(page);
  await page.getByTestId("permission-mode-trigger").click();
  await page.getByTestId(`permission-mode-${mode}`).click();
  await page.keyboard.press("Escape");
}

async function openOptions(page: Page) {
  const toggle = page.getByTestId("composer-options-toggle");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
}
