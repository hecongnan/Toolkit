const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");

const root = path.resolve(__dirname, "..");
const migration = readFileSync(path.join(root, "lib/supabase/migrations/20261002_todo_recurrence.sql"), "utf8");
const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
// PGlite returns date objects; PostgREST returns YYYY-MM-DD strings.
const normalizeRow = (row) => ({ ...row,
  due_date: row.due_date instanceof Date ? row.due_date.toISOString().slice(0, 10) : row.due_date,
  occurrence_date: row.occurrence_date instanceof Date ? row.occurrence_date.toISOString().slice(0, 10) : row.occurrence_date,
});

function loadTs(relativePath) {
  const filename = path.join(root, relativePath);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const mod = new Module(filename, module);
  mod._compile(compiled.outputText, filename);
  return mod.exports;
}

test("calendar dates are stable across month boundaries and time zones", () => {
  const { shiftDate, firstRepeatDate, isDateKey, repeatDescription } = loadTs("lib/todo-dates.ts");
  assert.equal(shiftDate("2024-02-28", 1), "2024-02-29");
  assert.equal(shiftDate("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftDate("2026-03-08", 1), "2026-03-09");
  assert.equal(firstRepeatDate("2026-10-03", "weekdays"), "2026-10-05");
  assert.equal(firstRepeatDate("2026-10-04", "weekdays"), "2026-10-05");
  assert.equal(isDateKey("2026-02-30"), false);
  assert.equal(isDateKey(""), false);
  assert.match(repeatDescription("weekly", "2026-10-02"), /每周五/);
});

test("PostgreSQL recurrence migration and operations", async (t) => {
  const db = new PGlite();
  const setUser = (id) => db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  const create = async (id, repeat, date, text = "任务") => normalizeRow((await db.query(
    "select * from public.todo_create($1::uuid,$2,2,$3::date,null,$4)", [id, text, date, repeat],
  )).rows[0]);
  const ensure = (date, today = "2026-10-02") => db.query("select public.todo_ensure_occurrences($1::date,$2::date)", [date, today]);
  const rows = async (rootId) => (await db.query("select * from todos where series_id = $1::uuid order by occurrence_date", [rootId])).rows.map(normalizeRow);
  const edit = (id, date, repeat, scope, text = "更新后的任务") => db.query(
    "select public.todo_edit($1::uuid,$2,1,$3::date,'09:00'::time,$4,$5)", [id, text, date, repeat, scope],
  );
  const remove = (id, scope) => db.query("select public.todo_remove($1::uuid,$2)", [id, scope]);
  try {
    await db.exec(`
      create role authenticated; create role anon;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema auth to authenticated, anon;
      insert into auth.users values ('${userA}'), ('${userB}');
    `);
    await db.exec(readFileSync(path.join(root, "lib/supabase/schema.sql"), "utf8"));
    const legacyId = randomUUID();
    await db.query("insert into todos (id,user_id,text,priority,due_date,repeat_rule,series_id) values ($1,$2,'旧每日任务',2,'2026-10-01','daily',$1)", [legacyId, userA]);
    await db.exec(migration);
    await db.exec("grant select,insert,update,delete on public.todos to authenticated; set role authenticated;");
    await setUser(userA);

    await t.test("existing series survives and pending tasks appear without completing the previous day", async () => {
      await ensure("2026-10-03");
      const list = await rows(legacyId);
      assert.deepEqual(list.map((row) => row.occurrence_date), ["2026-10-01", "2026-10-02", "2026-10-03"]);
      assert.equal(list.every((row) => !row.done), true);
      await ensure("2026-10-03");
      assert.equal((await rows(legacyId)).length, 3);
    });

    await t.test("weekday creation skips weekends; weekly repetition keeps the weekday", async () => {
      const weekdays = randomUUID();
      assert.equal((await create(weekdays, "weekdays", "2026-10-03")).due_date, "2026-10-05");
      await ensure("2026-10-04");
      assert.equal((await rows(weekdays)).length, 1);
      const weekly = randomUUID();
      await create(weekly, "weekly", "2026-09-25");
      await ensure("2026-10-01");
      assert.deepEqual((await rows(weekly)).map((row) => row.due_date), ["2026-09-25", "2026-10-02"]);
    });

    await t.test("rescheduling one occurrence does not regenerate it or shift future dates", async () => {
      const id = randomUUID();
      await create(id, "daily", "2026-10-02");
      await edit(id, "2026-10-03", "daily", "single", "单次改期");
      await ensure("2026-10-02");
      await ensure("2026-10-03");
      const list = await rows(id);
      assert.equal(list.length, 2);
      assert.deepEqual(list.map((row) => row.due_date), ["2026-10-03", "2026-10-03"]);
      assert.deepEqual(list.map((row) => row.occurrence_date), ["2026-10-02", "2026-10-03"]);
      assert.equal(list[1].text, "任务");
    });

    await t.test("skip survives repeated refreshes and can be restored", async () => {
      const id = randomUUID();
      await create(id, "daily", "2026-10-02");
      await remove(id, "single");
      await ensure("2026-10-02");
      assert.equal((await rows(id))[0].skipped, true);
      await db.query("update todos set skipped = false where id = $1", [id]);
      assert.equal((await rows(id))[0].done, false);
    });

    await t.test("future edits preserve past, completion, and skips while rebuilding pending tasks", async () => {
      const id = randomUUID();
      await create(id, "daily", "2026-10-01", "原任务");
      await ensure("2026-10-02"); await ensure("2026-10-03"); await ensure("2026-10-04");
      const list = await rows(id);
      await db.query("update todos set done = true where id = $1", [list[2].id]);
      await remove(list[3].id, "single");
      await edit(list[1].id, "2026-10-02", "daily", "future");
      await ensure("2026-10-05");
      const updated = await rows(id);
      assert.equal(updated.find((row) => row.occurrence_date === "2026-10-01").text, "原任务");
      assert.equal(updated.find((row) => row.occurrence_date === "2026-10-03").done, true);
      assert.equal(updated.find((row) => row.occurrence_date === "2026-10-04").skipped, true);
      assert.equal(updated.find((row) => row.occurrence_date === "2026-10-04").text, "更新后的任务");
      assert.equal(updated.find((row) => row.occurrence_date === "2026-10-05").text, "更新后的任务");
      assert.equal(updated.find((row) => row.occurrence_date === "2026-10-05").scheduled_time, "09:00:00");
    });

    await t.test("rule changes avoid overlapping segments and preserve the original stopped end date", async () => {
      const id = randomUUID();
      await create(id, "daily", "2026-10-02");
      await edit(id, "2026-10-02", "weekly", "future");
      await ensure("2026-10-03");
      assert.equal((await rows(id)).length, 1);
      await ensure("2026-10-09");
      const next = (await rows(id))[1];
      await remove(next.id, "future");
      await edit(id, "2026-10-02", "daily", "future");
      await ensure("2026-10-10");
      assert.equal((await rows(id)).some((row) => row.occurrence_date >= "2026-10-09"), false);
    });

    await t.test("stopping from the first occurrence never resurrects, even if migration is rerun", async () => {
      const id = randomUUID();
      await create(id, "daily", "2026-10-02");
      await ensure("2026-10-03");
      const completed = (await rows(id))[1];
      await db.query("update todos set done = true where id = $1", [completed.id]);
      await remove(id, "future");
      await ensure("2026-10-10");
      assert.deepEqual((await rows(id)).map((row) => row.id), [completed.id]);
      await db.exec("reset role");
      await db.exec(migration);
      await db.exec("set role authenticated");
      await ensure("2026-10-11");
      assert.deepEqual((await rows(id)).map((row) => row.id), [completed.id]);
    });

    await t.test("catch-up is bounded; visiting a distant date materializes just that extra day", async () => {
      const id = randomUUID();
      await create(id, "daily", "2020-01-01");
      await ensure("2030-01-01");
      const list = await rows(id);
      assert.equal(list.length, 32); // initial record + recent 30 days + selected future day
      assert.equal(list.filter((row) => row.occurrence_date >= "2026-09-03" && row.occurrence_date <= "2026-10-02").length, 30);
    });

    await t.test("one-off conversion and restarting a stopped plan create independent schedules", async () => {
      const id = randomUUID();
      await create(id, "none", "2026-10-02");
      await edit(id, "2026-10-02", "daily", "single");
      await ensure("2026-10-03");
      assert.equal((await rows(id)).length, 2);
      await edit(id, "2026-10-02", "none", "future");
      await ensure("2026-10-04");
      assert.equal((await rows(id)).length, 1);
      await edit(id, "2026-10-02", "daily", "single");
      const restarted = (await db.query("select series_id from todos where id = $1", [id])).rows[0].series_id;
      assert.notEqual(restarted, id);
      await ensure("2026-10-03");
      assert.equal((await rows(restarted)).length, 2);
      assert.equal((await rows(id)).length, 0);
    });

    await t.test("creation retries do not duplicate; invalid edits roll back without altering the series", async () => {
      const id = randomUUID();
      await create(id, "daily", "2026-10-02");
      await create(id, "daily", "2026-10-02");
      assert.equal((await rows(id)).length, 1);
      await assert.rejects(edit(id, "2026-10-03", "daily", "future"), /保持日期不变/);
      assert.equal((await rows(id))[0].due_date, "2026-10-02");
      await assert.rejects(create(randomUUID(), "invalid", "2026-10-02"), /检查任务/);
    });

    await t.test("RLS and invoker RPCs isolate users; unauthenticated callers cannot execute mutations", async () => {
      const id = randomUUID();
      await create(id, "daily", "2026-10-02");
      await setUser(userB);
      assert.deepEqual(await rows(id), []);
      await assert.rejects(edit(id, "2026-10-02", "daily", "future"), /任务已不存在/);
      await assert.rejects(remove(id, "future"), /任务已不存在/);
      await ensure("2026-11-01");
      await setUser(userA);
      assert.equal((await rows(id)).length, 1);
      await db.exec("reset role; set role anon");
      await setUser("");
      await assert.rejects(ensure("2026-10-02"), /permission denied/);
    });
  } finally {
    await db.close();
  }
});
