"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  Database,
  Github,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { Tag } from "@/components/ui/Tag";
import { readStorage, STORAGE_KEYS } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { todoErrorMessage } from "@/lib/todo-dates";
import {
  fromLocalAnalysisReport,
  fromLocalMaterial,
  fromLocalTodo,
  toAnalysisReport,
  toMaterial,
  toTodo,
  type AnalysisReportRow,
  type MaterialRow,
  type TodoRow,
} from "@/lib/supabase/mappers";
import type { AnalysisReport, Material, Todo } from "@/lib/types";

function formatToday(): string {
  return new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface LegacyCounts {
  materials: number;
  todos: number;
  reports: number;
}

function getLegacyCounts(): LegacyCounts | null {
  const materials = readStorage<Material[]>(STORAGE_KEYS.materials, []);
  const todos = readStorage<Todo[]>(STORAGE_KEYS.todos, []);
  const reports = readStorage<AnalysisReport[]>(STORAGE_KEYS.reports, []);
  const total = materials.length + todos.length + reports.length;
  if (!total) return null;
  return { materials: materials.length, todos: todos.length, reports: reports.length };
}

export default function DashboardPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [reports, setReports] = useState<AnalysisReport[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [legacyCounts, setLegacyCounts] = useState<LegacyCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const today = todayKey();

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLoadFailed(false);
    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) return;
      setUserId(user.id);

      const { error: recurrenceError } = await supabase.rpc("todo_ensure_occurrences", { p_date: today, p_today: today });
      if (recurrenceError) throw recurrenceError;

      const [todosRes, materialsRes, reportsRes] = await Promise.all([
        supabase
          .from("todos")
          .select("*")
          .eq("due_date", today)
          .eq("skipped", false)
          .order("position", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("materials")
          .select("*")
          .order("updated_at", { ascending: false }),
        supabase
          .from("analysis_reports")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(3),
      ]);

      if (todosRes.error) throw todosRes.error;
      if (materialsRes.error) throw materialsRes.error;
      if (reportsRes.error) throw reportsRes.error;

      setTodos(((todosRes.data ?? []) as TodoRow[]).map(toTodo));
      setMaterials(((materialsRes.data ?? []) as MaterialRow[]).map(toMaterial));
      setReports(((reportsRes.data ?? []) as AnalysisReportRow[]).map(toAnalysisReport));
      setLegacyCounts(getLegacyCounts());
    } catch (err: unknown) {
      setError(todoErrorMessage(err, "加载数据失败"));
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const migrateLegacyData = async () => {
    if (!userId) return;
    setMigrating(true);
    setError(null);
    try {
      const supabase = createClient();
      const oldMaterials = readStorage<Material[]>(STORAGE_KEYS.materials, []);
      const oldTodos = readStorage<Todo[]>(STORAGE_KEYS.todos, []);
      const oldReports = readStorage<AnalysisReport[]>(STORAGE_KEYS.reports, []);

      const saveRemaining = <T,>(key: string, remaining: T[]) => {
        if (remaining.length) {
          window.localStorage.setItem(key, JSON.stringify(remaining));
        } else {
          window.localStorage.removeItem(key);
        }
        setLegacyCounts(getLegacyCounts());
      };

      // Check the cloud before each insert. An earlier attempt may have written
      // a record even if the browser never received the response.
      while (oldMaterials.length) {
        const item = oldMaterials[0];
        const createdAt = new Date(item.createdAt).toISOString();
        const { data: existing, error: lookupError } = await supabase
          .from("materials")
          .select("id")
          .eq("user_id", userId)
          .eq("title", item.title)
          .eq("created_at", createdAt)
          .limit(1);
        if (lookupError) throw lookupError;
        if (!existing?.length) {
          const { error: insertError } = await supabase
            .from("materials")
            .insert(fromLocalMaterial(item, userId));
          if (insertError) throw insertError;
        }
        oldMaterials.shift();
        saveRemaining(STORAGE_KEYS.materials, oldMaterials);
      }

      while (oldTodos.length) {
        const item = oldTodos[0];
        const createdAt = new Date(item.createdAt).toISOString();
        const { data: existing, error: lookupError } = await supabase
          .from("todos")
          .select("id")
          .eq("user_id", userId)
          .eq("text", item.text)
          .eq("due_date", item.dueDate)
          .eq("created_at", createdAt)
          .limit(1);
        if (lookupError) throw lookupError;
        if (!existing?.length) {
          const { error: insertError } = await supabase
            .from("todos")
            .insert(fromLocalTodo(item, userId));
          if (insertError) throw insertError;
        }
        oldTodos.shift();
        saveRemaining(STORAGE_KEYS.todos, oldTodos);
      }

      while (oldReports.length) {
        const item = oldReports[0];
        const createdAt = new Date(item.createdAt).toISOString();
        const { data: existing, error: lookupError } = await supabase
          .from("analysis_reports")
          .select("id")
          .eq("user_id", userId)
          .eq("repo_url", item.repoUrl)
          .eq("created_at", createdAt)
          .limit(1);
        if (lookupError) throw lookupError;
        if (!existing?.length) {
          const { error: insertError } = await supabase
            .from("analysis_reports")
            .insert(fromLocalAnalysisReport(item, userId));
          if (insertError) throw insertError;
        }
        oldReports.shift();
        saveRemaining(STORAGE_KEYS.reports, oldReports);
      }

      setLegacyCounts(getLegacyCounts());
      await loadDashboard();
    } catch (err: unknown) {
      setLegacyCounts(getLegacyCounts());
      setError(err instanceof Error ? err.message : "导入旧数据失败");
    } finally {
      setMigrating(false);
    }
  };

  const todaysTodos = useMemo(
    () => todos.filter((t) => t.dueDate === today),
    [todos, today],
  );
  const completedToday = todaysTodos.filter((t) => t.done).length;
  const completionPct = todaysTodos.length
    ? Math.round((completedToday / todaysTodos.length) * 100)
    : 0;

  const inProgressMaterials = materials.filter((m) => m.status !== "done").length;
  const recentReports = reports.slice(0, 3);
  const previewTodos = [...todaysTodos]
    .sort((a, b) => Number(a.done) - Number(b.done) || a.position - b.position)
    .slice(0, 5);

  return (
    <>
      <PageHeader
        eyebrow="个人概览"
        title="今天，专注重要的事。"
        description={formatToday()}
        action={<Link href="/todos" className="button button-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium focus-ring">安排今日待办 <ArrowRight size={15} /></Link>}
      />

      {error && (
        <Card className="mb-6 border-rose-500/30 bg-rose-500/5">
          <p className="text-sm font-semibold text-rose-200">{loadFailed ? "加载失败" : "操作未完成"}</p>
          <p className="mt-1 text-sm text-rose-100/80">{error}</p>
          {loadFailed && <Button className="mt-3" onClick={loadDashboard}>重试加载</Button>}
        </Card>
      )}

      {legacyCounts && (
        <Card className="mb-6 border-teal-400/30 bg-teal-500/5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-gradient-soft text-teal-200">
                <Database size={18} />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-100">发现本机旧数据</p>
                <p className="mt-1 text-sm text-zinc-400">
                  学习资料 {legacyCounts.materials} 条、Todo {legacyCounts.todos} 条、报告 {legacyCounts.reports} 条，可导入当前账号。
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setLegacyCounts(null)}>
                暂不导入
              </Button>
              <Button variant="primary" onClick={migrateLegacyData} disabled={migrating}>
                {migrating && <Spinner size={14} className="text-white" />}
                导入云端
              </Button>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size={22} />
        </div>
      ) : loadFailed ? null : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              icon={<CheckCircle2 size={18} />}
              label="今日待办"
              value={`${completedToday}/${todaysTodos.length}`}
              hint={
                todaysTodos.length === 0
                  ? "今天还没有任务"
                  : `完成度 ${completionPct}%`
              }
              progress={completionPct}
              href="/todos"
            />
            <StatCard
              icon={<BookOpen size={18} />}
              label="学习资料"
              value={`${materials.length}`}
              hint={
                materials.length
                  ? `${inProgressMaterials} 项待学习`
                  : "去添加第一份资料"
              }
              href="/learning"
            />
            <StatCard
              icon={<Github size={18} />}
              label="最近分析"
              value={`${reports.length}`}
              hint={reports.length ? "查看最近的项目报告" : "从一个 GitHub 项目开始"}
              href="/github"
            />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <Card className="!p-0 overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                  <Sparkles size={16} className="text-teal-300" />
                  今日待办
                </div>
                <Link
                  href="/todos"
                  className="quiet-link inline-flex min-h-11 items-center gap-1 rounded-lg text-xs focus-ring"
                >
                  全部
                  <ArrowRight size={12} />
                </Link>
              </div>
              {previewTodos.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-zinc-500">
                  今天还没有任务，去添加一条吧。
                </div>
              ) : (
                <ul className="divide-y divide-white/5">
                  {previewTodos.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center gap-3 px-5 py-3 text-sm"
                    >
                      <span
                        className={
                          t.done
                            ? "h-4 w-4 shrink-0 rounded-full border border-teal-400/50 bg-brand-gradient"
                            : "h-4 w-4 shrink-0 rounded-full border border-white/15"
                        }
                      />
                      <span
                        className={
                          t.done
                            ? "flex-1 truncate text-zinc-500 line-through"
                            : "flex-1 truncate text-zinc-200"
                        }
                      >
                        {t.text}
                      </span>
                      {t.scheduledTime && (
                        <span className="hidden items-center gap-1 text-[11px] text-zinc-500 sm:inline-flex">
                          <Clock3 size={12} />
                          {t.scheduledTime}
                        </span>
                      )}
                      {t.priority === 1 && <Tag tone="rose">高</Tag>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="!p-0 overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                  <TrendingUp size={16} className="text-teal-300" />
                  最近分析
                </div>
                <Link
                  href="/github"
                  className="quiet-link inline-flex min-h-11 items-center gap-1 rounded-lg text-xs focus-ring"
                >
                  全部
                  <ArrowRight size={12} />
                </Link>
              </div>
              {recentReports.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-zinc-500">
                  粘贴一个 GitHub 仓库地址即可生成分析报告。
                </div>
              ) : (
                <ul className="divide-y divide-white/5">
                  {recentReports.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/github?id=${r.id}`}
                        className="flex flex-col gap-1 px-5 py-3 transition hover:bg-white/[0.03]"
                      >
                        <span className="text-sm font-medium text-zinc-100">
                          {r.owner}/{r.repo}
                        </span>
                        <span className="line-clamp-1 text-xs text-zinc-500">
                          {r.summary || r.repoUrl}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  progress,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  progress?: number;
  href: string;
}) {
  return (
    <Link href={href} className="group block focus-ring rounded-2xl">
      <Card className="stat-card h-full">
        <div className="mb-4 flex items-center justify-between">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent-soft)] text-[color:var(--accent)]">
            {icon}
          </div>
          <ArrowRight size={16} className="text-[color:var(--text-faint)]" />
        </div>
        <p className="text-sm text-zinc-400">{label}</p>
        <p className="mt-2 text-4xl font-semibold tabular-nums tracking-[-0.04em] text-zinc-50">{value}</p>
        <p className="mt-2 text-xs text-zinc-500">{hint}</p>
        {typeof progress === "number" && (
          <div role="progressbar" aria-label="今日待办完成度" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--control-bg)]">
            <div
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </Card>
    </Link>
  );
}
