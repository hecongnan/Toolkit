"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { readSavedTime } from "@/lib/time-data";
import { uid } from "@/lib/storage";
import { durationLabel, taskTimeTotals, timeError, timerLabel, type TimeRecord } from "@/lib/time-tracking";
import type { Todo } from "@/lib/types";
import { useTimeTracker } from "./TimeProvider";

interface TaskTimes {
  totals: ReturnType<typeof taskTimeTotals>;
  hasData: boolean; loading: boolean; error: string | null; load: () => Promise<void>;
}
const Context = createContext<TaskTimes | null>(null);

export function TaskTimeProvider({ taskIds, children }: { taskIds: string[]; children: ReactNode }) {
  const userId = useAuth().user?.id;
  const { historyRevision } = useTimeTracker();
  const idsKey = JSON.stringify([...new Set(taskIds)].sort());
  const key = `${userId}:${idsKey}`;
  const [result, setResult] = useState<{ key: string; records: TimeRecord[] } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const request = useRef({ version: 0 });
  const load = useCallback(async () => {
    if (!userId) return;
    const version = ++request.current.version;
    setLoading(true); setError(null);
    try {
      const records = await readSavedTime(userId, { taskIds: JSON.parse(idsKey) as string[] }, () => request.current.version === version);
      if (records) setResult({ key, records });
    } catch (failure) {
      if (version === request.current.version) setError({ key, message: timeError(failure) });
    } finally {
      if (version === request.current.version) setLoading(false);
    }
  }, [userId, idsKey, key]);
  useEffect(() => {
    const sequence = request.current;
    void load();
    return () => { sequence.version++; };
  }, [load, historyRevision]);
  const totals = useMemo(() => taskTimeTotals(result?.key === key ? result.records : []), [result, key]);
  return <Context.Provider value={{ totals, hasData: result?.key === key, error: error?.key === key ? error.message : null, loading, load }}>{children}</Context.Provider>;
}

export function TaskTimeFeedback() {
  const data = useContext(Context);
  if (!data?.error) return null;
  return <div role="alert" aria-label="任务用时加载提示" className="rounded-xl bg-[var(--control-bg)] p-3 text-xs leading-6">
    <p className="status-warning">任务用时暂未更新：{data.error}</p>
    <p>{data.hasData ? "当前用时为上次结果。" : "暂不显示累计用时。"}任务勾选和编辑仍可使用。</p>
    <Button size="sm" variant="ghost" disabled={data.loading} onClick={() => void data.load()}>重试任务用时</Button>
  </div>;
}

export function TaskTimeInfo({ task, disabled = false }: { task: Todo; disabled?: boolean }) {
  const router = useRouter();
  const data = useContext(Context);
  const tracker = useTimeTracker();
  const startId = useRef(uid());
  const actionButton = useRef<HTMLButtonElement>(null);
  const [attempted, setAttempted] = useState(false);
  const [conflict, setConflict] = useState(false);
  const active = tracker.active?.task_id === task.id ? tracker.active : null;
  const saved = data?.totals.get(task.id);
  useEffect(() => {
    if (tracker.active?.id === startId.current) startId.current = uid();
    if (!tracker.active) setConflict(false);
  }, [tracker.active]);
  if (!data) return null;
  const continueTime = async () => {
    setAttempted(true);
    if (tracker.active && !active) { setConflict(true); return; }
    setConflict(false);
    const restoreFocus = document.activeElement === actionButton.current;
    if (active) await tracker.control("resume");
    else if (await tracker.start(startId.current, task.text, saved?.category ?? "work", task.id)) startId.current = uid();
    // Disabling a pending button can move browser focus to body. Restore only
    // when it was ours and the user has not focused another control meanwhile.
    if (restoreFocus) window.requestAnimationFrame(() => {
      if (document.activeElement === document.body) actionButton.current?.focus({ preventScroll: true });
    });
  };
  return <div className="mt-1.5 min-w-0 text-xs leading-6" data-task-time={task.id}>
    <p className="text-[color:var(--text-muted)]">{data.hasData ? `已记录 ${durationLabel(saved?.seconds ?? 0)}${data.error || data.loading ? " · 上次结果" : ""}` : data.loading ? "正在读取用时…" : "累计用时暂不可用"}</p>
    {active && <p className="break-words text-[color:var(--accent)]">{active.running_since ? "计时中" : "已暂停"} · 本次 {timerLabel(tracker.elapsed)}（未保存）</p>}
    {(active || (saved && saved.seconds > 0)) && <Button ref={actionButton} className="max-w-full min-w-0" variant="ghost" size="sm" disabled={!active?.running_since && (disabled || tracker.busy || tracker.loading || !tracker.ready)} onClick={() => active?.running_since ? router.push("/time") : void continueTime()}>{active?.running_since ? "查看当前计时" : "继续记录"}</Button>}
    {conflict && <p role="status" className="break-words status-warning">另一条计时仍未结束，不会自动切换。<Link href="/time" className="quiet-link inline-flex min-h-11 items-center rounded-lg focus-ring">先处理当前计时 →</Link></p>}
    {attempted && tracker.error && <p role="alert" className="break-words status-warning">{tracker.error}<Link href="/time" className="quiet-link inline-flex min-h-11 items-center rounded-lg focus-ring">查看并同步计时 →</Link></p>}
  </div>;
}
