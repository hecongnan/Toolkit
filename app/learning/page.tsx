"use client";

import { BookOpen, Plus } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Notice } from "@/components/ui/Notice";
import { Spinner } from "@/components/ui/Spinner";
import { MaterialCard } from "@/components/learning/MaterialCard";
import { MaterialEditor } from "@/components/learning/MaterialEditor";
import { MaterialDetails } from "@/components/learning/MaterialDetails";
import { ContinueLearning } from "@/components/learning/ContinueLearning";
import { LearningToolbar } from "@/components/learning/LearningToolbar";
import { useLearningView } from "@/components/learning/useLearningView";
import { useMaterials } from "@/components/learning/useMaterials";
import { materialError, materialMatches, sortMaterials } from "@/lib/materials";
import type { Material } from "@/lib/types";

export default function LearningPage() {
  const library = useMaterials();
  const { userId, materials, loading, refreshing, loadFailed, loadError, pendingIds, rowErrors, failedStatuses } = library;
  const { view, update, ready } = useLearningView(userId, loading || loadFailed);
  const [editing, setEditing] = useState<Material | null>(null);
  const [open, setOpen] = useState(false);
  const [formSession, setFormSession] = useState(0);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Material | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deletingRef = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const searchInput = useRef<HTMLInputElement>(null);

  const openForm = (material: Material | null) => {
    if (savingRef.current || (material && pendingIds.has(material.id))) return;
    setEditing(material);
    setFormSession((session) => session + 1);
    setOpen(true);
  };
  const setEditorBusy = useCallback((busy: boolean) => { savingRef.current = busy; setSaving(busy); }, []);

  const categories = useMemo(() => Array.from(new Set(materials.map((material) => material.category).filter(Boolean))).sort(), [materials]);
  const matches = useMemo(() => materials.filter((material) => (!view.category || material.category === view.category) && materialMatches(material, view.query)), [materials, view.query, view.category]);
  const counts = { all: matches.length, todo: 0, doing: 0, done: 0 };
  for (const material of matches) counts[material.status] += 1;
  const filtered = sortMaterials(matches.filter((material) => view.status === "all" || material.status === view.status), view.sort);
  const hasFilters = Boolean(view.query.trim() || view.category || view.status !== "all");
  const continuing = !hasFilters ? sortMaterials(materials.filter((material) => material.status === "doing"), "updated")[0] : undefined;
  const viewing = materials.find((material) => material.id === viewId);
  const clearFilters = () => { update({ query: "", status: "all", category: "" }); searchInput.current?.focus(); };

  const save = async (material: Material, isEditing: boolean) => {
    const saved = await library.save(material, isEditing);
    if (saved) setNotice(hasFilters ? "资料已保存；若未显示，可清除筛选查看。" : "资料已保存。");
    return saved;
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
      action={<Button variant="primary" disabled={loading || loadFailed || !ready || saving} onClick={() => openForm(null)}><Plus size={16} />添加资料</Button>} />
    {notice && <Notice message={notice} onDismiss={dismissNotice} />}
    {loadError && <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm status-error">
      <span>{loadError}{!loadFailed && " 现有资料仍可使用。"}</span><Button size="sm" onClick={() => void library.load()} disabled={refreshing || pendingIds.size > 0}>重试加载</Button>
    </div>}

    {materials.length > 0 && !hasFilters && ready && <ContinueLearning material={continuing} onView={setViewId} onBrowse={() => update({ status: "todo" })} />}
    <LearningToolbar view={view} onChange={update} categories={categories} counts={counts} searchInput={searchInput} hasFilters={hasFilters} onClear={clearFilters}
      visible={filtered.length} total={materials.length} loading={loading || !ready} refreshing={refreshing} pending={pendingIds.size} onRefresh={() => void library.load()} />

    <div aria-busy={loading || refreshing} className="pb-20">
      {loadFailed ? null : loading || !ready ? <div className="flex justify-center py-16"><Spinner size={20} /></div> : materials.length === 0
        ? <EmptyState icon={<BookOpen size={20} />} title="从一份值得学习的资料开始" description="可以收藏链接，也可以只记录学习笔记。" action={<Button variant="primary" onClick={() => openForm(null)}><Plus size={16} />添加第一份资料</Button>} />
        : filtered.length === 0 ? <EmptyState title="没有匹配的资料" description="清除筛选，查看全部资料；原有资料没有被删除。" action={<Button onClick={clearFilters}>查看全部资料</Button>} />
        : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filtered.map((material) => <MaterialCard key={material.id} material={material}
          pending={pendingIds.has(material.id)} error={rowErrors[material.id]} onRetry={failedStatuses[material.id] ? () => void library.updateStatus(material.id, failedStatuses[material.id]) : undefined}
          onEdit={openForm} onView={(item) => setViewId(item.id)} onDelete={(id) => { setDeleting(materials.find((item) => item.id === id) ?? null); setDeleteError(null); }}
          onStatusChange={(id, status) => void library.updateStatus(id, status)} />)}</div>}
    </div>

    {userId && formSession > 0 && <MaterialEditor key={userId + ":" + formSession} open={open} initial={editing} userId={userId} categories={categories} onSave={save} onClose={() => setOpen(false)} onBusyChange={setEditorBusy} />}
    <MaterialDetails material={viewing} onClose={() => setViewId(null)} />
    <Modal open={Boolean(deleting)} onClose={() => { if (!deletingRef.current) setDeleting(null); }} title="删除学习资料">
      {deleting && <div className="space-y-4"><p className="break-words font-medium">{deleting.title}</p><p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">删除后，链接、标签和学习笔记都会移除，无法恢复。确定删除这份资料？</p>
        {deleteError && <p role="alert" className="status-error text-sm">{deleteError}</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button disabled={pendingIds.has(deleting.id)} onClick={() => setDeleting(null)}>保留资料</Button><Button variant="danger" disabled={pendingIds.has(deleting.id)} onClick={() => void confirmDelete()}>{pendingIds.has(deleting.id) ? "正在删除…" : "确认删除"}</Button></div>
      </div>}
    </Modal>
  </>;
}
