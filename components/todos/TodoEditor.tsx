"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { Todo, TodoRepeat } from "@/lib/types";

interface Props {
  todo: Todo;
  onSave: (todo: Todo) => Promise<boolean>;
  onCancel: () => void;
}

const REPEAT_OPTIONS: Array<{ value: TodoRepeat; label: string }> = [
  { value: "none", label: "不重复" },
  { value: "daily", label: "每天" },
  { value: "weekdays", label: "每个工作日" },
  { value: "weekly", label: "每周" },
];

export function TodoEditor({ todo, onSave, onCancel }: Props) {
  const [text, setText] = useState(todo.text);
  const [dueDate, setDueDate] = useState(todo.dueDate);
  const [scheduledTime, setScheduledTime] = useState(todo.scheduledTime ?? "");
  const [priority, setPriority] = useState(todo.priority);
  const [repeat, setRepeat] = useState<TodoRepeat>(todo.repeat);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setText(todo.text);
    setDueDate(todo.dueDate);
    setScheduledTime(todo.scheduledTime ?? "");
    setPriority(todo.priority);
    setRepeat(todo.repeat);
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
    });
    setSubmitting(false);
    if (saved) onCancel();
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <Field label="任务内容">
        <Input autoFocus value={text} onChange={(event) => setText(event.target.value)} required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="日期">
          <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required />
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
            value={repeat}
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

      <div className="flex justify-end gap-2 border-t border-[color:var(--border-subtle)] pt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" variant="primary" disabled={!text.trim() || submitting}>
          <Save size={15} />
          保存
        </Button>
      </div>
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
