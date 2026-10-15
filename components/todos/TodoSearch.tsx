"use client";

import { Search, X } from "lucide-react";
import type { RefObject } from "react";
import { Input } from "@/components/ui/Input";

export function TodoSearch({ query, onChange, inputRef, includeOverdue, matching, total, loading }: {
  query: string;
  onChange: (query: string) => void;
  inputRef: RefObject<HTMLInputElement>;
  includeOverdue: boolean;
  matching: number;
  total: number;
  loading: boolean;
}) {
  const active = Boolean(query.trim());
  return <section aria-label="查找任务" className="surface space-y-2 p-4">
    <div className="relative">
      <Search size={16} aria-hidden className="pointer-events-none absolute left-[12px] top-1/2 -translate-y-1/2 text-[color:var(--text-muted)]" />
      <Input ref={inputRef} aria-label="搜索当前任务" aria-describedby="todo-search-scope" value={query} onChange={(event) => onChange(event.target.value)} placeholder="搜索任务内容或计划时间" className="pl-[36px] pr-[48px]" />
      {query && <button type="button" aria-label="清除任务搜索" className="button absolute inset-y-0 right-0 grid min-h-[44px] w-[44px] place-items-center rounded-xl text-[color:var(--text-muted)] focus-ring" onClick={() => { onChange(""); inputRef.current?.focus(); }}><X size={16} aria-hidden /></button>}
    </div>
    <p id="todo-search-scope" className="text-xs leading-relaxed text-[color:var(--text-muted)]">{includeOverdue ? "范围：当前日期与已加载的逾期任务；其他日期请先切换查看。" : "范围：当前日期的任务；其他日期请先切换查看。"}</p>
    {active && <p role="status" aria-live="polite" className="text-xs leading-relaxed text-[color:var(--text-secondary)]">{loading ? "正在加载当前范围…" : `匹配 ${matching} / ${total} 项；当日进度仍按全部任务计算。`}</p>}
  </section>;
}
