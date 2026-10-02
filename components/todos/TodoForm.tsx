"use client";

import { Clock3, Plus, Repeat2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { uid } from "@/lib/storage";
import { REPEAT_OPTIONS, repeatDescription } from "@/lib/todo-dates";
import type { Todo, TodoRepeat } from "@/lib/types";

interface Props {
  date: string;
  onAdd: (t: Todo) => Promise<boolean>;
  disabled?: boolean;
}

export function TodoForm({ date, onAdd, disabled = false }: Props) {
  const [text, setText] = useState("");
  const [priority, setPriority] = useState<1 | 2 | 3>(2);
  const [scheduledTime, setScheduledTime] = useState("");
  const [repeat, setRepeat] = useState<TodoRepeat>("none");
  const [submitting, setSubmitting] = useState(false);
  const [draftId, setDraftId] = useState(uid);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || submitting || disabled) return;
    const now = Date.now();
    setSubmitting(true);
    const added = await onAdd({
      id: draftId,
      text: value,
      done: false,
      priority,
      dueDate: date,
      scheduledTime: scheduledTime || undefined,
      repeat,
      position: now,
      createdAt: now,
      updatedAt: now,
    });
    setSubmitting(false);
    if (added) {
      setText("");
      setPriority(2);
      setScheduledTime("");
      setRepeat("none");
      setDraftId(uid());
    }
  };

  return (
    <form onSubmit={submit} className="surface space-y-4 p-4 sm:p-5">
      <p className="text-sm font-semibold">添加一项待办</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="接下来，想完成什么？"
          className="sm:flex-1"
          disabled={submitting || disabled}
          aria-label="任务内容"
        />
        <Button type="submit" variant="primary" size="md" disabled={!text.trim() || submitting || disabled}>
          <Plus size={16} />
          添加
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="任务优先级" className="flex flex-wrap gap-1 rounded-xl bg-[var(--control-bg)] p-1">
          {[1, 2, 3].map((p) => (
            <button
              type="button"
              disabled={disabled || submitting}
              key={p}
              onClick={() => setPriority(p as 1 | 2 | 3)}
              aria-pressed={priority === p}
              className={
                "button min-h-11 rounded-lg px-3 text-xs font-medium focus-ring " +
                (priority === p
                  ? "bg-[var(--surface)] text-[color:var(--accent)] shadow-sm"
                  : "button-ghost")
              }
            >
              {["高", "中", "低"][p - 1]} · P{p}
            </button>
          ))}
        </div>

        <label className="relative">
          <Clock3 size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="time"
            disabled={disabled || submitting}
            value={scheduledTime}
            onChange={(event) => setScheduledTime(event.target.value)}
            aria-label="计划时间"
            className="field-control min-h-11 min-w-0 pl-8 pr-2 text-sm focus-ring"
          />
        </label>

        <label className="relative">
          <Repeat2 size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <select
            value={repeat}
            disabled={disabled || submitting}
            onChange={(event) => setRepeat(event.target.value as TodoRepeat)}
            aria-label="重复规则"
            className="field-control min-h-11 pl-8 pr-7 text-sm focus-ring"
          >
            {REPEAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs leading-relaxed text-[color:var(--text-muted)]">{repeatDescription(repeat, date)}</p>
    </form>
  );
}
