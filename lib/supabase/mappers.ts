import type {
  AnalysisChatMessage,
  AnalysisChatRole,
  AnalysisReport,
  Material,
  MaterialStatus,
  Todo,
  TodoRepeat,
} from "@/lib/types";

export interface MaterialRow {
  id: string;
  title: string;
  url: string | null;
  category: string;
  tags: string[] | null;
  status: MaterialStatus;
  priority: 1 | 2 | 3;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TodoRow {
  id: string;
  text: string;
  done: boolean;
  priority: 1 | 2 | 3;
  due_date: string;
  scheduled_time: string | null;
  repeat_rule: TodoRepeat;
  series_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface AnalysisReportRow {
  id: string;
  repo_url: string;
  owner: string;
  repo: string;
  branch: string;
  summary: string;
  markdown: string;
  created_at: string;
}

export interface AnalysisChatRow {
  id: string;
  report_id: string;
  role: AnalysisChatRole;
  content: string;
  created_at: string;
}

export function toMaterial(row: MaterialRow): Material {
  return {
    id: row.id,
    title: row.title,
    url: row.url ?? undefined,
    category: row.category,
    tags: row.tags ?? [],
    status: row.status,
    priority: row.priority,
    notes: row.notes ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

export function toTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    text: row.text,
    done: row.done,
    priority: row.priority,
    dueDate: row.due_date,
    scheduledTime: row.scheduled_time?.slice(0, 5) || undefined,
    repeat: row.repeat_rule ?? "none",
    seriesId: row.series_id ?? undefined,
    position: row.position ?? 0,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at ?? row.created_at).getTime(),
  };
}

export function toAnalysisReport(row: AnalysisReportRow): AnalysisReport {
  return {
    id: row.id,
    repoUrl: row.repo_url,
    owner: row.owner,
    repo: row.repo,
    branch: row.branch,
    summary: row.summary,
    markdown: row.markdown,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export function toAnalysisChatMessage(row: AnalysisChatRow): AnalysisChatMessage {
  return {
    id: row.id,
    reportId: row.report_id,
    role: row.role,
    content: row.content,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export function fromLocalMaterial(material: Material, userId: string) {
  return {
    user_id: userId,
    title: material.title,
    url: material.url ?? null,
    category: material.category,
    tags: material.tags,
    status: material.status,
    priority: material.priority,
    notes: material.notes ?? null,
    created_at: new Date(material.createdAt).toISOString(),
    updated_at: new Date(material.updatedAt).toISOString(),
  };
}

export function fromLocalTodo(todo: Todo, userId: string) {
  return {
    user_id: userId,
    text: todo.text,
    done: todo.done,
    priority: todo.priority,
    due_date: todo.dueDate,
    scheduled_time: todo.scheduledTime ?? null,
    repeat_rule: todo.repeat ?? "none",
    series_id: todo.seriesId ?? null,
    position: todo.position ?? 0,
    created_at: new Date(todo.createdAt).toISOString(),
    updated_at: new Date(todo.updatedAt ?? todo.createdAt).toISOString(),
  };
}

export function fromLocalAnalysisReport(report: AnalysisReport, userId: string) {
  return {
    user_id: userId,
    repo_url: report.repoUrl,
    owner: report.owner,
    repo: report.repo,
    branch: report.branch,
    summary: report.summary,
    markdown: report.markdown,
    created_at: new Date(report.createdAt).toISOString(),
  };
}
