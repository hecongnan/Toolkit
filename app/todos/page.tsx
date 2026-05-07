"use client";

import { CheckCircle2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { DateNav } from "@/components/todos/DateNav";
import { TodoForm } from "@/components/todos/TodoForm";
import { TodoItem } from "@/components/todos/TodoItem";
import { createClient } from "@/lib/supabase/client";
import { toTodo, type TodoRow } from "@/lib/supabase/mappers";
import type { Todo } from "@/lib/types";

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [date, setDate] = useState<string>(todayKey());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true });
      if (queryError) throw queryError;
      setTodos(((data ?? []) as TodoRow[]).map(toTodo));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "加载 Todo 失败");
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
      .sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
    const done = dayTodos
      .filter((t) => t.done)
      .sort((a, b) => b.createdAt - a.createdAt);
    return { undone, done };
  }, [dayTodos]);

  const total = dayTodos.length;
  const completed = sorted.done.length;
  const pct = total ? Math.round((completed / total) * 100) : 0;

  const add = async (t: Todo) => {
    if (!userId) return;
    setError(null);
    try {
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
          created_at: new Date(t.createdAt).toISOString(),
        })
        .select("*")
        .single();
      if (insertError) throw insertError;
      setTodos((prev) => [toTodo(data as TodoRow), ...prev]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "添加 Todo 失败");
    }
  };

  const toggle = async (id: string) => {
    const current = todos.find((t) => t.id === id);
    if (!current) return;
    const nextDone = !current.done;
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: nextDone } : t)),
    );

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("todos")
        .update({ done: nextDone })
        .eq("id", id);
      if (updateError) throw updateError;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "更新 Todo 失败");
      await loadTodos();
    }
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
      setError(err instanceof Error ? err.message : "删除 Todo 失败");
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

      <div className="space-y-4">
        <DateNav value={date} onChange={setDate} />

        <Card className="!p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs text-zinc-400">
              当日进度 · {completed}/{total}
            </span>
            <span className="text-xs font-semibold text-fuchsia-300">{pct}%</span>
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
                {sorted.undone.map((t) => (
                  <TodoItem
                    key={t.id}
                    todo={t}
                    onToggle={toggle}
                    onDelete={remove}
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
                      onDelete={remove}
                    />
                  ))}
                </div>
              </>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
