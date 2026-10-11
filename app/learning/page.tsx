"use client";

import { BookOpen, ExternalLink, Plus, RefreshCw, Search, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Notice } from "@/components/ui/Notice";
import { Spinner } from "@/components/ui/Spinner";
import { Tag } from "@/components/ui/Tag";
import { MaterialCard } from "@/components/learning/MaterialCard";
import { MaterialForm } from "@/components/learning/MaterialForm";
import { useMaterials } from "@/components/learning/useMaterials";
import { materialError, materialMatches, MATERIAL_STATUS_LABEL, safeMaterialUrl, sortMaterials, type MaterialSort } from "@/lib/materials";
import type { Material, MaterialStatus } from "@/lib/types";

const STATUS_FILTERS = ["all", "todo", "doing", "done"] as const;

export default function LearningPage() {
  const library = useMaterials();
  const { materials, loading, refreshing, loadFailed, loadError, pendingIds, rowErrors, failedStatuses } = library;
  const [editing, setEditing] = useState<Material | null>(null);
  const [open, setOpen] = useState(false);
  const [formSession, setFormSession] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Material | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deletingRef = useRef(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<MaterialStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sort, setSort] = useState<MaterialSort>("newest");
  const [notice, setNotice] = useState<string | null>(null);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const searchInput = useRef<HTMLInputElement>(null);

  const openForm = (material: Material | null) => {
    if (savingRef.current || (material && pendingIds.has(material.id))) return;
    setFormError(null);
    setEditing(material);
    setFormSession((session) => session + 1);
    setOpen(true);
  };
  const closeForm = () => {
    if (savingRef.current) return;
    setOpen(false);
    setEditing(null);
  };

  const categories = useMemo(() => Array.from(new Set(materials.map((material) => material.category).filter(Boolean))).sort(), [materials]);
  const matches = useMemo(() => materials.filter((material) => (!categoryFilter || material.category === categoryFilter) && materialMatches(material, query)), [materials, query, categoryFilter]);
  const counts = { all: matches.length, todo: 0, doing: 0, done: 0 };
  for (const material of matches) counts[material.status] += 1;
  const filtered = sortMaterials(matches.filter((material) => statusFilter === "all" || material.status === statusFilter), sort);
  const hasFilters = Boolean(query.trim() || categoryFilter || statusFilter !== "all");
  const continuing = !hasFilters ? sortMaterials(materials.filter((material) => material.status === "doing"), "updated")[0] : undefined;
  const continuingUrl = safeMaterialUrl(continuing?.url);
  const viewing = materials.find((material) => material.id === viewId);
  const viewingUrl = safeMaterialUrl(viewing?.url);
  const clearFilters = () => { setQuery(""); setStatusFilter("all"); setCategoryFilter(""); searchInput.current?.focus(); };

  const save = async (material: Material) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setFormError(null);
    try {
      if (await library.save(material, Boolean(editing))) {
        setOpen(false);
        setEditing(null);
        setNotice(hasFilters ? "资料已保存；若未显示，可清除筛选查看。" : "资料已保存。");
      } else setFormError("资料正在同步，请稍后重试。");
    } catch (error) { setFormError(materialError(error, "保存资料失败，请重试。")); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const confirmDelete = async () => {
    if (!deleting || deletingRef.current) return;
    deletingRef.current = true;
    setDeleteError(null);
    try {
      if (await library.remove(deleting.id)) {
        setDeleting(null);
        setNotice("资料已删除。");
        // The original delete trigger no longer exists; provide a useful focus target.
        window.requestAnimationFrame(() => searchInput.current?.focus({ preventScroll: true }));
      }
      else setDeleteError("资料正在同步，请稍后重试。");
    } catch (error) { setDeleteError(materialError(error, "删除资料失败，请重试。")); }
    finally { deletingRef.current = false; }
  };

  return <>
    <PageHeader eyebrow="持续积累" title="学习资料" description="收藏值得学习的内容，记录进度，随时接着学。"
      action={<Button variant="primary" disabled={loading || loadFailed || saving} onClick={() => openForm(null)}><Plus size={16} />添加资料</Button>} />
    {notice && <Notice message={notice} onDismiss={dismissNotice} />}
    {loadError && <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm status-error">
      <span>{loadError}{!loadFailed && " 现有资料仍可使用。"}</span><Button size="sm" onClick={() => void library.load()} disabled={refreshing || pendingIds.size > 0}>重试加载</Button>
    </div>}

    {materials.length > 0 && !hasFilters && <section aria-label="继续学习" className="surface mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><p className="section-label mb-1">继续学习</p><p className="min-h-12 line-clamp-2 break-words font-medium text-[color:var(--text-primary)]">{continuing?.title || "选一份资料，开始新的学习"}</p>
        <p className="mt-1 min-h-4 text-xs text-[color:var(--text-muted)]">{continuing ? "上次更新 " + new Date(continuing.updatedAt).toLocaleDateString("zh-CN") + (continuing.category ? " · " + continuing.category : "") : "将资料设为进行中，下次可从这里接着学。"}</p></div>
      <div className="flex flex-wrap gap-2">
        {continuing ? <Button size="sm" onClick={() => setViewId(continuing.id)}>查看笔记</Button> : <Button size="sm" onClick={() => setStatusFilter("todo")}>查看待学资料</Button>}
        {continuingUrl && <a href={continuingUrl} target="_blank" rel="noopener noreferrer" className="button button-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium focus-ring">继续阅读<ExternalLink size={14} aria-hidden /><span className="sr-only">（新窗口）</span></a>}
      </div>
    </section>}

    <section aria-label="查找学习资料" className="surface mb-4 space-y-3 p-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1"><Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-muted)]" />
          <Input ref={searchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、标签、笔记或链接" aria-label="搜索学习资料" className="pl-9 pr-12" />
          {query && <button type="button" aria-label="清除搜索" onClick={() => { setQuery(""); searchInput.current?.focus(); }} className="button icon-button absolute right-0 top-0 focus-ring"><X size={16} aria-hidden /></button>}
        </div>
        <select value={categoryFilter} aria-label="资料分类" onChange={(event) => setCategoryFilter(event.target.value)} className="field-control min-h-11 min-w-0 w-full px-3 text-sm focus-ring sm:w-40">
          <option value="">全部分类</option>
          {categoryFilter && !categories.includes(categoryFilter) && <option value={categoryFilter}>{categoryFilter}（暂无资料）</option>}
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
      </div>
      <div role="group" aria-label="学习状态筛选" className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--control-bg)] p-1 min-[360px]:grid-cols-4">
        {STATUS_FILTERS.map((status) => <button key={status} type="button" aria-pressed={statusFilter === status} aria-label={status === "all" ? "全部" : MATERIAL_STATUS_LABEL[status]} onClick={() => setStatusFilter(status)}
          className={"button flex min-h-11 min-w-0 flex-wrap items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium focus-ring " + (statusFilter === status ? "bg-[var(--surface)] text-[color:var(--accent)] shadow-sm" : "button-ghost")}>
          {status === "all" ? "全部" : MATERIAL_STATUS_LABEL[status]}<span className="tabular-nums text-[color:var(--text-muted)]">{counts[status]}</span>
        </button>)}
      </div>
    </section>

    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--text-muted)]">
      <p role="status" aria-live="polite">{loading ? "正在加载资料…" : "显示 " + filtered.length + " / " + materials.length + " 份资料"}{pendingIds.size > 0 && " · 正在同步 " + pendingIds.size + " 项"}</p>
      <div className="flex flex-wrap items-center gap-2">
        {hasFilters && <Button size="sm" variant="ghost" onClick={clearFilters}>清除筛选</Button>}
        <select aria-label="资料排序" value={sort} onChange={(event) => setSort(event.target.value as MaterialSort)} className="field-control min-h-11 max-w-full px-3 text-xs focus-ring"><option value="newest">最近添加</option><option value="priority">优先级</option><option value="updated">最近更新</option></select>
        <button type="button" onClick={() => void library.load()} disabled={loading || refreshing || pendingIds.size > 0} aria-label="刷新资料" className="button icon-button focus-ring disabled:opacity-40"><RefreshCw size={16} aria-hidden /></button>
      </div>
    </div>

    <div aria-busy={loading || refreshing} className="pb-20">
      {loading ? <div className="flex justify-center py-16"><Spinner size={20} /></div> : loadFailed ? null : materials.length === 0
        ? <EmptyState icon={<BookOpen size={20} />} title="从一份值得学习的资料开始" description="可以收藏链接，也可以只记录学习笔记。" action={<Button variant="primary" onClick={() => openForm(null)}><Plus size={16} />添加第一份资料</Button>} />
        : filtered.length === 0 ? <EmptyState title="没有匹配的资料" description="清除筛选，查看全部资料；原有资料没有被删除。" action={<Button onClick={clearFilters}>查看全部资料</Button>} />
        : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filtered.map((material) => <MaterialCard key={material.id} material={material}
          pending={pendingIds.has(material.id)} error={rowErrors[material.id]} onRetry={failedStatuses[material.id] ? () => void library.updateStatus(material.id, failedStatuses[material.id]) : undefined}
          onEdit={openForm} onView={(item) => setViewId(item.id)} onDelete={(id) => { setDeleting(materials.find((item) => item.id === id) ?? null); setDeleteError(null); }}
          onStatusChange={(id, status) => void library.updateStatus(id, status)} />)}</div>}
    </div>

    <Modal open={open} onClose={closeForm} title={editing ? "编辑资料" : "添加资料"}>
      <MaterialForm key={formSession} initial={editing} saving={saving} error={formError} onSubmit={save} onCancel={closeForm} />
    </Modal>
    <Modal open={Boolean(viewing)} onClose={() => setViewId(null)} title="资料详情">
      {viewing && <div className="space-y-4">
        <h3 className="break-words text-lg font-semibold">{viewing.title}</h3>
        <div className="flex flex-wrap gap-2"><Tag>{MATERIAL_STATUS_LABEL[viewing.status]}</Tag><Tag className="max-w-full break-all">{viewing.category}</Tag>{viewing.tags.map((tag, index) => <Tag className="max-w-full break-all" key={tag + "-" + index}>#{tag}</Tag>)}</div>
        <section aria-label="完整学习笔记" className="rounded-xl bg-[var(--control-bg)] p-4"><h4 className="mb-2 text-sm font-medium">学习笔记</h4><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[color:var(--text-secondary)]">{viewing.notes || "还没有笔记，可在编辑资料中记录学习目标、要点或下一步。"}</p></section>
        {viewingUrl && <a href={viewingUrl} target="_blank" rel="noopener noreferrer" className="quiet-link inline-flex min-h-11 max-w-full items-center gap-2 rounded-xl text-sm focus-ring"><ExternalLink size={16} className="shrink-0" aria-hidden /><span className="break-all">{viewingUrl}</span><span className="sr-only">（新窗口）</span></a>}
        {viewing.url && !viewingUrl && <p className="status-warning text-sm">链接格式不安全或无效，请编辑为 http 或 https 链接。</p>}
        <div className="flex justify-end"><Button onClick={() => setViewId(null)}>返回资料列表</Button></div>
      </div>}
    </Modal>
    <Modal open={Boolean(deleting)} onClose={() => { if (!deletingRef.current) setDeleting(null); }} title="删除学习资料">
      {deleting && <div className="space-y-4"><p className="break-words font-medium">{deleting.title}</p><p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">删除后，链接、标签和学习笔记都会移除，无法恢复。确定删除这份资料？</p>
        {deleteError && <p role="alert" className="status-error text-sm">{deleteError}</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button disabled={pendingIds.has(deleting.id)} onClick={() => setDeleting(null)}>保留资料</Button><Button variant="danger" disabled={pendingIds.has(deleting.id)} onClick={() => void confirmDelete()}>{pendingIds.has(deleting.id) ? "正在删除…" : "确认删除"}</Button></div>
      </div>}
    </Modal>
  </>;
}
