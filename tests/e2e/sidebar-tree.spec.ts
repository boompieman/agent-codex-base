import { expect, test } from "@playwright/test";
import { openApp } from "./helpers/app";
import { installRealtimeThreadSnapshotMock, seedGatewayThread } from "./helpers/gateway-store";
import { defaultGatewayHost, defaultGatewayProject } from "./fixtures/thread-history";

test("collapses the desktop sidebar and restores the saved layout", async ({ page }) => {
  await openApp(page);

  const sidebarGap = page.locator('[data-slot="sidebar-gap"]');
  await expect(page.locator('[data-slot="sidebar"][data-state="expanded"]')).toBeVisible();
  await page.getByTestId("desktop-sidebar-collapse").click();
  await expect.poll(() => sidebarGap.evaluate((element) => element.clientWidth)).toBe(0);
  await expect(page.getByTestId("desktop-sidebar-expand")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("desktop-sidebar-expand")).toBeVisible();
  await expect.poll(() => sidebarGap.evaluate((element) => element.clientWidth)).toBe(0);

  await page.getByTestId("desktop-sidebar-expand").click();
  await expect.poll(() => sidebarGap.evaluate((element) => element.clientWidth)).toBeGreaterThan(0);
  await expect(page.getByTestId("desktop-sidebar-collapse")).toBeVisible();
});

test("opens the workspace summary beside Agent", async ({ page }) => {
  await openApp(page);
  await seedGatewayThread(page, {
    hostId: 100,
    projectId: 200,
    threadId: "native-shell-thread",
    host: { ...defaultGatewayHost(100), name: "Native Shell Host" },
    project: {
      ...defaultGatewayProject(100, 200),
      name: "Native Shell Project",
      remotePath: "/workspace/native-shell",
    },
    currentThread: { id: "native-shell-thread", name: "Native Shell Thread" },
    status: "completed",
  });

  await expect(page.getByTestId("desktop-workspace-header")).toContainText("Native Shell Thread");
  await page.getByTestId("open-summary-button").click();
  await expect(page.getByTestId("workspace-file-panel")).toBeVisible();

  await expect
    .poll(async () => {
      const agent = await page.getByTestId("chat-main-pane").boundingBox();
      const summary = await page.getByTestId("workspace-file-panel").boundingBox();
      return agent !== null && summary !== null && summary.x >= agent.x + agent.width;
    })
    .toBe(true);
});

test("toggles an expanded project closed from the desktop sidebar", async ({ page }) => {
  await openApp(page);
  await seedGatewayThread(page, {
    hostId: 101,
    projectId: null,
    host: { ...defaultGatewayHost(101), name: "Toggle Host" },
    project: {
      ...defaultGatewayProject(101, 201),
      name: "Toggle Project",
      remotePath: "/workspace/toggle",
    },
    threads: [
      {
        id: "toggle-thread",
        title: "Toggle Thread",
        pinned: false,
        updatedAt: Date.now(),
      },
    ],
  });
  await page.evaluate(() => {
    const driver = window.__codexGatewayE2e;
    if (!driver) throw new Error("Gateway E2E driver is unavailable");
    driver.catalog.selectProject = async (projectId: number) => {
      const { navigation } = driver;
      navigation.selectedProjectId = projectId;
      navigation.selectedThreadId = null;
    };
  });

  await expect(page.getByTestId("desktop-layout")).toBeVisible();
  await page.getByTestId("connections-toggle").click();
  await expect(page.getByTestId("project-button-201")).toBeVisible();
  await page.getByTestId("project-button-201").click();
  await expect(page.getByTestId("thread-button-toggle-thread")).toBeVisible();

  await page.getByTestId("project-button-201").click();
  await expect(page.getByTestId("thread-button-toggle-thread")).toBeHidden();
});

test("keeps pinned worktree threads in their project and exposes row actions", async ({ page }) => {
  await openApp(page);
  const hostId = 105;
  const projectId = 205;
  const threadId = "pinned-worktree-thread";
  await seedGatewayThread(page, {
    hostId,
    projectId,
    threadId: null,
    host: { ...defaultGatewayHost(hostId), name: "Worktree Host" },
    project: {
      ...defaultGatewayProject(hostId, projectId),
      name: "Worktree Project",
      remotePath: "/workspace/project",
    },
    threads: [
      {
        id: threadId,
        name: "Pinned worktree task",
        cwd: "/workspace/worktrees/task-org",
        gitInfo: { sha: "abc123", branch: "feat/task-org", originUrl: null },
        pinned: true,
      },
    ],
  });
  await page.evaluate(
    ({ hostId, projectId, threadId }) => {
      const driver = window.__codexGatewayE2e;
      if (!driver) throw new Error("Gateway E2E driver is unavailable");
      driver.config.gatewayConfig.pinnedThreads = [
        { hostId, projectId, threadId, title: "Pinned worktree task" },
      ];
      driver.activity.ingestGatewayThreads(driver.navigation.threads, driver.catalog.projects);
    },
    { hostId, projectId, threadId },
  );

  const projectThread = page.getByTestId(`thread-button-${threadId}`);
  const pinnedThread = page.getByTestId(`pinned-thread-button-${threadId}`);
  await page.getByTestId("connections-toggle").click();
  await expect(projectThread).toBeVisible();
  await expect(pinnedThread).toBeVisible();
  await expect(projectThread).toContainText("feat/task-org");
  await expect(pinnedThread).not.toContainText("feat/task-org");
  await expect(projectThread.getByLabel("工作树")).toBeVisible();

  await page.getByTestId(`thread-actions-thread-button-${threadId}`).click();
  await expect(page.getByRole("menuitem", { name: "取消置顶" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "重命名会话" })).toBeVisible();
});

test("marks completed threads as needing review until they are opened", async ({ page }) => {
  await openApp(page);
  await seedGatewayThread(page, {
    hostId: 102,
    projectId: 202,
    threadId: "selected-thread",
    host: { ...defaultGatewayHost(102), name: "Review Host" },
    project: {
      ...defaultGatewayProject(102, 202),
      name: "Review Project",
      remotePath: "/workspace/review",
    },
    currentThread: { id: "selected-thread", name: "Selected Thread" },
    threads: [
      {
        id: "review-thread",
        name: "Review Thread",
        pinned: false,
        updatedAt: Math.floor(Date.now() / 1000),
      },
      {
        id: "selected-thread",
        name: "Selected Thread",
        pinned: false,
        updatedAt: Math.floor(Date.now() / 1000),
      },
    ],
    status: "completed",
  });
  await installRealtimeThreadSnapshotMock(page, {
    hostId: 102,
    snapshots: {
      "review-thread": {
        thread: { id: "review-thread", name: "Review Thread" },
        history: { thread: { id: "review-thread", turns: [] } },
        projectId: 202,
        runtimeStatus: "completed",
      },
    },
  });
  await page.evaluate(() => {
    const runtime = window.__codexGatewayE2e?.runtime;
    if (!runtime) throw new Error("Gateway E2E driver is unavailable");
    runtime.setThreadStatus(102, "review-thread", "running");
    runtime.setThreadStatus(102, "review-thread", "completed");
  });

  await page.getByTestId("connections-toggle").click();
  await expect(page.getByTestId("thread-button-review-thread")).toBeVisible();
  await expect(
    page.getByTestId("thread-button-review-thread").getByLabel("已完成，待查看", { exact: true }),
  ).toBeVisible();

  await page.getByTestId("thread-button-review-thread").click();
  await expect(
    page.getByTestId("thread-button-review-thread").getByLabel("已完成", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId("thread-button-review-thread").getByLabel("已完成，待查看", { exact: true }),
  ).toBeHidden();
});

test("shows native running, approval, input, and completed thread states", async ({ page }) => {
  await openApp(page);
  await seedGatewayThread(page, {
    hostId: 103,
    projectId: 203,
    threadId: null,
    host: { ...defaultGatewayHost(103), name: "State Host" },
    project: {
      ...defaultGatewayProject(103, 203),
      name: "State Project",
      remotePath: "/workspace/states",
    },
    threads: [
      { id: "running-thread", name: "Running Thread", pinned: false, updatedAt: 4 },
      { id: "approval-thread", name: "Approval Thread", pinned: false, updatedAt: 3 },
      { id: "input-thread", name: "Input Thread", pinned: false, updatedAt: 2 },
      { id: "completed-thread", name: "Completed Thread", pinned: false, updatedAt: 1 },
    ],
  });
  await page.evaluate(() => {
    const runtime = window.__codexGatewayE2e?.runtime;
    if (!runtime) throw new Error("Gateway E2E driver is unavailable");
    runtime.setThreadStatus(103, "running-thread", "running");
    runtime.setThreadStatus(103, "approval-thread", "running", {
      activeFlags: ["waitingOnApproval"],
    });
    runtime.setThreadStatus(103, "input-thread", "running", {
      activeFlags: ["waitingOnUserInput"],
    });
    runtime.setThreadStatus(103, "completed-thread", "completed");
  });

  await page.getByTestId("connections-toggle").click();
  await expect(page.getByTestId("thread-button-running-thread")).toContainText("运行中");
  await expect(page.getByTestId("thread-button-approval-thread")).toContainText("等待审批");
  await expect(page.getByTestId("thread-button-input-thread")).toContainText("需要输入");
  await expect(page.getByTestId("thread-button-completed-thread")).toContainText("已完成");
});

test("keeps non-pinned main threads in recent activity for the page session", async ({ page }) => {
  await openApp(page);
  const host = {
    ...defaultGatewayHost(104),
    name: "Activity Host",
    sshHost: "activity.example.internal",
  };
  const project = {
    ...defaultGatewayProject(104, 204),
    name: "Activity Project",
    remotePath: "/workspace/activity",
  };
  await page.evaluate(
    ({ host, project }) => {
      const driver = window.__codexGatewayE2e;
      if (!driver) throw new Error("Gateway E2E driver is unavailable");
      const { activity, catalog, config, runtime } = driver;
      catalog.hosts = [host];
      catalog.projects = [project];
      config.gatewayConfig.pinnedThreads = [
        {
          hostId: host.id,
          projectId: project.id,
          threadId: "already-pinned",
          title: "Already pinned",
        },
      ];
      activity.ingestMetadata(
        host.id,
        [
          {
            id: "recent-main",
            title: "Recent main thread",
            projectId: project.id,
            cwd: project.remotePath,
            parentThreadId: null,
            agentNickname: null,
            agentRole: null,
            name: null,
            preview: null,
            recencyAt: null,
            updatedAt: 3,
          },
          {
            id: "already-pinned",
            title: "Already pinned",
            projectId: project.id,
            cwd: null,
            parentThreadId: null,
            agentNickname: null,
            agentRole: null,
            name: null,
            preview: null,
            recencyAt: null,
            updatedAt: 2,
          },
          {
            id: "spawned-child",
            title: "Spawned child",
            projectId: project.id,
            parentThreadId: "recent-main",
            cwd: null,
            agentNickname: null,
            agentRole: null,
            name: null,
            preview: null,
            recencyAt: null,
            updatedAt: 1,
          },
          {
            id: "managed-child-before-parent-hydration",
            title: "Inherited parent title",
            projectId: project.id,
            agentRole: "explorer",
            agentNickname: "Scout",
            cwd: null,
            parentThreadId: null,
            name: null,
            preview: null,
            recencyAt: null,
            updatedAt: 4,
          },
        ],
        [project],
      );
      runtime.setThreadStatus(host.id, "recent-main", "running");
      runtime.setThreadStatus(host.id, "already-pinned", "running");
      runtime.setThreadStatus(host.id, "spawned-child", "running");
      runtime.setThreadStatus(host.id, "managed-child-before-parent-hydration", "running");
      runtime.setThreadStatus(host.id, "recent-main", "completed");
    },
    { host, project },
  );

  await expect(page.getByText("最近任務", { exact: true })).toBeVisible();
  await expect(page.getByTestId("recent-thread-button-recent-main")).toBeVisible();
  await expect(page.getByTestId("recent-thread-button-already-pinned")).toBeHidden();
  await expect(page.getByTestId("recent-thread-button-spawned-child")).toBeHidden();
  await expect(
    page.getByTestId("recent-thread-button-managed-child-before-parent-hydration"),
  ).toBeHidden();

  const sectionOrder = await page.getByTestId("sidebar-scroll-area").evaluate((root) => {
    const text = root.textContent ?? "";
    return [text.indexOf("已固定"), text.indexOf("最近任務"), text.indexOf("連線設定")];
  });
  expect(sectionOrder[0]).toBeLessThan(sectionOrder[1]!);
  expect(sectionOrder[1]).toBeLessThan(sectionOrder[2]!);
});

test("sorts pinned threads for display without rewriting persisted pin order", async ({ page }) => {
  await openApp(page);
  const hosts = [
    { ...defaultGatewayHost(302), name: "Zulu Host" },
    { ...defaultGatewayHost(301), name: "Alpha Host" },
  ];
  const pinnedThreads = [
    { hostId: 302, projectId: null, threadId: "z-alpha", title: "Alpha Thread" },
    { hostId: 301, projectId: null, threadId: "a-zulu", title: "Zulu Thread" },
    { hostId: 301, projectId: null, threadId: "a-alpha-b", title: "Alpha Thread" },
    { hostId: 301, projectId: null, threadId: "a-alpha-a", title: "Alpha Thread" },
  ];
  await page.evaluate(
    ({ hosts, pinnedThreads }) => {
      const driver = window.__codexGatewayE2e;
      if (!driver) throw new Error("Gateway E2E driver is unavailable");
      driver.catalog.hosts = hosts;
      driver.config.gatewayConfig.pinnedThreads = pinnedThreads;
    },
    { hosts, pinnedThreads },
  );

  const renderedThreadIds = await page
    .locator('[data-testid^="pinned-thread-button-"]')
    .evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-testid")?.replace("pinned-thread-button-", "")),
    );
  expect(renderedThreadIds).toEqual(["a-alpha-a", "a-alpha-b", "a-zulu", "z-alpha"]);

  const storedThreadIds = await page.evaluate(() => {
    const driver = window.__codexGatewayE2e;
    if (!driver) throw new Error("Gateway E2E driver is unavailable");
    return driver.config.gatewayConfig.pinnedThreads.map((thread) => thread.threadId);
  });
  expect(storedThreadIds).toEqual(pinnedThreads.map((thread) => thread.threadId));
});

test("long expanded tree labels truncate without displacing trailing statuses", async ({
  page,
}) => {
  await openApp(page);
  const hostId = 103;
  const projectId = 203;
  const threadId = "long-sidebar-thread";
  const longTitle = `Long thread ${"unbroken-segment-".repeat(18)}`;
  await seedGatewayThread(page, {
    hostId,
    projectId,
    threadId: null,
    host: {
      ...defaultGatewayHost(hostId),
      name: `Long host ${"host-segment-".repeat(12)}`,
      sshHost: "very-long-hostname.example.internal",
    },
    project: {
      ...defaultGatewayProject(hostId, projectId),
      name: `Long project ${"project-segment-".repeat(12)}`,
      remotePath: "/workspace/sidebar-layout",
    },
    threads: [{ id: threadId, name: longTitle, pinned: false, updatedAt: 1 }],
  });
  await installRealtimeThreadSnapshotMock(page, {
    hostId,
    snapshots: {
      [threadId]: {
        thread: { id: threadId, name: longTitle },
        history: { thread: { id: threadId, turns: [] } },
        projectId,
        runtimeStatus: "running",
      },
    },
  });
  await page.evaluate(
    ({ hostId, threadId }) => {
      const driver = window.__codexGatewayE2e;
      if (!driver) throw new Error("Gateway E2E driver is unavailable");
      const { catalog, runtime } = driver;
      catalog.hostConnectionStatuses = { [hostId]: { status: "connected" } };
      runtime.setThreadStatus(hostId, threadId, "running");
    },
    { hostId, threadId },
  );

  await page.getByTestId("connections-toggle").click();
  await expect(page.getByTestId(`thread-button-${threadId}`)).toBeVisible();
  await page.getByTestId(`thread-button-${threadId}`).click();
  await expect(page.getByTestId(`thread-button-${threadId}`)).toHaveAttribute(
    "data-selected",
    "true",
  );
  await expect(page.getByTestId(`host-button-${hostId}`).getByLabel("已连接")).toBeVisible();
  await expect(page.getByTestId(`thread-button-${threadId}`).getByLabel("运行中")).toBeVisible();

  const metrics = await page.getByTestId("sidebar-scroll-area").evaluate(
    (root, { hostId, threadId, longTitle }) => {
      const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
      const threadButton = root.querySelector<HTMLElement>(
        `[data-testid="thread-button-${CSS.escape(threadId)}"]`,
      );
      const title = threadButton?.querySelector<HTMLElement>(`[title="${CSS.escape(longTitle)}"]`);
      const hostStatus = root.querySelector<HTMLElement>(
        `[data-testid="host-button-${hostId}"] [aria-label="已连接"]`,
      );
      const threadStatus = threadButton?.querySelector<HTMLElement>('[aria-label="运行中"]');
      const statuses = [hostStatus, threadStatus];
      if (!viewport || !title || statuses.some((status) => !status)) {
        throw new Error("Missing sidebar layout nodes");
      }
      const viewportRect = viewport.getBoundingClientRect();
      return {
        overflow: viewport.scrollWidth - viewport.clientWidth,
        titleClipped: title.scrollWidth > title.clientWidth,
        titleOverflow: getComputedStyle(title).textOverflow,
        statusesInside: statuses.every((status) => {
          if (!status) return false;
          const rect = status.getBoundingClientRect();
          return rect.left >= viewportRect.left && rect.right <= viewportRect.right;
        }),
      };
    },
    { hostId, threadId, longTitle },
  );
  expect(metrics).toEqual({
    overflow: 0,
    titleClipped: true,
    titleOverflow: "ellipsis",
    statusesInside: true,
  });
});
