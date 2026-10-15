"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { toTodo, type TodoRow } from "@/lib/supabase/mappers";
import { todayKey, todoErrorMessage } from "@/lib/todo-dates";
import type { Todo } from "@/lib/types";

export function useToday() {
  const [today, setToday] = useState(todayKey);
  useEffect(() => {
    const refresh = () => setToday(todayKey());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  return today;
}

// All views use the same todos and recurrence RPCs. Publish only complete ranges;
// a failed later page must never masquerade as a complete zero/partial count.
export function useTaskRange(start: string, end: string, ensureDates: string[]) {
  const { user } = useAuth();
  const userId = user?.id;
  const key = `${userId}:${start}:${end}`;
  const ensureKey = ensureDates.join(",");
  const [result, setResult] = useState<{ key: string; tasks: Todo[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const request = useRef({ version: 0 });
  const locks = useRef(new Set<string>());
  const load = useCallback(async () => {
    if (!userId || locks.current.size) return;
    const version = ++request.current.version;
    setLoading(true); setFailure(null);
    try {
      const client = createClient();
      // Sequential writes avoid competing per-series advisory locks.
      for (const date of ensureKey.split(",").filter(Boolean)) {
        const { error } = await client.rpc("todo_ensure_occurrences", { p_date: date, p_today: todayKey() });
        if (error) throw error;
        if (version !== request.current.version) return;
      }
      const tasks = new Map<string, Todo>();
      const pageSize = 500;
      let expected: number | null = null;
      for (let offset = 0; ; offset += pageSize) {
        const { data, count, error } = await client.from("todos").select("*", { count: "exact" })
          .eq("user_id", userId).gte("due_date", start).lte("due_date", end)
          .order("due_date").order("position").order("id").range(offset, offset + pageSize - 1);
        if (error) throw error;
        if (version !== request.current.version) return;
        if (count === null || (expected !== null && expected !== count)) throw new Error("任务在加载期间发生变化，请刷新后查看完整结果。");
        expected = count;
        for (const row of (data ?? []) as TodoRow[]) tasks.set(row.id, toTodo(row));
        if (offset + (data?.length ?? 0) >= count) break;
        if (!data?.length) throw new Error("未能加载完整任务，请重试。");
      }
      if (tasks.size !== expected) throw new Error("任务在加载期间发生变化，请刷新后查看完整结果。");
      setResult({ key, tasks: [...tasks.values()] }); setRowErrors({});
    } catch (error) {
      if (version === request.current.version) setFailure({ key, message: todoErrorMessage(error, "暂时无法加载任务，请重试。") });
    } finally { if (version === request.current.version) setLoading(false); }
  }, [userId, start, end, ensureKey, key]);
  useEffect(() => {
    const sequence = request.current;
    void load();
    return () => { sequence.version++; };
  }, [load]);

  const tasks = result?.key === key ? result.tasks : [];
  const toggle = async (task: Todo) => {
    if (!userId || locks.current.has(task.id) || loading || result?.key !== key) return;
    locks.current.add(task.id); setPending(new Set(locks.current));
    setRowErrors((previous) => { const next = { ...previous }; delete next[task.id]; return next; });
    const optimistic = { ...task, done: !task.done, updatedAt: Date.now() };
    const replace = (value: Todo) => setResult((previous) => previous?.key === key
      ? { ...previous, tasks: previous.tasks.map((item) => item.id === value.id ? value : item) } : previous);
    replace(optimistic);
    try {
      const { data, error } = await createClient().from("todos").update({ done: optimistic.done, updated_at: new Date(optimistic.updatedAt).toISOString() })
        .eq("id", task.id).eq("user_id", userId).select("*").single();
      if (error) throw error;
      if (!data || data.id !== task.id) throw new Error("未收到保存确认，请重试。");
      replace(toTodo(data as TodoRow));
    } catch (error) {
      replace(task);
      setRowErrors((previous) => ({ ...previous, [task.id]: "修改未保存，已恢复原状态。" + todoErrorMessage(error, "请重试。") }));
    } finally { locks.current.delete(task.id); setPending(new Set(locks.current)); }
  };
  return { tasks, loading: loading || (!result && !failure), hasData: result?.key === key,
    error: failure?.key === key ? failure.message : null, pending, rowErrors, load, toggle };
}
