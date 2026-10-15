import type { Todo, TodoRepeat } from "@/lib/types";

export interface TodoRow {
  id: string;
  text: string;
  done: boolean;
  priority: 1 | 2 | 3;
  due_date: string;
  scheduled_time: string | null;
  repeat_rule: TodoRepeat;
  series_id: string | null;
  occurrence_date?: string | null;
  skipped?: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export function toTodo(row: TodoRow): Todo {
  return {
    id: row.id, text: row.text, done: row.done, priority: row.priority,
    dueDate: row.due_date, scheduledTime: row.scheduled_time?.slice(0, 5) || undefined,
    repeat: row.repeat_rule ?? "none", seriesId: row.series_id ?? undefined,
    occurrenceDate: row.occurrence_date ?? undefined, skipped: row.skipped ?? false,
    position: row.position ?? 0,
    createdAt: new Date(row.created_at).getTime(), updatedAt: new Date(row.updated_at ?? row.created_at).getTime(),
  };
}
