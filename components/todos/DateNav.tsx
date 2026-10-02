"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { isDateKey, shiftDate, todayKey } from "@/lib/todo-dates";

interface Props {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
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

export function DateNav({ value, onChange, disabled = false }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="surface flex items-center gap-0.5 p-1">
        <button
          disabled={disabled}
          onClick={() => onChange(shiftDate(value, -1))}
          aria-label="上一天"
          className="button icon-button focus-ring"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          disabled={disabled}
          onClick={() => onChange(todayKey())}
          className="button button-ghost min-h-11 rounded-xl px-3 text-sm font-medium focus-ring"
        >
          今天
        </button>
        <button
          disabled={disabled}
          onClick={() => onChange(shiftDate(value, 1))}
          aria-label="下一天"
          className="button icon-button focus-ring"
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="flex flex-1 flex-wrap items-baseline justify-end gap-x-2 gap-y-1 text-sm sm:justify-center">
        <span aria-live="polite" className="font-semibold text-zinc-100">{relativeLabel(value)}</span>
        <span className="text-xs tabular-nums text-zinc-500">{value}</span>
      </div>
      <label className="relative inline-flex w-full items-center sm:w-auto">
        <CalendarDays
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
        />
        <input
          type="date"
          aria-label="选择任务日期"
          disabled={disabled}
          value={value}
          onChange={(e) => { if (isDateKey(e.target.value)) onChange(e.target.value); }}
          className="field-control min-h-11 w-full min-w-0 pl-9 pr-3 text-sm focus-ring sm:w-auto"
        />
      </label>
    </div>
  );
}
