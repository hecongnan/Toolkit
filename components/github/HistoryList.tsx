"use client";

import { Github, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { AnalysisReport } from "@/lib/types";

interface Props {
  reports: AnalysisReport[];
  selectedId: string | null;
  onSelect: (r: AnalysisReport) => void;
  onDelete: (id: string) => void;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(ts).toLocaleDateString("zh-CN");
}

export function HistoryList({ reports, selectedId, onSelect, onDelete }: Props) {
  if (reports.length === 0) {
    return (
      <EmptyState
        icon={<Github size={20} />}
        title="历史为空"
        description="完成的分析会保存在这里，方便随时回看。"
      />
    );
  }

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="border-b border-white/5 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
        历史报告 · {reports.length}
      </div>
      <ul className="divide-y divide-white/5">
        {reports.map((r) => (
          <li
            key={r.id}
            className={
              "group flex items-center gap-2 transition " +
              (selectedId === r.id ? "bg-white/[0.04]" : "hover:bg-white/[0.03]")
            }
          >
            <button
              onClick={() => onSelect(r)}
              className="flex-1 px-4 py-3 text-left focus-ring"
            >
              <p className="text-sm font-medium text-zinc-100">
                {r.owner}/{r.repo}
              </p>
              <p className="line-clamp-1 text-xs text-zinc-500">
                {r.summary || r.repoUrl}
              </p>
              <p className="mt-1 text-[11px] text-zinc-600">
                {timeAgo(r.createdAt)} · {r.branch}
              </p>
            </button>
            <button
              onClick={() => {
                if (confirm("删除这条历史记录？")) onDelete(r.id);
              }}
              aria-label="删除"
              className="mr-2 rounded-md p-1.5 text-zinc-500 opacity-0 transition group-hover:opacity-100 hover:bg-rose-500/10 hover:text-rose-300 focus-ring focus:opacity-100"
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
