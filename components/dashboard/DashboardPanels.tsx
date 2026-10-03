"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2, Clock3, Github, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import type { SectionState, useDashboard } from "./useDashboard";

interface Props {
  data: ReturnType<typeof useDashboard>;
  hasLegacyData: boolean;
}

export function DashboardPanels({ data, hasLegacyData }: Props) {
  const { todos, materials, reports, hasAnyTodos, userId, status, reloadSection } = data;
  const completed = todos.filter((todo) => todo.done).length;
  const preview = [...todos].sort((a, b) => Number(a.done) - Number(b.done) || a.position - b.position).slice(0, 5);
  const emptyWorkspace = Boolean(userId) && !data.accountError && hasAnyTodos === false && materials.length === 0 && reports.length === 0 &&
    !hasLegacyData && Object.values(status).every((section) => section.loaded && !section.error);

  if (emptyWorkspace) {
    return <Card className="max-w-3xl" role="region" aria-labelledby="welcome-start-title">
      <div className="mb-5 grid h-11 w-11 place-items-center rounded-xl bg-[var(--accent-soft)] text-[color:var(--accent)]"><Sparkles size={20} aria-hidden /></div>
      <h2 id="welcome-start-title" className="text-2xl font-semibold tracking-tight">从第一条待办开始</h2>
      <p className="mt-3 max-w-lg text-sm leading-6 text-[color:var(--text-muted)]">写下一件今天想完成的事。不必一次安排好所有计划，从一小步开始就好。</p>
      <Link href="/todos" className="button button-primary mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium focus-ring">创建第一条待办 <ArrowRight size={15} aria-hidden /></Link>
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-[color:var(--border-subtle)] pt-4 text-sm">
        <Link href="/learning" className="quiet-link inline-flex min-h-11 items-center gap-2 rounded-lg focus-ring"><BookOpen size={16} aria-hidden />也可以先添加学习资料</Link>
        <Link href="/settings" className="quiet-link inline-flex min-h-11 items-center rounded-lg focus-ring">AI 可以稍后设置</Link>
      </div>
    </Card>;
  }

  return <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
    <Card className="!p-0 overflow-hidden" role="region" aria-labelledby="overview-todos-title" aria-busy={status.todos.loading}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--border-subtle)] px-4 py-3 sm:px-5">
        <h2 id="overview-todos-title" className="inline-flex items-center gap-2 text-sm font-semibold"><CheckCircle2 size={17} className="text-[color:var(--accent)]" aria-hidden />今日待办</h2>
        <Link href="/todos" className="quiet-link inline-flex min-h-11 items-center gap-1 rounded-lg text-xs focus-ring">管理待办 <ArrowRight size={13} aria-hidden /></Link>
      </div>
      <ModuleFeedback label="今日待办" state={status.todos} onRetry={() => void reloadSection("todos")} retryLabel="重试待办" />
      {!status.todos.loaded && status.todos.loading && <SectionSkeleton label="正在加载今日待办" rows={3} />}
      {status.todos.loaded && (preview.length > 0 ? <ul className="divide-y divide-[color:var(--border-subtle)]">
        {preview.map((todo) => <li key={todo.id}>
          <Link href="/todos" aria-label={`在每日待办中查看：${todo.text}`} className="button button-ghost flex min-h-16 items-center gap-3 px-4 py-3 focus-ring sm:px-5">
            <div className="min-w-0 flex-1">
              <p className={`line-clamp-2 break-words text-sm leading-6 ${todo.done ? "text-[color:var(--text-muted)] line-through" : "text-[color:var(--text-primary)]"}`}>{todo.text}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--text-muted)]">
                <span className="inline-flex items-center gap-1">{todo.done && <CheckCircle2 size={12} aria-hidden />}{todo.done ? "已完成" : "待完成"}</span>
                {todo.scheduledTime && <span className="inline-flex items-center gap-1 tabular-nums"><Clock3 size={12} aria-hidden />{todo.scheduledTime}</span>}
                {todo.priority === 1 && <Tag tone="rose">优先</Tag>}
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-[color:var(--accent)]">查看 <ArrowRight size={13} aria-hidden /></span>
          </Link>
        </li>)}
      </ul> : <div className="px-5 py-6">
        <p className="text-sm font-medium">今天还没有安排</p>
        <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">挑一件想完成的事，给今天一个轻松的开始。</p>
        <Link href="/todos" className="button button-primary mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-medium focus-ring">添加今日待办 <ArrowRight size={15} aria-hidden /></Link>
      </div>)}
    </Card>

    <div className="min-w-0 space-y-5">
      <section aria-label="工作区摘要" className="grid grid-cols-3 gap-2 sm:gap-3">
        <SummaryCard label="今日进度" value={`${completed}/${todos.length}`} hint={todos.length ? `${Math.round(completed / todos.length * 100)}% 已完成` : "今日未安排"} icon={<CheckCircle2 size={16} />} href="/todos" state={status.todos} />
        <SummaryCard label="学习资料" value={String(materials.length)} hint={`${materials.filter((item) => item.status !== "done").length} 项待学习`} icon={<BookOpen size={16} />} href="/learning" state={status.materials} />
        <SummaryCard label="最近分析" value={String(reports.length)} hint="最近的报告" icon={<Github size={16} />} href="/github" state={status.reports} />
      </section>
      {status.materials.error && <Card className="!p-0" role="region" aria-label="学习资料加载状态"><ModuleFeedback label="学习资料" state={status.materials} onRetry={() => void reloadSection("materials")} retryLabel="重试资料" /></Card>}
      <Card className="!p-0 overflow-hidden" role="region" aria-labelledby="overview-reports-title" aria-busy={status.reports.loading}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--border-subtle)] px-4 py-3 sm:px-5">
          <h2 id="overview-reports-title" className="inline-flex items-center gap-2 text-sm font-semibold"><Github size={17} className="text-[color:var(--accent)]" aria-hidden />最近分析</h2>
          <Link href="/github" className="quiet-link inline-flex min-h-11 items-center gap-1 rounded-lg text-xs focus-ring">查看全部 <ArrowRight size={13} aria-hidden /></Link>
        </div>
        <ModuleFeedback label="项目报告" state={status.reports} onRetry={() => void reloadSection("reports")} retryLabel="重试报告" />
        {!status.reports.loaded && status.reports.loading && <SectionSkeleton label="正在加载项目报告" rows={2} />}
        {status.reports.loaded && (reports.length > 0 ? <ul className="divide-y divide-[color:var(--border-subtle)]">
          {reports.map((report) => <li key={report.id}><Link href={`/github?id=${report.id}`} className="button button-ghost flex min-h-16 items-center gap-3 px-4 py-3 focus-ring sm:px-5">
            <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium text-[color:var(--text-primary)]">{report.owner}/{report.repo}</p><p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-[color:var(--text-muted)]">{report.summary || report.repoUrl}</p></div>
            <ArrowRight size={14} className="shrink-0 text-[color:var(--accent)]" aria-hidden />
          </Link></li>)}
        </ul> : <div className="px-5 py-6"><p className="text-sm text-[color:var(--text-muted)]">想了解一个项目？从 GitHub 仓库地址开始。</p><Link href="/github" className="quiet-link mt-3 inline-flex min-h-11 items-center gap-1 rounded-lg text-sm focus-ring">分析一个项目 <ArrowRight size={14} aria-hidden /></Link></div>)}
      </Card>
    </div>
  </div>;
}

function SummaryCard({ label, value, hint, icon, href, state }: { label: string; value: string; hint: string; icon: React.ReactNode; href: string; state: SectionState }) {
  const description = state.error ? state.loaded ? "更新失败" : "暂不可用" : state.loading ? state.loaded ? "正在更新" : "正在加载" : hint;
  return <Link href={href} aria-label={label} className="group min-w-0 rounded-2xl focus-ring">
    <Card className="stat-card h-full !p-3 sm:!p-4">
      <span className="mb-3 inline-flex text-[color:var(--accent)]" aria-hidden>{icon}</span>
      <p className="break-words text-xs font-medium text-[color:var(--text-muted)]">{label}</p>
      <p className="mt-2 break-words text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">{state.loaded ? value : "—"}</p>
      <p className="mt-2 break-words text-xs leading-5 text-[color:var(--text-muted)]">{description}</p>
    </Card>
  </Link>;
}

function ModuleFeedback({ label, state, onRetry, retryLabel }: { label: string; state: SectionState; onRetry: () => void; retryLabel: string }) {
  if (state.error) return <div role="alert" className="m-4 space-y-2 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
    <p className="status-error text-sm font-medium">{label}{state.loaded ? "更新失败，已保留上次内容" : "暂时无法加载"}</p>
    <p className="break-words text-xs leading-5 text-[color:var(--text-muted)]">{state.error}</p>
    <Button size="sm" disabled={state.loading} onClick={onRetry}>{retryLabel}</Button>
  </div>;
  return null;
}

function SectionSkeleton({ label, rows }: { label: string; rows: number }) {
  return <div role="status" aria-label={label} className="px-5 py-4">
    <span className="sr-only">{label}</span>
    <div aria-hidden className="space-y-5">{Array.from({ length: rows }, (_, index) => <div key={index} className="space-y-2 py-1"><div className="h-4 w-2/3 rounded bg-[var(--control-bg)]" /><div className="h-3 w-1/3 rounded bg-[var(--control-bg)]" /></div>)}</div>
  </div>;
}
