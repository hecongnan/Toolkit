"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { uid } from "@/lib/storage";
import type { Todo } from "@/lib/types";

interface Props {
  date: string;
  onAdd: (t: Todo) => void;
}

export function TodoForm({ date, onAdd }: Props) {
  const [text, setText] = useState("");
  const [priority, setPriority] = useState<1 | 2 | 3>(2);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    onAdd({
      id: uid(),
      text: value,
      done: false,
      priority,
      dueDate: date,
      createdAt: Date.now(),
    });
    setText("");
    setPriority(2);
  };

  return (
    <form onSubmit={submit} className="surface flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="输入一项任务，回车添加..."
        className="flex-1"
      />
      <div className="flex items-center gap-2">
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
        <Button type="submit" variant="primary" size="md">
          <Plus size={16} />
          添加
        </Button>
      </div>
    </form>
  );
}
