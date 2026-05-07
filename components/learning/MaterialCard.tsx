"use client";

import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import type { Material, MaterialStatus } from "@/lib/types";

const STATUS_LABEL: Record<MaterialStatus, string> = {
  todo: "待学",
  doing: "进行中",
  done: "已完成",
};
const STATUS_TONE: Record<MaterialStatus, "default" | "violet" | "amber" | "emerald"> = {
  todo: "default",
  doing: "amber",
  done: "emerald",
};
const PRIORITY_LABEL: Record<number, string> = { 1: "高", 2: "中", 3: "低" };
const PRIORITY_TONE = { 1: "rose", 2: "amber", 3: "sky" } as const;

interface Props {
  material: Material;
  onEdit: (m: Material) => void;
  onDelete: (id: string) => void;
  onCycleStatus: (id: string) => void;
}

export function MaterialCard({ material, onEdit, onDelete, onCycleStatus }: Props) {
  const updated = new Date(material.updatedAt).toLocaleDateString("zh-CN");
  return (
    <Card className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => onCycleStatus(material.id)}
          className="focus-ring rounded-md"
          title="点击切换状态"
        >
          <Tag tone={STATUS_TONE[material.status]}>
            {STATUS_LABEL[material.status]}
          </Tag>
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(material)}
            aria-label="编辑"
            className="rounded-md p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100 focus-ring"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onDelete(material.id)}
            aria-label="删除"
            className="rounded-md p-1.5 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-300 focus-ring"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1">
        <h3 className="text-base font-semibold leading-snug text-zinc-50 line-clamp-2">
          {material.title}
        </h3>
        {material.notes && (
          <p className="mt-1.5 line-clamp-3 text-sm text-zinc-400">
            {material.notes}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {material.category && <Tag tone="violet">{material.category}</Tag>}
        <Tag tone={PRIORITY_TONE[material.priority]}>
          P{material.priority} · {PRIORITY_LABEL[material.priority]}
        </Tag>
        {material.tags.slice(0, 3).map((t) => (
          <Tag key={t}>#{t}</Tag>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-white/5 pt-3 text-xs text-zinc-500">
        <span>{updated}</span>
        {material.url && (
          <a
            href={material.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-fuchsia-300 hover:text-fuchsia-200"
          >
            打开
            <ExternalLink size={12} />
          </a>
        )}
      </div>
    </Card>
  );
}
