"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { materialError } from "@/lib/materials";
import type { Material } from "@/lib/types";
import { MaterialForm } from "./MaterialForm";
import { useMaterialDraft } from "./useMaterialDraft";

interface Props {
  open: boolean;
  initial: Material | null;
  userId: string;
  categories: string[];
  onClose: () => void;
  onSave: (material: Material, editing: boolean) => Promise<boolean>;
  onBusyChange: (busy: boolean) => void;
}

export function MaterialEditor({ open, initial, userId, categories, onClose, onSave, onBusyChange }: Props) {
  const form = useMaterialDraft(userId, initial, open);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [closeRequested, setCloseRequested] = useState(false);
  const [clearRequested, setClearRequested] = useState(false);
  const keepEditing = useRef<HTMLButtonElement>(null);

  const requestClose = () => {
    if (savingRef.current) return;
    if (!form.dirty) { onClose(); return; }
    setCloseRequested(true);
    window.requestAnimationFrame(() => keepEditing.current?.focus({ preventScroll: true }));
  };
  const save = async (material: Material) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    onBusyChange(true);
    setError(null);
    try {
      if (await onSave(material, Boolean(initial))) { form.markSaved(); onClose(); }
      else setError("资料正在同步，请稍后重试。");
    } catch (failure) { setError(materialError(failure, "保存资料失败，请重试。")); }
    finally { savingRef.current = false; setSaving(false); onBusyChange(false); }
  };

  return <Modal open={open} onClose={requestClose} title={initial ? "编辑资料" : "添加资料"}>
    <div className="space-y-4">
      {closeRequested ? <section role="alert" aria-label="未保存的修改" className="space-y-3 rounded-xl border border-[color:var(--border-default)] bg-[var(--control-bg)] p-4">
        <h3 className="font-medium">还有未保存的内容</h3>
        <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">{form.storageFailed ? "浏览器无法保留草稿，请继续编辑并保存；放弃后无法恢复。" : "草稿仅保留在当前标签页，不会自动添加到资料库。关闭标签页后可能无法恢复。"}</p>
        <div className="flex flex-wrap gap-2">
          <Button className="w-full min-w-0 max-w-full whitespace-normal break-words sm:w-auto" ref={keepEditing} onClick={() => setCloseRequested(false)}>继续编辑</Button>
          {!form.storageFailed && <Button className="w-full min-w-0 max-w-full whitespace-normal break-words sm:w-auto" onClick={onClose}>保留草稿并关闭</Button>}
          <Button className="w-full min-w-0 max-w-full whitespace-normal break-words sm:w-auto" variant="danger" onClick={() => { form.clear(); onClose(); }}>放弃修改并关闭</Button>
        </div>
      </section> : <>
        {(form.restored || form.dirty) && <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--text-secondary)]">
          <p role="status">{form.storageFailed ? "无法保留草稿，请勿关闭页面。" : form.restored ? "已恢复此标签页中的未保存草稿。" : "草稿已保留在此标签页，尚未保存到资料库。"}</p>
          <Button className="max-w-full whitespace-normal break-words" size="sm" variant="ghost" disabled={saving} onClick={() => setClearRequested(true)}>清除草稿</Button>
        </div>}
        {clearRequested && <section role="alert" aria-label="清除草稿确认" className="space-y-3 rounded-xl bg-[var(--control-bg)] p-4">
          <p className="text-sm">清除未保存的内容？{initial ? "原有资料不会被删除。" : "此操作无法恢复。"}</p>
          <div className="flex flex-wrap gap-2"><Button className="w-full min-w-0 max-w-full whitespace-normal break-words sm:w-auto" onClick={() => setClearRequested(false)}>保留内容</Button><Button className="w-full min-w-0 max-w-full whitespace-normal break-words sm:w-auto" variant="danger" onClick={() => { form.clear(); setClearRequested(false); setError(null); }}>确认清除草稿</Button></div>
        </section>}
        <MaterialForm initial={initial} draft={form.draft} onChange={form.change} categories={categories} saving={saving} error={error} onSubmit={(material) => void save(material)} onCancel={requestClose} />
      </>}
    </div>
  </Modal>;
}
