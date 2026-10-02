"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { Todo, TodoRepeat, TodoScope } from "@/lib/types";
import { REPEAT_OPTIONS, repeatDescription } from "@/lib/todo-dates";

interface Props {
  todo: Todo;
  onSave: (todo: Todo, scope: TodoScope) => Promise<boolean>;
  onCancel: () => void;
  error?: string | null;
}

export function TodoEditor({ todo, onSave, onCancel, error }: Props) {
  const [text, setText] = useState(todo.text);
  const [dueDate, setDueDate] = useState(todo.dueDate);
  const [scheduledTime, setScheduledTime] = useState(todo.scheduledTime ?? "");
  const [priority, setPriority] = useState(todo.priority);
  const [repeat, setRepeat] = useState<TodoRepeat>(todo.repeat);
  const [submitting, setSubmitting] = useState(false);
  const [scope, setScope] = useState<TodoScope>("single");
  const recurring = Boolean(todo.seriesId) && todo.repeat !== "none";

  useEffect(() => {
    setText(todo.text);
    setDueDate(todo.dueDate);
    setScheduledTime(todo.scheduledTime ?? "");
    setPriority(todo.priority);
    setRepeat(todo.repeat);
    setScope("single");
  }, [todo]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    const saved = await onSave({
      ...todo,
      text: text.trim(),
      dueDate,
      scheduledTime: scheduledTime || undefined,
      priority,
      repeat,
      updatedAt: Date.now(),
    }, scope);
    setSubmitting(false);
    if (saved) onCancel();
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <fieldset disabled={submitting} className="space-y-5">
      {recurring && (
        <Field label="修改范围">
          <select aria-label="修改范围" value={scope} disabled={submitting} onChange={(event) => {
            setScope(event.target.value as TodoScope);
            setDueDate(todo.dueDate);
            setRepeat(todo.repeat);
          }} className="h-10 w-full rounded-lg border border-[color:var(--border-default)] bg-[var(--control-bg)] px-3 text-sm text-[color:var(--text-primary)] focus-ring">
            <option value="single">仅这次</option>
            <option value="future">这次及以后</option>
          </select>
        </Field>
      )}
      <Field label="任务内容">
        <Input autoFocus value={text} onChange={(event) => setText(event.target.value)} required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="日期">
          <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required disabled={scope === "future"} />
        </Field>
        <Field label="计划时间">
          <Input
            type="time"
            value={scheduledTime}
            onChange={(event) => setScheduledTime(event.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="优先级">
          <div className="grid grid-cols-3 gap-1.5">
            {[1, 2, 3].map((value) => (
              <button
                type="button"
                key={value}
                onClick={() => setPriority(value as 1 | 2 | 3)}
                className={
                  "h-10 rounded-lg border text-xs font-medium transition focus-ring " +
                  (priority === value
                    ? "border-teal-400/50 bg-teal-500/15 text-teal-100"
                    : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-zinc-100")
                }
              >
                P{value}
              </button>
            ))}
          </div>
        </Field>
        <Field label="重复">
          <select
            aria-label="重复"
            value={repeat}
            disabled={recurring && scope === "single"}
            onChange={(event) => setRepeat(event.target.value as TodoRepeat)}
            className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm text-zinc-200 focus-ring"
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
            : repeatDescription(repeat, dueDate)}
      </p>
      {scope === "future" && <p className="text-xs text-[color:var(--text-muted)]">{repeatDescription(repeat, todo.occurrenceDate ?? dueDate)}</p>}
      {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}

      <div className="flex justify-end gap-2 border-t border-[color:var(--border-subtle)] pt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" variant="primary" disabled={!text.trim() || submitting}>
          <Save size={15} />
          保存
        </Button>
      </div>
      </fieldset>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-zinc-400">{label}</span>
      {children}
    </label>
  );
}
