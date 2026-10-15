"use client";

import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/components/auth/AuthProvider";
import { useTodoDraft } from "./useTodoDraft";
import { isDateKey, REPEAT_OPTIONS, repeatDescription, todoErrorMessage } from "@/lib/todo-dates";
import type { Todo, TodoRepeat } from "@/lib/types";

interface Props {
  date: string;
  onAdd: (t: Todo) => Promise<boolean>;
  disabled?: boolean;
  error?: string | null;
  onOpenChange?: (open: boolean) => void;
  onReset?: () => void;
}

export function TodoForm(props: Props) {
  const { user } = useAuth();
  if (!user) return null;
  return <TodoCreateForm key={user.id} {...props} userId={user.id} />;
}

function TodoCreateForm({ date, onAdd, disabled = false, error, onOpenChange, onReset, userId }: Props & { userId: string }) {
  const form = useTodoDraft(userId, date);
  const { text, dueDate, priority, scheduledTime, repeat, id: draftId } = form.draft;
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [clearRequested, setClearRequested] = useState(false);
  const [closeRequested, setCloseRequested] = useState(false);
  const contentInput = useRef<HTMLInputElement>(null);
  const keepEditing = useRef<HTMLButtonElement>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!open || !form.dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [open, form.dirty]);
  const close = () => {
    if (submittingRef.current) return;
    if (form.dirty && form.storageFailed) {
      setCloseRequested(true);
      window.requestAnimationFrame(() => keepEditing.current?.focus({ preventScroll: true }));
      return;
    }
    setOpen(false);
    setClearRequested(false);
    onOpenChange?.(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || submittingRef.current || disabled || !isDateKey(dueDate)) return;
    const now = Date.now();
    submittingRef.current = true;
    setSubmitting(true);
    setLocalError(null);
    try {
      const added = await onAdd({
        id: draftId,
        text: value,
        done: false,
        priority,
        dueDate,
        scheduledTime: scheduledTime || undefined,
        repeat,
        position: now,
        createdAt: now,
        updatedAt: now,
      });
      if (added) {
        form.markSaved();
        setOpen(false);
        onOpenChange?.(false);
      }
    } catch (failure) { setLocalError(todoErrorMessage(failure, "任务未添加，请重试。")); }
    finally { submittingRef.current = false; setSubmitting(false); }
  };

  return (
    <>
    <Button variant="primary" disabled={disabled || submitting} onClick={() => { setLocalError(null); setOpen(true); onOpenChange?.(true); }}><Plus size={16} aria-hidden />添加任务</Button>
    <Modal open={open} onClose={close} title="添加任务" className="task-dialog">
    {closeRequested ? <section role="alert" aria-label="任务草稿未保留" className="space-y-4">
      <p className="font-medium">浏览器无法保留草稿</p><p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">当前输入仍在本页，但离开或刷新可能丢失。建议继续编辑并添加任务。</p>
      <Button ref={keepEditing} className="max-w-full whitespace-normal break-words" onClick={() => setCloseRequested(false)}>继续编辑</Button>
      <Button className="max-w-full whitespace-normal break-words" variant="ghost" onClick={() => { setCloseRequested(false); setOpen(false); onOpenChange?.(false); }}>仍然关闭，保留本页输入</Button>
    </section> : <>
    {form.dirty && <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--text-secondary)]">
      <p role="status">{form.storageFailed ? "无法保留草稿，请勿离开或刷新。" : form.restored ? "已恢复此标签页中的任务草稿。" : "草稿已保留在此标签页，尚未添加任务。"}</p>
      <Button className="max-w-full whitespace-normal break-words" size="sm" variant="ghost" disabled={submitting} onClick={() => setClearRequested(true)}>清除草稿</Button>
    </div>}
    {clearRequested && <section role="alert" aria-label="清除任务草稿" className="mb-4 space-y-3 rounded-xl bg-[var(--control-bg)] p-4">
      <p className="text-sm">清除这份未提交的任务草稿？已添加的任务不会被删除。</p>
      <div className="flex flex-wrap gap-2"><Button disabled={submitting} className="max-w-full whitespace-normal break-words" onClick={() => setClearRequested(false)}>保留内容</Button><Button disabled={submitting} className="max-w-full whitespace-normal break-words" variant="danger" onClick={() => {
        if (submittingRef.current) return;
        if (form.clear()) { setClearRequested(false); setLocalError(null); onReset?.(); window.requestAnimationFrame(() => contentInput.current?.focus({ preventScroll: true })); }
      }}>确认清除草稿</Button></div>
      {form.clearFailed && <p role="alert" className="status-error text-sm">无法清除浏览器中的草稿，当前输入已保留，请检查存储权限。</p>}
    </section>}
    <form onSubmit={submit} className="space-y-5">
      <fieldset disabled={submitting || disabled} className="space-y-5">
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-[color:var(--text-secondary)]">任务内容</span>
        <Input
          ref={contentInput}
          autoFocus
          required
          value={text}
          onChange={(e) => form.change("text", e.target.value)}
          placeholder="接下来，想完成什么？"
          aria-label="任务内容"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block min-w-0"><span className="mb-1.5 block text-xs font-medium text-[color:var(--text-secondary)]">任务日期</span>
          <Input type="date" required aria-label="任务日期" value={dueDate} onChange={(event) => form.change("dueDate", event.target.value)} />
        </label>
        <label className="block min-w-0"><span className="mb-1.5 block text-xs font-medium text-[color:var(--text-secondary)]">计划时间（可选）</span>
          <Input type="time" value={scheduledTime} onChange={(event) => form.change("scheduledTime", event.target.value)} aria-label="计划时间" />
        </label>
      </div>
      <div className="space-y-2">
        <p className="text-xs leading-relaxed text-[color:var(--text-muted)]">留空表示不指定时间；这里只记录计划时间，不会发送提醒。</p>
        {scheduledTime && <Button type="button" variant="ghost" size="sm" onClick={() => form.change("scheduledTime", "")}>清除计划时间</Button>}
      </div>

      <fieldset><legend className="mb-1.5 text-xs font-medium text-[color:var(--text-secondary)]">任务优先级</legend>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--control-bg)] p-1">
          {[1, 2, 3].map((p) => (
            <button
              type="button"
              key={p}
              onClick={() => form.change("priority", p as 1 | 2 | 3)}
              aria-pressed={priority === p}
              className={
                "button min-h-11 min-w-0 break-all rounded-lg px-2 text-xs font-medium focus-ring " +
                (priority === p
                  ? "bg-[var(--surface)] text-[color:var(--accent)] shadow-sm"
                  : "button-ghost")
              }
            >
              {["高", "中", "低"][p - 1]} · P{p}
            </button>
          ))}
        </div>
      </fieldset>

        <label className="block"><span className="mb-1.5 block text-xs font-medium text-[color:var(--text-secondary)]">重复规则</span>
          <select
            value={repeat}
            onChange={(event) => form.change("repeat", event.target.value as TodoRepeat)}
            aria-label="重复规则"
            className="field-control min-h-11 w-full min-w-0 px-3 text-sm focus-ring"
          >
            {REPEAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      <p className="text-xs leading-relaxed text-[color:var(--text-muted)]">{repeatDescription(repeat, dueDate)}</p>
      {(localError || error) && <p role="alert" className="status-error break-words text-sm">{localError || error}</p>}
      <p className="text-xs leading-relaxed text-[color:var(--text-muted)]">关闭不会添加任务。草稿仅保留在当前标签页，不跨设备同步；关闭标签页后可能无法恢复。</p>
      <div className="sticky bottom-0 z-10 grid grid-cols-2 gap-2 border-t border-[color:var(--border-subtle)] bg-[var(--surface)] py-4 sm:flex sm:flex-wrap sm:justify-end">
        <Button className="w-full min-w-0 max-w-full whitespace-normal break-words max-sm:px-3 sm:w-auto" type="button" variant="ghost" onClick={close}>取消</Button>
        <Button className="w-full min-w-0 max-w-full whitespace-normal break-words max-sm:px-3 sm:w-auto" type="submit" variant="primary" disabled={!text.trim() || !isDateKey(dueDate) || submitting || disabled}>
          {submitting ? "正在添加…" : "添加"}
        </Button>
      </div>
      </fieldset>
    </form>
    </>}
    </Modal>
    </>
  );
}
