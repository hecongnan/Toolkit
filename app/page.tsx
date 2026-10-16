"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, ChartNoAxesCombined, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { RangeFeedback } from "@/components/workspace/RangeFeedback";
import { TaskRows } from "@/components/workspace/TaskRows";
import { useTaskRange, useToday } from "@/components/workspace/useTaskRange";
import { dateLabel, dateRange, taskSummary, weekStart } from "@/lib/task-workspace";
import { DailyTimeSummary } from "@/components/time/DailyTimeSummary";
import { useTimeTracker } from "@/components/time/TimeProvider";

export default function DashboardPage() {
  const today = useToday();
  const tracker = useTimeTracker();
  const start = weekStart(today);
  const days = dateRange(start, 7);
  const data = useTaskRange(start, days[6], days);
  const current = data.tasks.filter((task) => task.dueDate === today && !task.skipped);
  const summary = taskSummary(current);
  const week = taskSummary(data.tasks);
  const priorities = current.filter((task) => !task.done).sort((a, b) => a.priority - b.priority || a.position - b.position).slice(0, 5);
  return <>
    <PageHeader eyebrow="个人行动工作台" title="今天，专注重要的事。" description={dateLabel(today, { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
      action={<Button variant="ghost" disabled={data.loading || data.pending.size > 0} onClick={() => { void data.load(); tracker.refreshSaved(); void tracker.load(); }}><RefreshCw size={15} />{data.loading ? "正在同步" : "刷新概览"}</Button>} />
    <section aria-label="工作区使用路径" className="mb-6 flex flex-wrap gap-2">
      {[
        { href: "/week", step: "01", title: "计划这一周", text: "把要做的事放到合适的日期", icon: CalendarDays },
        { href: "/todos?date=today", step: "02", title: "完成今天的事", text: "从一件具体的小事开始", icon: CheckCircle2 },
        { href: "/review", step: "03", title: "回顾再调整", text: "从实际进度决定下一步", icon: ChartNoAxesCombined },
      ].map(({ href, step, title, icon: Icon }) => <Link key={href} href={href} className="button button-secondary inline-flex min-h-11 min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-sm focus-ring">
        <Icon size={16} className="shrink-0 text-[color:var(--accent)]" aria-hidden /><span className="text-xs tabular-nums text-[color:var(--text-muted)]">{step}</span><span>{title}</span>
      </Link>)}
    </section>
    <DailyTimeSummary today={today} />
    <RangeFeedback {...data} onRetry={() => void data.load()} disabled={data.pending.size > 0} />
    {data.hasData && <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Card className="!p-0 overflow-hidden" role="region" aria-label="今日待办">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--border-subtle)] px-5 py-3"><h2 className="text-base font-semibold">今天，先做这些</h2><Link href="/todos?date=today" className="quiet-link inline-flex min-h-11 items-center gap-1 rounded-lg text-sm focus-ring">管理待办<ArrowRight size={14} /></Link></div>
        {priorities.length ? <TaskRows tasks={priorities} /> : <div className="px-5 py-9"><h3 className="text-lg font-semibold">{summary.done ? "今天的安排已经完成" : "从第一条待办开始"}</h3><p className="mt-3 text-sm leading-6 text-[color:var(--text-muted)]">{summary.done ? "给自己一点休息，也可以看看后面的安排。" : "写下一件今天想完成的事，不必一次排满整天。"}</p><Link href="/todos?date=today" className="button button-primary mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm focus-ring">{summary.done ? "查看今日任务" : "创建第一条待办"}<ArrowRight size={15} /></Link></div>}
        {current.filter((task) => !task.done).length > 5 && <p className="border-t border-[color:var(--border-subtle)] px-5 py-4 text-xs text-[color:var(--text-muted)]">还有 {summary.pending - 5} 项待办，可在每日待办中查看。</p>}
      </Card>
      <div className="min-w-0 space-y-5">
        <Link href="/todos?date=today" aria-label="今日进度" className="surface button block p-5 focus-ring"><div className="flex items-center justify-between"><h2 className="text-sm font-medium">今日进度</h2><span className="text-xs text-[color:var(--text-muted)]">{summary.percent === null ? "尚未安排" : summary.percent + "%"}</span></div><p className="mt-3 text-3xl font-semibold tabular-nums">{summary.done}<span className="text-lg text-[color:var(--text-muted)]"> / {summary.total}</span></p><p className="mt-2 text-xs text-[color:var(--text-muted)]">已完成 / 已安排 · 跳过不计入</p></Link>
        <Card><h2 className="text-sm font-semibold">这一周的节奏</h2><p className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">{week.total ? `已安排 ${week.total} 项，完成 ${week.done} 项。看看哪些天安排较多，为重要的事留出余量。` : "先安排一两件重要的事，给变化和休息留出空间。"}</p><Link href="/week" className="quiet-link mt-3 inline-flex min-h-11 items-center gap-1 rounded-lg text-sm focus-ring">查看一周计划<ArrowRight size={14} /></Link></Card>
        <p className="px-1 text-xs leading-6 text-[color:var(--text-muted)]">周计划负责安排，每日待办负责执行，行动回顾帮助调整。所有页面共用同一批任务。</p>
      </div>
    </div>}
  </>;
}
