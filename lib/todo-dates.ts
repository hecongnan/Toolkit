import type { TodoRepeat } from "@/lib/types";

export const REPEAT_OPTIONS: Array<{ value: TodoRepeat; label: string }> = [
  { value: "none", label: "不重复" },
  { value: "daily", label: "每天" },
  { value: "weekdays", label: "周一至周五" },
  { value: "weekly", label: "每周" },
];

export function todayKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function shiftDate(value: string, days: number): string {
  if (!isDateKey(value)) throw new Error("无效日期");
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function firstRepeatDate(value: string, repeat: TodoRepeat): string {
  let date = value;
  if (!isDateKey(date)) return date;
  if (repeat === "weekdays") {
    while ([0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay())) date = shiftDate(date, 1);
  }
  return date;
}

export function repeatDescription(repeat: TodoRepeat, start: string): string {
  if (repeat === "none") return "只安排一次，不会自动重复。";
  if (!isDateKey(start)) return "请选择开始日期。";
  const first = firstRepeatDate(start, repeat);
  if (repeat === "weekdays") {
    return `从 ${first} 开始，每周一至周五出现；不按法定节假日调整。`;
  }
  if (repeat === "weekly") {
    const day = ["日", "一", "二", "三", "四", "五", "六"][new Date(`${start}T00:00:00Z`).getUTCDay()];
    return `从 ${start} 开始，每周${day}出现，与上次是否完成无关。`;
  }
  return `从 ${start} 开始，每天出现，与上次是否完成无关。`;
}

export function todoErrorMessage(error: unknown, fallback: string): string {
  const details = error as { message?: string; code?: string } | null;
  if (details?.code === "PGRST202" || details?.code === "42703" ||
      /todo_ensure_occurrences|todo_create|todo_edit|todo_remove|occurrence_date|skipped/.test(details?.message ?? "")) {
    return "任务功能需要更新后才能使用，请联系站点管理员。";
  }
  return details?.message || fallback;
}
