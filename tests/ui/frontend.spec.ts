import { test, expect, type Page, type BrowserContext, type Locator } from "@playwright/test";
import { shiftDate } from "../../lib/todo-dates";

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
type ReadSection = "todos";
type ReadPlan = { wait?: Promise<void>; fail?: boolean };

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
  const state = {
    errors, authUser: user, authenticated, authReads: 0, authPlans: [] as { wait?: Promise<void>; status?: number }[],
    todoCreates: [] as Record<string, unknown>[], createPlans: [] as TodoPatchPlan[],
    todoEdits: [] as Record<string, unknown>[], editPlans: [] as TodoPatchPlan[],
    todos, todoReads: 0, todoReadDates: [] as string[], todoWrites: [] as { id: string; patch: Partial<TodoFixture> }[],
    todoPatchPlans: new Map<string, TodoPatchPlan[]>(),
    holdTodoReads: undefined as Promise<void> | undefined,
    readPlans: new Map<ReadSection, ReadPlan[]>(),
    readCounts: { todos: 0 },
    failRecurrence: false,
  };
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === "127.0.0.1") return route.continue();
    // Deny every unexpected external request; never touch production data.
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
        if (plan?.outcome === "empty") return respond(null);
        if (plan?.outcome === "missing") return respond({ id: "unrelated-task" });
        if (!todos.some((row) => row.id === payload.p_id)) todos.push(todoFixture(payload.p_id, payload.p_text, {
          priority: payload.p_priority, due_date: payload.p_due_date, scheduled_time: payload.p_time,
          repeat_rule: payload.p_repeat, series_id: payload.p_repeat === "none" ? null : payload.p_id, position: payload.p_position,
        }));
        const saved = todos.find((row) => row.id === payload.p_id)!;
        return respond(request.headers().accept?.includes("application/vnd.pgrst.object+json") ? saved : [saved]);
      }
      if (url.pathname.endsWith("/todo_edit")) {
        const payload = request.postDataJSON();
        state.todoEdits.push(payload);
        const plan = state.editPlans.shift();
        if (plan?.wait) await plan.wait;
        if (plan?.outcome === "error") return respond({ message: "模拟编辑失败，请重试", code: "P0001" }, 400);
        const row = todos.find((item) => item.id === payload.p_id);
        if (!row) return respond({ message: "任务已不存在，请刷新后重试", code: "P0001" }, 400);
        // Only the edited row is modeled here. Real series effects are covered
        // by the PostgreSQL tests; todo_edit intentionally returns void/null.
        const newSchedule = !row.series_id || (row.repeat_rule === "none" && payload.p_repeat !== "none" && payload.p_scope === "single");
        let dueDate = payload.p_due_date;
        if (newSchedule && payload.p_repeat === "weekdays") {
          const due = new Date(`${dueDate}T00:00:00Z`);
          while ([0, 6].includes(due.getUTCDay())) due.setUTCDate(due.getUTCDate() + 1);
          dueDate = due.toISOString().slice(0, 10);
        }
        Object.assign(row, { text: payload.p_text, priority: payload.p_priority, due_date: dueDate, scheduled_time: payload.p_time });
        if (newSchedule || payload.p_scope === "future") row.repeat_rule = payload.p_repeat;
        return respond(null);
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
      if (due?.startsWith("eq.")) state.todoReadDates.push(due.slice(3));
      const filtered = todos.filter((row) =>
        url.searchParams.getAll("due_date").every((value) =>
          value.startsWith("eq.") ? row.due_date === value.slice(3)
            : value.startsWith("gte.") ? row.due_date >= value.slice(4)
            : value.startsWith("lte.") ? row.due_date <= value.slice(4)
            : value.startsWith("lt.") ? row.due_date < value.slice(3) : false) &&
        (!url.searchParams.has("user_id") || row.user_id === url.searchParams.get("user_id")?.slice(3)) &&
        (!url.searchParams.has("done") || row.done === (url.searchParams.get("done") === "eq.true")) &&
        (!url.searchParams.has("skipped") || row.skipped === (url.searchParams.get("skipped") === "eq.true")),
      );
      if (url.searchParams.get("order")?.startsWith("due_date")) filtered.sort((a, b) => a.due_date.localeCompare(b.due_date) || a.position - b.position || a.id.localeCompare(b.id));
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? filtered.length);
      // Snapshot before waiting, as a real in-flight read may return stale data.
      const data = filtered.slice(offset, offset + limit).map((row) => ({ ...row }));
      if (state.holdTodoReads) await state.holdTodoReads;
      return plannedRead("todos", data, { "content-range": `${offset}-${Math.max(offset + data.length - 1, offset)}/${filtered.length}` });
    }
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
      ["/week", "一周计划", "本周"],
      ["/review", "行动回顾", "每天的计划与完成情况"],
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
  await dialog.getByRole("link", { name: "一周计划", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "一周计划" })).toBeVisible();
  await expect(dialog).not.toBeVisible();
  await trigger.click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
});

test("theme follows system until explicitly chosen, then survives reload", async ({ page, context }) => {
  await isolate(page, context);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/review");
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
  await page.goto("/review");
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
    for (const [label, title] of [["一周计划", "一周计划"], ["概览", "今天，专注重要的事。"], ["行动回顾", "行动回顾"], ["每日待办", "每日待办"]]) {
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

test.describe("safe task editing", () => {
  async function openEditor(page: Page, title = "每天读书") {
    await todoRow(page, title).getByRole("button", { name: "编辑", exact: true }).click();
    return page.getByRole("dialog", { name: "编辑任务", exact: true });
  }

  test("all close paths protect modified input and discard leaves the saved task intact", async ({ page, context }, info) => {
    const state = await isolate(page, context);
    await page.goto("/todos");
    let dialog = await openEditor(page);
    await expect(dialog.getByRole("button", { name: "保存", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    const trigger = todoRow(page, "每天读书").getByRole("button", { name: "编辑", exact: true });
    await expect(trigger).toBeFocused();
    dialog = await openEditor(page);
    await dialog.getByLabel("任务内容", { exact: true }).fill("尚未保存的阅读计划");
    await dialog.getByLabel("计划时间", { exact: true }).fill("09:15");
    for (const close of ["escape", "cancel", "close", "backdrop"]) {
      if (close === "escape") await page.keyboard.press("Escape");
      else if (close === "backdrop") await page.mouse.click(4, 4);
      else await dialog.getByRole("button", { name: close === "cancel" ? "取消" : "关闭", exact: true }).click();
      await expect(dialog.getByRole("alert", { name: "未保存的任务修改" })).toBeVisible();
      await expect(dialog.getByRole("button", { name: "继续编辑", exact: true })).toBeFocused();
      await dialog.getByRole("button", { name: "继续编辑", exact: true }).click();
      await expect(dialog.getByLabel("任务内容", { exact: true })).toBeFocused();
      await expect(dialog.getByLabel("任务内容", { exact: true })).toHaveValue("尚未保存的阅读计划");
      await expect(dialog.getByLabel("计划时间", { exact: true })).toHaveValue("09:15");
    }
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await page.screenshot({ path: info.outputPath("task-edit-discard-confirmation.png") });
    await dialog.getByRole("button", { name: "放弃修改并关闭", exact: true }).click();
    await expect(trigger).toBeFocused();
    dialog = await openEditor(page);
    await expect(dialog.getByLabel("任务内容", { exact: true })).toHaveValue("每天读书");
    await expect(dialog.getByLabel("计划时间", { exact: true })).toHaveValue("08:30");
    expect(state.todoEdits).toHaveLength(0);
    expect(state.errors).toEqual([]);
  });

  test("scope changes preserve inputs while only the active scope reaches the server", async ({ page, context }) => {
    const state = await isolate(page, context);
    await page.goto("/todos");
    const dialog = await openEditor(page);
    await dialog.getByLabel("日期", { exact: true }).fill("2030-11-04");
    await dialog.getByLabel("任务内容", { exact: true }).fill("每周阅读");
    await dialog.getByLabel("计划时间", { exact: true }).fill("09:15");
    await dialog.getByRole("button", { name: "低 · P3", exact: true }).click();
    await dialog.getByLabel("修改范围", { exact: true }).selectOption("future");
    await expect(dialog.getByLabel("日期", { exact: true })).toBeDisabled();
    await expect(dialog.getByLabel("日期", { exact: true })).toHaveValue(today);
    await dialog.getByLabel("重复", { exact: true }).selectOption("weekly");
    await dialog.getByLabel("修改范围", { exact: true }).selectOption("single");
    await expect(dialog.getByLabel("日期", { exact: true })).toHaveValue("2030-11-04");
    await expect(dialog.getByLabel("重复", { exact: true })).toHaveValue("daily");
    await expect(dialog.getByLabel("重复", { exact: true })).toBeDisabled();
    await dialog.getByLabel("修改范围", { exact: true }).selectOption("future");
    await expect(dialog.getByLabel("重复", { exact: true })).toHaveValue("weekly");
    await expect(dialog.getByLabel("任务内容", { exact: true })).toHaveValue("每周阅读");
    await dialog.getByRole("button", { name: "保存", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(state.todoEdits).toHaveLength(1);
    expect(state.todoEdits[0]).toMatchObject({ p_scope: "future", p_due_date: today, p_repeat: "weekly", p_time: "09:15", p_priority: 3, p_text: "每周阅读" });
    await expect(page.getByText("这次及以后的计划已更新。", { exact: true })).toBeVisible();
    expect(state.errors).toEqual([]);
  });

  test("quick rescheduling and clearing time do not submit until save and explain the destination", async ({ page, context }) => {
    const state = await isolate(page, context);
    const next = new Date(`${today}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const tomorrow = next.toISOString().slice(0, 10);
    await page.goto("/todos");
    const dialog = await openEditor(page);
    await dialog.getByRole("button", { name: "明天", exact: true }).click();
    await expect(dialog.getByLabel("日期", { exact: true })).toHaveValue(tomorrow);
    await dialog.getByRole("button", { name: "今天", exact: true }).click();
    await expect(dialog.getByLabel("日期", { exact: true })).toHaveValue(today);
    await dialog.getByRole("button", { name: "明天", exact: true }).click();
    await dialog.getByRole("button", { name: "清除计划时间", exact: true }).click();
    await expect(dialog.getByLabel("计划时间", { exact: true })).toHaveValue("");
    expect(state.todoEdits).toHaveLength(0);
    await dialog.getByRole("button", { name: "保存", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(state.todoEdits[0]).toMatchObject({ p_scope: "single", p_due_date: tomorrow, p_time: null, p_repeat: "daily" });
    await expect(page.getByText(`任务已保存，安排在 ${tomorrow}。可切换日期查看。`, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "下一天", exact: true }).click();
    await expect(todoRow(page, "每天读书")).toBeVisible();
    expect(state.errors).toEqual([]);
  });

  test("failed edits preserve input, slow retries lock every close path and duplicate submits", async ({ page, context }) => {
    const state = await isolate(page, context);
    state.todos.push(todoFixture("77777777-7777-4777-8777-777777777777", "不受影响的任务"));
    const slow = gate();
    state.editPlans.push({ outcome: "error" }, { wait: slow.wait });
    try {
      await page.goto("/todos");
      const stable = await watchTodoList(page, todoRow(page, "不受影响的任务"));
      const dialog = await openEditor(page);
      await dialog.getByLabel("任务内容", { exact: true }).fill("失败后保留的任务");
      await dialog.getByRole("button", { name: "保存", exact: true }).click();
      await expect(dialog.getByRole("alert")).toContainText("模拟编辑失败");
      await expect(dialog.getByLabel("任务内容", { exact: true })).toHaveValue("失败后保留的任务");
      await dialog.getByRole("button", { name: "保存", exact: true }).click();
      await expect.poll(() => state.todoEdits.length).toBe(2);
      await expect(dialog.getByRole("button", { name: "正在保存…", exact: true })).toBeDisabled();
      await expect(dialog.getByLabel("任务内容", { exact: true })).toBeDisabled();
      await page.keyboard.press("Escape");
      await dialog.getByRole("button", { name: "关闭", exact: true }).click();
      await page.mouse.click(4, 4);
      await dialog.locator("form").evaluate((form: HTMLFormElement) => { form.requestSubmit(); form.requestSubmit(); });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("alert", { name: "未保存的任务修改" })).toHaveCount(0);
      expect(state.todoEdits).toHaveLength(2);
      slow.release();
      await expect(dialog).not.toBeVisible();
      await expect(todoRow(page, "失败后保留的任务")).toBeVisible();
      expect(state.todoEdits[0]).toEqual(state.todoEdits[1]);
      await stable();
      expect(state.errors).toEqual([]);
    } finally { slow.release(); }
  });

  test("invalid and unchanged edits cannot submit; changed fields alone are protected", async ({ page, context }) => {
    const state = await isolate(page, context);
    await page.goto("/todos");
    const dialog = await openEditor(page);
    await dialog.getByLabel("任务内容", { exact: true }).fill("   ");
    await expect(dialog.getByRole("button", { name: "保存", exact: true })).toBeDisabled();
    await dialog.getByLabel("任务内容", { exact: true }).fill("每天读书");
    await dialog.getByLabel("日期", { exact: true }).fill("");
    await expect(dialog.getByRole("button", { name: "保存", exact: true })).toBeDisabled();
    await dialog.getByLabel("日期", { exact: true }).fill(today);
    await expect(dialog.getByRole("button", { name: "保存", exact: true })).toBeDisabled();
    await dialog.getByRole("button", { name: "高 · P1", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(dialog.getByRole("alert", { name: "未保存的任务修改" })).toBeVisible();
    expect(state.todoEdits).toHaveLength(0);
    expect(state.errors).toEqual([]);
  });

  test("saving a title outside the current search restores keyboard focus to search", async ({ page, context }) => {
    const state = await isolate(page, context);
    await page.goto("/todos");
    const input = page.getByLabel("搜索当前任务", { exact: true });
    await input.fill("读书");
    const dialog = await openEditor(page);
    await dialog.getByLabel("任务内容", { exact: true }).fill("每日散步");
    await dialog.getByRole("button", { name: "保存", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("读书");
    await expect(page.getByText("没有匹配的任务", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "清除任务搜索", exact: true }).click();
    await expect(todoRow(page, "每日散步")).toBeVisible();
    expect(state.errors).toEqual([]);
  });

  test("starting weekday repetition reports the actual first date after weekend rollover", async ({ page, context }) => {
    const state = await isolate(page, context);
    state.todos.push(todoFixture("77777777-7777-4777-8777-777777777777", "单次学习"));
    await page.goto("/todos");
    const dialog = await openEditor(page, "单次学习");
    await dialog.getByLabel("日期", { exact: true }).fill("2026-10-17");
    await dialog.getByLabel("重复", { exact: true }).selectOption("weekdays");
    await dialog.getByRole("button", { name: "保存", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("任务已保存，安排在 2026-10-19。可切换日期查看。", { exact: true })).toBeVisible();
    expect(state.errors).toEqual([]);
  });
});

test.describe("mobile task editing", () => {
  test.use({ hasTouch: true, isMobile: true });
  for (const largeText of [false, true]) {
    test(`editing stays usable with sticky actions: ${largeText ? "320px large text" : "short touch screen"}`, async ({ page, context }, info) => {
      const state = await isolate(page, context);
      await page.setViewportSize(largeText ? { width: 320, height: 900 } : { width: 375, height: 560 });
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: largeText ? "dark" : "light" });
      await page.goto("/todos");
      await page.getByRole("button", { name: "更多操作：每天读书", exact: true }).tap();
      await page.getByRole("menuitem", { name: "编辑", exact: true }).tap();
      const dialog = page.getByRole("dialog", { name: "编辑任务", exact: true });
      if (largeText) await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      await dialog.getByLabel("任务内容", { exact: true }).fill("手机上编辑阅读计划");
      const panel = dialog.locator(".modal-panel");
      await panel.evaluate((node) => node.scrollTo(0, 0));
      const save = dialog.getByRole("button", { name: "保存", exact: true });
      const bounds = await panel.boundingBox();
      const button = await save.boundingBox();
      expect(button!.y).toBeGreaterThanOrEqual(bounds!.y);
      expect(button!.y + button!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
      expect(button!.height).toBeGreaterThanOrEqual(44);
      expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath("task-edit-mobile.png") });
      await save.tap();
      await expect(dialog).not.toBeVisible();
      await expect(todoRow(page, "手机上编辑阅读计划")).toBeVisible();
      expect(state.todoEdits).toHaveLength(1);
      expect(state.errors).toEqual([]);
    });
  }
});

test.describe("task search and view memory", () => {
  const viewKey = `toolkit:todo-view:${userId}`;
  const future = "2030-11-04";

  test("title and time use normalized AND search without refetching or changing day progress", async ({ page, context }, info) => {
    const state = await isolate(page, context);
    state.todos[0].text = "React 组件阅读";
    state.todos.push(todoFixture("77777777-7777-4777-8777-777777777777", "React 会议", { scheduled_time: "09:30:00" }));
    await page.goto("/todos");
    await expect(todoRow(page, "React 组件阅读")).toBeVisible();
    const reads = state.todoReads;
    const input = page.getByRole("textbox", { name: "搜索当前任务", exact: true });
    await input.fill(" ＲＥＡＣＴ  组件 ０８：３０ ");
    await expect(todoRow(page, "React 组件阅读")).toBeVisible();
    await expect(todoRow(page, "React 会议")).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "匹配 1 / 3 项" })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "当日完成度" })).toHaveAttribute("aria-valuenow", "33");
    await expect(todoRow(page, "React 组件阅读")).toHaveAttribute("draggable", "false");
    await expect(page.getByRole("button", { name: "下移", exact: true })).toHaveCount(0);
    await expect(todoRow(page, "React 组件阅读").getByRole("button", { name: "编辑", exact: true })).toBeEnabled();
    await input.fill("不存在的任务");
    await expect(page.getByText("没有匹配的任务", { exact: true })).toBeVisible();
    await expect(page.getByText("这一天没有待办", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("task-search-empty-desktop.png"), fullPage: true });
    await page.getByRole("button", { name: "清除搜索，查看全部", exact: true }).click();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("");
    await expect(todoRow(page, "React 会议")).toBeVisible();
    await expect(todoRow(page, "React 组件阅读")).toHaveAttribute("draggable", "true");
    await expect(todoRow(page, "React 组件阅读").getByRole("button", { name: "下移", exact: true })).toBeEnabled();
    expect(state.todoReads).toBe(reads);
    expect(state.todoWrites).toHaveLength(0);
    expect(state.errors).toEqual([]);
  });

  test("search reveals completed and skipped matches and restores collapsed browsing on clear", async ({ page, context }) => {
    const state = await isolate(page, context);
    state.todos.push(todoFixture("77777777-7777-4777-8777-777777777777", "学习运动", { skipped: true }));
    await page.goto("/todos");
    await expect(todoRow(page, "每天读书")).toBeVisible();
    await page.getByLabel("搜索当前任务", { exact: true }).fill("学习");
    await expect(todoRow(page, "整理学习资料")).toBeVisible();
    await expect(page.getByRole("button", { name: "恢复这次", exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "匹配 2 / 3 项" })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "当日完成度" })).toHaveAttribute("aria-valuenow", "50");
    await page.getByRole("button", { name: "清除任务搜索", exact: true }).click();
    await expect(todoRow(page, "整理学习资料")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "恢复这次", exact: true })).not.toBeVisible();
    expect(state.errors).toEqual([]);
  });

  test("completion and failed undo under search retain the match, query and list without reads", async ({ page, context }) => {
    const state = await isolate(page, context);
    await page.goto("/todos");
    await expect(todoRow(page, "每天读书")).toBeVisible();
    const reads = state.todoReads;
    const input = page.getByLabel("搜索当前任务", { exact: true });
    await input.fill("读书");
    await todoRow(page, "每天读书").getByRole("button", { name: "标记完成", exact: true }).click();
    await expect(todoRow(page, "每天读书").getByRole("button", { name: "标记未完成", exact: true })).toBeEnabled();
    await expect(input).toHaveValue("读书");
    await expect(page.getByRole("progressbar", { name: "当日完成度" })).toHaveAttribute("aria-valuenow", "100");
    const undo = page.getByRole("button", { name: "撤销完成：每天读书", exact: true });
    state.todoPatchPlans.set(state.todos[0].id, [{ outcome: "error" }]);
    await undo.click();
    await expect(page.getByRole("status").filter({ hasText: "撤销未保存" })).toBeVisible();
    await expect(todoRow(page, "每天读书")).toBeVisible();
    await undo.click();
    await expect(todoRow(page, "每天读书").getByRole("button", { name: "标记完成", exact: true })).toBeEnabled();
    await expect(input).toHaveValue("读书");
    expect(state.todoReads).toBe(reads);
    expect(state.errors).toEqual([]);
  });

  test("unloaded overdue records require load more and other dates are not silently searched", async ({ page, context }) => {
    const state = await isolate(page, context);
    for (let i = 0; i < 51; i++) state.todos.push(todoFixture(`77777777-7777-4777-8777-${String(i).padStart(12, "0")}`, i === 50 ? "尚未加载的目标" : `逾期记录 ${i}`, { due_date: "2020-01-01" }));
    state.todos.push(todoFixture("88888888-8888-4888-8888-888888888888", "未来独有目标", { due_date: future }));
    await page.goto("/todos");
    await expect(todoRow(page, "每天读书")).toBeVisible();
    const input = page.getByLabel("搜索当前任务", { exact: true });
    await input.fill("尚未加载的目标");
    await expect(page.getByText("没有匹配的任务", { exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "匹配 0 / 52 项" })).toBeVisible();
    await page.getByRole("button", { name: "加载更多（已加载 50/51）", exact: true }).click();
    await expect(todoRow(page, "尚未加载的目标")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "匹配 1 / 53 项" })).toBeVisible();
    await expect(page.getByRole("button", { name: /加载更多/ })).toHaveCount(0);
    await input.fill("未来独有目标");
    await expect(todoRow(page, "未来独有目标")).toHaveCount(0);
    await expect(page.getByText("逾期任务中没有匹配。", { exact: true })).toBeVisible();
    await page.getByLabel("选择任务日期", { exact: true }).fill(future);
    await expect(todoRow(page, "未来独有目标")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "匹配 1 / 1 项" })).toBeVisible();
    await expect(page.getByText(/范围：当前日期的任务/)).toBeVisible();
    expect(state.errors).toEqual([]);
  });

  test("date and query return after navigation and reload without first requesting today", async ({ page, context }) => {
    const state = await isolate(page, context);
    state.todos.push(todoFixture("77777777-7777-4777-8777-777777777777", "未来阅读", { due_date: future }));
    await page.goto("/todos");
    await page.getByLabel("选择任务日期", { exact: true }).fill(future);
    await expect(todoRow(page, "未来阅读")).toBeVisible();
    await page.getByLabel("搜索当前任务", { exact: true }).fill("阅读");
    await page.getByRole("link", { name: "行动回顾", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "行动回顾" })).toBeVisible();
    state.todoReadDates.length = 0;
    await page.getByRole("link", { name: "每日待办", exact: true }).click();
    await expect(page.getByLabel("选择任务日期", { exact: true })).toHaveValue(future);
    await expect(page.getByLabel("搜索当前任务", { exact: true })).toHaveValue("阅读");
    await expect(todoRow(page, "未来阅读")).toBeVisible();
    expect(state.todoReadDates).toEqual([future]);
    state.todoReadDates.length = 0;
    await page.reload();
    await expect(todoRow(page, "未来阅读")).toBeVisible();
    await expect(page.getByLabel("搜索当前任务", { exact: true })).toHaveValue("阅读");
    expect(state.todoReadDates).toEqual([future]);
    await expect(page).toHaveURL(/\/todos$/);
    expect(state.errors).toEqual([]);
  });

  test("overview today links override remembered future dates and search", async ({ page, context }) => {
    const state = await isolate(page, context);
    await page.goto(`/todos?date=${future}&q=未来`);
    await expect(page.getByLabel("选择任务日期", { exact: true })).toHaveValue(future);
    await page.getByRole("link", { name: "概览", exact: true }).click();
    await expect(page.getByRole("link", { name: "管理待办", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "今日进度", exact: true })).toHaveAttribute("href", "/todos?date=today");
    state.todoReadDates.length = 0;
    await page.getByRole("link", { name: "管理待办", exact: true }).click();
    await expect(todoRow(page, "每天读书")).toBeVisible();
    await expect(page.getByLabel("选择任务日期", { exact: true })).toHaveValue(today);
    await expect(page.getByLabel("搜索当前任务", { exact: true })).toHaveValue("");
    expect(state.todoReadDates).toEqual([today]);
    expect(state.errors).toEqual([]);
  });

  test("entry parameters are consumed without losing unrelated parameters or later selections", async ({ page, context }) => {
    const state = await isolate(page, context);
    await page.goto("/todos?date=today&q=读书&utm=test#main-content");
    await expect(page.getByLabel("搜索当前任务", { exact: true })).toHaveValue("读书");
    await expect(page).toHaveURL(/\/todos\?utm=test#main-content$/);
    await page.getByLabel("选择任务日期", { exact: true }).fill(future);
    await page.getByLabel("搜索当前任务", { exact: true }).fill("后续选择");
    await page.reload();
    await expect(page.getByLabel("选择任务日期", { exact: true })).toHaveValue(future);
    await expect(page.getByLabel("搜索当前任务", { exact: true })).toHaveValue("后续选择");
    expect(state.errors).toEqual([]);
  });

  for (const record of ["corrupt", "foreign", "invalid-date", "today-memory", "historical-memory"] as const) {
    test(`safe account-scoped view restoration: ${record}`, async ({ page, context }) => {
      const state = await isolate(page, context);
      await page.addInitScript(({ key, record }) => {
        const view = { version: 1, date: record === "invalid-date" ? "2026-02-30" : "2020-01-01", query: "旧搜索", followsToday: record === "today-memory" };
        sessionStorage.setItem(record === "foreign" ? "toolkit:todo-view:other-account" : key, record === "corrupt" ? "broken json" : JSON.stringify(view));
      }, { key: viewKey, record });
      await page.goto("/todos");
      const valid = record === "today-memory" || record === "historical-memory";
      const date = record === "historical-memory" ? "2020-01-01" : today;
      await expect(page.getByLabel("选择任务日期", { exact: true })).toHaveValue(date);
      await expect(page.getByLabel("搜索当前任务", { exact: true })).toHaveValue(valid ? "旧搜索" : "");
      await expect(page.getByRole("status", { name: "正在加载", exact: true })).toHaveCount(0);
      expect(state.todoReadDates).toEqual([date]);
      expect(state.errors).toEqual([]);
    });
  }

  test("invalid incoming dates fall back to today instead of stored future date", async ({ page, context }) => {
    const state = await isolate(page, context);
    await page.addInitScript((key) => sessionStorage.setItem(key, JSON.stringify({ version: 1, date: "2030-11-04", query: "旧搜索", followsToday: false })), viewKey);
    await page.goto("/todos?date=2026-02-30&utm=test");
    await expect(page.getByLabel("选择任务日期", { exact: true })).toHaveValue(today);
    await expect(page.getByLabel("搜索当前任务", { exact: true })).toHaveValue("");
    await expect(page).toHaveURL(/\/todos\?utm=test$/);
    expect(state.errors).toEqual([]);
  });

  test("switching accounts does not reveal previous account's search or date", async ({ page, context }) => {
    const state = await isolate(page, context);
    await page.goto(`/todos?date=${future}&q=私人搜索`);
    await expect(page.getByLabel("搜索当前任务", { exact: true })).toHaveValue("私人搜索");
    state.authUser = { ...user, id: "88888888-8888-4888-8888-888888888888" };
    await page.reload();
    await expect(page.getByLabel("选择任务日期", { exact: true })).toHaveValue(today);
    await expect(page.getByLabel("搜索当前任务", { exact: true })).toHaveValue("");
    expect(await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!)?.query, viewKey)).toBe("私人搜索");
    expect(state.errors).toEqual([]);
  });

  test("unavailable storage does not block searching or completing tasks", async ({ page, context }) => {
    const state = await isolate(page, context);
    await page.addInitScript(() => {
      const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
      Storage.prototype.getItem = function (key) { if (key.startsWith("toolkit:todo-view:")) throw new Error("unavailable"); return get.call(this, key); };
      Storage.prototype.setItem = function (key, value) { if (key.startsWith("toolkit:todo-view:")) throw new Error("unavailable"); return set.call(this, key, value); };
    });
    await page.goto("/todos");
    await page.getByLabel("搜索当前任务", { exact: true }).fill("读书");
    await todoRow(page, "每天读书").getByRole("button", { name: "标记完成", exact: true }).click();
    await expect(todoRow(page, "每天读书").getByRole("button", { name: "标记未完成", exact: true })).toBeEnabled();
    expect(state.todos[0].done).toBe(true);
    expect(state.errors).toEqual([]);
  });

  test("mobile large text search has touch targets, keyboard clear and no hidden ordering actions", async ({ page, context }, info) => {
    const state = await isolate(page, context);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.goto("/todos");
    await expect(todoRow(page, "每天读书")).toBeVisible();
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await page.getByLabel("搜索当前任务", { exact: true }).fill("读书");
    const clear = page.getByRole("button", { name: "清除任务搜索", exact: true });
    const box = await clear.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect((await todoRow(page, "每天读书").getByText("每天读书", { exact: true }).boundingBox())!.width).toBeGreaterThanOrEqual(96);
    for (const control of ["标记完成", "更多操作：每天读书", "上一天", "下一天"]) {
      const target = await page.getByRole("button", { name: control, exact: true }).boundingBox();
      expect(target!.height).toBeGreaterThanOrEqual(44);
      expect(target!.width).toBeGreaterThanOrEqual(44);
    }
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath("task-search-small-dark-large-text.png"), fullPage: true });
    await page.getByRole("button", { name: "更多操作：每天读书", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "上移", exact: true })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "下移", exact: true })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "编辑", exact: true })).toBeEnabled();
    await page.keyboard.press("Escape");
    await clear.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("搜索当前任务", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("搜索当前任务", { exact: true })).toBeFocused();
    await noOverflow(page);
    expect(state.errors).toEqual([]);
  });
});

test.describe("touch task search", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("tap completion keeps search and other matching rows responsive", async ({ page, context }, info) => {
    const state = await isolate(page, context);
    state.todos.push(todoFixture("77777777-7777-4777-8777-777777777777", "另一份书单"));
    await page.goto("/todos");
    await expect(todoRow(page, "每天读书")).toBeVisible();
    await page.getByLabel("搜索当前任务", { exact: true }).fill("书");
    const stable = await watchTodoList(page, todoRow(page, "另一份书单"));
    const reads = state.todoReads;
    await todoRow(page, "每天读书").getByRole("button", { name: "标记完成", exact: true }).tap();
    await expect(todoRow(page, "每天读书").getByRole("button", { name: "标记未完成", exact: true })).toBeEnabled();
    await expect(page.getByLabel("搜索当前任务", { exact: true })).toHaveValue("书");
    await expect(page.getByRole("status").filter({ hasText: "匹配 2 / 3 项" })).toBeVisible();
    await stable();
    expect(state.todoReads).toBe(reads);
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath("task-search-mobile-completed.png"), fullPage: true });
    await page.getByRole("button", { name: "清除任务搜索", exact: true }).tap();
    await expect(page.getByLabel("搜索当前任务", { exact: true })).toBeFocused();
    expect(state.errors).toEqual([]);
  });
});

test.describe("task draft recovery", () => {
  test.use({ hasTouch: true });
  const draftKey = `toolkit:todo-draft:${userId}:new`;

  test("navigation and reload recover all task fields and the same create id, then confirmed save clears the draft", async ({ page, context }, info) => {
    const state = await isolate(page, context);
    await page.goto("/todos");
    await page.getByRole("button", { name: "添加任务", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "添加任务", exact: true });
    await dialog.getByLabel("任务内容", { exact: true }).fill("跨页面保留的计划");
    await dialog.getByLabel("任务日期", { exact: true }).fill("2026-10-19");
    await dialog.getByLabel("计划时间", { exact: true }).fill("08:40");
    await dialog.getByRole("button", { name: "低 · P3", exact: true }).click();
    await dialog.getByLabel("重复规则", { exact: true }).selectOption("weekdays");
    await expect.poll(() => page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? "null")?.draft.text, draftKey)).toBe("跨页面保留的计划");
    const id = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!).draft.id, draftKey);
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await page.getByRole("navigation", { name: "主要导航" }).getByRole("link", { name: "行动回顾", exact: true }).click();
    await expect(page.getByRole("heading", { name: "行动回顾", exact: true })).toBeVisible();
    await page.getByRole("navigation", { name: "主要导航" }).getByRole("link", { name: "每日待办", exact: true }).click();
    await page.getByRole("button", { name: "添加任务", exact: true }).click();
    await expect(dialog.getByText("已恢复此标签页中的任务草稿。", { exact: true })).toBeVisible();
    await expect(dialog.getByLabel("任务内容", { exact: true })).toHaveValue("跨页面保留的计划");
    await expect(dialog.getByLabel("任务日期", { exact: true })).toHaveValue("2026-10-19");
    await expect(dialog.getByLabel("计划时间", { exact: true })).toHaveValue("08:40");
    await expect(dialog.getByRole("button", { name: "低 · P3", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByLabel("重复规则", { exact: true })).toHaveValue("weekdays");
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await page.reload();
    await page.getByRole("button", { name: "添加任务", exact: true }).click();
    await expect(dialog.getByLabel("任务内容", { exact: true })).toHaveValue("跨页面保留的计划");
    await expect(dialog.locator(".modal-panel")).toHaveCSS("opacity", "1");
    await page.screenshot({ path: info.outputPath("task-draft-restored.png") });
    await dialog.getByRole("button", { name: "添加", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(state.todoCreates).toHaveLength(1);
    expect(state.todoCreates[0]).toMatchObject({ p_id: id, p_time: "08:40", p_repeat: "weekdays", p_priority: 3 });
    await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), draftKey)).toBeNull();
    expect(state.errors).toEqual([]);
  });

  test("clearing a failed draft confirms intent, clears its error and restores focus without deleting saved tasks", async ({ page, context }) => {
    const state = await isolate(page, context);
    state.createPlans.push({ outcome: "error" });
    await page.goto("/todos");
    await page.getByRole("button", { name: "添加任务", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "添加任务", exact: true });
    await dialog.getByLabel("任务内容", { exact: true }).fill("尚未添加");
    await dialog.getByRole("button", { name: "添加", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("模拟添加失败");
    await dialog.getByRole("button", { name: "清除草稿", exact: true }).click();
    await dialog.getByRole("button", { name: "保留内容", exact: true }).click();
    await expect(dialog.getByLabel("任务内容", { exact: true })).toHaveValue("尚未添加");
    await dialog.getByRole("button", { name: "清除草稿", exact: true }).click();
    await dialog.getByRole("button", { name: "确认清除草稿", exact: true }).click();
    await expect(dialog.getByLabel("任务内容", { exact: true })).toHaveValue("");
    await expect(dialog.getByLabel("任务内容", { exact: true })).toBeFocused();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    expect(state.todos).toHaveLength(2);
    expect(await page.evaluate((key) => sessionStorage.getItem(key), draftKey)).toBeNull();
    expect(state.errors).toEqual([]);
  });

  for (const outcome of ["empty", "missing"] as const) {
    test(outcome + " creation result cannot show success, remove input or delete the stored draft", async ({ page, context }) => {
      const state = await isolate(page, context);
      state.createPlans.push({ outcome });
      await page.goto("/todos");
      await page.getByRole("button", { name: "添加任务", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "添加任务", exact: true });
      await dialog.getByLabel("任务内容", { exact: true }).fill("必须确认已创建");
      await dialog.getByRole("button", { name: "添加", exact: true }).click();
      await expect(dialog.getByRole("alert")).toContainText("未收到任务创建确认");
      await expect(dialog.getByLabel("任务内容", { exact: true })).toHaveValue("必须确认已创建");
      expect(await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!).draft.text, draftKey)).toBe("必须确认已创建");
      await expect(page.getByText("任务已添加。", { exact: true })).toHaveCount(0);
      await dialog.getByRole("button", { name: "添加", exact: true }).click();
      await expect(dialog).not.toBeVisible();
      expect(state.todoCreates[0].p_id).toBe(state.todoCreates[1].p_id);
      expect(state.todos.filter((row) => row.text === "必须确认已创建")).toHaveLength(1);
      expect(state.errors).toEqual([]);
    });
  }

  test("a time-only draft retains its chosen date and switching dates without a draft follows the list", async ({ page, context }) => {
    const state = await isolate(page, context);
    await page.goto("/todos");
    await page.getByLabel("选择任务日期").fill("2026-10-19");
    await page.getByRole("button", { name: "添加任务", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "添加任务", exact: true });
    await expect(dialog.getByLabel("任务日期", { exact: true })).toHaveValue("2026-10-19");
    await dialog.getByLabel("计划时间", { exact: true }).fill("11:15");
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await page.getByLabel("选择任务日期").fill("2026-10-20");
    await page.getByRole("button", { name: "添加任务", exact: true }).click();
    await expect(dialog.getByLabel("任务日期", { exact: true })).toHaveValue("2026-10-19");
    await expect(dialog.getByLabel("计划时间", { exact: true })).toHaveValue("11:15");
    await dialog.getByRole("button", { name: "清除草稿", exact: true }).click();
    await dialog.getByRole("button", { name: "确认清除草稿", exact: true }).click();
    await expect(dialog.getByLabel("任务日期", { exact: true })).toHaveValue("2026-10-20");
    expect(state.todoCreates).toHaveLength(0);
    expect(state.errors).toEqual([]);
  });

  test("unavailable storage warns before closing, preserves page input and still allows a confirmed save", async ({ page, context }, info) => {
    const state = await isolate(page, context);
    await page.addInitScript(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith("toolkit:todo-draft:")) throw new DOMException("Preview quota", "QuotaExceededError");
        return original.call(this, key, value);
      };
    });
    await page.setViewportSize({ width: 320, height: 1000 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.goto("/todos");
    await page.getByRole("button", { name: "添加任务", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "添加任务", exact: true });
    await dialog.getByLabel("任务内容", { exact: true }).fill("仍然可以正常添加");
    await expect(dialog.getByText("无法保留草稿，请勿离开或刷新。", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog.getByRole("alert", { name: "任务草稿未保留" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "继续编辑", exact: true })).toBeFocused();
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath("task-draft-storage-warning.png") });
    await dialog.getByRole("button", { name: "仍然关闭，保留本页输入", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole("button", { name: "添加任务", exact: true }).click();
    await expect(dialog.getByLabel("任务内容", { exact: true })).toHaveValue("仍然可以正常添加");
    await dialog.getByRole("button", { name: "添加", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(state.todoCreates).toHaveLength(1);
    expect(state.errors).toEqual([]);
  });

  test("malformed and foreign-account stored drafts never populate the form", async ({ page, context }) => {
    const state = await isolate(page, context);
    await page.addInitScript((key) => {
      const draft = { id: "99999999-9999-4999-8999-999999999999", text: "另一个账号的内容", dueDate: "2026-10-19", priority: 2, scheduledTime: "", repeat: "none" };
      sessionStorage.setItem("toolkit:todo-draft:other-account:new", JSON.stringify({ version: 1, draft, baselineDate: "2026-10-19" }));
      sessionStorage.setItem(key, JSON.stringify({ version: 1, draft: { ...draft, priority: 99 }, baselineDate: "2026-10-19" }));
    }, draftKey);
    await page.goto("/todos");
    await page.getByRole("button", { name: "添加任务", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "添加任务", exact: true });
    await expect(dialog.getByLabel("任务内容", { exact: true })).toHaveValue("");
    await expect(dialog.getByText("已恢复此标签页中的任务草稿。", { exact: true })).toHaveCount(0);
    expect(state.todoCreates).toHaveLength(0);
    expect(state.errors).toEqual([]);
  });

  test("failed storage removal does not falsely clear a draft or erase its input", async ({ page, context }) => {
    const state = await isolate(page, context);
    await page.goto("/todos");
    await page.getByRole("button", { name: "添加任务", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "添加任务", exact: true });
    await dialog.getByLabel("任务内容", { exact: true }).fill("清除失败时保留");
    await page.evaluate(() => {
      const original = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function (key) {
        if (key.startsWith("toolkit:todo-draft:")) throw new DOMException("Preview removal denied", "SecurityError");
        return original.call(this, key);
      };
    });
    await dialog.getByRole("button", { name: "清除草稿", exact: true }).click();
    await dialog.getByRole("button", { name: "确认清除草稿", exact: true }).click();
    await expect(dialog.getByText("无法清除浏览器中的草稿，当前输入已保留，请检查存储权限。", { exact: true })).toBeVisible();
    await expect(dialog.getByLabel("任务内容", { exact: true })).toHaveValue("清除失败时保留");
    expect(state.todoCreates).toHaveLength(0);
    expect(state.errors).toEqual([]);
  });

  test("short mobile view keeps create actions visible while fields scroll", async ({ page, context }, info) => {
    const state = await isolate(page, context);
    await page.setViewportSize({ width: 375, height: 560 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/todos");
    await page.getByRole("button", { name: "添加任务", exact: true }).tap();
    const dialog = page.getByRole("dialog", { name: "添加任务", exact: true });
    await dialog.getByLabel("任务内容", { exact: true }).fill("短屏幕也能轻松添加");
    const panel = dialog.locator(".modal-panel");
    await panel.evaluate((node) => node.scrollTo(0, 0));
    const submit = dialog.getByRole("button", { name: "添加", exact: true });
    const bounds = await panel.boundingBox();
    const button = await submit.boundingBox();
    expect(button!.y).toBeGreaterThanOrEqual(bounds!.y);
    expect(button!.y + button!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
    expect(button!.height).toBeGreaterThanOrEqual(44);
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath("task-draft-short-mobile.png") });
    await submit.tap();
    await expect(dialog).not.toBeVisible();
    expect(state.todoCreates).toHaveLength(1);
    expect(state.errors).toEqual([]);
  });
});

test("mobile layout accommodates enlarged text without horizontal scrolling", async ({ page, context }) => {
  await isolate(page, context);
  await page.setViewportSize({ width: 375, height: 1000 });
  for (const path of ["/", "/todos", "/week", "/review"]) {
    await page.goto(path);
    await expect(page.locator("#main-content h1")).toBeVisible();
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await noOverflow(page);
  }
});

test.describe("connected action workspace", () => {
  test("retired pages redirect and removed APIs cannot call external services", async ({ page, context }) => {
    const state = await isolate(page, context);
    for (const [old, target, heading] of [["/learning", "/week", "一周计划"], ["/github?id=old-report", "/review", "行动回顾"], ["/settings", "/", "今天，专注重要的事。"]]) {
      await page.goto(old);
      await expect(page).toHaveURL(new RegExp(target === "/" ? "/$" : target + "$"));
      await expect(page.getByRole("heading", { name: heading, level: 1, exact: true })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "主要导航" }).getByRole("link")).toHaveCount(4);
      await expect(page.getByRole("link", { name: /^(AI 设置|项目分析|学习资料)$/ })).toHaveCount(0);
    }
    for (const api of ["/api/analyze", "/api/analyze/chat", "/api/ai/status"]) expect((await page.request.post(api, { data: {} })).status()).toBe(404);
    expect(state.errors).toEqual([]);
  });

  test("planning, daily execution and review share one record", async ({ page, context }) => {
    const state = await isolate(page, context);
    await page.goto("/week");
    const chosen = shiftDate(today, -1);
    await page.getByLabel("跳转计划日期").fill(chosen);
    await page.getByRole("button", { name: "添加任务", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "添加任务", exact: true });
    await expect(dialog.getByLabel("任务日期")).toHaveValue(chosen);
    await dialog.getByLabel("任务内容", { exact: true }).fill("把想法做成可验证的小任务");
    await dialog.getByLabel("计划时间", { exact: true }).fill("10:15");
    await dialog.getByRole("button", { name: "添加", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(state.todoCreates).toHaveLength(1);
    expect(state.todoCreates[0]).toMatchObject({ p_due_date: chosen, p_time: "10:15", p_repeat: "none" });
    await page.getByRole("link", { name: "查看并编辑：把想法做成可验证的小任务", exact: true }).click();
    const row = todoRow(page, "把想法做成可验证的小任务");
    await expect(row).toBeVisible();
    await expect(page.getByLabel("选择任务日期")).toHaveValue(chosen);
    await row.getByRole("button", { name: "标记完成", exact: true }).click();
    await expect.poll(() => state.todos.find((task) => task.text === "把想法做成可验证的小任务")?.done).toBe(true);
    await page.getByRole("navigation", { name: "主要导航" }).getByRole("link", { name: "行动回顾", exact: true }).click();
    await page.getByLabel("搜索回顾任务").fill("可验证");
    await expect(page.locator("[data-workspace-task]").filter({ hasText: "把想法做成可验证的小任务" })).toContainText("已完成");
    await expect(page.getByRole("status").filter({ hasText: "显示 1 /" })).toBeVisible();
    expect(state.errors).toEqual([]);
  });

  test("weekly completion keeps rows stable, rolls back a failed write and retries", async ({ page, context }) => {
    const state = await isolate(page, context);
    const first = state.todos[0];
    const slow = gate();
    state.todoPatchPlans.set(first.id, [{ wait: slow.wait, outcome: "error" }]);
    try {
      await page.goto("/week");
      const row = page.locator('[data-workspace-task="' + first.id + '"]');
      await expect(row).toBeVisible();
      const node = await row.elementHandle();
      await page.getByRole("button", { name: "完成任务：每天读书", exact: true }).click();
      await expect(page.getByRole("button", { name: "恢复任务：每天读书", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(row).toHaveAttribute("aria-busy", "true");
      expect(await node?.evaluate((element) => element.isConnected)).toBe(true);
      slow.release();
      await expect(row.getByRole("alert")).toContainText("已恢复原状态");
      await page.getByRole("button", { name: "完成任务：每天读书", exact: true }).click();
      await expect(row).toHaveAttribute("aria-busy", "false");
      expect(state.todos[0].done).toBe(true);
      expect(await node?.evaluate((element) => element.isConnected)).toBe(true);
      expect(state.errors).toEqual([]);
    } finally { slow.release(); }
  });

  test("review excludes skips and future dates, switches ranges and filters without altering totals", async ({ page, context }) => {
    const state = await isolate(page, context);
    state.todos.splice(0, state.todos.length,
      todoFixture("77777777-7777-4777-8777-000000000001", "完成的过去计划", { due_date: shiftDate(today, -2), done: true }),
      todoFixture("77777777-7777-4777-8777-000000000002", "待完成的过去计划", { due_date: shiftDate(today, -1) }),
      todoFixture("77777777-7777-4777-8777-000000000003", "跳过不计入", { skipped: true }),
      todoFixture("77777777-7777-4777-8777-000000000004", "未来不计入", { due_date: shiftDate(today, 1) }),
      todoFixture("77777777-7777-4777-8777-000000000005", "较早的记录", { due_date: shiftDate(today, -15), done: true }));
    await page.goto("/review");
    const summary = page.getByRole("region", { name: "回顾摘要" });
    await expect(summary.getByText("完成比例", { exact: true }).locator("..")).toContainText("50%");
    await page.getByRole("group", { name: "回顾任务状态" }).getByRole("button", { name: "已完成", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "显示 1 / 2 项" })).toBeVisible();
    await expect(summary.getByText("完成比例", { exact: true }).locator("..")).toContainText("50%");
    await page.getByRole("button", { name: "近 30 天", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "显示 2 / 3 项" })).toBeVisible();
    await expect(page.getByText("未来不计入", { exact: true })).toHaveCount(0);
    expect(state.errors).toEqual([]);
  });

  test("a later-page failure never displays partial statistics and retry loads all 503 records", async ({ page, context }) => {
    const state = await isolate(page, context);
    state.todos.splice(0);
    for (let index = 0; index < 503; index++) state.todos.push(todoFixture("77777777-7777-4777-8777-" + String(index).padStart(12, "0"), "批量记录 " + index));
    state.readPlans.set("todos", [{}, { fail: true }]);
    await page.goto("/review");
    await expect(page.locator("#main-content").getByRole("alert")).toContainText("数据未加载完成");
    await expect(page.getByRole("region", { name: "回顾摘要" })).toHaveCount(0);
    await page.getByRole("button", { name: "重试加载", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "显示 503 / 503 项" })).toBeVisible();
    expect(state.readCounts.todos).toBe(4);
    expect(state.errors).toEqual([]);
  });

  test("failed refresh preserves existing rows and clearly marks stale results", async ({ page, context }) => {
    const state = await isolate(page, context);
    await page.goto("/week");
    const row = page.locator('[data-workspace-task="' + state.todos[0].id + '"]');
    await expect(row).toBeVisible();
    const node = await row.elementHandle();
    state.readPlans.set("todos", [{ fail: true }]);
    await page.getByRole("button", { name: "刷新", exact: true }).click();
    await expect(page.locator("#main-content").getByRole("alert")).toContainText("上次加载的结果");
    expect(await node?.evaluate((element) => element.isConnected)).toBe(true);
    await page.getByRole("button", { name: "重试加载", exact: true }).click();
    await expect(page.locator("#main-content").getByRole("alert")).toHaveCount(0);
    expect(state.errors).toEqual([]);
  });

  test("empty workspace has a starting point and never invents a completion percentage", async ({ page, context }) => {
    const state = await isolate(page, context);
    state.todos.splice(0);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "从第一条待办开始" })).toBeVisible();
    await expect(page.getByRole("link", { name: "今日进度", exact: true })).toContainText("尚未安排");
    await page.getByRole("link", { name: "创建第一条待办", exact: true }).click();
    await expect(page.getByRole("button", { name: "添加任务", exact: true })).toBeEnabled();
    await page.getByRole("navigation", { name: "主要导航" }).getByRole("link", { name: "行动回顾", exact: true }).click();
    await expect(page.getByText("这个时间段还没有任务记录", { exact: true })).toBeVisible();
    await expect(page.getByText("完成比例", { exact: true }).locator("..")).toContainText("—");
    expect(state.errors).toEqual([]);
  });

  for (const width of [320, 375]) test("new screens support dark mode and 200% text at " + width, async ({ page, context }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await isolate(page, context);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => localStorage.setItem("toolkit-theme", "dark"));
    for (const path of ["/", "/week", "/review"]) {
      await page.goto(path);
      await expect(page.getByText("每天读书", { exact: true }).first()).toBeVisible();
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath((path.slice(1) || "overview") + "-" + width + ".png"), fullPage: true });
    }
    expect(state.errors).toEqual([]);
  });
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
