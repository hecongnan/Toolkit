"use client";

import { CheckCircle2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { DateNav } from "@/components/todos/DateNav";
import { TodoEditor } from "@/components/todos/TodoEditor";
import { TodoForm } from "@/components/todos/TodoForm";
import { TodoItem } from "@/components/todos/TodoItem";
import { createClient } from "@/lib/supabase/client";
import { toTodo, type TodoRow } from "@/lib/supabase/mappers";
import { shiftDate, todayKey, todoErrorMessage } from "@/lib/todo-dates";
import type { Todo, TodoScope } from "@/lib/types";

export default function TodosPage() {
  const [today, setToday] = useState(todayKey);
  const [date, setDate] = useState(todayKey);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [overdueLimit, setOverdueLimit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [deleting, setDeleting] = useState<Todo | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const requestRef = useRef(0);
  const busyRef = useRef(false);
  const pendingRef = useRef(new Set<string>());

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const loadTodos = useCallback(async (clearError = true, background = false): Promise<boolean> => {
    const request = ++requestRef.current;
    if (!background) {
      setLoading(true);
      setLoadFailed(false);
    }
    if (clearError) setError(null);
    try {
      const supabase = createClient();
      const { error: ensureError } = await supabase.rpc("todo_ensure_occurrences", { p_date: date, p_today: today });
      if (ensureError) throw ensureError;
      const [day, overdue] = await Promise.all([
        supabase.from("todos").select("*").eq("due_date", date).order("position").order("created_at"),
        supabase.from("todos").select("*", { count: "exact" }).lt("due_date", today)
          .eq("done", false).eq("skipped", false)
          .or("series_id.is.null,repeat_rule.eq.none,due_date.gte." + shiftDate(today, -29))
          .order("due_date").order("priority").order("position").order("id").range(0, overdueLimit - 1),
      ]);
      if (day.error) throw day.error;
      if (overdue.error) throw overdue.error;
      if (request !== requestRef.current) return false;
      const merged = new Map<string, Todo>();
      for (const row of [...(day.data ?? []), ...(overdue.data ?? [])] as TodoRow[]) merged.set(row.id, toTodo(row));
      setTodos(Array.from(merged.values()));
      setOverdueCount(overdue.count ?? 0);
      setLoadFailed(false);
      return true;
    } catch (err: unknown) {
      if (request === requestRef.current) {
        setError(todoErrorMessage(err, "加载任务失败，请稍后重试。"));
        if (!background) setLoadFailed(true);
      }
      return false;
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [date, today, overdueLimit]);

  useEffect(() => {
    void loadTodos();
    return () => { requestRef.current += 1; };
  }, [loadTodos]);

  useEffect(() => {
    const refresh = () => {
      if (loading || busyRef.current || pendingRef.current.size || editing || deleting) return;
      const current = todayKey();
      if (current !== today) {
        setToday(current);
        setDate((value) => value === today ? current : value);
      } else {
        void loadTodos(true, !loadFailed);
      }
    };
    const timer = window.setInterval(() => { if (todayKey() !== today) refresh(); }, 60_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [today, loadTodos, loading, loadFailed, editing, deleting]);

  const dayTodos = useMemo(() => todos.filter((todo) => todo.dueDate === date), [todos, date]);
  const undone = dayTodos.filter((todo) => !todo.done && !todo.skipped).sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
  const done = dayTodos.filter((todo) => todo.done && !todo.skipped).sort((a, b) => b.updatedAt - a.updatedAt);
  const skipped = dayTodos.filter((todo) => todo.skipped);
  const overdue = todos.filter((todo) => todo.dueDate < today && !todo.done && !todo.skipped)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.priority - b.priority || a.position - b.position);
  const total = undone.length + done.length;
  const pct = total ? Math.round(done.length / total * 100) : 0;
  const disabled = busy || loading || pendingIds.size > 0;

  const runMutation = async (action: () => Promise<void>, success: string): Promise<boolean> => {
    if (busyRef.current || pendingRef.current.size) return false;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await loadTodos(false, true);
      setNotice(success);
      return true;
    } catch (err: unknown) {
      const message = todoErrorMessage(err, "操作未完成，请重试。");
      await loadTodos(false, true);
      setError(message);
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const add = async (todo: Todo) => runMutation(async () => {
    const position = undone.length ? Math.max(...undone.map((item) => item.position)) + 1024 : 1024;
    const { error: createError } = await createClient().rpc("todo_create", {
      p_id: todo.id, p_text: todo.text, p_priority: todo.priority, p_due_date: todo.dueDate,
      p_time: todo.scheduledTime ?? null, p_repeat: todo.repeat, p_position: position,
    });
    if (createError) throw createError;
  }, todo.repeat === "weekdays" ? "任务已添加；周一至周五出现，周末自动顺延。" : "任务已添加。");

  const toggle = async (id: string) => {
    const todo = todos.find((item) => item.id === id);
    if (!todo || loading || busyRef.current || pendingRef.current.has(id)) return;

    // An older background read must not undo a newer local action.
    requestRef.current += 1;
    pendingRef.current.add(id);
    setPendingIds(new Set(pendingRef.current));
    setError(null);
    setNotice(null);
    const optimistic = { ...todo, done: todo.skipped ? false : !todo.done, skipped: false, updatedAt: Date.now() };
    const isOverdue = (item: Todo) => Number(item.dueDate < today && !item.done && !item.skipped);
    const countChange = isOverdue(optimistic) - isOverdue(todo);
    setTodos((items) => items.map((item) => item.id === id ? optimistic : item));
    setOverdueCount((count) => count + countChange);
    try {
      const { data, error: updateError } = await createClient().from("todos").update({
        done: optimistic.done, skipped: false, updated_at: new Date(optimistic.updatedAt).toISOString(),
      }).eq("id", id).select("*").single();
      if (updateError) throw updateError;
      if (!data) throw new Error("任务未保存，请重试。");
      const saved = toTodo(data as TodoRow);
      setTodos((items) => items.map((item) => item.id === id ? saved : item));
      setOverdueCount((count) => count + isOverdue(saved) - isOverdue(optimistic));
      setNotice(todo.skipped ? "本次任务已恢复。" : todo.done ? "已恢复为待完成。" : "本次任务已完成。");
    } catch (err: unknown) {
      // Roll back only this row; other tasks may already have been completed.
      setTodos((items) => items.map((item) => item.id === id ? todo : item));
      setOverdueCount((count) => count - countChange);
      setError(`“${todo.text}”未保存，已恢复原状态。${todoErrorMessage(err, "请重试。")}`);
    } finally {
      pendingRef.current.delete(id);
      setPendingIds(new Set(pendingRef.current));
    }
  };

  const editRequest = async (todo: Todo, scope: TodoScope) => {
    const { error: updateError } = await createClient().rpc("todo_edit", {
      p_id: todo.id, p_text: todo.text, p_priority: todo.priority, p_due_date: todo.dueDate,
      p_time: todo.scheduledTime ?? null, p_repeat: todo.repeat, p_scope: scope,
    });
    if (updateError) throw updateError;
  };
  const saveTodo = async (todo: Todo, scope: TodoScope) => runMutation(
    () => editRequest(todo, scope), scope === "future" ? "这次及以后的计划已更新。" : "这次任务已保存。",
  );
  const remove = async (todo: Todo, scope: TodoScope) => {
    const removed = await runMutation(async () => {
      const { error: removeError } = await createClient().rpc("todo_remove", { p_id: todo.id, p_scope: scope });
      if (removeError) throw removeError;
    }, scope === "future" ? "已停止这次及以后的重复，完成记录保留。" : todo.seriesId ? "本次已跳过，可在该日期的“已跳过”中恢复。" : "任务已删除。");
    if (removed) setDeleting(null);
  };
  const skip = (id: string) => {
    const todo = todos.find((item) => item.id === id);
    if (todo) void remove(todo, "single");
  };
  const moveToToday = (id: string) => {
    const todo = todos.find((item) => item.id === id);
    if (todo) void runMutation(() => editRequest({ ...todo, dueDate: today }, "single"), "本次任务已移到今天，重复规则保持不变。");
  };
  const persistOrder = async (ordered: Todo[]) => runMutation(async () => {
    const supabase = createClient();
    const results = await Promise.all(ordered.map((todo, index) =>
      supabase.from("todos").update({ position: (index + 1) * 1024 }).eq("id", todo.id),
    ));
    const failure = results.find((result) => result.error);
    if (failure?.error) throw failure.error;
  }, "任务顺序已保存。");
  const moveTodo = (id: string, direction: -1 | 1) => {
    const index = undone.findIndex((todo) => todo.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= undone.length || disabled) return;
    const ordered = [...undone];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    void persistOrder(ordered);
  };
  const dropTodo = (id: string) => {
    const source = undone.findIndex((todo) => todo.id === draggingId);
    const target = undone.findIndex((todo) => todo.id === id);
    setDraggingId(null);
    if (source < 0 || target < 0 || source === target || disabled) return;
    const ordered = [...undone];
    const [moved] = ordered.splice(source, 1);
    ordered.splice(target, 0, moved);
    void persistOrder(ordered);
  };
  const renderTodo = (todo: Todo, index: number, overdueItem = false) => (
    <TodoItem key={todo.id} todo={todo} disabled={disabled}
      toggleDisabled={busy || loading || pendingIds.has(todo.id)} pending={pendingIds.has(todo.id)} showDate={overdueItem}
      onToggle={toggle} onEdit={(item) => { setError(null); setEditing(item); }}
      onDelete={(id) => { setError(null); setDeleting(todos.find((item) => item.id === id) ?? null); }}
      onSkip={skip} onMoveToToday={overdueItem ? moveToToday : undefined}
      onMove={moveTodo} onDragStart={setDraggingId} onDrop={dropTodo} onDragEnd={() => setDraggingId(null)}
      canMoveUp={!overdueItem && index > 0} canMoveDown={!overdueItem && index < undone.length - 1}
    />
  );

  return (
    <>
      <PageHeader eyebrow="一天，一步" title="每日待办" description="给重要的事留出时间。今天没完成的，也可以从容安排。" />
      {error && <div role="alert" className="mb-4 space-y-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
        <p>{error}</p>{loadFailed && <Button size="sm" onClick={() => void loadTodos()}>重试加载</Button>}
      </div>}
      {notice && <div role="status" className="surface pointer-events-none fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex items-center justify-between gap-3 rounded-2xl px-4 py-2 text-sm shadow-lg sm:left-auto sm:max-w-md">
        <span>{notice}</span><button type="button" onClick={() => setNotice(null)} className="button pointer-events-auto min-h-11 shrink-0 rounded-xl px-3 text-xs focus-ring">关闭</button>
      </div>}
      <div className="space-y-4 pb-16">
        <DateNav value={date} onChange={setDate} disabled={busy || pendingIds.size > 0} />
        <Card className="!p-4">
          <div className="mb-3 flex items-center justify-between text-xs text-[color:var(--text-muted)]">
            <span>{loading ? "正在加载当日进度..." : "当日进度 · " + done.length + "/" + total + "（跳过不计入）"}</span><span>{pct}%</span>
          </div>
          <div role="progressbar" aria-label="当日完成度" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-[var(--control-bg)]"><div className="h-full rounded-full bg-blue-500" style={{ width: pct + "%" }} /></div>
          <p role="status" aria-live="polite" className="mt-2 min-h-5 text-xs text-[color:var(--text-muted)]">{pendingIds.size > 0 ? `正在同步 ${pendingIds.size} 项，可继续勾选。` : "可在“已完成”中恢复任务。"}</p>
        </Card>
        <TodoForm date={date} onAdd={add} disabled={disabled || loadFailed} />
        {loading ? <div className="flex justify-center py-12"><Spinner size={20} /></div> : loadFailed ? null : (
          <>
            {undone.length ? <Card className="!p-0 overflow-hidden"><div className="divide-y divide-[color:var(--border-subtle)]">{undone.map((todo, index) => renderTodo(todo, index))}</div></Card>
              : <EmptyState icon={<CheckCircle2 size={20} />} title={done.length ? "当日任务已全部完成" : "这一天没有待办"} description="在上方添加任务，或切换日期查看重复计划。" />}
            {done.length > 0 && <details className="surface"><summary className="cursor-pointer px-4 py-3 text-sm text-[color:var(--text-muted)]">已完成 · {done.length}</summary><div className="divide-y divide-[color:var(--border-subtle)]">{done.map((todo, index) => renderTodo(todo, index))}</div></details>}
            {skipped.length > 0 && <details className="surface"><summary className="cursor-pointer px-4 py-3 text-sm text-[color:var(--text-muted)]">已跳过 · {skipped.length}（可恢复）</summary><div className="divide-y divide-[color:var(--border-subtle)]">{skipped.map((todo) => <div key={todo.id} className="flex items-center justify-between gap-3 px-4 py-3"><span className="break-words text-sm">{todo.text}</span><Button size="sm" disabled={busy || loading || pendingIds.has(todo.id)} onClick={() => void toggle(todo.id)}>恢复这次</Button></div>)}</div></details>}
            {date === today && overdueCount > 0 && <details className="surface" open>
              <summary className="status-warning min-h-11 cursor-pointer px-4 py-4 text-sm font-medium">逾期未完成 · {overdueCount}</summary>
              <p className="px-4 pb-3 text-xs leading-relaxed text-[color:var(--text-muted)]">重复任务补齐最近 30 天；单次任务不限制逾期日期。可以完成、移到今天或跳过这次；更早的重复记录可按日期查看。</p>
              <div className="divide-y divide-[color:var(--border-subtle)]">{overdue.map((todo, index) => renderTodo(todo, index, true))}</div>
              {overdue.length < overdueCount && <div className="p-4"><Button size="sm" disabled={disabled} onClick={() => setOverdueLimit((value) => value + 50)}>加载更多（已显示 {overdue.length}/{overdueCount}）</Button></div>}
            </details>}
          </>
        )}
      </div>
      <Modal open={Boolean(editing)} onClose={() => { if (!busy) setEditing(null); }} title="编辑任务">
        {editing && <TodoEditor todo={editing} error={error} onSave={saveTodo} onCancel={() => { if (!busy) setEditing(null); }} />}
      </Modal>
      <Modal open={Boolean(deleting)} onClose={() => { if (!busy) setDeleting(null); }} title={deleting?.seriesId ? "处理重复任务" : "删除任务"}>
        {deleting && <div className="space-y-4">
          <p className="break-words text-sm">{deleting.text}</p>
          <p className="text-sm text-[color:var(--text-muted)]">{deleting.seriesId ? "跳过只影响本次，可在该日期恢复；停止重复会移除这次及以后未完成的任务，已完成记录保留。" : "确认删除这条任务？删除后无法恢复。"}</p>
          {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button disabled={busy} onClick={() => setDeleting(null)}>取消</Button>
            <Button disabled={busy} variant={deleting.seriesId ? "secondary" : "danger"} onClick={() => void remove(deleting, "single")}>{deleting.seriesId ? "跳过这次" : "确认删除"}</Button>
            {deleting.seriesId && deleting.repeat !== "none" && <Button disabled={busy} variant="danger" onClick={() => void remove(deleting, "future")}>停止这次及以后</Button>}
          </div>
        </div>}
      </Modal>
    </>
  );
}
