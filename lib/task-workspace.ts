import { isDateKey, shiftDate } from "./todo-dates";
import type { Todo } from "./types";

export function weekStart(date: string): string {
  if (!isDateKey(date)) throw new Error("无效日期");
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return shiftDate(date, -((weekday + 6) % 7));
}

export function dateRange(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => shiftDate(start, index));
}

export function taskSummary(tasks: Todo[]) {
  const active = tasks.filter((task) => !task.skipped);
  const done = active.filter((task) => task.done).length;
  return { total: active.length, done, pending: active.length - done,
    skipped: tasks.length - active.length, percent: active.length ? Math.round(done / active.length * 100) : null };
}

export function dateLabel(date: string, options: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", weekday: "short" }): string {
  return new Intl.DateTimeFormat("zh-CN", { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

export function taskHref(task: Todo): string {
  return `/todos?date=${task.dueDate}&q=${encodeURIComponent(task.text)}`;
}
