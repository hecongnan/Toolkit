"use client";

import { Clock3, Plus, Repeat2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { uid } from "@/lib/storage";
import type { Todo, TodoRepeat } from "@/lib/types";

interface Props {
  date: string;
  onAdd: (t: Todo) => Promise<boolean>;
}

const REPEAT_OPTIONS: Array<{ value: TodoRepeat; label: string }> = [
  { value: "none", label: "不重复" },
  { value: "daily", label: "每天" },
  { value: "weekdays", label: "工作日" },
  { value: "weekly", label: "每周" },
];

export function TodoForm({ date, onAdd }: Props) {
  const [text, setText] = useState("");
  const [priority, setPriority] = useState<1 | 2 | 3>(2);
  const [scheduledTime, setScheduledTime] = useState("");
  const [repeat, setRepeat] = useState<TodoRepeat>("none");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || submitting) return;
    const now = Date.now();
    setSubmitting(true);
    const added = await onAdd({
      id: uid(),
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
    }
  };

  return (
    <form onSubmit={submit} className="surface space-y-3 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="输入一项任务，回车添加..."
          className="flex-1"
          disabled={submitting}
        />
        <Button type="submit" variant="primary" size="md" disabled={!text.trim() || submitting}>
          <Plus size={16} />
          添加
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1">
          {[1, 2, 3].map((p) => (
            <button
              type="button"
              key={p}
              onClick={() => setPriority(p as 1 | 2 | 3)}
              className={
                "rounded-md px-2.5 py-1 text-xs font-medium transition focus-ring " +
                (priority === p
                  ? "bg-brand-gradient text-white shadow-glow"
                  : "text-zinc-400 hover:text-zinc-100")
              }
            >
              P{p}
            </button>
          ))}
        </div>

        <label className="relative">
          <Clock3 size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="time"
            value={scheduledTime}
            onChange={(event) => setScheduledTime(event.target.value)}
            aria-label="计划时间"
            className="h-9 rounded-lg border border-white/10 bg-white/[0.03] pl-8 pr-2 text-xs text-zinc-300 focus-ring"
          />
        </label>

        <label className="relative">
          <Repeat2 size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <select
            value={repeat}
            onChange={(event) => setRepeat(event.target.value as TodoRepeat)}
            aria-label="重复规则"
            className="h-9 rounded-lg border border-white/10 bg-white/[0.03] pl-8 pr-7 text-xs text-zinc-300 focus-ring"
          >
            {REPEAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </form>
  );
}
