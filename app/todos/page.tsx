"use client";

import { CheckCircle2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { DateNav } from "@/components/todos/DateNav";
import { TodoEditor } from "@/components/todos/TodoEditor";
import { TodoForm } from "@/components/todos/TodoForm";
import { TodoItem } from "@/components/todos/TodoItem";
import { uid } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { toTodo, type TodoRow } from "@/lib/supabase/mappers";
import type { Todo, TodoRepeat } from "@/lib/types";

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nextRepeatDate(value: string, repeat: TodoRepeat): string | null {
  if (repeat === "none") return null;
  const [year, month, day] = value.split("-").map(Number);
  const next = new Date(year, month - 1, day);
  next.setDate(next.getDate() + (repeat === "weekly" ? 7 : 1));
  if (repeat === "weekdays") {
    while (next.getDay() === 0 || next.getDay() === 6) {
      next.setDate(next.getDate() + 1);
    }
  }
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

function todoErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  if (/position|scheduled_time|repeat_rule|series_id|updated_at/i.test(message)) {
    return "Todo 数据库结构尚未升级，请在 Supabase SQL Editor 执行 lib/supabase/migrations/20260913_todo_v2.sql";
  }
  return message;
}

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [date, setDate] = useState<string>(todayKey());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const loadTodos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) return;
      setUserId(user.id);

      const { data, error: queryError } = await supabase
        .from("todos")
        .select("*")
        .eq("due_date", date)
        .order("done", { ascending: true })
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (queryError) throw queryError;
      setTodos(((data ?? []) as TodoRow[]).map(toTodo));
    } catch (err: unknown) {
      setError(todoErrorMessage(err, "加载 Todo 失败"));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    loadTodos();
  }, [loadTodos]);

  const dayTodos = useMemo(
    () => todos.filter((t) => t.dueDate === date),
    [todos, date],
  );

  const sorted = useMemo(() => {
    const undone = dayTodos
      .filter((t) => !t.done)
      .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
    const done = dayTodos
      .filter((t) => t.done)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return { undone, done };
  }, [dayTodos]);

  const total = dayTodos.length;
  const completed = sorted.done.length;
  const pct = total ? Math.round((completed / total) * 100) : 0;

  const add = async (t: Todo): Promise<boolean> => {
    if (!userId) return false;
    setError(null);
    setNotice(null);
    try {
      const position = sorted.undone.length
        ? Math.max(...sorted.undone.map((item) => item.position)) + 1024
        : 1024;
      const supabase = createClient();
      const { data, error: insertError } = await supabase
        .from("todos")
        .insert({
          id: t.id,
          user_id: userId,
          text: t.text,
          done: t.done,
          priority: t.priority,
          due_date: t.dueDate,
          scheduled_time: t.scheduledTime ?? null,
          repeat_rule: t.repeat,
          series_id: t.repeat === "none" ? null : t.id,
          position,
          created_at: new Date(t.createdAt).toISOString(),
          updated_at: new Date(t.updatedAt).toISOString(),
        })
        .select("*")
        .single();
      if (insertError) throw insertError;
      setTodos((prev) => [...prev, toTodo(data as TodoRow)]);
      return true;
    } catch (err: unknown) {
      setError(todoErrorMessage(err, "添加 Todo 失败"));
      return false;
    }
  };

  const toggle = async (id: string) => {
    const current = todos.find((t) => t.id === id);
    if (!current) return;
    const nextDone = !current.done;
    const updatedAt = Date.now();
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: nextDone, updatedAt } : t)),
    );

    try {
      const supabase = createClient();
      const seriesId = current.repeat === "none" ? null : current.seriesId ?? current.id;
      const { error: updateError } = await supabase
        .from("todos")
        .update({
          done: nextDone,
          series_id: seriesId,
          updated_at: new Date(updatedAt).toISOString(),
        })
        .eq("id", id);
      if (updateError) throw updateError;

      const nextDate = nextDone ? nextRepeatDate(current.dueDate, current.repeat) : null;
      if (nextDate && userId) {
        const now = Date.now();
        const { data: existing, error: existingError } = await supabase
          .from("todos")
          .select("id")
          .eq("series_id", seriesId)
          .eq("due_date", nextDate)
          .maybeSingle();
        if (existingError) throw existingError;
        if (!existing) {
          const { error: repeatError } = await supabase.from("todos").insert({
            id: uid(),
            user_id: userId,
            text: current.text,
            done: false,
            priority: current.priority,
            due_date: nextDate,
            scheduled_time: current.scheduledTime ?? null,
            repeat_rule: current.repeat,
            series_id: seriesId,
            position: now,
            created_at: new Date(now).toISOString(),
            updated_at: new Date(now).toISOString(),
          });
          if (repeatError) throw repeatError;
          setNotice(`下一期任务已创建：${nextDate}`);
        }
      }
    } catch (err: unknown) {
      setError(todoErrorMessage(err, "更新 Todo 失败"));
      await loadTodos();
    }
  };

  const saveTodo = async (todo: Todo): Promise<boolean> => {
    setError(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("todos")
        .update({
          text: todo.text,
          priority: todo.priority,
          due_date: todo.dueDate,
          scheduled_time: todo.scheduledTime ?? null,
          repeat_rule: todo.repeat,
          series_id: todo.repeat === "none" ? null : todo.seriesId ?? todo.id,
          position: todo.position,
          updated_at: new Date(todo.updatedAt).toISOString(),
        })
        .eq("id", todo.id);
      if (updateError) throw updateError;
      setTodos((prev) => prev.map((item) => (item.id === todo.id ? todo : item)));
      return true;
    } catch (err: unknown) {
      setError(todoErrorMessage(err, "保存 Todo 失败"));
      return false;
    }
  };

  const persistOrder = async (ordered: Todo[]) => {
    const positioned = ordered.map((todo, index) => ({
      ...todo,
      position: (index + 1) * 1024,
    }));
    setTodos((prev) =>
      prev.map((todo) => positioned.find((item) => item.id === todo.id) ?? todo),
    );

    try {
      const supabase = createClient();
      const results = await Promise.all(
        positioned.map((todo) =>
          supabase.from("todos").update({ position: todo.position }).eq("id", todo.id),
        ),
      );
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
    } catch (err: unknown) {
      setError(todoErrorMessage(err, "保存任务顺序失败"));
      await loadTodos();
    }
  };

  const moveTodo = (id: string, direction: -1 | 1) => {
    const index = sorted.undone.findIndex((todo) => todo.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= sorted.undone.length) return;
    const reordered = [...sorted.undone];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    void persistOrder(reordered);
  };

  const dropTodo = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return setDraggingId(null);
    const sourceIndex = sorted.undone.findIndex((todo) => todo.id === draggingId);
    const targetIndex = sorted.undone.findIndex((todo) => todo.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return setDraggingId(null);
    const reordered = [...sorted.undone];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    setDraggingId(null);
    void persistOrder(reordered);
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from("todos")
        .delete()
        .eq("id", id);
      if (deleteError) throw deleteError;
      setTodos((prev) => prev.filter((t) => t.id !== id));
    } catch (err: unknown) {
      setError(todoErrorMessage(err, "删除 Todo 失败"));
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Today"
        title="每日 Todo"
        description="按日期管理任务，专注眼前的每一项。"
      />

      {error && (
        <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      {notice && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 rounded text-xs text-emerald-200/70 hover:text-emerald-100 focus-ring"
          >
            关闭
          </button>
        </div>
      )}

      <div className="space-y-4">
        <DateNav value={date} onChange={setDate} />

        <Card className="!p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs text-zinc-400">
              当日进度 · {completed}/{total}
            </span>
            <span className="text-xs font-semibold text-teal-300">{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-brand-gradient transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </Card>

        <TodoForm date={date} onAdd={add} />

        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size={20} />
          </div>
        ) : total === 0 ? (
          <EmptyState
            icon={<CheckCircle2 size={20} />}
            title="这一天没有任务"
            description="在上方输入框中添加一条任务开始吧。"
          />
        ) : (
          <Card className="!p-0 overflow-hidden">
            {sorted.undone.length > 0 && (
              <div className="divide-y divide-white/5">
                {sorted.undone.map((t, index) => (
                  <TodoItem
                    key={t.id}
                    todo={t}
                    onToggle={toggle}
                    onEdit={setEditing}
                    onDelete={remove}
                    onMove={moveTodo}
                    onDragStart={setDraggingId}
                    onDrop={dropTodo}
                    onDragEnd={() => setDraggingId(null)}
                    canMoveUp={index > 0}
                    canMoveDown={index < sorted.undone.length - 1}
                  />
                ))}
              </div>
            )}
            {sorted.done.length > 0 && (
              <>
                {sorted.undone.length > 0 && (
                  <div className="border-t border-white/5 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                    已完成
                  </div>
                )}
                <div className="divide-y divide-white/5 opacity-70">
                  {sorted.done.map((t) => (
                    <TodoItem
                      key={t.id}
                      todo={t}
                      onToggle={toggle}
                      onEdit={setEditing}
                      onDelete={remove}
                      onMove={() => undefined}
                      onDragStart={() => undefined}
                      onDrop={() => undefined}
                      onDragEnd={() => undefined}
                      canMoveUp={false}
                      canMoveDown={false}
                    />
                  ))}
                </div>
              </>
            )}
          </Card>
        )}
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="编辑任务">
        {editing && (
          <TodoEditor todo={editing} onSave={saveTodo} onCancel={() => setEditing(null)} />
        )}
      </Modal>
    </>
  );
}
