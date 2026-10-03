"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toAnalysisReport, toMaterial, toTodo, type AnalysisReportRow, type MaterialRow, type TodoRow } from "@/lib/supabase/mappers";
import { todayKey, todoErrorMessage } from "@/lib/todo-dates";
import type { AnalysisReport, Material, Todo } from "@/lib/types";

export type DashboardSection = "todos" | "materials" | "reports";
export interface SectionState {
  loading: boolean;
  loaded: boolean;
  error: string | null;
}

const sections: DashboardSection[] = ["todos", "materials", "reports"];

export function useDashboard() {
  const today = todayKey();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [reports, setReports] = useState<AnalysisReport[]>([]);
  const [hasAnyTodos, setHasAnyTodos] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<DashboardSection, SectionState>>(() => ({
    todos: { loading: true, loaded: false, error: null },
    materials: { loading: true, loaded: false, error: null },
    reports: { loading: true, loaded: false, error: null },
  }));
  const requests = useRef({ todos: 0, materials: 0, reports: 0, account: 0 });

  const reloadSection = useCallback(async (section: DashboardSection) => {
    const request = ++requests.current[section];
    setStatus((current) => ({ ...current, [section]: { ...current[section], loading: true, error: null } }));
    try {
      const supabase = createClient();
      if (section === "todos") {
        const { error } = await supabase.rpc("todo_ensure_occurrences", { p_date: today, p_today: today });
        if (error) throw error;
        const [day, existing] = await Promise.all([
          supabase.from("todos").select("*").eq("due_date", today).eq("skipped", false).order("position").order("created_at"),
          // An empty day is not necessarily a new account: check other dates too.
          supabase.from("todos").select("id").limit(1),
        ]);
        if (day.error) throw day.error;
        if (existing.error) throw existing.error;
        if (requests.current[section] !== request) return;
        setTodos(((day.data ?? []) as TodoRow[]).map(toTodo));
        setHasAnyTodos(Boolean(existing.data?.length));
      } else if (section === "materials") {
        const { data, error } = await supabase.from("materials").select("*").order("updated_at", { ascending: false });
        if (error) throw error;
        if (requests.current[section] !== request) return;
        setMaterials(((data ?? []) as MaterialRow[]).map(toMaterial));
      } else {
        const { data, error } = await supabase.from("analysis_reports").select("*").order("created_at", { ascending: false }).limit(3);
        if (error) throw error;
        if (requests.current[section] !== request) return;
        setReports(((data ?? []) as AnalysisReportRow[]).map(toAnalysisReport));
      }
      setStatus((current) => ({ ...current, [section]: { loading: false, loaded: true, error: null } }));
    } catch (error: unknown) {
      if (requests.current[section] !== request) return;
      const message = todoErrorMessage(error, "暂时无法加载，请检查网络后重试。");
      setStatus((current) => ({ ...current, [section]: { ...current[section], loading: false, error: message } }));
    }
  }, [today]);

  const loadDashboard = useCallback(async () => {
    const request = ++requests.current.account;
    setAccountError(null);
    const loadAccount = async () => {
      try {
        const { data: { user }, error } = await createClient().auth.getUser();
        if (error) throw error;
        if (request !== requests.current.account) return;
        setUserId(user?.id ?? null);
        if (!user) setAccountError("登录状态已失效，请重新登录。");
      } catch {
        if (request === requests.current.account) {
          setUserId(null);
          setAccountError("暂时无法确认账号信息，请刷新重试。");
        }
      }
    };
    // Each section publishes its own result without waiting for the others.
    await Promise.all([loadAccount(), ...sections.map(reloadSection)]);
  }, [reloadSection]);

  useEffect(() => {
    const currentRequests = requests.current;
    void loadDashboard();
    return () => {
      currentRequests.account += 1;
      for (const section of sections) currentRequests[section] += 1;
    };
  }, [loadDashboard]);

  return { today, todos, materials, reports, hasAnyTodos, userId, accountError, status, reloadSection, loadDashboard };
}
