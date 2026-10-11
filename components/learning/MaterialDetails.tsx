import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Tag } from "@/components/ui/Tag";
import { MATERIAL_STATUS_LABEL, safeMaterialUrl } from "@/lib/materials";
import type { Material } from "@/lib/types";

export function MaterialDetails({ material, onClose }: { material?: Material; onClose: () => void }) {
  const url = safeMaterialUrl(material?.url);
  return <Modal open={Boolean(material)} onClose={onClose} title="资料详情">
    {material && <div className="space-y-4">
      <h3 className="break-words text-lg font-semibold">{material.title}</h3>
      <div className="flex flex-wrap gap-2"><Tag>{MATERIAL_STATUS_LABEL[material.status]}</Tag><Tag className="max-w-full break-all">{material.category}</Tag>{material.tags.map((tag, index) => <Tag className="max-w-full break-all" key={tag + "-" + index}>#{tag}</Tag>)}</div>
      <section aria-label="完整学习笔记" className="rounded-xl bg-[var(--control-bg)] p-4"><h4 className="mb-2 text-sm font-medium">学习笔记</h4><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[color:var(--text-secondary)]">{material.notes || "还没有笔记，可在编辑资料中记录学习目标、要点或下一步。"}</p></section>
      {url && <a href={url} target="_blank" rel="noopener noreferrer" className="quiet-link inline-flex min-h-11 max-w-full items-center gap-2 rounded-xl text-sm focus-ring"><ExternalLink size={16} className="shrink-0" aria-hidden /><span className="break-all">{url}</span><span className="sr-only">（新窗口）</span></a>}
      {material.url && !url && <p className="status-warning text-sm">链接格式不安全或无效，请编辑为 http 或 https 链接。</p>}
      <div className="flex justify-end"><Button onClick={onClose}>返回资料列表</Button></div>
    </div>}
  </Modal>;
}
