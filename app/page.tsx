"use client";

import { Database, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard/useDashboard";
import { DashboardPanels } from "@/components/dashboard/DashboardPanels";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { readStorage, STORAGE_KEYS } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import {
  fromLocalAnalysisReport,
  fromLocalMaterial,
  fromLocalTodo,
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
  const dashboard = useDashboard();
  const { userId, accountError, status, loadDashboard } = dashboard;
  const [legacyCounts, setLegacyCounts] = useState<LegacyCounts | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLegacyCounts(getLegacyCounts());
  }, []);

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

  const refreshing = Object.values(status).some((section) => section.loading);

  return (
    <>
      <PageHeader
        eyebrow="个人概览"
        title="今天，专注重要的事。"
        description={formatToday()}
        action={<Button variant="ghost" disabled={refreshing || migrating} onClick={() => void loadDashboard()}><RefreshCw size={15} />{refreshing ? "正在同步" : "刷新概览"}</Button>}
      />

      {(error || accountError) && (
        <Card role="alert" className="mb-6 border-rose-500/30 bg-rose-500/5">
          <p className="status-error text-sm font-semibold">{error ? "导入未完成" : "账号信息暂不可用"}</p>
          <p className="mt-1 text-sm text-[color:var(--text-secondary)]">{error || accountError}</p>
          {accountError && <Button className="mt-3" disabled={refreshing} onClick={() => void loadDashboard()}>重新检查账号</Button>}
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
              <Button variant="primary" onClick={migrateLegacyData} disabled={migrating || !userId}>
                {migrating && <Spinner size={14} className="text-white" />}
                导入云端
              </Button>
            </div>
          </div>
        </Card>
      )}

      <DashboardPanels data={dashboard} hasLegacyData={Boolean(legacyCounts)} />
    </>
  );
}
