"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { Todo, TodoRepeat, TodoScope } from "@/lib/types";
import { isDateKey, REPEAT_OPTIONS, repeatDescription, shiftDate, todayKey, todoErrorMessage } from "@/lib/todo-dates";

export interface TodoEditorHandle { requestClose: () => void; }

interface Props {
  todo: Todo;
  onSave: (todo: Todo, scope: TodoScope) => Promise<boolean>;
  onCancel: () => void;
  error?: string | null;
}

export const TodoEditor = forwardRef<TodoEditorHandle, Props>(function TodoEditor({ todo, onSave, onCancel, error }, ref) {
  const [text, setText] = useState(todo.text);
  const [dueDate, setDueDate] = useState(todo.dueDate);
  const [scheduledTime, setScheduledTime] = useState(todo.scheduledTime ?? "");
  const [priority, setPriority] = useState(todo.priority);
  const [repeat, setRepeat] = useState<TodoRepeat>(todo.repeat);
  const [submitting, setSubmitting] = useState(false);
  const [scope, setScope] = useState<TodoScope>("single");
  const [closeRequested, setCloseRequested] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const contentInput = useRef<HTMLInputElement>(null);
  const keepEditing = useRef<HTMLButtonElement>(null);
  const recurring = Boolean(todo.seriesId) && todo.repeat !== "none";
  // Switching scope changes what will be sent, not the user's other inputs.
  const effectiveDate = scope === "future" ? todo.dueDate : dueDate;
  const effectiveRepeat = recurring && scope === "single" ? todo.repeat : repeat;
  const commonChanged = text.trim() !== todo.text || scheduledTime !== (todo.scheduledTime ?? "") || priority !== todo.priority;
  const changed = commonChanged || effectiveDate !== todo.dueDate || effectiveRepeat !== todo.repeat;
  const dirty = commonChanged || dueDate !== todo.dueDate || repeat !== todo.repeat;
  const valid = Boolean(text.trim()) && isDateKey(effectiveDate);

  const requestClose = () => {
    if (submittingRef.current) return;
    if (!dirty) { onCancel(); return; }
    setCloseRequested(true);
  };
  useImperativeHandle(ref, () => ({ requestClose }));

  useEffect(() => {
    if (closeRequested) keepEditing.current?.focus({ preventScroll: true });
  }, [closeRequested]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || !changed || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setLocalError(null);
    try {
      const saved = await onSave({
        ...todo, text: text.trim(), dueDate: effectiveDate,
        scheduledTime: scheduledTime || undefined, priority, repeat: effectiveRepeat,
        updatedAt: Date.now(),
      }, scope);
      if (saved) onCancel();
      else setLocalError("任务未保存，请重试。");
    } catch (failure) {
      setLocalError(todoErrorMessage(failure, "任务未保存，请重试。"));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (closeRequested) return <section role="alert" aria-label="未保存的任务修改" className="space-y-4">
    <h3 className="font-medium">还有未保存的修改</h3>
    <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">继续编辑可以保留当前输入。放弃后恢复原任务，不会删除任务。</p>
    <div className="flex flex-wrap gap-2">
      <Button ref={keepEditing} className="w-full min-w-0 whitespace-normal break-words sm:w-auto" onClick={() => {
        setCloseRequested(false);
        window.requestAnimationFrame(() => contentInput.current?.focus({ preventScroll: true }));
      }}>继续编辑</Button>
      <Button variant="danger" className="w-full min-w-0 whitespace-normal break-words sm:w-auto" onClick={onCancel}>放弃修改并关闭</Button>
    </div>
  </section>;

  return (
    <form onSubmit={submit} className="space-y-5">
      <fieldset disabled={submitting} className="space-y-5">
      {recurring && (
        <Field label="修改范围">
          <select aria-label="修改范围" value={scope} onChange={(event) => setScope(event.target.value as TodoScope)} className="field-control min-h-11 w-full min-w-0 px-3 text-sm focus-ring">
            <option value="single">仅这次</option>
            <option value="future">这次及以后</option>
          </select>
        </Field>
      )}
      <Field label="任务内容">
        <Input ref={contentInput} autoFocus value={text} onChange={(event) => setText(event.target.value)} required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="日期">
          <Input type="date" value={effectiveDate} onChange={(event) => setDueDate(event.target.value)} required disabled={scope === "future"} />
        </Field>
        <Field label="计划时间">
          <Input
            type="time"
            value={scheduledTime}
            onChange={(event) => setScheduledTime(event.target.value)}
          />
        </Field>
      </div>
      {scope === "single" && <div role="group" aria-label="快捷改期" className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => setDueDate(todayKey())} aria-pressed={dueDate === todayKey()}>今天</Button>
        <Button type="button" size="sm" onClick={() => setDueDate(shiftDate(todayKey(), 1))} aria-pressed={dueDate === shiftDate(todayKey(), 1)}>明天</Button>
      </div>}
      <div className="space-y-2">
        <p className="text-xs leading-relaxed text-[color:var(--text-muted)]">计划时间可留空，不会发送提醒。</p>
        {scheduledTime && <Button type="button" size="sm" variant="ghost" onClick={() => setScheduledTime("")}>清除计划时间</Button>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset><legend className="mb-1.5 text-xs font-medium text-[color:var(--text-secondary)]">优先级</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {[1, 2, 3].map((value) => (
              <button
                type="button"
                key={value}
                onClick={() => setPriority(value as 1 | 2 | 3)}
                aria-pressed={priority === value}
                className={
                  "button min-h-11 min-w-0 break-words rounded-xl border px-1 text-xs font-medium focus-ring " +
                  (priority === value
                    ? "border-[color:var(--accent)] bg-[var(--accent-soft)] text-[color:var(--accent)]"
                    : "button-secondary")
                }
              >
                {["高", "中", "低"][value - 1]} · P{value}
              </button>
            ))}
          </div>
        </fieldset>
        <Field label="重复">
          <select
            aria-label="重复"
            value={effectiveRepeat}
            disabled={recurring && scope === "single"}
            onChange={(event) => setRepeat(event.target.value as TodoRepeat)}
            className="field-control min-h-11 w-full min-w-0 px-3 text-sm focus-ring"
          >
            {REPEAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <p className="text-xs leading-relaxed text-[color:var(--text-muted)]">
        {recurring && scope === "single"
          ? "只改变这次任务。改期后，后续任务仍按原来的日期重复。"
          : recurring
            ? "按这次原定日期开始更新后续计划；未完成任务的单次修改也会被替换。已完成记录和已跳过的日期保留。系列编辑不改变日期。"
            : repeatDescription(effectiveRepeat, effectiveDate)}
      </p>
      {scope === "future" && <p className="text-xs text-[color:var(--text-muted)]">{repeatDescription(repeat, todo.occurrenceDate ?? dueDate)}</p>}
      {(error || localError) && <p role="alert" className="status-error break-words text-sm">{error || localError}</p>}

      <div className="sticky bottom-0 z-10 grid grid-cols-2 gap-2 border-t border-[color:var(--border-subtle)] bg-[var(--surface)] py-4 sm:flex sm:flex-wrap sm:justify-end">
        <Button className="w-full min-w-0 whitespace-normal break-words max-sm:px-3 sm:w-auto" type="button" variant="ghost" onClick={requestClose}>
          取消
        </Button>
        <Button className="w-full min-w-0 whitespace-normal break-words max-sm:px-3 sm:w-auto" type="submit" variant="primary" disabled={!valid || !changed || submitting}>
          {submitting ? "正在保存…" : "保存"}
        </Button>
      </div>
      </fieldset>
    </form>
  );
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-medium text-[color:var(--text-secondary)]">{label}</span>
      {children}
    </label>
  );
}
