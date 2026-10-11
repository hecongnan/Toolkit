"use client";

import { RefreshCw, Search, X } from "lucide-react";
import type { RefObject } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MATERIAL_STATUS_LABEL, type MaterialSort } from "@/lib/materials";
import type { MaterialStatus } from "@/lib/types";
import type { LearningView } from "./useLearningView";

interface Props {
  view: LearningView;
  onChange: (patch: Partial<LearningView>) => void;
  categories: string[];
  counts: Record<MaterialStatus | "all", number>;
  searchInput: RefObject<HTMLInputElement>;
  hasFilters: boolean;
  onClear: () => void;
  visible: number;
  total: number;
  loading: boolean;
  refreshing: boolean;
  pending: number;
  onRefresh: () => void;
}

export function LearningToolbar({ view, onChange, categories, counts, searchInput, hasFilters, onClear, visible, total, loading, refreshing, pending, onRefresh }: Props) {
  return <>
    <section aria-label="查找学习资料" className="surface mb-4 space-y-3 p-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1"><Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-muted)]" />
          <Input ref={searchInput} value={view.query} onChange={(event) => onChange({ query: event.target.value })} placeholder="搜索标题、标签、笔记或链接" aria-label="搜索学习资料" className="pl-9 pr-12" />
          {view.query && <button type="button" aria-label="清除搜索" onClick={() => { onChange({ query: "" }); searchInput.current?.focus(); }} className="button icon-button absolute right-0 top-0 focus-ring"><X size={16} aria-hidden /></button>}
        </div>
        <select value={view.category} aria-label="资料分类" onChange={(event) => onChange({ category: event.target.value })} className="field-control min-h-11 min-w-0 w-full px-3 text-sm focus-ring sm:w-40">
          <option value="">全部分类</option>
          {view.category && !categories.includes(view.category) && <option value={view.category}>{view.category}（暂无资料）</option>}
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
      </div>
      <div role="group" aria-label="学习状态筛选" className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--control-bg)] p-1 min-[360px]:grid-cols-4">
        {(["all", "todo", "doing", "done"] as const).map((status) => <button key={status} type="button" aria-pressed={view.status === status} aria-label={status === "all" ? "全部" : MATERIAL_STATUS_LABEL[status]} onClick={() => onChange({ status })}
          className={"button flex min-h-11 min-w-0 flex-wrap items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium focus-ring " + (view.status === status ? "bg-[var(--surface)] text-[color:var(--accent)] shadow-sm" : "button-ghost")}>
          {status === "all" ? "全部" : MATERIAL_STATUS_LABEL[status]}<span className="tabular-nums text-[color:var(--text-muted)]">{counts[status]}</span>
        </button>)}
      </div>
    </section>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--text-muted)]">
      <p role="status" aria-live="polite">{loading ? "正在加载资料…" : "显示 " + visible + " / " + total + " 份资料"}{pending > 0 && " · 正在同步 " + pending + " 项"}</p>
      <div className="flex flex-wrap items-center gap-2">
        {hasFilters && <Button size="sm" variant="ghost" onClick={onClear}>清除筛选</Button>}
        <select aria-label="资料排序" value={view.sort} onChange={(event) => onChange({ sort: event.target.value as MaterialSort })} className="field-control min-h-11 max-w-full px-3 text-xs focus-ring"><option value="newest">最近添加</option><option value="priority">优先级</option><option value="updated">最近更新</option></select>
        <button type="button" onClick={onRefresh} disabled={loading || refreshing || pending > 0} aria-label="刷新资料" className="button icon-button focus-ring disabled:opacity-40"><RefreshCw size={16} aria-hidden /></button>
      </div>
    </div>
  </>;
}
