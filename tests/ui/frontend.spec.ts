import { test, expect, type Page, type BrowserContext, type Locator } from "@playwright/test";

const host = "frontend-preview.supabase.co";
const userId = "11111111-1111-4111-8111-111111111111";
const timestamp = new Date().toISOString();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
const user = { id: userId, email: "preview@example.test", aud: "authenticated", role: "authenticated", app_metadata: { provider: "email" }, user_metadata: {}, created_at: timestamp };

type TodoFixture = {
  id: string; user_id: string; text: string; priority: number; done: boolean; skipped: boolean;
  repeat_rule: string; series_id: string | null; due_date: string; occurrence_date: string | null;
  scheduled_time: string | null; position: number; created_at: string; updated_at: string;
};
type TodoPatchPlan = { wait?: Promise<void>; outcome?: "error" | "empty" | "missing" };
type ReadSection = "todos" | "materials" | "reports";
type ReadPlan = { wait?: Promise<void>; fail?: boolean };
type MaterialFixture = { id: string; user_id: string; title: string; category: string; tags: string[]; status: "todo" | "doing" | "done"; priority: number; notes: string | null; url: string | null; created_at: string; updated_at: string };

function todoFixture(id: string, text: string, overrides: Partial<TodoFixture> = {}): TodoFixture {
  return { id, user_id: userId, text, priority: 2, done: false, skipped: false, repeat_rule: "none", series_id: null, due_date: today, occurrence_date: null, scheduled_time: null, position: 4096, created_at: timestamp, updated_at: timestamp, ...overrides };
}

function gate() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  return { wait, release };
}

function previewSession(account = user) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return { access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: account.id, exp, aud: "authenticated", role: "authenticated" })}.preview`, refresh_token: "preview-only", token_type: "bearer", expires_in: 3600, expires_at: exp, user: account };
}

async function isolate(page: Page, context: BrowserContext, authenticated = true) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (authenticated) {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const session = previewSession();
    await context.addCookies([{ name: "sb-frontend-preview-auth-token", value: "base64-" + encode(session), domain: "127.0.0.1", path: "/" }]);
  }
  const todos: TodoFixture[] = [
    { id: "22222222-2222-4222-8222-222222222222", user_id: userId, text: "每天读书", priority: 2, done: false, skipped: false, repeat_rule: "daily", series_id: "22222222-2222-4222-8222-222222222222", due_date: today, occurrence_date: today, scheduled_time: "08:30:00", position: 1024, created_at: timestamp, updated_at: timestamp },
    { id: "33333333-3333-4333-8333-333333333333", user_id: userId, text: "整理学习资料", priority: 1, done: true, skipped: false, repeat_rule: "none", series_id: null, due_date: today, occurrence_date: null, scheduled_time: null, position: 2048, created_at: timestamp, updated_at: timestamp },
  ];
  const materials: MaterialFixture[] = [
    { id: "44444444-4444-4444-8444-444444444444", user_id: userId, title: "React 组件设计笔记", category: "前端", tags: ["React", "组件"], status: "doing", priority: 2, notes: "把复杂的问题拆成小而清晰的组件。", url: "https://react.dev", created_at: timestamp, updated_at: timestamp },
    { id: "55555555-5555-4555-8555-555555555555", user_id: userId, title: "无障碍界面实践", category: "设计", tags: ["A11y"], status: "todo", priority: 1, notes: "为键盘、触摸和不同的视觉需求留出空间。", url: null, created_at: timestamp, updated_at: timestamp },
  ];
  const reports = [{ id: "66666666-6666-4666-8666-666666666666", user_id: userId, repo_url: "https://github.com/example/toolkit", owner: "example", repo: "toolkit", branch: "main", summary: "一个清晰、专注的个人工作区。", markdown: "# 项目概览\n\n一个清晰、专注的个人工作区。\n\n## 架构\n\n| 层级 | 说明 |\n| --- | --- |\n| 前端 | React + Next.js |\n| 数据 | Supabase |\n\n## 改进方向\n\n- 统一组件与交互\n- 关注无障碍与移动体验\n", created_at: timestamp }];
  const state = {
    errors, authUser: user, authenticated, authReads: 0, authPlans: [] as { wait?: Promise<void>; status?: number }[],
    todoCreates: [] as Record<string, unknown>[], createPlans: [] as TodoPatchPlan[],
    failMaterial: false, materialWrites: 0, materialIds: [] as string[],
    materialPlans: new Map<string, TodoPatchPlan[]>(),
    materialRequests: [] as { id: string; method: string; payload: Partial<MaterialFixture> }[],
    todos, materials, reports, todoReads: 0, todoWrites: [] as { id: string; patch: Partial<TodoFixture> }[],
    todoPatchPlans: new Map<string, TodoPatchPlan[]>(),
    holdTodoReads: undefined as Promise<void> | undefined,
    readPlans: new Map<ReadSection, ReadPlan[]>(),
    readCounts: { todos: 0, materials: 0, reports: 0 },
    failRecurrence: false,
  };
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === "127.0.0.1") return route.continue();
    // Deny every unexpected external request, including actual AI calls.
    if (url.hostname !== host) { errors.push(`Unexpected external request: ${url.hostname}`); return route.abort(); }
    const respond = (data: unknown, status = 200, headers: Record<string, string> = {}) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-expose-headers": "content-range", ...headers }, body: JSON.stringify(data) });
    const plannedRead = async (section: ReadSection, data: unknown, headers: Record<string, string> = {}) => {
      state.readCounts[section]++;
      const plan = state.readPlans.get(section)?.shift();
      const body = JSON.parse(JSON.stringify(data));
      if (plan?.wait) await plan.wait;
      if (plan?.fail) return respond({ message: "模拟模块加载失败，请重试", code: "P0001" }, 400);
      return respond(body, 200, headers);
    };
    if (request.method() === "OPTIONS") return respond(null);
    if (url.pathname === "/auth/v1/user") {
      state.authReads++;
      const plan = state.authPlans.shift();
      const body = { ...state.authUser };
      if (plan?.wait) await plan.wait;
      if (plan?.status) return respond({ message: "模拟校验失败", code: plan.status === 401 ? "bad_jwt" : "temporary_error" }, plan.status);
      return respond(state.authenticated ? body : { message: "No session" }, state.authenticated ? 200 : 401);
    }
    if (url.pathname === "/auth/v1/logout") { state.authenticated = false; return respond({}); }
    if (url.pathname === "/auth/v1/token") { state.authenticated = true; return respond(previewSession(state.authUser)); }
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      if (url.pathname.endsWith("/todo_create")) {
        const payload = request.postDataJSON();
        state.todoCreates.push(payload);
        const plan = state.createPlans.shift();
        if (plan?.wait) await plan.wait;
        if (plan?.outcome === "error") return respond({ message: "模拟添加失败，请重试", code: "P0001" }, 400);
        if (!todos.some((row) => row.id === payload.p_id)) todos.push(todoFixture(payload.p_id, payload.p_text, {
          priority: payload.p_priority, due_date: payload.p_due_date, scheduled_time: payload.p_time,
          repeat_rule: payload.p_repeat, series_id: payload.p_repeat === "none" ? null : payload.p_id, position: payload.p_position,
        }));
        return respond(payload.p_id);
      }
      if (url.pathname.endsWith("/todo_ensure_occurrences") && state.failRecurrence) return respond({ message: "模拟重复计划失败", code: "P0001" }, 400);
      if (url.pathname.endsWith("/todo_remove")) {
        const { p_id, p_scope } = request.postDataJSON();
        const index = todos.findIndex((row) => row.id === p_id);
        if (index >= 0) {
          if (todos[index].series_id && p_scope === "single") todos[index].skipped = true;
          else todos.splice(index, 1);
        }
      }
      return respond(null);
    }
    if (url.pathname === "/rest/v1/todos") {
      if (request.method() === "PATCH") {
        const id = url.searchParams.get("id")?.replace(/^eq\./, "") ?? "";
        const patch = request.postDataJSON() as Partial<TodoFixture>;
        const plan = state.todoPatchPlans.get(id)?.shift();
        state.todoWrites.push({ id, patch });
        if (plan?.wait) await plan.wait;
        if (plan?.outcome === "error") return respond({ message: "模拟任务保存失败，请重试", code: "P0001" }, 400);
        if (plan?.outcome === "empty") return respond(null);
        const row = todos.find((item) => item.id === id);
        if (!row || plan?.outcome === "missing") return respond({ message: "Cannot coerce the result to a single JSON object", details: "The result contains 0 rows", code: "PGRST116" }, 406);
        Object.assign(row, patch);
        return respond(request.headers().accept?.includes("application/vnd.pgrst.object+json") ? row : [row]);
      }
      state.todoReads++;
      const due = url.searchParams.get("due_date");
      const filtered = todos.filter((row) =>
        (!due || (due.startsWith("eq.") ? row.due_date === due.slice(3) : row.due_date < due.slice(3))) &&
        (!url.searchParams.has("done") || row.done === (url.searchParams.get("done") === "eq.true")) &&
        (!url.searchParams.has("skipped") || row.skipped === (url.searchParams.get("skipped") === "eq.true")),
      );
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? filtered.length);
      // Snapshot before waiting, as a real in-flight read may return stale data.
      const data = filtered.slice(offset, offset + limit).map((row) => ({ ...row }));
      if (state.holdTodoReads) await state.holdTodoReads;
      return plannedRead("todos", data, { "content-range": `${offset}-${Math.max(offset + data.length - 1, offset)}/${filtered.length}` });
    }
    if (url.pathname === "/rest/v1/materials") {
      if (request.method() !== "GET") {
        const payload = request.method() === "DELETE" ? {} : request.postDataJSON() as Partial<MaterialFixture>;
        const id = payload.id ?? url.searchParams.get("id")?.replace(/^eq\./, "") ?? "";
        const plan = state.materialPlans.get(id)?.shift();
        state.materialWrites++;
        state.materialIds.push(id);
        state.materialRequests.push({ id, method: request.method(), payload });
        if (plan?.wait) await plan.wait;
        if (state.failMaterial || plan?.outcome === "error") return respond({ message: "模拟保存失败，请重试", code: "P0001" }, 400);
        if (plan?.outcome === "empty") return respond(null);
        const index = materials.findIndex((row) => row.id === id);
        if (plan?.outcome === "missing" || (index < 0 && request.method() !== "POST")) return respond({ message: "Cannot coerce the result to a single JSON object", code: "PGRST116" }, 406);
        if (request.method() === "DELETE") { materials.splice(index, 1); return respond({ id }); }
        if (index >= 0) Object.assign(materials[index], payload);
        else materials.push(payload as MaterialFixture);
        const saved = materials.find((row) => row.id === id)!;
        return respond(request.headers().accept?.includes("application/vnd.pgrst.object+json") ? saved : [saved]);
      }
      return plannedRead("materials", materials);
    }
    if (url.pathname === "/rest/v1/analysis_reports") return plannedRead("reports", reports);
    if (url.pathname === "/rest/v1/analysis_chats") return respond([]);
    errors.push(`Unhandled preview request: ${url.pathname}`);
    return respond({ message: "Unhandled preview request" }, 400);
  });
  return state;
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

function todoRow(page: Page, text: string) {
  return page.locator("div.group").filter({ has: page.getByText(text, { exact: true }) });
}

async function watchTodoList(page: Page, survivor: Locator) {
  const element = await survivor.elementHandle();
  if (!element) throw new Error("Expected a mounted task before observing list stability");
  await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>("#main-content")!;
    main.dataset.testLoadingFlash = "false";
    const selector = '[role="status"][aria-label="正在加载"]';
    new MutationObserver((records) => {
      for (const record of records) for (const node of Array.from(record.addedNodes)) {
        if (node instanceof Element && (node.matches(selector) || node.querySelector(selector))) main.dataset.testLoadingFlash = "true";
      }
    }).observe(main, { childList: true, subtree: true });
  });
  return async () => {
    expect(await element.evaluate((node) => node.isConnected), "unaffected task DOM should not be replaced").toBe(true);
    await expect(page.locator("#main-content")).toHaveAttribute("data-test-loading-flash", "false");
    await expect(page.getByRole("status", { name: "正在加载", exact: true })).toHaveCount(0);
  };
}

test.describe("touch task completion", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("slow concurrent completions update immediately and reconcile out of order without clearing the list", async ({ page, context }, info) => {
    const state = await isolate(page, context);
    const firstId = state.todos[0].id;
    const second = todoFixture("77777777-7777-4777-8777-777777777777", "回复项目消息", { position: 3072 });
    state.todos.push(second, todoFixture("88888888-8888-4888-8888-888888888888", "下一件待办"));
    const first = gate();
    const secondGate = gate();
    state.todoPatchPlans.set(firstId, [{ wait: first.wait }]);
    state.todoPatchPlans.set(second.id, [{ wait: secondGate.wait }]);
    try {
      await page.goto("/todos");
      await expect(todoRow(page, "下一件待办")).toBeVisible();
      const stable = await watchTodoList(page, todoRow(page, "下一件待办"));
      const initialReads = state.todoReads;
      await page.getByText("已完成 · 1", { exact: true }).tap();
      await todoRow(page, "每天读书").getByRole("button", { name: "标记完成", exact: true }).tap();
      await expect.poll(() => state.todoWrites.length).toBe(1);
      await expect(page.getByText("已完成 · 2", { exact: true })).toBeVisible();
      await expect(todoRow(page, "每天读书").getByRole("button", { name: "标记未完成", exact: true })).toBeDisabled();
      await expect(todoRow(page, second.text).getByRole("button", { name: "标记完成", exact: true })).toBeEnabled();
      await expect(page.getByLabel("选择任务日期")).toBeDisabled();
      await expect(page.getByRole("button", { name: "添加任务", exact: true })).toBeDisabled();
      await expect(todoRow(page, "下一件待办").getByRole("button", { name: "更多操作：下一件待办", exact: true })).toBeDisabled();
      await stable();

      await todoRow(page, second.text).getByRole("button", { name: "标记完成", exact: true }).tap();
      await expect.poll(() => state.todoWrites.length).toBe(2);
      await expect(page.getByRole("progressbar", { name: "当日完成度" })).toHaveAttribute("aria-valuenow", "75");
      secondGate.release();
      await expect(todoRow(page, second.text).getByRole("button", { name: "标记未完成", exact: true })).toBeEnabled();
      await expect(todoRow(page, "每天读书").getByRole("button", { name: "标记未完成", exact: true })).toBeDisabled();
      await expect(todoRow(page, "下一件待办").getByRole("button", { name: "标记完成", exact: true })).toBeEnabled();
      await stable();
      first.release();
      await expect(page.getByLabel("选择任务日期")).toBeEnabled();
      await expect(page.getByText("已完成 · 3", { exact: true })).toBeVisible();
      expect(state.todos.find((item) => item.id === firstId)?.done).toBe(true);
      expect(second.done).toBe(true);
      expect(state.todoReads, "completion should not refetch every task").toBe(initialReads);
      await stable();
      await noOverflow(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: info.outputPath("touch-concurrent-complete.png"), fullPage: true });
      expect(state.errors).toEqual([]);
    } finally { first.release(); secondGate.release(); }
  });

  test("one failed completion rolls back only that task and can be retried", async ({ page, context }, info) => {
    const state = await isolate(page, context);
    const firstId = state.todos[0].id;
    const second = todoFixture("77777777-7777-4777-8777-777777777777", "另一项可以完成的事");
    state.todos.push(second, todoFixture("88888888-8888-4888-8888-888888888888", "保持可操作的任务", { position: 5120 }));
    const failure = gate();
    state.todoPatchPlans.set(firstId, [{ wait: failure.wait, outcome: "error" }]);
    try {
      await page.goto("/todos");
      await expect(todoRow(page, "保持可操作的任务")).toBeVisible();
      const stable = await watchTodoList(page, todoRow(page, "保持可操作的任务"));
      await page.getByText("已完成 · 1", { exact: true }).tap();
      await todoRow(page, "每天读书").getByRole("button", { name: "标记完成", exact: true }).tap();
      await expect.poll(() => state.todoWrites.length).toBe(1);
      await todoRow(page, second.text).getByRole("button", { name: "标记完成", exact: true }).tap();
      await expect(todoRow(page, second.text).getByRole("button", { name: "标记未完成", exact: true })).toBeEnabled();
      failure.release();
      await expect(page.locator("#main-content").getByRole("alert")).toContainText("模拟任务保存失败");
      await expect(todoRow(page, "每天读书").getByRole("button", { name: "标记完成", exact: true })).toBeEnabled();
      await expect(todoRow(page, second.text).getByRole("button", { name: "标记未完成", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByText("已完成 · 2", { exact: true })).toBeVisible();
      expect(state.todos.find((item) => item.id === firstId)?.done).toBe(false);
      expect(second.done).toBe(true);
      await stable();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: info.outputPath("touch-complete-rollback.png"), fullPage: true });

      await todoRow(page, "每天读书").getByRole("button", { name: "标记完成", exact: true }).tap();
      await expect(todoRow(page, "每天读书").getByRole("button", { name: "标记未完成", exact: true })).toBeEnabled();
      await expect(page.locator("#main-content").getByRole("alert")).toHaveCount(0);
      await expect(page.getByText("已完成 · 3", { exact: true })).toBeVisible();
      expect(state.todoWrites).toHaveLength(3);
      await stable();
      expect(state.errors).toEqual([]);
    } finally { failure.release(); }
  });

  for (const outcome of ["empty", "missing"] as const) {
    test(`${outcome} single-row update response cannot falsely confirm completion`, async ({ page, context }) => {
      const state = await isolate(page, context);
      const pending = gate();
      state.todoPatchPlans.set(state.todos[0].id, [{ wait: pending.wait, outcome }]);
      try {
        await page.goto("/todos");
        await todoRow(page, "每天读书").getByRole("button", { name: "标记完成", exact: true }).tap();
        await expect.poll(() => state.todoWrites.length).toBe(1);
        await expect(page.getByText("已完成 · 2", { exact: true })).toBeVisible();
        pending.release();
        await expect(page.locator("#main-content").getByRole("alert")).toBeVisible();
        await expect(todoRow(page, "每天读书").getByRole("button", { name: "标记完成", exact: true })).toBeEnabled();
        await expect(page.getByText("已完成 · 1", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "撤销完成：每天读书", exact: true })).toHaveCount(0);
        expect(state.todos[0].done).toBe(false);
        expect(state.errors).toEqual([]);
      } finally { pending.release(); }
    });
  }

  test("deletion revalidates in the background and feedback does not shift surviving tasks", async ({ page, context }, info) => {
    const state = await isolate(page, context);
    const removed = todoFixture("77777777-7777-4777-8777-777777777777", "删除这一项");
    state.todos.push(removed);
    const reads = gate();
    try {
      await page.goto("/todos");
      const survivor = todoRow(page, "每天读书");
      await expect(survivor).toBeVisible();
      const initialY = await survivor.evaluate((node) => node.getBoundingClientRect().top + scrollY);
      const stable = await watchTodoList(page, survivor);
      const initialReads = state.todoReads;
      state.holdTodoReads = reads.wait;
      await todoRow(page, removed.text).getByRole("button", { name: `更多操作：${removed.text}`, exact: true }).tap();
      await page.getByRole("menuitem", { name: "删除", exact: true }).tap();
      const dialog = page.getByRole("dialog", { name: "删除任务" });
      await dialog.getByRole("button", { name: "确认删除", exact: true }).tap();
      await expect.poll(() => state.todoReads).toBeGreaterThan(initialReads);
      await stable();
      reads.release();
      await expect(dialog).not.toBeVisible();
      await expect(page.getByText(removed.text, { exact: true })).toHaveCount(0);
      await expect(page.getByRole("status").filter({ hasText: "任务已删除" })).toBeVisible();
      expect(await survivor.evaluate((node) => node.getBoundingClientRect().top + scrollY)).toBeCloseTo(initialY, 0);
      await stable();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: info.outputPath("touch-delete-feedback.png"), fullPage: true });
      expect(state.errors).toEqual([]);
    } finally { reads.release(); }
  });

  test("overdue count and skipped recovery update before their saves finish", async ({ page, context }) => {
    const state = await isolate(page, context);
    const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const overdue = todoFixture("77777777-7777-4777-8777-777777777777", "昨日未完成的任务", { due_date: yesterday });
    const skipped = todoFixture("88888888-8888-4888-8888-888888888888", "恢复跳过的任务", { skipped: true, repeat_rule: "daily", series_id: "88888888-8888-4888-8888-888888888888", occurrence_date: today });
    state.todos.push(overdue, skipped);
    const overdueSave = gate();
    const skippedSave = gate();
    state.todoPatchPlans.set(overdue.id, [{ wait: overdueSave.wait }]);
    state.todoPatchPlans.set(skipped.id, [{ wait: skippedSave.wait }]);
    try {
      await page.goto("/todos");
      await expect(page.getByText("逾期未完成 · 1", { exact: true })).toBeVisible();
      const stable = await watchTodoList(page, todoRow(page, "每天读书"));
      await todoRow(page, overdue.text).getByRole("button", { name: "标记完成", exact: true }).tap();
      await expect.poll(() => state.todoWrites.length).toBe(1);
      await expect(page.getByText("逾期未完成 · 1", { exact: true })).toHaveCount(0);
      await page.getByText("已跳过 · 1（可恢复）", { exact: true }).tap();
      await page.getByRole("button", { name: "恢复这次", exact: true }).tap();
      await expect.poll(() => state.todoWrites.length).toBe(2);
      await expect(todoRow(page, skipped.text)).toBeVisible();
      await expect(todoRow(page, skipped.text).getByRole("button", { name: "标记完成", exact: true })).toBeDisabled();
      await expect(page.getByText("已跳过 · 1（可恢复）", { exact: true })).toHaveCount(0);
      skippedSave.release();
      await expect(todoRow(page, skipped.text).getByRole("button", { name: "标记完成", exact: true })).toBeEnabled();
      overdueSave.release();
      await expect(page.getByLabel("选择任务日期")).toBeEnabled();
      expect(overdue.done).toBe(true);
      expect(skipped.skipped).toBe(false);
      await stable();
      expect(state.errors).toEqual([]);
    } finally { overdueSave.release(); skippedSave.release(); }
  });

  test("a stale background response cannot undo a newer completion", async ({ page, context }) => {
    const state = await isolate(page, context);
    const reads = gate();
    try {
      await page.goto("/todos");
      await expect(todoRow(page, "每天读书")).toBeVisible();
      await page.getByText("已完成 · 1", { exact: true }).tap();
      const initialReads = state.todoReads;
      state.holdTodoReads = reads.wait;
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect.poll(() => state.todoReads).toBe(initialReads + 2);
      await todoRow(page, "每天读书").getByRole("button", { name: "标记完成", exact: true }).tap();
      await expect(todoRow(page, "每天读书").getByRole("button", { name: "标记未完成", exact: true })).toBeEnabled();
      const dayResponse = page.waitForResponse((response) => response.url().includes("/rest/v1/todos?") && response.request().method() === "GET" && new URL(response.url()).searchParams.get("due_date")?.startsWith("eq.") === true);
      reads.release();
      await (await dayResponse).finished();
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(page.getByText("已完成 · 2", { exact: true })).toBeVisible();
      await expect(todoRow(page, "每天读书").getByRole("button", { name: "标记未完成", exact: true })).toHaveAttribute("aria-pressed", "true");
      expect(state.errors).toEqual([]);
    } finally { reads.release(); }
  });
});

test.describe("task undo and mobile menu", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("undo restores the exact completed task without a reload, and failed undo can retry", async ({ page, context }, info) => {
    const state = await isolate(page, context);
    const target = state.todos[0];
    const survivor = todoFixture("77777777-7777-4777-8777-777777777777", "继续处理这件事");
    state.todos.push(survivor);
    await page.goto("/todos");
    await expect(todoRow(page, survivor.text)).toBeVisible();
    const stable = await watchTodoList(page, todoRow(page, survivor.text));
    const reads = state.todoReads;
    await todoRow(page, target.text).getByRole("button", { name: "标记完成", exact: true }).tap();
    const undo = page.getByRole("button", { name: `撤销完成：${target.text}`, exact: true });
    await expect(undo).toBeVisible();
    await page.screenshot({ path: info.outputPath("mobile-undo.png"), fullPage: true });
    state.todoPatchPlans.set(target.id, [{ outcome: "error" }]);
    await undo.tap();
    await expect(page.getByRole("status").filter({ hasText: "撤销未保存" })).toBeVisible();
    expect(target.done).toBe(true);
    await undo.tap();
    await expect(todoRow(page, target.text).getByRole("button", { name: "标记完成", exact: true })).toBeEnabled();
    expect(target.done).toBe(false);
    expect(state.todoWrites.map((write) => write.patch.done)).toEqual([true, false, false]);
    expect(state.todoReads).toBe(reads);
    await expect(page.getByRole("button", { name: /撤销完成：/ })).toHaveCount(0);
    await stable();
    expect(state.errors).toEqual([]);
  });

  test("out-of-order saves cannot change the latest undo target", async ({ page, context }) => {
    const state = await isolate(page, context);
    const first = state.todos[0];
    const second = todoFixture("77777777-7777-4777-8777-777777777777", "最后完成的任务");
    state.todos.push(second);
    const slow = gate();
    state.todoPatchPlans.set(first.id, [{ wait: slow.wait }]);
    try {
      await page.goto("/todos");
      await todoRow(page, first.text).getByRole("button", { name: "标记完成", exact: true }).tap();
      await todoRow(page, second.text).getByRole("button", { name: "标记完成", exact: true }).tap();
      const undo = page.getByRole("button", { name: `撤销完成：${second.text}`, exact: true });
      await expect(undo).toBeVisible();
      slow.release();
      await expect(page.getByLabel("选择任务日期")).toBeEnabled();
      await expect(undo).toBeVisible();
      await undo.tap();
      await expect(todoRow(page, second.text).getByRole("button", { name: "标记完成", exact: true })).toBeEnabled();
      expect(first.done).toBe(true);
      expect(second.done).toBe(false);
      expect(state.todoWrites.at(-1)?.id).toBe(second.id);
      expect(state.errors).toEqual([]);
    } finally { slow.release(); }
  });

  test("undo of an overdue completion restores the overdue count", async ({ page, context }) => {
    const state = await isolate(page, context);
    const yesterday = new Date(`${today}T12:00:00+08:00`);
    yesterday.setDate(yesterday.getDate() - 1);
    const dueDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(yesterday);
    const overdue = todoFixture("77777777-7777-4777-8777-777777777777", "昨天的单次任务", { due_date: dueDate });
    state.todos.push(overdue);
    await page.goto("/todos");
    await todoRow(page, overdue.text).getByRole("button", { name: "标记完成", exact: true }).tap();
    const undo = page.getByRole("button", { name: `撤销完成：${overdue.text}`, exact: true });
    await expect(undo).toBeVisible();
    await expect(page.getByText("逾期未完成 · 1", { exact: true })).toHaveCount(0);
    await undo.tap();
    await expect(page.getByText("逾期未完成 · 1", { exact: true })).toBeVisible();
    await expect(todoRow(page, overdue.text).getByRole("button", { name: "标记完成", exact: true })).toBeEnabled();
    expect(overdue.done).toBe(false);
    expect(state.errors).toEqual([]);
  });

  test("undo stays available while keyboard focused and expires after leaving", async ({ page, context }) => {
    await isolate(page, context);
    await page.clock.install();
    await page.goto("/todos");
    await todoRow(page, "每天读书").getByRole("button", { name: "标记完成", exact: true }).tap();
    const undo = page.getByRole("button", { name: "撤销完成：每天读书", exact: true });
    await expect(undo).toBeVisible();
    await undo.focus();
    await page.clock.fastForward(15_000);
    await expect(undo).toBeFocused();
    await page.getByRole("button", { name: "添加任务", exact: true }).focus();
    await page.clock.fastForward(8_100);
    await expect(undo).toHaveCount(0);
    await page.getByText("已完成 · 2", { exact: true }).tap();
    await expect(todoRow(page, "每天读书").getByRole("button", { name: "标记未完成", exact: true })).toBeEnabled();
  });

  test("mobile menu supports arrows, Escape, outside dismissal, and edit focus return", async ({ page, context }, info) => {
    const state = await isolate(page, context);
    await page.goto("/todos");
    const trigger = page.getByRole("button", { name: "更多操作：每天读书", exact: true });
    await trigger.focus();
    await page.keyboard.press("ArrowDown");
    const menu = page.getByRole("menu", { name: "任务操作：每天读书", exact: true });
    await expect(menu.getByRole("menuitem", { name: "编辑", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "跳过这次", exact: true })).toBeFocused();
    await expect(menu.getByRole("menuitem", { name: "上移", exact: true })).toBeDisabled();
    await page.keyboard.press("End");
    await expect(menu.getByRole("menuitem", { name: "删除", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.tap();
    await expect(menu).toBeVisible();
    await page.screenshot({ path: info.outputPath("mobile-more-menu.png") });
    await expect(menu).toBeVisible();
    await page.getByRole("heading", { name: "每日待办", exact: true }).tap();
    await expect(menu).toHaveCount(0);
    await trigger.tap();
    await menu.getByRole("menuitem", { name: "编辑", exact: true }).tap();
    const dialog = page.getByRole("dialog", { name: "编辑任务" });
    await expect(dialog.getByLabel("任务内容")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    expect(state.errors).toEqual([]);
  });

  test("menu actions skip just this occurrence and reorder without offering invalid actions", async ({ page, context }) => {
    const state = await isolate(page, context);
    const second = todoFixture("77777777-7777-4777-8777-777777777777", "第二件事");
    state.todos.push(second);
    await page.goto("/todos");
    await page.getByRole("button", { name: "更多操作：每天读书", exact: true }).tap();
    await page.getByRole("menuitem", { name: "下移", exact: true }).tap();
    await expect(page.getByRole("status").filter({ hasText: "任务顺序已保存" })).toBeVisible();
    expect(state.todos[0].position).toBeGreaterThan(second.position);
    await page.getByRole("button", { name: "更多操作：第二件事", exact: true }).tap();
    await expect(page.getByRole("menuitem", { name: "跳过这次", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "更多操作：每天读书", exact: true }).tap();
    await page.getByRole("menuitem", { name: "跳过这次", exact: true }).tap();
    await expect(page.getByText("已跳过 · 1（可恢复）", { exact: true })).toBeVisible();
    expect(state.todos[0].skipped).toBe(true);
    expect(state.todos[0].repeat_rule).toBe("daily");
    expect(state.errors).toEqual([]);
  });

  test("long titles, small screens and menus near the viewport edge stay usable", async ({ page, context }, info) => {
    const state = await isolate(page, context);
    state.todos[0].text = "很长的任务内容与链接https://example.test/" + "long".repeat(18);
    for (let index = 0; index < 6; index++) state.todos.push(todoFixture(`extra-${index}`, `更多待办 ${index}`, { position: 5120 + index * 1024 }));
    await page.setViewportSize({ width: 320, height: 720 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
    await page.goto("/todos");
    await expect(todoRow(page, "更多待办 5")).toBeAttached();
    await page.getByRole("button", { name: "更多操作：更多待办 5", exact: true }).tap();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(12);
    expect(box!.y).toBeGreaterThanOrEqual(12);
    expect(box!.x + box!.width).toBeLessThanOrEqual(308);
    expect(box!.y + box!.height).toBeLessThanOrEqual(708);
    for (const item of await menu.getByRole("menuitem").all()) expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath("small-dark-more-menu.png") });
    await page.keyboard.press("Escape");
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await page.getByRole("button", { name: "更多操作：更多待办 5", exact: true }).tap();
    await expect(page.getByRole("menuitem", { name: "删除", exact: true })).toBeVisible();
    await noOverflow(page);
    expect(state.errors).toEqual([]);
  });
});

test.describe("learning workflow", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const card = (page: Page, title: string) => page.getByRole("article", { name: title, exact: true });

  test("concurrent status choices save independently, roll back only the failed card, and retry without reload", async ({ page, context }) => {
    const state = await isolate(page, context);
    const first = state.materials[0];
    const second = state.materials[1];
    const slow = gate();
    state.materialPlans.set(first.id, [{ wait: slow.wait, outcome: "error" }]);
    try {
      await page.goto("/learning");
      await expect(card(page, second.title)).toBeVisible();
      const stable = await watchTodoList(page, card(page, second.title));
      const reads = state.readCounts.materials;
      await card(page, first.title).getByLabel("学习状态：" + first.title, { exact: true }).selectOption("done");
      await expect(card(page, first.title)).toHaveAttribute("aria-busy", "true");
      await expect(card(page, first.title).getByRole("combobox")).toBeDisabled();
      await expect(card(page, first.title).getByRole("button", { name: "编辑", exact: true })).toBeDisabled();
      await expect(page.getByRole("button", { name: "刷新资料", exact: true })).toBeDisabled();
      await card(page, second.title).getByRole("combobox").selectOption("doing");
      await expect(card(page, second.title)).toHaveAttribute("aria-busy", "false");
      slow.release();
      await expect(card(page, first.title).getByRole("alert")).toContainText("已恢复为进行中");
      await expect(card(page, first.title).getByRole("combobox")).toHaveValue("doing");
      await expect(card(page, second.title).getByRole("combobox")).toHaveValue("doing");
      await card(page, first.title).getByRole("button", { name: "重试状态更新", exact: true }).tap();
      await expect(card(page, first.title).getByRole("combobox")).toHaveValue("done");
      await expect(card(page, first.title)).toHaveAttribute("aria-busy", "false");
      await expect(card(page, first.title).getByRole("alert")).toHaveCount(0);
      expect(first.status).toBe("done");
      expect(second.status).toBe("doing");
      expect(state.materialRequests.map((request) => request.id)).toEqual([first.id, second.id, first.id]);
      expect(state.readCounts.materials).toBe(reads);
      await stable();
      expect(state.errors).toEqual([]);
    } finally { slow.release(); }
  });

  for (const outcome of ["empty", "missing"] as const) {
    test(outcome + " update result cannot falsely confirm a learning status", async ({ page, context }) => {
      const state = await isolate(page, context);
      state.materialPlans.set(state.materials[0].id, [{ outcome }]);
      await page.goto("/learning");
      const target = card(page, state.materials[0].title);
      await target.getByRole("combobox").selectOption("done");
      await expect(target.getByRole("alert")).toBeVisible();
      await expect(target.getByRole("combobox")).toHaveValue("doing");
      expect(state.materials[0].status).toBe("doing");
      expect(state.errors).toEqual([]);
    });
  }

  test("refresh preserves existing cards and filters, and a stale read cannot overwrite a new status", async ({ page, context }) => {
    const state = await isolate(page, context);
    const read = gate();
    try {
      await page.goto("/learning");
      const target = card(page, state.materials[0].title);
      await expect(target).toBeVisible();
      const stable = await watchTodoList(page, target);
      const initialReads = state.readCounts.materials;
      state.readPlans.set("materials", [{ wait: read.wait }]);
      await page.getByRole("button", { name: "刷新资料", exact: true }).tap();
      await expect.poll(() => state.readCounts.materials).toBe(initialReads + 1);
      await target.getByRole("combobox").selectOption("done");
      await expect(target).toHaveAttribute("aria-busy", "false");
      const response = page.waitForResponse((result) => result.url().includes("/rest/v1/materials?") && result.request().method() === "GET");
      read.release();
      await (await response).finished();
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(target.getByRole("combobox")).toHaveValue("done");
      await stable();
      await page.getByLabel("搜索学习资料", { exact: true }).fill("React");
      await page.getByLabel("资料分类", { exact: true }).selectOption("前端");
      state.readPlans.set("materials", [{ fail: true }]);
      await page.getByRole("button", { name: "刷新资料", exact: true }).tap();
      await expect(page.locator("#main-content").getByRole("alert")).toContainText("现有资料仍可使用");
      await expect(target).toBeVisible();
      await expect(page.getByLabel("搜索学习资料", { exact: true })).toHaveValue("React");
      await expect(page.getByLabel("资料分类", { exact: true })).toHaveValue("前端");
      await page.getByRole("button", { name: "重试加载", exact: true }).tap();
      await expect(page.locator("#main-content").getByRole("alert")).toHaveCount(0);
      await stable();
      expect(state.errors).toEqual([]);
    } finally { read.release(); }
  });

  test("search combines terms across fields, category all stays distinct, counts and sort remain clear", async ({ page, context }, info) => {
    const state = await isolate(page, context);
    state.materials[1].category = "all";
    await page.goto("/learning");
    const filters = page.getByRole("group", { name: "学习状态筛选", exact: true });
    await expect(filters.getByRole("button", { name: "全部", exact: true })).toContainText("2");
    await page.getByLabel("资料排序", { exact: true }).selectOption("priority");
    await expect(page.getByRole("article").first()).toHaveAttribute("aria-label", state.materials[1].title);
    await page.getByLabel("搜索学习资料", { exact: true }).fill("ＲＥＡＣＴ 组件");
    await expect(card(page, state.materials[0].title)).toBeVisible();
    await expect(card(page, state.materials[1].title)).toHaveCount(0);
    await expect(filters.getByRole("button", { name: "全部", exact: true })).toContainText("1");
    await filters.getByRole("button", { name: "已完成", exact: true }).tap();
    await expect(page.getByText("没有匹配的资料", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "查看全部资料", exact: true }).tap();
    await expect(page.getByLabel("搜索学习资料", { exact: true })).toBeFocused();
    await expect(page.getByRole("article")).toHaveCount(2);
    await page.getByLabel("资料分类", { exact: true }).selectOption("all");
    await expect(card(page, state.materials[1].title)).toBeVisible();
    await expect(card(page, state.materials[0].title)).toHaveCount(0);
    await page.getByRole("button", { name: "清除筛选", exact: true }).tap();
    await page.getByLabel("搜索学习资料", { exact: true }).fill("react.dev");
    await expect(card(page, state.materials[0].title)).toBeVisible();
    await page.getByRole("button", { name: "清除搜索", exact: true }).tap();
    await expect(page.getByRole("article")).toHaveCount(2);
    await page.screenshot({ path: info.outputPath("learning-mobile.png"), fullPage: true });
    expect(state.materialWrites).toBe(0);
    expect(state.errors).toEqual([]);
  });

  test("continue learning opens full notes, returns focus, and never activates unsafe stored links", async ({ page, context }, info) => {
    const state = await isolate(page, context);
    const notes = "学习目标\n" + "详细笔记。".repeat(80) + "\n下一步：整理组件接口。\n<script>alert('not html')</script>";
    state.materials[0].notes = notes;
    state.materials[0].tags.push("进阶", "记录", "复习");
    state.materials[1].url = "javascript:alert(1)";
    await page.goto("/learning");
    const continuing = page.getByRole("region", { name: "继续学习", exact: true });
    await expect(continuing.getByRole("link", { name: /继续阅读/ })).toHaveAttribute("href", "https://react.dev/");
    const trigger = continuing.getByRole("button", { name: "查看笔记", exact: true });
    await trigger.tap();
    const dialog = page.getByRole("dialog", { name: "资料详情", exact: true });
    await expect(dialog.getByRole("region", { name: "完整学习笔记", exact: true })).toContainText("下一步：整理组件接口。");
    await expect(dialog.getByText("#复习", { exact: true })).toBeVisible();
    expect(await dialog.locator("script").count()).toBe(0);
    await expect(dialog.locator(".modal-panel")).toHaveCSS("opacity", "1");
    await page.screenshot({ path: info.outputPath("learning-notes.png") });
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    const unsafe = card(page, state.materials[1].title);
    await expect(unsafe.getByRole("link")).toHaveCount(0);
    await unsafe.getByRole("button", { name: "查看笔记", exact: true }).tap();
    await expect(dialog.getByText("链接格式不安全或无效，请编辑为 http 或 https 链接。", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("link")).toHaveCount(0);
    expect(state.materialWrites).toBe(0);
    expect(state.errors).toEqual([]);
  });

  test("new and edited materials save actual records without a reload, with safe links and deduplicated Chinese tags", async ({ page, context }) => {
    const state = await isolate(page, context);
    await page.goto("/learning");
    await expect(card(page, state.materials[0].title)).toBeVisible();
    const reads = state.readCounts.materials;
    const stable = await watchTodoList(page, card(page, state.materials[0].title));
    await page.getByRole("button", { name: "添加资料", exact: true }).tap();
    const dialog = page.getByRole("dialog", { name: "添加资料", exact: true });
    await dialog.getByLabel("标题").fill("新的学习笔记");
    for (const unsafe of ["javascript:alert(1)", "data:text/html,hello", "file:///notes", "https://user:password@example.test"]) {
      await dialog.getByLabel("链接（可选）").fill(unsafe);
      await expect(dialog.getByLabel("链接（可选）")).toHaveAttribute("aria-invalid", "true");
      await expect(dialog.getByRole("button", { name: "添加", exact: true })).toBeDisabled();
    }
    expect(state.materialWrites).toBe(0);
    await dialog.getByLabel("链接（可选）").fill("https://example.test/notes");
    await dialog.getByRole("button", { name: "更多选项", exact: false }).tap();
    await dialog.getByLabel("标签（逗号分隔）").fill("React，Hooks、React, 组件");
    await dialog.getByLabel("备注").fill("记录下一步");
    await dialog.getByRole("button", { name: "添加", exact: true }).tap();
    await expect(dialog).not.toBeVisible();
    const created = state.materials.find((material) => material.title === "新的学习笔记")!;
    expect(created.tags).toEqual(["React", "Hooks", "组件"]);
    await card(page, created.title).getByRole("button", { name: "编辑", exact: true }).tap();
    const editing = page.getByRole("dialog", { name: "编辑资料", exact: true });
    await editing.getByLabel("标题").fill("更新后的学习笔记");
    await editing.getByRole("button", { name: "保存", exact: true }).tap();
    await expect(editing).not.toBeVisible();
    await expect(card(page, "更新后的学习笔记")).toBeVisible();
    expect(created.id).toBe(state.materialRequests.at(-1)?.id);
    expect(state.materialRequests.at(-1)?.method).toBe("PATCH");
    expect(state.readCounts.materials).toBe(reads);
    await stable();
    expect(state.errors).toEqual([]);
  });

  test("delete requires confirmation, stays locked during saving, and preserves the record after a missing result", async ({ page, context }) => {
    const state = await isolate(page, context);
    const target = state.materials[1];
    const wait = gate();
    state.materialPlans.set(target.id, [{ wait: wait.wait, outcome: "missing" }]);
    try {
      await page.goto("/learning");
      const stable = await watchTodoList(page, card(page, state.materials[0].title));
      const reads = state.readCounts.materials;
      await card(page, target.title).getByRole("button", { name: "删除", exact: true }).tap();
      const dialog = page.getByRole("dialog", { name: "删除学习资料", exact: true });
      await dialog.getByRole("button", { name: "保留资料", exact: true }).tap();
      expect(state.materialWrites).toBe(0);
      await card(page, target.title).getByRole("button", { name: "删除", exact: true }).tap();
      await dialog.getByRole("button", { name: "确认删除", exact: true }).tap();
      await expect(dialog.getByRole("button", { name: "正在删除…", exact: true })).toBeDisabled();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeVisible();
      wait.release();
      await expect(dialog.getByRole("alert")).toBeVisible();
      expect(state.materials.some((material) => material.id === target.id)).toBe(true);
      await dialog.getByRole("button", { name: "确认删除", exact: true }).tap();
      await expect(dialog).not.toBeVisible();
      await expect(card(page, target.title)).toHaveCount(0);
      await expect(page.getByLabel("搜索学习资料", { exact: true })).toBeFocused();
      expect(state.materials.some((material) => material.id === target.id)).toBe(false);
      expect(state.readCounts.materials).toBe(reads);
      await stable();
      expect(state.errors).toEqual([]);
    } finally { wait.release(); }
  });

  test("initial load errors have a retry, and small dark layouts support long content and enlarged text", async ({ page, context }, info) => {
    const state = await isolate(page, context);
    state.readPlans.set("materials", [{ fail: true }]);
    state.materials[0].title = "长标题" + "学习资料".repeat(12);
    state.materials[0].tags = ["long-tag-".repeat(12)];
    state.materials[0].category = "长分类".repeat(12);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.goto("/learning");
    await expect(page.locator("#main-content").getByRole("alert")).toBeVisible();
    await expect(page.getByRole("button", { name: "添加资料", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "重试加载", exact: true }).tap();
    await expect(card(page, state.materials[0].title)).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath("learning-small-dark.png"), fullPage: true });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await noOverflow(page);
    await card(page, state.materials[0].title).getByRole("button", { name: "查看笔记", exact: true }).tap();
    await noOverflow(page);
    await expect(page.getByRole("dialog").locator(".modal-panel")).toHaveCSS("transform", "none");
    expect(state.errors).toEqual([]);
  });
});

test.describe("welcome workspace", () => {
  test.use({ viewport: { width: 375, height: 900 }, hasTouch: true, isMobile: true });

  test("tasks are usable while reports are slow and material failure retries independently", async ({ page, context }) => {
    const state = await isolate(page, context);
    const slowReport = gate();
    state.readPlans.set("reports", [{ wait: slowReport.wait }]);
    state.readPlans.set("materials", [{ fail: true }]);
    try {
      await page.goto("/");
      const task = page.getByRole("link", { name: "在每日待办中查看：每天读书", exact: true });
      await expect(task).toBeVisible();
      const node = await task.elementHandle();
      await expect(page.getByRole("status", { name: "正在加载项目报告", exact: true })).toBeVisible();
      await expect(page.getByRole("region", { name: "学习资料加载状态" }).getByRole("alert")).toContainText("学习资料暂时无法加载");
      const before = { ...state.readCounts };
      await page.getByRole("button", { name: "重试资料", exact: true }).tap();
      await expect(page.getByRole("region", { name: "学习资料加载状态" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "学习资料", exact: true })).toContainText("2");
      expect(state.readCounts).toEqual({ ...before, materials: before.materials + 1 });
      expect(await node?.evaluate((element) => element.isConnected)).toBe(true);
      slowReport.release();
      await expect(page.getByText("example/toolkit", { exact: true })).toBeVisible();
      expect(state.errors).toEqual([]);
    } finally { slowReport.release(); }
  });

  test("a failed recurrence request only affects tasks", async ({ page, context }) => {
    const state = await isolate(page, context);
    state.failRecurrence = true;
    await page.goto("/");
    await expect(page.getByRole("region", { name: "今日待办", exact: true }).getByRole("alert")).toContainText("今日待办暂时无法加载");
    await expect(page.getByText("example/toolkit", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "学习资料", exact: true })).toContainText("2");
    const before = { ...state.readCounts };
    state.failRecurrence = false;
    await page.getByRole("button", { name: "重试待办", exact: true }).tap();
    await expect(page.getByRole("link", { name: "在每日待办中查看：每天读书", exact: true })).toBeVisible();
    expect(state.readCounts.materials).toBe(before.materials);
    expect(state.readCounts.reports).toBe(before.reports);
    expect(state.errors).toEqual([]);
  });

  test("refresh and failed report retry retain visible task and report content", async ({ page, context }) => {
    const state = await isolate(page, context);
    const slowReport = gate();
    try {
      await page.goto("/");
      const task = page.getByRole("link", { name: "在每日待办中查看：每天读书", exact: true });
      const report = page.getByText("example/toolkit", { exact: true });
      await expect(report).toBeVisible();
      await expect(page.getByRole("button", { name: "刷新概览", exact: true })).toBeEnabled();
      const taskNode = await task.elementHandle();
      const reportNode = await report.elementHandle();
      const initialY = await task.evaluate((element) => element.getBoundingClientRect().top + scrollY);
      state.readPlans.set("reports", [{ wait: slowReport.wait, fail: true }]);
      await page.getByRole("button", { name: "刷新概览", exact: true }).tap();
      await expect(page.getByRole("region", { name: "最近分析", exact: true })).toHaveAttribute("aria-busy", "true");
      await expect(task).toBeVisible();
      await expect(report).toBeVisible();
      await expect(page.getByRole("status", { name: /正在加载/ })).toHaveCount(0);
      expect(await task.evaluate((element) => element.getBoundingClientRect().top + scrollY)).toBeCloseTo(initialY, 0);
      slowReport.release();
      await expect(page.getByRole("region", { name: "最近分析", exact: true }).getByRole("alert")).toContainText("已保留上次内容");
      expect(await taskNode?.evaluate((element) => element.isConnected)).toBe(true);
      expect(await reportNode?.evaluate((element) => element.isConnected)).toBe(true);
      const before = { ...state.readCounts };
      await page.getByRole("button", { name: "重试报告", exact: true }).tap();
      await expect(page.getByRole("region", { name: "最近分析", exact: true })).toHaveAttribute("aria-busy", "false");
      await expect(page.getByRole("region", { name: "最近分析", exact: true }).getByRole("alert")).toHaveCount(0);
      expect(state.readCounts).toEqual({ ...before, reports: before.reports + 1 });
      expect(state.errors).toEqual([]);
    } finally { slowReport.release(); }
  });

  test("an empty account has one clear starting point and optional AI setup", async ({ page, context }, info) => {
    const state = await isolate(page, context);
    state.todos.splice(0);
    state.materials.splice(0);
    state.reports.splice(0);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "从第一条待办开始", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "工作区摘要", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "AI 可以稍后设置", exact: true })).toHaveAttribute("href", "/settings");
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath("welcome-first-task.png"), fullPage: true });
    await page.getByRole("link", { name: "创建第一条待办", exact: true }).tap();
    await expect(page.getByRole("heading", { name: "每日待办", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "添加任务", exact: true })).toBeEnabled();
    expect(state.errors).toEqual([]);
  });

  test("an empty day with future tasks is not treated as a new account", async ({ page, context }) => {
    const state = await isolate(page, context);
    const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    state.todos.splice(0, state.todos.length, todoFixture("77777777-7777-4777-8777-777777777777", "明天已有安排", { due_date: tomorrow }));
    state.materials.splice(0);
    state.reports.splice(0);
    await page.goto("/");
    await expect(page.getByText("今天还没有安排", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "工作区摘要", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "从第一条待办开始", exact: true })).toHaveCount(0);
    expect(state.errors).toEqual([]);
  });

  test("mobile shows tasks before statistics, keeps times and provides a real viewing link", async ({ page, context }, info) => {
    await isolate(page, context);
    await page.goto("/");
    const taskRegion = page.getByRole("region", { name: "今日待办", exact: true });
    const summary = page.getByRole("region", { name: "工作区摘要", exact: true });
    await expect(taskRegion.getByText("08:30", { exact: true })).toBeVisible();
    const taskBox = await taskRegion.boundingBox();
    const summaryBox = await summary.boundingBox();
    expect(summaryBox!.y).toBeGreaterThanOrEqual(taskBox!.y + taskBox!.height);
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath("welcome-mobile-tasks-first.png"), fullPage: true });
    await taskRegion.getByRole("link", { name: "在每日待办中查看：每天读书", exact: true }).tap();
    await expect(page).toHaveURL(/\/todos$/);
    await expect(todoRow(page, "每天读书")).toBeVisible();
  });

  test("password visibility preserves input, does not submit, and supports keyboard toggling", async ({ page, context }, info) => {
    const state = await isolate(page, context, false);
    for (const path of ["/login", "/register"]) {
      await page.goto(path);
      const password = page.getByLabel("密码", { exact: true });
      await password.fill("preview-password");
      await password.focus();
      const show = page.getByRole("button", { name: "显示密码", exact: true });
      const box = await show.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      await show.tap();
      await expect(password).toHaveAttribute("type", "text");
      await expect(password).toHaveValue("preview-password");
      await expect(password).toBeFocused();
      const hide = page.getByRole("button", { name: "隐藏密码", exact: true });
      await hide.focus();
      await page.keyboard.press("Space");
      await expect(password).toHaveAttribute("type", "password");
      await expect(password).toHaveValue("preview-password");
      if (path === "/login") await expect(password).toHaveAttribute("placeholder", "输入密码");
      else await expect(page.locator("#password-help")).toBeVisible();
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath(`welcome-${path.slice(1)}-password.png`), fullPage: true });
    }
    expect(state.errors).toEqual([]);
  });
});

for (const mode of [
  { name: "desktop light", width: 1440, theme: "light" },
  { name: "desktop dark", width: 1440, theme: "dark" },
  { name: "mobile light", width: 375, theme: "light" },
  { name: "mobile dark", width: 375, theme: "dark" },
] as const) {
  test(`${mode.name}: all workspace routes have no overflow or runtime errors`, async ({ page, context }, info) => {
    await page.setViewportSize({ width: mode.width, height: 1000 });
    await page.addInitScript((theme) => localStorage.setItem("toolkit-theme", theme), mode.theme);
    const state = await isolate(page, context);
    for (const [path, title, content] of [
      ["/", "今天，专注重要的事。", "每天读书"],
      ["/todos", "每日待办", "每天读书"],
      ["/learning", "学习资料", "React 组件设计笔记"],
      ["/github", "项目分析", "example/toolkit"],
      ["/settings", "AI 设置", "DeepSeek"],
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByText(content, { exact: true }).first()).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", mode.theme);
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath(`${path.replaceAll("/", "") || "overview"}.png`), fullPage: true });
    }
    expect(state.errors).toEqual([]);
  });
}

test("native dialog traps focus, restores the trigger, and opens instantly from keyboard", async ({ page, context }) => {
  await isolate(page, context);
  await page.goto("/todos");
  const trigger = page.locator("div.group").filter({ has: page.getByText("每天读书", { exact: true }) }).getByRole("button", { name: "编辑", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "编辑任务" });
  await expect(dialog.getByLabel("任务内容")).toBeFocused();
  expect(await dialog.locator(".modal-panel").evaluate((element) => getComputedStyle(element).transitionDuration.split(",").every((duration) => parseFloat(duration) === 0))).toBe(true);
  for (let index = 0; index < 20; index++) {
    await page.keyboard.press(index % 3 ? "Tab" : "Shift+Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  // Opening again must not wait for the previous exit animation/DOM cleanup.
  await page.keyboard.press("Enter");
  await expect(dialog.getByLabel("任务内容")).toBeFocused();
  await page.keyboard.press("Escape");
});

test("mobile drawer is modal, returns focus, navigates and closes when resized", async ({ page, context }, info) => {
  await isolate(page, context);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/todos");
  const trigger = page.getByRole("button", { name: "打开导航" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "工作区导航" });
  await expect(dialog).toBeVisible();
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.screenshot({ path: info.outputPath("mobile-drawer.png") });
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole("link", { name: "学习资料", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "学习资料" })).toBeVisible();
  await expect(dialog).not.toBeVisible();
  await trigger.click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
});

test("theme follows system until explicitly chosen, then survives reload", async ({ page, context }) => {
  await isolate(page, context);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/settings");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "切换到夜间样式", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("small text theme tokens meet 4.5:1 against the application surfaces", async ({ page, context }) => {
  await isolate(page, context);
  await page.goto("/settings");
  const ratios = await page.evaluate(() => {
    const luminance = (hex: string) => {
      const raw = hex.trim().replace("#", "");
      const full = raw.length === 3 ? raw.split("").map((value) => value + value).join("") : raw;
      const values = full.match(/.{2}/g)!.map((value) => parseInt(value, 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    };
    const results: { theme: string; foreground: string; background: string; ratio: number }[] = [];
    for (const theme of ["light", "dark"]) {
      document.documentElement.dataset.theme = theme;
      const style = getComputedStyle(document.documentElement);
      for (const foreground of ["--text-primary", "--text-secondary", "--text-tertiary", "--text-muted", "--text-faint"]) {
        for (const background of ["--app-bg", "--surface", "--surface-panel", "--control-bg"]) {
          const a = luminance(style.getPropertyValue(foreground));
          const b = luminance(style.getPropertyValue(background));
          results.push({ theme, foreground, background, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) });
        }
      }
    }
    return results;
  });
  for (const result of ratios) expect(result.ratio, JSON.stringify(result)).toBeGreaterThanOrEqual(4.5);
});

test("reduced motion removes panel movement and touch controls have 44px targets", async ({ page, context }, info) => {
  await isolate(page, context);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/todos");
  const row = page.locator("div.group").filter({ has: page.getByText("每天读书", { exact: true }) });
  await expect(row).toBeVisible();
  await noOverflow(page);
  for (const button of await row.getByRole("button").all()) {
    const box = await button.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await row.getByRole("button", { name: "更多操作：每天读书", exact: true }).click();
  await page.getByRole("menuitem", { name: "编辑", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".modal-panel")).toHaveCSS("transform", "none");
  await page.screenshot({ path: info.outputPath("mobile-edit.png") });
  await noOverflow(page);
});

test.describe("shared workspace authentication", () => {
  test("workspace navigation reuses one verified user without showing another blocking auth screen", async ({ page, context }) => {
    const state = await isolate(page, context);
    await page.goto("/todos");
    await expect(todoRow(page, "每天读书")).toBeVisible();
    expect(state.authReads).toBe(1);
    await page.evaluate(() => {
      document.body.dataset.authWaitFlash = "false";
      new MutationObserver((records) => {
        for (const record of records) for (const node of Array.from(record.addedNodes)) {
          if (node.textContent?.includes("正在检查登录状态")) document.body.dataset.authWaitFlash = "true";
        }
      }).observe(document.body, { childList: true, subtree: true });
    });
    for (const [label, title] of [["学习资料", "学习资料"], ["概览", "今天，专注重要的事。"], ["AI 设置", "AI 设置"], ["项目分析", "项目分析"], ["每日待办", "每日待办"]]) {
      await page.getByRole("navigation", { name: "主要导航", exact: true }).getByRole("link", { name: label, exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
    }
    expect(state.authReads).toBe(1);
    await expect(page.locator("body")).toHaveAttribute("data-auth-wait-flash", "false");
    expect(state.errors).toEqual([]);
  });

  test("initial auth failure hides protected data and can retry without a reload", async ({ page, context }) => {
    const state = await isolate(page, context);
    state.authPlans.push({ status: 400 });
    await page.goto("/todos");
    await expect(page.getByText("暂时无法确认登录状态", { exact: true })).toBeVisible();
    await expect(page.locator("#main-content")).toHaveCount(0);
    expect(state.todoReads).toBe(0);
    await page.getByRole("button", { name: "重试", exact: true }).click();
    await expect(todoRow(page, "每天读书")).toBeVisible();
    expect(state.authReads).toBe(2);
    expect(state.errors).toEqual([]);
  });

  test("background validation is deduplicated, preserves content on network failure and handles revocation", async ({ page, context }) => {
    const state = await isolate(page, context);
    await page.clock.install();
    await page.goto("/todos");
    await expect(todoRow(page, "每天读书")).toBeVisible();
    const survivor = await todoRow(page, "每天读书").elementHandle();
    const slow = gate();
    state.authPlans.push({ wait: slow.wait, status: 400 });
    try {
      await page.clock.fastForward(61_000);
      await page.evaluate(() => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
      await expect.poll(() => state.authReads).toBe(2);
      await expect(todoRow(page, "每天读书")).toBeVisible();
      await expect(page.getByText("正在检查登录状态...", { exact: true })).toHaveCount(0);
      slow.release();
      await expect(page.getByText("暂时无法更新登录状态，现有页面仍可使用。", { exact: true })).toBeVisible();
      expect(await survivor!.evaluate((node) => node.isConnected)).toBe(true);
      await page.getByRole("button", { name: "重试连接", exact: true }).click();
      await expect(page.getByRole("button", { name: "重试连接", exact: true })).toHaveCount(0);
      expect(state.authReads).toBe(3);
      state.authPlans.push({ status: 401 });
      await page.clock.fastForward(61_000);
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(page).toHaveURL(/\/login\?next=%2Ftodos/);
      await expect(page.locator("#main-content")).toHaveCount(0);
    } finally { slow.release(); }
    expect(state.errors).toEqual([]);
  });

  test("sign-out updates the shared state immediately and stale validation cannot restore private content", async ({ page, context }) => {
    const state = await isolate(page, context);
    await page.clock.install();
    await page.goto("/todos");
    await expect(todoRow(page, "每天读书")).toBeVisible();
    const slow = gate();
    state.authPlans.push({ wait: slow.wait });
    try {
      await page.clock.fastForward(61_000);
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect.poll(() => state.authReads).toBe(2);
      await page.evaluate(() => {
        const channel = new BroadcastChannel("sb-frontend-preview-auth-token");
        channel.postMessage({ event: "SIGNED_OUT", session: null });
        channel.close();
      });
      await expect(page).toHaveURL(/\/login/);
      await expect(page.locator("#main-content")).toHaveCount(0);
      slow.release();
      await expect(page.getByRole("heading", { name: "欢迎回到 Toolkit", exact: true })).toBeVisible();
      await expect(page.locator("#main-content")).toHaveCount(0);
    } finally { slow.release(); }
    expect(state.errors).toEqual([]);
  });

  test("new sign-in restores a protected destination and ordinary logout leaves no protected page", async ({ page, context }) => {
    const state = await isolate(page, context, false);
    await page.goto("/todos");
    await expect(page).toHaveURL(/\/login\?next=%2Ftodos/);
    await page.getByLabel("邮箱", { exact: true }).fill("preview@example.test");
    await page.getByLabel("密码", { exact: true }).fill("preview-password");
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page.getByRole("heading", { name: "每日待办", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "退出登录", exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("#main-content")).toHaveCount(0);
    expect(state.errors).toEqual([]);
  });

  test("an account change hides the old page during verification and does not reuse its task draft", async ({ page, context }) => {
    const state = await isolate(page, context);
    const slow = gate();
    await page.goto("/todos");
    await page.getByRole("button", { name: "添加任务", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "添加任务", exact: true });
    await dialog.getByLabel("任务内容", { exact: true }).fill("原账号未提交内容");
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    state.authUser = { ...user, id: "88888888-8888-4888-8888-888888888888", email: "second@example.test" };
    state.authPlans.push({ wait: slow.wait });
    try {
      await page.evaluate((session) => {
        const channel = new BroadcastChannel("sb-frontend-preview-auth-token");
        channel.postMessage({ event: "SIGNED_IN", session });
        channel.close();
      }, previewSession(state.authUser));
      await expect(page.getByText("正在检查登录状态...", { exact: true })).toBeVisible();
      await expect(page.locator("#main-content")).toHaveCount(0);
      slow.release();
      await expect(page.getByText("second@example.test", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "添加任务", exact: true }).click();
      await expect(dialog.getByLabel("任务内容", { exact: true })).toHaveValue("");
      expect(state.todoCreates).toHaveLength(0);
    } finally { slow.release(); }
    expect(state.errors).toEqual([]);
  });

  for (const next of ["https://example.test", "//example.test", "/\\example.test"]) {
    test("authenticated login rejects external or ambiguous return target " + next, async ({ page, context }) => {
      const state = await isolate(page, context);
      await page.goto("/login?next=" + encodeURIComponent(next));
      await expect(page).toHaveURL("/");
      await expect(page.getByRole("heading", { name: "今天，专注重要的事。", exact: true })).toBeVisible();
      expect(state.errors).toEqual([]);
    });
  }
});

test.describe("task creation dialog", () => {
  test.use({ hasTouch: true });

  test("mobile dialog has all scheduling options, uses the selected date, and saves actual values", async ({ page, context }, info) => {
    const state = await isolate(page, context);
    await page.setViewportSize({ width: 375, height: 950 });
    await page.goto("/todos");
    await expect(todoRow(page, "每天读书")).toBeVisible();
    await expect(page.getByLabel("任务内容", { exact: true })).toHaveCount(0);
    const selected = "2026-10-19";
    await page.getByLabel("选择任务日期").fill(selected);
    const trigger = page.getByRole("button", { name: "添加任务", exact: true });
    await expect(trigger).toBeEnabled();
    await trigger.tap();
    const dialog = page.getByRole("dialog", { name: "添加任务", exact: true });
    await expect(dialog.getByLabel("任务内容", { exact: true })).toBeFocused();
    await expect(dialog.getByLabel("任务日期", { exact: true })).toHaveValue(selected);
    await expect(dialog.getByLabel("重复规则", { exact: true })).toHaveValue("none");
    await dialog.getByLabel("任务内容", { exact: true }).fill("练习新的知识");
    await dialog.getByLabel("计划时间", { exact: true }).fill("09:30");
    await dialog.getByRole("group", { name: "任务优先级", exact: true }).getByRole("button", { name: "高 · P1", exact: true }).tap();
    await dialog.getByLabel("重复规则", { exact: true }).selectOption("weekly");
    await expect(dialog.getByText(/每周一出现/)).toBeVisible();
    await expect(dialog.getByText(/不会发送提醒/)).toBeVisible();
    await expect(dialog.locator(".modal-panel")).toHaveCSS("opacity", "1");
    await expect(dialog.getByRole("button", { name: "高 · P1", exact: true })).toHaveAttribute("aria-pressed", "true");
    await dialog.evaluate(async (node) => { await Promise.all(node.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {}))); });
    await page.screenshot({ path: info.outputPath("task-create-mobile.png") });
    await dialog.getByRole("button", { name: "添加", exact: true }).tap();
    await expect(dialog).not.toBeVisible();
    expect(state.todoCreates[0]).toMatchObject({ p_text: "练习新的知识", p_due_date: selected, p_time: "09:30", p_repeat: "weekly", p_priority: 1 });
    await expect(todoRow(page, "练习新的知识")).toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.tap();
    await expect(dialog.getByLabel("任务内容", { exact: true })).toHaveValue("");
    await expect(dialog.getByLabel("计划时间", { exact: true })).toHaveValue("");
    await expect(dialog.getByLabel("重复规则", { exact: true })).toHaveValue("none");
    expect(state.errors).toEqual([]);
  });

  test("cancellation retains the page draft and time can be cleared without adding a task", async ({ page, context }) => {
    const state = await isolate(page, context);
    await page.goto("/todos");
    const trigger = page.getByRole("button", { name: "添加任务", exact: true });
    await trigger.tap();
    const dialog = page.getByRole("dialog", { name: "添加任务", exact: true });
    await dialog.getByLabel("任务内容", { exact: true }).fill("稍后继续填写");
    await dialog.getByLabel("计划时间", { exact: true }).fill("10:20");
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await trigger.tap();
    await expect(dialog.getByLabel("任务内容", { exact: true })).toHaveValue("稍后继续填写");
    await expect(dialog.getByLabel("计划时间", { exact: true })).toHaveValue("10:20");
    await dialog.getByRole("button", { name: "清除计划时间", exact: true }).tap();
    await expect(dialog.getByLabel("计划时间", { exact: true })).toHaveValue("");
    await dialog.getByRole("button", { name: "添加", exact: true }).tap();
    await expect(dialog).not.toBeVisible();
    expect(state.todoCreates).toHaveLength(1);
    expect(state.todoCreates[0]).toMatchObject({ p_time: null, p_repeat: "none" });
    expect(state.errors).toEqual([]);
  });

  test("failed and slow creation retain input and retry id, and lock dismissal and duplicate submits", async ({ page, context }) => {
    const state = await isolate(page, context);
    const slow = gate();
    state.createPlans.push({ outcome: "error" }, { wait: slow.wait });
    try {
      await page.goto("/todos");
      await expect(todoRow(page, "每天读书")).toBeVisible();
      const stable = await watchTodoList(page, todoRow(page, "每天读书"));
      await page.getByRole("button", { name: "添加任务", exact: true }).tap();
      const dialog = page.getByRole("dialog", { name: "添加任务", exact: true });
      await dialog.getByLabel("任务内容", { exact: true }).fill("失败后仍保留");
      await dialog.getByLabel("计划时间", { exact: true }).fill("18:00");
      await dialog.getByRole("button", { name: "添加", exact: true }).tap();
      await expect(dialog.getByRole("alert")).toContainText("模拟添加失败");
      await expect(dialog.getByLabel("任务内容", { exact: true })).toHaveValue("失败后仍保留");
      await expect(dialog.getByLabel("计划时间", { exact: true })).toHaveValue("18:00");
      await dialog.getByRole("button", { name: "添加", exact: true }).tap();
      await expect.poll(() => state.todoCreates.length).toBe(2);
      await expect(dialog.getByRole("button", { name: "正在添加…", exact: true })).toBeDisabled();
      await page.keyboard.press("Escape");
      await dialog.getByRole("button", { name: "关闭", exact: true }).tap();
      await expect(dialog).toBeVisible();
      slow.release();
      await expect(dialog).not.toBeVisible();
      expect(state.todoCreates[0].p_id).toBe(state.todoCreates[1].p_id);
      expect(state.todos.filter((row) => row.text === "失败后仍保留")).toHaveLength(1);
      await stable();
    } finally { slow.release(); }
    expect(state.errors).toEqual([]);
  });

  test("changing task date describes weekday rollover and confirms where the created task belongs", async ({ page, context }) => {
    const state = await isolate(page, context);
    await page.goto("/todos");
    await page.getByRole("button", { name: "添加任务", exact: true }).tap();
    const dialog = page.getByRole("dialog", { name: "添加任务", exact: true });
    await dialog.getByLabel("任务内容", { exact: true }).fill("工作日练习");
    await dialog.getByLabel("任务日期", { exact: true }).fill("2026-10-17");
    await dialog.getByLabel("重复规则", { exact: true }).selectOption("weekdays");
    await expect(dialog.getByText(/从 2026-10-19 开始/)).toBeVisible();
    await dialog.getByRole("button", { name: "添加", exact: true }).tap();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("任务已添加，安排在 2026-10-19。可切换日期查看。", { exact: true })).toBeVisible();
    expect(state.todoCreates[0]).toMatchObject({ p_due_date: "2026-10-17", p_repeat: "weekdays" });
    expect(state.errors).toEqual([]);
  });

  test("small dark dialog stays inside the panel at 200 percent text size and supports keyboard focus", async ({ page, context }, info) => {
    const state = await isolate(page, context);
    await page.setViewportSize({ width: 320, height: 1000 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.goto("/todos");
    const trigger = page.getByRole("button", { name: "添加任务", exact: true });
    await expect(trigger).toBeEnabled();
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "添加任务", exact: true });
    await expect(dialog.getByLabel("任务内容", { exact: true })).toBeFocused();
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await noOverflow(page);
    expect(await dialog.locator(".modal-panel").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press(i % 2 ? "Tab" : "Shift+Tab");
      expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    }
    await dialog.locator(".modal-panel").evaluate((node) => node.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath("task-create-large-dark.png") });
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    expect(state.errors).toEqual([]);
  });
});

test.describe("friendly learning library", () => {
  test.use({ hasTouch: true });
  const draftKey = `toolkit:material-draft:${userId}:new`;
  const card = (page: Page, title: string) => page.getByRole("article", { name: title, exact: true });

  test("quick capture keeps optional fields collapsed and offers touch-sized category suggestions", async ({ page, context }, info) => {
    const state = await isolate(page, context);
    await page.setViewportSize({ width: 375, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/learning");
    await page.getByRole("button", { name: "添加资料", exact: true }).tap();
    const dialog = page.getByRole("dialog", { name: "添加资料", exact: true });
    await expect(dialog.getByLabel("标题")).toBeFocused();
    await expect(dialog.getByLabel("备注")).toBeVisible();
    await expect(dialog.getByLabel("分类", { exact: true })).not.toBeVisible();
    await dialog.getByLabel("标题").fill("快速收藏");
    await dialog.locator(".modal-panel").evaluate((node) => node.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath("learning-quick-capture.png") });
    await dialog.getByRole("button", { name: /更多选项/ }).tap();
    const suggestion = dialog.getByRole("group", { name: "已有分类建议" }).getByRole("button", { name: "前端", exact: true });
    expect((await suggestion.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await suggestion.tap();
    await expect(dialog.getByLabel("分类", { exact: true })).toHaveValue("前端");
    await dialog.getByLabel("分类", { exact: true }).fill("新分类");
    await dialog.getByLabel("标签（逗号分隔）").fill("基础，基础、收藏");
    await page.screenshot({ path: info.outputPath("learning-more-options.png") });
    await dialog.getByRole("button", { name: "添加", exact: true }).tap();
    await expect(dialog).not.toBeVisible();
    const saved = state.materials.find((item) => item.title === "快速收藏")!;
    expect(saved).toMatchObject({ category: "新分类", status: "todo", priority: 2, tags: ["基础", "收藏"] });
    expect(await page.evaluate((key) => sessionStorage.getItem(key), draftKey)).toBeNull();
    await noOverflow(page);
    expect(state.errors).toEqual([]);
  });

  test("Escape and cancel protect input, retained drafts survive refresh and keep the retry id", async ({ page, context }) => {
    const state = await isolate(page, context);
    await page.goto("/learning");
    await page.getByRole("button", { name: "添加资料", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "添加资料", exact: true });
    await dialog.getByLabel("标题").fill("尚未保存的课程");
    await dialog.getByLabel("备注").fill("学到第三章，下次继续");
    await expect.poll(() => page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? "null")?.title, draftKey)).toBe("尚未保存的课程");
    const original = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), draftKey);
    await page.keyboard.press("Escape");
    await expect(dialog.getByRole("alert", { name: "未保存的修改" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "继续编辑", exact: true })).toBeFocused();
    await dialog.getByRole("button", { name: "继续编辑", exact: true }).click();
    await expect(dialog.getByLabel("备注")).toHaveValue("学到第三章，下次继续");
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await dialog.getByRole("button", { name: "保留草稿并关闭", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(state.materialWrites).toBe(0);
    page.once("dialog", (prompt) => prompt.accept());
    await page.reload();
    await page.getByRole("button", { name: "添加资料", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "添加资料", exact: true });
    await expect(dialog.getByText("已恢复此标签页中的未保存草稿。", { exact: true })).toBeVisible();
    await expect(dialog.getByLabel("标题")).toHaveValue("尚未保存的课程");
    await expect(dialog.getByLabel("备注")).toHaveValue("学到第三章，下次继续");
    await dialog.getByRole("button", { name: "添加", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(state.materialIds).toEqual([original.id]);
    expect(await page.evaluate((key) => sessionStorage.getItem(key), draftKey)).toBeNull();
    expect(state.errors).toEqual([]);
  });

  test("clearing and discarding drafts are explicit and never delete existing records", async ({ page, context }) => {
    const state = await isolate(page, context);
    await page.goto("/learning");
    await card(page, state.materials[0].title).getByRole("button", { name: "编辑", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "编辑资料", exact: true });
    await dialog.getByLabel("标题").fill("暂存编辑");
    await dialog.getByRole("button", { name: "清除草稿", exact: true }).click();
    await dialog.getByRole("button", { name: "保留内容", exact: true }).click();
    await expect(dialog.getByLabel("标题")).toHaveValue("暂存编辑");
    await dialog.getByRole("button", { name: "清除草稿", exact: true }).click();
    await dialog.getByRole("button", { name: "确认清除草稿", exact: true }).click();
    await expect(dialog.getByLabel("标题")).toHaveValue(state.materials[0].title);
    await dialog.getByLabel("备注").fill("不想保留的修改");
    await dialog.getByRole("button", { name: "关闭", exact: true }).click();
    await dialog.getByRole("button", { name: "放弃修改并关闭", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await card(page, state.materials[0].title).getByRole("button", { name: "编辑", exact: true }).click();
    await expect(dialog.getByLabel("备注")).toHaveValue(state.materials[0].notes!);
    expect(state.materialWrites).toBe(0);
    expect(state.materials).toHaveLength(2);
    expect(state.errors).toEqual([]);
  });

  test("unavailable draft storage gives honest feedback and still permits saving", async ({ page, context }) => {
    const state = await isolate(page, context);
    await page.addInitScript(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith("toolkit:material-draft:")) throw new DOMException("Preview storage full", "QuotaExceededError");
        return original.call(this, key, value);
      };
    });
    await page.goto("/learning");
    await page.getByRole("button", { name: "添加资料", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "添加资料", exact: true });
    await dialog.getByLabel("标题").fill("存储不可用仍能保存");
    await expect(dialog.getByText("无法保留草稿，请勿关闭页面。", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog.getByRole("button", { name: "保留草稿并关闭", exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "继续编辑", exact: true }).click();
    await dialog.getByRole("button", { name: "添加", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(state.materialWrites).toBe(1);
    expect(state.errors).toEqual([]);
  });

  test("saving locks dismissal and duplicate submissions without losing the draft", async ({ page, context }) => {
    const state = await isolate(page, context);
    const wait = gate();
    try {
      await page.goto("/learning");
      await page.getByRole("button", { name: "添加资料", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "添加资料", exact: true });
      await dialog.getByLabel("标题").fill("等待同步");
      await expect.poll(() => page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? "null")?.id, draftKey)).toBeTruthy();
      const id = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!).id, draftKey);
      state.materialPlans.set(id, [{ wait: wait.wait }]);
      await dialog.getByRole("button", { name: "添加", exact: true }).click();
      await expect.poll(() => state.materialWrites).toBe(1);
      await page.keyboard.press("Escape");
      await dialog.getByRole("button", { name: "关闭", exact: true }).click();
      await expect(dialog.getByLabel("标题")).toBeDisabled();
      await expect(dialog.getByRole("alert", { name: "未保存的修改" })).toHaveCount(0);
      wait.release();
      await expect(dialog).not.toBeVisible();
      expect(state.materialWrites).toBe(1);
    } finally { wait.release(); }
    expect(state.errors).toEqual([]);
  });

  test("filters and scroll position return after navigating away, while explicit links override memory", async ({ page, context }) => {
    const state = await isolate(page, context);
    for (let i = 0; i < 28; i++) state.materials.push({ ...state.materials[0], id: `77777777-7777-4777-8777-${String(i).padStart(12, "0")}`, title: `React 学习资料 ${i}` });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/learning");
    await expect(card(page, state.materials[0].title)).toBeVisible();
    await page.getByLabel("搜索学习资料", { exact: true }).fill("React");
    await page.getByLabel("资料分类", { exact: true }).selectOption("前端");
    await page.getByRole("group", { name: "学习状态筛选" }).getByRole("button", { name: "进行中", exact: true }).click();
    await page.getByLabel("资料排序", { exact: true }).selectOption("priority");
    await expect(page).toHaveURL(/sort=priority/);
    await page.evaluate(() => window.scrollTo(0, 1100));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(1100);
    await expect.poll(() => page.evaluate((id) => JSON.parse(sessionStorage.getItem(`toolkit:learning-view:${id}`)!)?.scroll, userId)).toBe(1100);
    await page.getByRole("link", { name: "每日待办", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "每日待办" })).toBeVisible();
    await page.getByRole("link", { name: "学习资料", exact: true }).click();
    await expect(page.getByLabel("搜索学习资料", { exact: true })).toHaveValue("React");
    await expect(page.getByLabel("资料分类", { exact: true })).toHaveValue("前端");
    await expect(page.getByLabel("资料排序", { exact: true })).toHaveValue("priority");
    await expect(page.getByRole("group", { name: "学习状态筛选" }).getByRole("button", { name: "进行中", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(1100);
    await page.goto("/learning?q=无障碍&status=todo");
    await expect(page.getByLabel("搜索学习资料", { exact: true })).toHaveValue("无障碍");
    await expect(page.getByLabel("资料分类", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("资料排序", { exact: true })).toHaveValue("newest");
    await expect(card(page, state.materials[1].title)).toBeVisible();
    expect(state.materialWrites).toBe(0);
    expect(state.errors).toEqual([]);
  });

  test("foreign-account drafts and view memory are ignored, and malformed URL options are safe", async ({ page, context }) => {
    const state = await isolate(page, context);
    await page.addInitScript(() => {
      sessionStorage.setItem("toolkit:material-draft:other-account:new", JSON.stringify({ title: "另一个账号的私人笔记" }));
      sessionStorage.setItem("toolkit:learning-view:other-account", JSON.stringify({ view: { query: "私人搜索" }, scroll: 900 }));
    });
    await page.goto("/learning?status=unknown&sort=unknown&utm=test");
    await expect(page.getByLabel("搜索学习资料", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("资料排序", { exact: true })).toHaveValue("newest");
    await expect(page).toHaveURL(/\/learning\?utm=test$/);
    await page.getByRole("button", { name: "添加资料", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "添加资料", exact: true });
    await expect(dialog.getByLabel("标题")).toHaveValue("");
    await expect(dialog.getByText(/已恢复/)).toHaveCount(0);
    expect(state.materialWrites).toBe(0);
    expect(state.errors).toEqual([]);
  });

  test("switching accounts cannot restore the previous account's private draft or filters", async ({ page, context }) => {
    const state = await isolate(page, context);
    await page.goto("/learning");
    await page.getByLabel("搜索学习资料", { exact: true }).fill("原账号私密查找");
    await page.getByRole("button", { name: "添加资料", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "添加资料", exact: true });
    await dialog.getByLabel("标题").fill("原账号私密笔记");
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await dialog.getByRole("button", { name: "保留草稿并关闭", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    state.authUser = { ...user, id: "88888888-8888-4888-8888-888888888888" };
    await page.goto("/learning");
    await expect(page.getByLabel("搜索学习资料", { exact: true })).toHaveValue("");
    await page.getByRole("button", { name: "添加资料", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "添加资料", exact: true });
    await expect(dialog.getByLabel("标题")).toHaveValue("");
    await expect(dialog.getByText(/已恢复/)).toHaveCount(0);
    expect(await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!)?.title, draftKey)).toBe("原账号私密笔记");
    expect(state.materialWrites).toBe(0);
    expect(state.errors).toEqual([]);
  });

  test("small dark editor supports large text, keyboard groups, and backdrop dismissal protection", async ({ page, context }, info) => {
    const state = await isolate(page, context);
    await page.setViewportSize({ width: 320, height: 1000 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.goto("/learning");
    await page.getByRole("button", { name: "添加资料", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "添加资料", exact: true });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await dialog.getByLabel("标题").fill("长标题与未保存笔记");
    await dialog.getByLabel("备注").fill("学习笔记".repeat(25));
    await dialog.getByRole("button", { name: /更多选项/ }).click();
    await noOverflow(page);
    expect(await dialog.locator(".modal-panel").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await expect(dialog.getByRole("group", { name: "学习状态", exact: true })).toBeVisible();
    await dialog.locator(".modal-panel").evaluate((node) => node.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath("learning-editor-large-dark.png") });
    await dialog.evaluate((node) => node.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await expect(dialog.getByRole("alert", { name: "未保存的修改" })).toBeVisible();
    expect(await dialog.locator(".modal-panel").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await dialog.locator(".modal-panel").evaluate((node) => node.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath("learning-unsaved-large-dark.png") });
    await dialog.getByRole("button", { name: "继续编辑", exact: true }).click();
    await expect(dialog.getByLabel("标题")).toHaveValue("长标题与未保存笔记");
    expect(state.materialWrites).toBe(0);
    expect(state.errors).toEqual([]);
  });
});

test("material save failure stays inside the dialog and retains the draft", async ({ page, context }) => {
  const state = await isolate(page, context);
  state.failMaterial = true;
  await page.goto("/learning");
  await page.getByRole("button", { name: "添加资料", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "添加资料" });
  await dialog.getByLabel("标题").fill("保存失败后仍保留这段内容");
  await dialog.getByRole("button", { name: "添加", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("模拟保存失败");
  await expect(dialog.getByLabel("标题")).toHaveValue("保存失败后仍保留这段内容");
  state.failMaterial = false;
  await dialog.getByRole("button", { name: "添加", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(state.materialWrites).toBe(2);
  expect(state.materialIds[0]).toBe(state.materialIds[1]);
});

test("material creation gets a fresh draft when reopened during the exit transition", async ({ page, context }) => {
  const state = await isolate(page, context);
  await page.goto("/learning");
  await page.getByRole("button", { name: "添加资料", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "添加资料" });
  await dialog.getByLabel("标题").fill("第一份资料");
  // Reopen as soon as the native dialog closes, before its exit cleanup finishes.
  await dialog.evaluate((element) => {
    element.addEventListener("close", () => {
      const button = Array.from(document.querySelectorAll<HTMLButtonElement>("main button")).find((item) => item.textContent?.trim() === "添加资料");
      button?.click();
    }, { once: true });
  });
  await dialog.getByRole("button", { name: "添加", exact: true }).click();
  await expect(dialog.getByLabel("标题")).toHaveValue("");
  await dialog.getByLabel("标题").fill("第二份资料");
  await dialog.getByRole("button", { name: "添加", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(state.materialIds).toHaveLength(2);
  expect(state.materialIds[0]).not.toBe(state.materialIds[1]);
});

test("mobile layout accommodates enlarged text without horizontal scrolling", async ({ page, context }) => {
  await isolate(page, context);
  await page.setViewportSize({ width: 375, height: 1000 });
  for (const path of ["/", "/todos", "/learning", "/settings"]) {
    await page.goto(path);
    await expect(page.locator("#main-content h1")).toBeVisible();
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await noOverflow(page);
  }
});

test("report clipboard feedback and persistent AI sheet remain usable", async ({ page, context }, info) => {
  const state = await isolate(page, context);
  await page.addInitScript(() => {
    let calls = 0;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { if (++calls === 1) throw new Error("preview clipboard failure"); } } });
  });
  await page.goto("/github");
  await page.getByRole("button", { name: /example\/toolkit/ }).click();
  await page.getByRole("button", { name: "复制", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "复制失败" })).toBeVisible();
  await page.getByRole("button", { name: "复制", exact: true }).click();
  await expect(page.getByRole("button", { name: "已复制" })).toBeVisible();
  await page.getByRole("button", { name: "问 AI", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("向 AI 追问")).toBeVisible();
  await dialog.getByLabel("向 AI 追问").fill("关闭后保留的草稿");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "问 AI", exact: true }).click();
  await expect(dialog.getByLabel("向 AI 追问")).toHaveValue("关闭后保留的草稿");
  await page.screenshot({ path: info.outputPath("report-chat.png"), fullPage: true });
  expect(state.errors).toEqual([]);
});

test("login, registration and recovery pages stay accessible without a session", async ({ page, context }, info) => {
  const state = await isolate(page, context, false);
  await page.setViewportSize({ width: 375, height: 900 });
  for (const [path, heading] of [["/login", "欢迎回到 Toolkit"], ["/register", "开启你的个人工作区"], ["/forgot-password", "找回密码"], ["/update-password", "设置新密码"]]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`${path.slice(1)}.png`), fullPage: true });
  }
  await page.goto("/todos");
  await expect(page).toHaveURL(/\/login\?next=/);
  await expect(page.getByRole("heading", { name: "欢迎回到 Toolkit" })).toBeVisible();
  expect(state.errors).toEqual([]);
});
