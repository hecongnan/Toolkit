"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, RefreshCw, Search } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { RangeFeedback } from "@/components/workspace/RangeFeedback";
import { TaskRows } from "@/components/workspace/TaskRows";
import { useTaskRange, useToday } from "@/components/workspace/useTaskRange";
import { shiftDate } from "@/lib/todo-dates";
import { dateLabel, dateRange, taskSummary } from "@/lib/task-workspace";
import { todoMatchesQuery } from "@/lib/todo-search";
import { TimeReview } from "@/components/time/TimeReview";

export default function ReviewPage() {
  const today = useToday();
  const [duration, setDuration] = useState(7);
  const [filter, setFilter] = useState<"all" | "done" | "pending">("all");
  const [query, setQuery] = useState("");
  const start = shiftDate(today, 1 - duration);
  const data = useTaskRange(start, today, [today]);
  const summary = taskSummary(data.tasks);
  const active = data.tasks.filter((task) => !task.skipped);
  const matches = active.filter((task) => todoMatchesQuery(task, query) && (filter === "all" || (filter === "done" ? task.done : !task.done)));
  const days = dateRange(start, duration);
  const pastPending = active.filter((task) => !task.done && task.dueDate < today).length;
  return <>
    <PageHeader eyebrow="回顾 · 为下一步留依据" title="行动回顾" description="看看最近的计划完成得怎么样，再调整接下来的安排。进度来自你的任务，不需要另外记一份。"
      action={<Link href="/week" className="button button-primary inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm focus-ring">调整一周计划<ArrowRight size={15} /></Link>} />
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div role="group" aria-label="回顾时间范围" className="surface grid w-full min-w-0 grid-cols-2 gap-1 p-1 sm:w-auto">{[7, 30].map((days) => <Button key={days} className="min-w-0 whitespace-normal max-sm:px-2" variant={duration === days ? "primary" : "ghost"} aria-pressed={duration === days} onClick={() => setDuration(days)}>近 {days} 天</Button>)}</div>
      <p className="text-xs tabular-nums text-[color:var(--text-muted)]">{start} — {today}</p><Button variant="ghost" disabled={data.loading} onClick={() => void data.load()}><RefreshCw size={15} />刷新回顾</Button>
    </div>
    <TimeReview start={start} end={today} />
    <RangeFeedback {...data} onRetry={() => void data.load()} />
    {data.hasData && <>
      <section aria-label="回顾摘要" className="mb-5 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 7rem), 1fr))" }}>
        {[['已安排', summary.total], ['已完成', summary.done], ['待完成', summary.pending], ['完成比例', summary.percent === null ? '—' : `${summary.percent}%`]].map(([label, value]) => <Card key={label} className="min-w-0 !p-4"><p className="text-xs text-[color:var(--text-muted)]">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p></Card>)}
      </section>
      <Card className="mb-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold">{pastPending ? `${pastPending} 项过去的安排还未完成` : summary.total ? "让回顾帮助你安排下一步" : "从一件小事开始积累"}</h2><p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">{pastPending ? "先决定哪些仍值得做，再到每日待办改期、完成或跳过。无需把所有未完成的事都堆到今天。" : summary.total ? "已有任务会随完成、恢复或改期更新。可以在周计划中留出更适合自己的节奏。" : "先安排今天的任务，完成后会自动出现在这里。"}</p></div><Link href="/todos?date=today" className="quiet-link inline-flex min-h-11 items-center gap-1 rounded-lg text-sm focus-ring">{pastPending ? "处理未完成安排" : "安排今天"}<ArrowRight size={14} /></Link></div></Card>
      <Card className="mb-5 !p-4 sm:!p-5"><h2 className="text-sm font-semibold">每天的计划与完成情况</h2><p className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">按任务计划日期归组，蓝色为已完成。点击日期查看当天任务。</p>
        <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 4rem), 1fr))" }}>{days.map((date) => {
          const stats = taskSummary(data.tasks.filter((task) => task.dueDate === date));
          return <Link key={date} href={`/todos?date=${date}`} aria-label={`${date}，已完成 ${stats.done} / ${stats.total} 项`} className="button min-h-20 min-w-0 rounded-xl border border-[color:var(--border-subtle)] p-2 text-center focus-ring"><span className="block text-xs tabular-nums">{date.slice(5).replace("-", "/")}</span><span className="my-2 block h-1.5 overflow-hidden rounded-full bg-[var(--control-bg)]"><span className="block h-full rounded-full bg-blue-500" style={{ width: `${stats.percent ?? 0}%` }} /></span><span className="block text-xs tabular-nums text-[color:var(--text-muted)]">{stats.done}/{stats.total}</span></Link>;
        })}</div>
      </Card>
      <section aria-label="查找回顾任务" className="surface mb-4 space-y-3 p-4">
        <div className="relative"><Search size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-muted)]" /><Input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="搜索回顾任务" placeholder="搜索近几天的任务或计划时间" className="pl-10" /></div>
        <div role="group" aria-label="回顾任务状态" className="flex flex-wrap gap-2">{([['all', '全部'], ['done', '已完成'], ['pending', '待完成']] as const).map(([value, label]) => <Button key={value} size="sm" aria-pressed={filter === value} variant={filter === value ? "primary" : "ghost"} onClick={() => setFilter(value)}>{label}</Button>)}{(query || filter !== "all") && <Button size="sm" variant="ghost" onClick={() => { setQuery(""); setFilter("all"); }}>清除筛选</Button>}</div>
      </section>
      <p role="status" className="mb-4 text-xs text-[color:var(--text-muted)]">显示 {matches.length} / {summary.total} 项；已跳过 {summary.skipped} 项不计入进度。</p>
      <div className="space-y-4">{[...days].reverse().map((date) => {
        const rows = matches.filter((task) => task.dueDate === date);
        return rows.length ? <Card key={date} className="!p-0 overflow-hidden"><h2 className="border-b border-[color:var(--border-subtle)] px-5 py-4 text-sm font-semibold">{dateLabel(date)}</h2><TaskRows tasks={rows} /></Card> : null;
      })}{matches.length === 0 && <Card><p className="text-sm font-medium">{summary.total ? "没有匹配的任务" : "这个时间段还没有任务记录"}</p><p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">{summary.total ? "试试清除筛选；任务仍然保留。" : "去每日待办安排一件事，或在一周计划中选择日期。"}</p></Card>}</div>
      <p className="mt-5 text-xs leading-6 text-[color:var(--text-muted)]">统计按计划日期和当前完成状态计算，包含今天，不代表实际完成时刻。改期后任务归入新的计划日期；删除和恢复任务也会更新结果。当前回顾支持最近 30 天。</p>
    </>}
  </>;
}
