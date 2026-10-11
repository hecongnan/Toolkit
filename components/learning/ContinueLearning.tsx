import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { safeMaterialUrl } from "@/lib/materials";
import type { Material } from "@/lib/types";

export function ContinueLearning({ material, onView, onBrowse }: { material?: Material; onView: (id: string) => void; onBrowse: () => void }) {
  const url = safeMaterialUrl(material?.url);
  return <section aria-label="继续学习" className="surface mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0"><p className="section-label mb-1">继续学习</p><p className="min-h-12 line-clamp-2 break-words font-medium text-[color:var(--text-primary)]">{material?.title || "选一份资料，开始新的学习"}</p>
      <p className="mt-1 min-h-4 text-xs text-[color:var(--text-muted)]">{material ? "上次更新 " + new Date(material.updatedAt).toLocaleDateString("zh-CN") + (material.category ? " · " + material.category : "") : "将资料设为进行中，下次可从这里接着学。"}</p></div>
    <div className="flex flex-wrap gap-2">
      {material ? <Button size="sm" onClick={() => onView(material.id)}>查看笔记</Button> : <Button size="sm" onClick={onBrowse}>查看待学资料</Button>}
      {url && <a href={url} target="_blank" rel="noopener noreferrer" className="button button-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium focus-ring">继续阅读<ExternalLink size={14} aria-hidden /><span className="sr-only">（新窗口）</span></a>}
    </div>
  </section>;
}
