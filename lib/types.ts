export type TodoRepeat = "none" | "daily" | "weekdays" | "weekly";
export type TodoScope = "single" | "future";

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  priority: 1 | 2 | 3;
  dueDate: string;
  scheduledTime?: string;
  repeat: TodoRepeat;
  seriesId?: string;
  occurrenceDate?: string;
  skipped?: boolean;
  position: number;
  createdAt: number;
  updatedAt: number;
}
