"use client";

import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  GripVertical,
  Pencil,
  Repeat2,
  Trash2,
} from "lucide-react";
import { Tag } from "@/components/ui/Tag";
import { cn } from "@/lib/cn";
import type { Todo } from "@/lib/types";

interface Props {
  todo: Todo;
  onToggle: (id: string) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onDragStart: (id: string) => void;
  onDrop: (id: string) => void;
  onDragEnd: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

const PRIORITY_TONE = { 1: "rose", 2: "amber", 3: "sky" } as const;
const PRIORITY_LABEL = { 1: "高", 2: "中", 3: "低" };
const REPEAT_LABEL = {
  none: "",
  daily: "每天",
  weekdays: "工作日",
  weekly: "每周",
} as const;

export function TodoItem({
  todo,
  onToggle,
  onEdit,
  onDelete,
  onMove,
  onDragStart,
  onDrop,
  onDragEnd,
  canMoveUp,
  canMoveDown,
}: Props) {
  return (
    <div
      draggable={!todo.done}
      onDragStart={() => onDragStart(todo.id)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => onDrop(todo.id)}
      onDragEnd={onDragEnd}
      className={cn(
        "group flex items-center gap-2 px-3 py-3 transition sm:gap-3 sm:px-4",
        "hover:bg-white/[0.03]",
        !todo.done && "cursor-grab active:cursor-grabbing",
      )}
    >
      {!todo.done && (
        <GripVertical size={15} className="hidden shrink-0 text-zinc-600 sm:block" aria-hidden />
      )}
      <button
        onClick={() => onToggle(todo.id)}
        aria-label={todo.done ? "标记未完成" : "标记完成"}
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center rounded-full border transition focus-ring",
          todo.done
            ? "border-teal-400/50 bg-brand-gradient text-white shadow-glow"
            : "border-white/15 hover:border-teal-400/40",
        )}
      >
        {todo.done && <Check size={12} strokeWidth={3} />}
      </button>

      <div className="min-w-0 flex-1">
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
        {(todo.scheduledTime || todo.repeat !== "none") && (
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
            {todo.scheduledTime && (
              <span className="inline-flex items-center gap-1">
                <Clock3 size={12} />
                {todo.scheduledTime}
              </span>
            )}
            {todo.repeat !== "none" && (
              <span className="inline-flex items-center gap-1">
                <Repeat2 size={12} />
                {REPEAT_LABEL[todo.repeat]}
              </span>
            )}
          </div>
        )}
      </div>

      <Tag tone={PRIORITY_TONE[todo.priority]} className="hidden sm:inline-flex">
        P{todo.priority} · {PRIORITY_LABEL[todo.priority]}
      </Tag>

      <div className="flex shrink-0 items-center opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        {!todo.done && (
          <>
            <IconButton
              label="上移"
              disabled={!canMoveUp}
              onClick={() => onMove(todo.id, -1)}
            >
              <ChevronUp size={14} />
            </IconButton>
            <IconButton
              label="下移"
              disabled={!canMoveDown}
              onClick={() => onMove(todo.id, 1)}
            >
              <ChevronDown size={14} />
            </IconButton>
          </>
        )}
        <IconButton label="编辑" onClick={() => onEdit(todo)}>
          <Pencil size={14} />
        </IconButton>
        <IconButton label="删除" danger onClick={() => onDelete(todo.id)}>
          <Trash2 size={14} />
        </IconButton>
      </div>
    </div>
  );
}

function IconButton({
  label,
  children,
  danger = false,
  disabled = false,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "rounded-md p-1.5 text-zinc-500 transition focus-ring disabled:cursor-not-allowed disabled:opacity-25",
        danger
          ? "hover:bg-rose-500/10 hover:text-rose-300"
          : "hover:bg-white/5 hover:text-zinc-100",
      )}
    >
      {children}
    </button>
  );
}
