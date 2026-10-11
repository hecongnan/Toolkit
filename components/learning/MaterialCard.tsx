"use client";

import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { MATERIAL_STATUS_LABEL, safeMaterialUrl } from "@/lib/materials";
import type { Material, MaterialStatus } from "@/lib/types";

const PRIORITY_LABEL: Record<number, string> = { 1: "高", 2: "中", 3: "低" };
const PRIORITY_TONE = { 1: "rose", 2: "amber", 3: "sky" } as const;

interface Props {
  material: Material;
  onEdit: (material: Material) => void;
  onView: (material: Material) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: MaterialStatus) => void;
  pending?: boolean;
  error?: string;
  onRetry?: () => void;
}

export function MaterialCard({ material, onEdit, onView, onDelete, onStatusChange, pending = false, error, onRetry }: Props) {
  const url = safeMaterialUrl(material.url);
  const tags = Array.from(new Set(material.tags));
  return <Card role="article" aria-label={material.title} aria-busy={pending} data-material-id={material.id} className="flex h-full min-w-0 flex-col gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <select value={material.status} disabled={pending} aria-label={"学习状态：" + material.title}
        onChange={(event) => onStatusChange(material.id, event.target.value as MaterialStatus)}
        className="field-control min-h-11 min-w-0 max-w-full rounded-xl px-3 text-xs focus-ring disabled:opacity-60">
        {(["todo", "doing", "done"] as const).map((status) => <option key={status} value={status}>{MATERIAL_STATUS_LABEL[status]}</option>)}
      </select>
      <div className="flex items-center gap-1">
        <button type="button" disabled={pending} onClick={() => onEdit(material)} aria-label="编辑" className="button icon-button focus-ring disabled:opacity-30"><Pencil size={16} aria-hidden /></button>
        <button type="button" disabled={pending} onClick={() => onDelete(material.id)} aria-label="删除" className="button icon-button status-error focus-ring disabled:opacity-30"><Trash2 size={16} aria-hidden /></button>
      </div>
    </div>
    <div className="min-w-0 flex-1">
      <h3><button type="button" onClick={() => onView(material)} aria-label={"查看资料：" + material.title} title={material.title}
        className="button min-h-11 w-full rounded-lg text-left text-base font-semibold leading-relaxed text-[color:var(--text-primary)] focus-ring">
        <span className="line-clamp-2 break-words">{material.title}</span>
      </button></h3>
      {material.notes && <p className="mt-1 line-clamp-3 break-words text-sm leading-relaxed text-[color:var(--text-secondary)]">{material.notes}</p>}
    </div>
    <div className="flex flex-wrap items-center gap-1.5">
      {material.category && <Tag tone="teal" className="max-w-full break-all">{material.category}</Tag>}
      <Tag tone={PRIORITY_TONE[material.priority]}>P{material.priority} · {PRIORITY_LABEL[material.priority]}</Tag>
      {tags.slice(0, 3).map((tag) => <Tag key={tag} className="max-w-full break-all">#{tag}</Tag>)}
      {tags.length > 3 && <span className="text-xs text-[color:var(--text-muted)]">+{tags.length - 3} 个标签</span>}
    </div>
    {error && <div className="space-y-1"><p role="alert" className="break-words text-xs leading-relaxed status-error">{error}</p>{onRetry && <Button size="sm" disabled={pending} onClick={onRetry}>重试状态更新</Button>}</div>}
    <p className="text-xs text-[color:var(--text-muted)]">{pending ? "正在同步…" : "更新于 " + new Date(material.updatedAt).toLocaleDateString("zh-CN")}</p>
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--border-subtle)] pt-2">
      <Button size="sm" variant="ghost" onClick={() => onView(material)}>查看笔记</Button>
      {url && <a href={url} target="_blank" rel="noopener noreferrer" className="quiet-link inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm focus-ring">打开资料<ExternalLink size={14} aria-hidden /><span className="sr-only">（新窗口）</span></a>}
      {material.url && !url && <span className="text-xs status-warning">链接需修正</span>}
    </div>
  </Card>;
}
