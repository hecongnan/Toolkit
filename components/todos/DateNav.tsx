"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  value: string;
  onChange: (next: string) => void;
}

function shiftDate(value: string, days: number): string {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayKey(): string {
  return formatDate(new Date());
}

function relativeLabel(value: string): string {
  const today = todayKey();
  if (value === today) return "今天";
  if (value === shiftDate(today, -1)) return "昨天";
  if (value === shiftDate(today, 1)) return "明天";
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

export function DateNav({ value, onChange }: Props) {
  return (
    <div className="surface flex flex-wrap items-center justify-between gap-3 p-3">
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(shiftDate(value, -1))}
          aria-label="上一天"
          className="rounded-lg p-2 text-zinc-300 hover:bg-white/5 focus-ring"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={() => onChange(todayKey())}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/5 focus-ring"
        >
          今天
        </button>
        <button
          onClick={() => onChange(shiftDate(value, 1))}
          aria-label="下一天"
          className="rounded-lg p-2 text-zinc-300 hover:bg-white/5 focus-ring"
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold text-zinc-100">{relativeLabel(value)}</span>
        <span className="text-zinc-500">{value}</span>
      </div>
      <label className="relative inline-flex items-center">
        <CalendarDays
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
        />
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 rounded-lg border border-white/10 bg-white/[0.03] pl-9 pr-3 text-xs text-zinc-200 focus-ring hover:border-white/20 [color-scheme:dark]"
        />
      </label>
    </div>
  );
}
