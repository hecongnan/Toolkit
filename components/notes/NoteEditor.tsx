"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase/client";
import { uid } from "@/lib/storage";
import { todayKey } from "@/lib/todo-dates";
import { noteDraftKey, noteError, noteTitle, parseNoteDraft, type NoteDraft, type NoteTask, type TaskNote } from "@/lib/notes";

export function NoteEditor({ userId, initial, task, onClose, onSaved }: {
  userId: string; initial: TaskNote | null; task: NoteTask | null; onClose: () => void; onSaved: (warning?: string) => void;
}) {
  const originalTask = initial?.task_id ? { id: initial.task_id, text: initial.task_title ?? "关联任务", dueDate: initial.task_date ?? todayKey() } : task;
  const [base, setBase] = useState(() => ({ initial, task: originalTask, title: initial?.title ?? "", body: initial?.body ?? "" }));
  const [id, setId] = useState(() => initial?.id ?? uid());
  const [title, setTitle] = useState(base.title), [body, setBody] = useState(base.body), [selected, setSelected] = useState<NoteTask | null>(base.task);
  const [tasks, setTasks] = useState<NoteTask[]>([]), [taskError, setTaskError] = useState<string | null>(null);
  const [offer, setOffer] = useState<NoteDraft | null>(null), [ready, setReady] = useState(false), [warning, setWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [closing, setClosing] = useState(false), [error, setError] = useState<string | null>(null);
  const [draftSafe, setDraftSafe] = useState(false);
  const lock = useRef(false), discard = useRef(false), keep = useRef<HTMLButtonElement>(null), alive = useRef(true);
  const wroteDraft = useRef(false);
  const key = noteDraftKey(userId);
  const taskOptions = [...new Map([...(base.task ? [base.task] : []), ...tasks].map((item) => [item.id, item])).values()];
  const dirty = title !== base.title || body !== base.body || selected?.id !== base.task?.id;
  useEffect(() => {
    alive.current = true;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) { const draft = parseNoteDraft(raw, userId); if (draft) setOffer(draft); else setWarning("原草稿格式无效或属于其他账号，未自动填入。"); }
    } catch { setWarning("无法读取本地草稿；当前输入仍可保存，请勿依赖刷新恢复。"); }
    setReady(true);
    return () => { alive.current = false; };
  }, [key, userId]);
  useEffect(() => {
    let current = true;
    void createClient().from("todos").select("id,text,due_date").eq("user_id", userId).eq("due_date", todayKey()).eq("skipped", false).order("position").then(({ data, error: failure }) => {
      if (!current) return;
      if (failure) setTaskError("今日任务暂时无法读取，可保留现有关联或独立记录。");
      else setTasks((data ?? []).map((row: { id: string; text: string; due_date: string }) => ({ id: row.id, text: row.text, dueDate: row.due_date })));
    });
    return () => { current = false; };
  }, [userId]);
  useEffect(() => {
    if (!ready || offer || discard.current) return;
    if (!dirty) {
      if (wroteDraft.current) {
        try { sessionStorage.removeItem(key); wroteDraft.current = false; setDraftSafe(false); }
        catch { setWarning("内容已还原，但本地旧草稿清理失败，下次恢复前请核对。"); }
      }
      return;
    }
    try {
      const draft: NoteDraft = { userId, id, title, body, task: selected, initial: base.initial };
      sessionStorage.setItem(key, JSON.stringify(draft));
      wroteDraft.current = true;
      setDraftSafe(true);
    } catch { setDraftSafe(false); setWarning("草稿无法保留在此标签页；当前输入仍在，请先保存，不要刷新或关闭网页。"); }
  }, [ready, offer, dirty, userId, id, title, body, selected, base.initial, key]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const clearDraft = () => {
    try { sessionStorage.removeItem(key); return true; }
    catch { setWarning("本地草稿清理失败，下次恢复时请先核对已保存笔记。"); return false; }
  };
  const close = () => {
    if (lock.current) return;
    if (!dirty) { onClose(); return; }
    setClosing(true); requestAnimationFrame(() => keep.current?.focus());
  };
  const restore = () => {
    if (!offer) return;
    setId(offer.id);
    setBase({ initial: offer.initial, task: offer.initial?.task_id ? { id: offer.initial.task_id, text: offer.initial.task_title ?? "关联任务", dueDate: offer.initial.task_date ?? todayKey() } : offer.task, title: offer.initial?.title ?? "", body: offer.initial?.body ?? "" });
    setTitle(offer.title); setBody(offer.body); setSelected(offer.task); setOffer(null); setError(null);
    wroteDraft.current = true;
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (lock.current || !ready || !body.trim()) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      const { data, error: failure } = await createClient().rpc("note_save", { p_id: id, p_title: noteTitle(title, body), p_body: body, p_task_id: selected?.id ?? null, p_version: base.initial?.version ?? null }).single();
      if (failure) throw failure;
      const saved = data as TaskNote | null;
      if (!saved || saved.id !== id || typeof saved.body !== "string") throw new Error("未收到保存确认，当前输入和草稿已保留，请重试。");
      if (!alive.current) return;
      discard.current = true;
      const cleared = clearDraft();
      onSaved(cleared ? undefined : "笔记已保存，但本地草稿清理失败，下次恢复前请核对。");
    } catch (failure) { if (alive.current) setError(noteError(failure)); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  return <Modal open onClose={close} title={base.initial ? "编辑笔记" : "记录笔记"} className="task-dialog">
    {!ready ? <p className="text-sm">正在读取草稿…</p> : offer ? <section aria-label="恢复笔记草稿" className="space-y-4">
      <p className="text-sm leading-6">此标签页有一份未保存笔记，恢复后不会自动覆盖服务器上的内容。</p><p className="break-words text-sm font-medium">{offer.title || offer.body.slice(0, 80) || "未命名草稿"}</p>
      {offer.task && <p className="break-words text-xs leading-6">草稿关联：{offer.task.text} · {offer.task.dueDate}</p>}
      <div className="flex flex-wrap gap-2"><Button onClick={restore}>恢复草稿</Button><Button variant="ghost" onClick={() => { clearDraft(); setOffer(null); }}>不恢复，开始当前笔记</Button></div>
    </section> : closing ? <section role="alert" aria-label="未保存的笔记" className="space-y-4">
      <p className="text-sm leading-6">还有未保存内容。可继续编辑，或保留标签页草稿后关闭。</p>
      <div className="flex flex-wrap gap-2"><Button ref={keep} onClick={() => setClosing(false)}>继续编辑</Button><Button disabled={!draftSafe} onClick={onClose}>保留草稿并关闭</Button><Button variant="danger" onClick={() => { if (clearDraft()) { discard.current = true; onClose(); } }}>放弃修改并关闭</Button></div>
      {warning && <p role="alert" className="text-xs leading-6 status-warning">{warning}</p>}
    </section> : <form onSubmit={save} className="space-y-4"><fieldset disabled={busy} className="min-w-0 space-y-4">
      <label className="block"><span className="mb-2 block text-sm font-medium">标题（可选）</span><Input autoFocus maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="留空时使用正文第一行" /></label>
      <label className="block"><span className="mb-2 block text-sm font-medium">笔记正文</span><textarea required maxLength={20000} value={body} onChange={(event) => setBody(event.target.value)} placeholder="记录完成过程、学到的知识、遇到的问题或下一步。支持换行和粘贴代码，以纯文本保存。" rows={8} className="field-control min-h-48 w-full min-w-0 resize-y p-3 text-sm leading-7 focus-ring" /></label>
      <p className="text-xs leading-6 text-[color:var(--text-muted)]">{body.length}/20000 · 草稿仅在当前标签页保留，不等于已保存。</p>
      <label className="block min-w-0"><span className="mb-2 block text-sm font-medium">关联任务</span><select aria-label="关联任务" className="field-control min-h-11 w-full min-w-0 px-3 text-sm focus-ring" value={selected?.id ?? ""} onChange={(event) => setSelected(taskOptions.find((item) => item.id === event.target.value) ?? null)}>
        <option value="">独立笔记，不关联任务</option>{selected && !taskOptions.some((item) => item.id === selected.id) && <option value={selected.id}>{selected.text} · {selected.dueDate}</option>}{taskOptions.map((item) => <option key={item.id} value={item.id}>{item.text} · {item.dueDate}</option>)}
      </select></label>
      {selected && <p className="break-words text-xs leading-6 text-[color:var(--text-muted)]">关联本次任务：{selected.text} · {selected.dueDate}。保存笔记不会改变完成状态。</p>}
      {!selected && base.initial?.task_title && !base.initial.task_id && <p className="break-words text-xs leading-6 text-[color:var(--text-muted)]">原关联任务：{base.initial.task_title}（已移除），笔记仍保留。</p>}
      {taskError && <p className="text-xs leading-6 status-warning">{taskError}</p>}{warning && <p role="alert" className="text-xs leading-6 status-warning">{warning}</p>}{error && <p role="alert" className="break-words text-sm leading-6 status-error">{error}</p>}
      {error && base.initial && <div className="rounded-xl bg-[var(--control-bg)] p-3 text-xs leading-6"><p>若不想覆盖原笔记，可把当前内容另存为新笔记。原笔记会保留。</p><Button className="mt-2 max-w-full min-w-0" type="button" variant="ghost" size="sm" onClick={() => { setId(uid()); setBase({ initial: null, task: selected, title: "", body: "" }); setError(null); }}>另存为新笔记</Button></div>}
      <div className="sticky bottom-0 grid gap-2 border-t border-[color:var(--border-subtle)] bg-[var(--surface)] py-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,10rem),1fr))" }}><Button type="button" variant="ghost" onClick={close}>取消</Button><Button type="submit" variant="primary" disabled={busy || !body.trim() || (Boolean(base.initial) && !dirty)}>{busy ? "正在保存…" : "保存笔记"}</Button></div>
    </fieldset></form>}
  </Modal>;
}
