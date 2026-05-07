"use client";

import { Check, Trash2 } from "lucide-react";
import { Tag } from "@/components/ui/Tag";
import { cn } from "@/lib/cn";
import type { Todo } from "@/lib/types";

interface Props {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

const PRIORITY_TONE = { 1: "rose", 2: "amber", 3: "sky" } as const;
const PRIORITY_LABEL = { 1: "高", 2: "中", 3: "低" };

export function TodoItem({ todo, onToggle, onDelete }: Props) {
  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-4 py-3 transition",
        "hover:bg-white/[0.03]",
      )}
    >
      <button
        onClick={() => onToggle(todo.id)}
        aria-label={todo.done ? "标记未完成" : "标记完成"}
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center rounded-full border transition focus-ring",
          todo.done
            ? "border-fuchsia-400/50 bg-brand-gradient text-white shadow-glow"
            : "border-white/15 hover:border-fuchsia-400/40",
        )}
      >
        {todo.done && <Check size={12} strokeWidth={3} />}
      </button>

      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm leading-snug",
            todo.done
              ? "text-zinc-500 line-through decoration-zinc-600"
              : "text-zinc-100",
          )}
        >
          {todo.text}
        </p>
      </div>

      <Tag tone={PRIORITY_TONE[todo.priority]}>P{todo.priority} · {PRIORITY_LABEL[todo.priority]}</Tag>

      <button
        onClick={() => onDelete(todo.id)}
        aria-label="删除"
        className="rounded-md p-1.5 text-zinc-500 opacity-0 transition group-hover:opacity-100 hover:bg-rose-500/10 hover:text-rose-300 focus-ring focus:opacity-100"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
