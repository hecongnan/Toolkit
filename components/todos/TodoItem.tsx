"use client";

import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  GripVertical,
  Pencil,
  Repeat2,
  SkipForward,
  CalendarArrowUp,
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
  disabled?: boolean;
  showDate?: boolean;
  onSkip?: (id: string) => void;
  onMoveToToday?: (id: string) => void;
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
  disabled = false,
  showDate = false,
  onSkip,
  onMoveToToday,
}: Props) {
  const reorderable = !todo.done && !todo.skipped && !showDate;
  return (
    <div
      draggable={reorderable && !disabled}
      onDragStart={() => onDragStart(todo.id)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => onDrop(todo.id)}
      onDragEnd={onDragEnd}
      className={cn(
        "group flex flex-wrap items-center gap-2 px-3 py-3 transition sm:gap-3 sm:px-4",
        "hover:bg-white/[0.03]",
        reorderable && !disabled && "sm:cursor-grab sm:active:cursor-grabbing",
      )}
    >
      {reorderable && (
        <GripVertical size={15} className="hidden shrink-0 text-zinc-600 sm:block" aria-hidden />
      )}
      <button
        onClick={() => onToggle(todo.id)}
        disabled={disabled}
        aria-label={todo.skipped ? "恢复这次任务" : todo.done ? "标记未完成" : "标记完成"}
        aria-pressed={todo.done}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-lg focus-ring disabled:opacity-50"
      >
        <span className={cn(
          "grid h-5 w-5 place-items-center rounded-full border transition",
          todo.done
            ? "border-teal-400/50 bg-brand-gradient text-white shadow-glow"
            : "border-[color:var(--border-default)] hover:border-teal-400/40",
        )}>
        {todo.done && <Check size={12} strokeWidth={3} />}
        </span>
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "break-words text-sm leading-snug",
            todo.done
              ? "text-zinc-500 line-through decoration-zinc-600"
              : "text-[color:var(--text-primary)]",
          )}
        >
          {todo.text}
        </p>
        {(showDate || todo.scheduledTime || todo.repeat !== "none" || todo.occurrenceDate !== undefined) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
            {showDate && <span className="text-amber-500">{todo.dueDate} · 逾期</span>}
            {todo.occurrenceDate && todo.occurrenceDate !== todo.dueDate && <span>原定 {todo.occurrenceDate}</span>}
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

      <Tag tone={PRIORITY_TONE[todo.priority]}>
        P{todo.priority} · {PRIORITY_LABEL[todo.priority]}
      </Tag>

      <div className="flex w-full shrink-0 items-center justify-end transition sm:w-auto sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        {reorderable && (
          <>
            <IconButton
              label="上移"
              disabled={disabled || !canMoveUp}
              onClick={() => onMove(todo.id, -1)}
            >
              <ChevronUp size={14} />
            </IconButton>
            <IconButton
              label="下移"
              disabled={disabled || !canMoveDown}
              onClick={() => onMove(todo.id, 1)}
            >
              <ChevronDown size={14} />
            </IconButton>
          </>
        )}
        {onMoveToToday && <IconButton label="移到今天" disabled={disabled} onClick={() => onMoveToToday(todo.id)}><CalendarArrowUp size={16} /></IconButton>}
        {onSkip && !todo.done && !todo.skipped && todo.seriesId && todo.repeat !== "none" && <IconButton label="跳过这次" disabled={disabled} onClick={() => onSkip(todo.id)}><SkipForward size={16} /></IconButton>}
        <IconButton label="编辑" disabled={disabled} onClick={() => onEdit(todo)}>
          <Pencil size={14} />
        </IconButton>
        <IconButton label="删除" disabled={disabled} danger onClick={() => onDelete(todo.id)}>
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
        "grid h-11 w-11 place-items-center rounded-lg text-[color:var(--text-muted)] transition focus-ring disabled:cursor-not-allowed disabled:opacity-25",
        danger
          ? "hover:bg-rose-500/10 hover:text-rose-300"
          : "hover:bg-white/5 hover:text-zinc-100",
      )}
    >
      {children}
    </button>
  );
}
