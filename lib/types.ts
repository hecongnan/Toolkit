export type MaterialStatus = "todo" | "doing" | "done";

export interface Material {
  id: string;
  title: string;
  url?: string;
  category: string;
  tags: string[];
  status: MaterialStatus;
  priority: 1 | 2 | 3;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  priority: 1 | 2 | 3;
  dueDate: string;
  createdAt: number;
}

export interface AnalysisReport {
  id: string;
  repoUrl: string;
  owner: string;
  repo: string;
  branch: string;
  summary: string;
  markdown: string;
  createdAt: number;
}
