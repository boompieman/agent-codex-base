import { expect, test } from "@playwright/test";
import { openApp } from "./helpers/app";
import { seedGatewayThread } from "./helpers/gateway-store";
import { defaultGatewayHost, defaultGatewayProject } from "./fixtures/thread-history";

test("restores the draft and removes the optimistic message when sending fails", async ({
  page,
}) => {
  await openApp(page);
  await seedGatewayThread(page, {
    hostId: 106,
    projectId: 206,
    threadId: "draft-recovery-thread",
    host: defaultGatewayHost(106),
    project: defaultGatewayProject(106, 206),
    currentThread: { id: "draft-recovery-thread", name: "Draft Recovery Thread" },
    status: "completed",
  });
  await page.evaluate(() => {
    const realtime = window.__codexGatewayE2e?.realtime;
    if (!realtime) throw new Error("Gateway E2E driver is unavailable");
    Object.assign(realtime, {
      request: async () => {
        throw new Error("forced send failure");
      },
    });
  });

  const draft = "送出失败后保留这份草稿";
  const composer = page.getByTestId("composer-input");
  await composer.fill(draft);
  await page.getByTestId("send-turn-button").click();

  await expect(composer).toHaveAttribute("data-value", draft);
  await expect(page.getByTestId("chat-scroll-area").getByText(draft, { exact: true })).toHaveCount(
    0,
  );
});
