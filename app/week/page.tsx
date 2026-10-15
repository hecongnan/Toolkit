"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { TodoForm } from "@/components/todos/TodoForm";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import { RangeFeedback } from "@/components/workspace/RangeFeedback";
import { TaskRows } from "@/components/workspace/TaskRows";
import { useTaskRange, useToday } from "@/components/workspace/useTaskRange";
import { createTodo } from "@/lib/todo-data";
import { firstRepeatDate, isDateKey, shiftDate } from "@/lib/todo-dates";
import { dateLabel, dateRange, taskSummary, weekStart } from "@/lib/task-workspace";
import type { Todo } from "@/lib/types";

export default function WeekPage() { return <Suspense fallback={null}><WeekPlan /></Suspense>; }

function WeekPlan() {
  const today = useToday();
  const params = useSearchParams();
  const requested = params.get("date");
  const [chosen, setChosen] = useState<string | null>(() => requested && isDateKey(requested) ? requested : null);
  const selected = chosen ?? today;
  const start = weekStart(selected);
  const days = dateRange(start, 7);
  const end = days[6];
  const data = useTaskRange(start, end, days);
  const [formOpen, setFormOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const disabled = creating || formOpen || data.pending.size > 0;
  const summary = taskSummary(data.tasks);
  const dayTasks = data.tasks.filter((task) => task.dueDate === selected);
  const dayStrip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = dayStrip.current;
    const button = strip?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!strip || !button) return;
    const bounds = strip.getBoundingClientRect();
    const item = button.getBoundingClientRect();
    if (item.left < bounds.left) strip.scrollLeft -= bounds.left - item.left;
    else if (item.right > bounds.right) strip.scrollLeft += item.right - bounds.right;
  }, [selected, data.hasData]);
  const add = async (task: Todo) => {
    setCreating(true);
    try {
      await createTodo(task);
      await data.load();
      const actualDate = firstRepeatDate(task.dueDate, task.repeat);
      setNotice(actualDate >= start && actualDate <= end ? `任务已添加，安排在 ${actualDate}。` : `任务已添加，安排在 ${actualDate}，可在每日待办中查看。`);
      if (actualDate >= start && actualDate <= end) setChosen(actualDate);
      return true;
    } finally { setCreating(false); }
  };
  return <>
    <PageHeader eyebrow="计划 · 看清这一周" title="一周计划" description="把事情安排到合适的一天，预留余量。这里与每日待办使用同一份任务数据。"
      action={<Link href="/todos?date=today" className="button button-secondary inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm focus-ring">去做今天的事<ArrowRight size={15} aria-hidden /></Link>} />
    {notice && <Notice message={notice} onDismiss={() => setNotice(null)} />}
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="surface flex items-center gap-1 p-1">
        <button type="button" aria-label="上一周" disabled={disabled} onClick={() => setChosen(shiftDate(selected, -7))} className="button icon-button focus-ring disabled:opacity-40"><ChevronLeft size={18} /></button>
        <Button variant="ghost" disabled={disabled} onClick={() => setChosen(null)}>本周</Button>
        <button type="button" aria-label="下一周" disabled={disabled} onClick={() => setChosen(shiftDate(selected, 7))} className="button icon-button focus-ring disabled:opacity-40"><ChevronRight size={18} /></button>
      </div>
      <p className="text-sm font-medium tabular-nums">{start} — {end}</p>
      <label className="block min-w-0"><span className="sr-only">跳转计划日期</span><input type="date" value={selected} disabled={disabled} onChange={(event) => { if (isDateKey(event.target.value)) setChosen(event.target.value); }} className="field-control min-h-11 w-full min-w-0 px-2 text-sm focus-ring" /></label>
    </div>
    <RangeFeedback {...data} onRetry={() => void data.load()} disabled={disabled} />
    {data.hasData && <>
      <section aria-label="本周安排摘要" className="mb-5 grid gap-2 sm:gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 7rem), 1fr))" }}>
        {[['已安排', summary.total], ['已完成', summary.done], ['待完成', summary.pending]].map(([label, value]) => <Card key={label} className="min-w-0 !p-3 sm:!p-5"><p className="text-xs text-[color:var(--text-muted)]">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p></Card>)}
      </section>
      <p className="mb-2 text-xs text-[color:var(--text-muted)] sm:hidden">左右滑动选择日期，也可使用上方日期框。</p>
      <div ref={dayStrip} role="group" aria-label="选择一周中的日期" className="mb-5 flex gap-2 overflow-x-auto pb-2 sm:grid sm:grid-cols-4 xl:grid-cols-7">
        {days.map((date) => {
          const stats = taskSummary(data.tasks.filter((task) => task.dueDate === date));
          return <button key={date} type="button" aria-pressed={date === selected} aria-label={`查看 ${date} 的安排`} disabled={disabled} onClick={() => setChosen(date)}
            className={"button min-h-28 w-32 min-w-0 shrink-0 rounded-2xl border p-3 text-left focus-ring disabled:opacity-50 sm:w-auto " + (date === selected ? "border-[color:var(--accent)] bg-[var(--accent-soft)]" : "border-[color:var(--border-subtle)] bg-[var(--surface)]")}>
            <span className="block text-xs text-[color:var(--text-muted)]">{dateLabel(date, { weekday: "short" })}{date === today ? " · 今天" : ""}</span><span className="mt-2 block text-lg font-semibold">{date.slice(5).replace("-", "/")}</span>
            <span className="mt-2 block text-xs leading-5 text-[color:var(--text-secondary)]">{stats.total ? `${stats.pending} 项待办 · ${stats.done} 项完成` : "留有余量"}</span>
          </button>;
        })}
      </div>
      <Card className="!p-0 overflow-hidden" role="region" aria-label="所选日期的任务">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border-subtle)] p-4 sm:px-5">
          <div><h2 className="inline-flex items-center gap-2 text-base font-semibold"><CalendarDays size={18} className="text-[color:var(--accent)]" aria-hidden />{dateLabel(selected)}</h2><p className="mt-1 text-xs text-[color:var(--text-muted)]">勾选完成；点击任务查看时间、重复规则或改期。</p></div>
          <TodoForm date={selected} onAdd={add} disabled={data.loading || creating || data.pending.size > 0} onOpenChange={setFormOpen} />
        </div>
        {dayTasks.length ? <TaskRows tasks={dayTasks} onToggle={(task) => void data.toggle(task)} pending={data.pending} errors={data.rowErrors} disabled={data.loading} /> : <div className="px-5 py-10 text-center"><p className="text-sm font-medium">这一天还没有安排</p><p className="mt-2 text-sm text-[color:var(--text-muted)]">添加一件具体的小事，也可以留出休息时间。</p></div>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--border-subtle)] px-5 py-3"><Link href={`/todos?date=${selected}`} className="quiet-link inline-flex min-h-11 items-center gap-1 rounded-lg text-sm focus-ring">管理这一天的全部任务<ArrowRight size={14} /></Link><Button size="sm" variant="ghost" disabled={data.loading || disabled} onClick={() => void data.load()}><RefreshCw size={14} />刷新</Button></div>
      </Card>
      <p className="mt-4 text-xs leading-6 text-[color:var(--text-muted)]">已跳过的任务不计入进度。重复任务按原有规则出现，单次改期不会改变后续计划。</p>
      <Link href="/review" className="quiet-link mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm focus-ring">看看最近完成了什么<ArrowRight size={14} /></Link>
    </>}
  </>;
}
