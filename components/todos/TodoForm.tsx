"use client";

import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { uid } from "@/lib/storage";
import { isDateKey, REPEAT_OPTIONS, repeatDescription, todoErrorMessage } from "@/lib/todo-dates";
import type { Todo, TodoRepeat } from "@/lib/types";

interface Props {
  date: string;
  onAdd: (t: Todo) => Promise<boolean>;
  disabled?: boolean;
  error?: string | null;
  onOpenChange?: (open: boolean) => void;
}

export function TodoForm({ date, onAdd, disabled = false, error, onOpenChange }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [dueDate, setDueDate] = useState(date);
  const [priority, setPriority] = useState<1 | 2 | 3>(2);
  const [scheduledTime, setScheduledTime] = useState("");
  const [repeat, setRepeat] = useState<TodoRepeat>("none");
  const [submitting, setSubmitting] = useState(false);
  const [draftId, setDraftId] = useState(uid);
  const [localError, setLocalError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => { if (!open && !text) setDueDate(date); }, [date, open, text]);
  const close = () => {
    if (submittingRef.current) return;
    setOpen(false);
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
        setText("");
        setPriority(2);
        setScheduledTime("");
        setRepeat("none");
        setDraftId(uid());
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
    <form onSubmit={submit} className="space-y-5">
      <fieldset disabled={submitting || disabled} className="space-y-5">
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-[color:var(--text-secondary)]">任务内容</span>
        <Input
          autoFocus
          required
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="接下来，想完成什么？"
          aria-label="任务内容"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block min-w-0"><span className="mb-1.5 block text-xs font-medium text-[color:var(--text-secondary)]">任务日期</span>
          <Input type="date" required aria-label="任务日期" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </label>
        <label className="block min-w-0"><span className="mb-1.5 block text-xs font-medium text-[color:var(--text-secondary)]">计划时间（可选）</span>
          <Input type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} aria-label="计划时间" />
        </label>
      </div>
      <div className="space-y-2">
        <p className="text-xs leading-relaxed text-[color:var(--text-muted)]">留空表示不指定时间；这里只记录计划时间，不会发送提醒。</p>
        {scheduledTime && <Button type="button" variant="ghost" size="sm" onClick={() => setScheduledTime("")}>清除计划时间</Button>}
      </div>

      <fieldset><legend className="mb-1.5 text-xs font-medium text-[color:var(--text-secondary)]">任务优先级</legend>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--control-bg)] p-1">
          {[1, 2, 3].map((p) => (
            <button
              type="button"
              key={p}
              onClick={() => setPriority(p as 1 | 2 | 3)}
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
            onChange={(event) => setRepeat(event.target.value as TodoRepeat)}
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
      <p className="text-xs leading-relaxed text-[color:var(--text-muted)]">关闭不会添加任务；未提交内容会保留在本页，离开或刷新页面后可能丢失。</p>
      <div className="flex flex-wrap justify-end gap-2 border-t border-[color:var(--border-subtle)] pt-4">
        <Button className="max-w-full whitespace-normal break-words" type="button" variant="ghost" onClick={close}>取消</Button>
        <Button className="max-w-full whitespace-normal break-words" type="submit" variant="primary" disabled={!text.trim() || !isDateKey(dueDate) || submitting || disabled}>
          {submitting ? "正在添加…" : "添加"}
        </Button>
      </div>
      </fieldset>
    </form>
    </Modal>
    </>
  );
}
