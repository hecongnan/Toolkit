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
import { TodoMenu, type TodoMenuAction } from "./TodoMenu";

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
  toggleDisabled?: boolean;
  pending?: boolean;
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
  toggleDisabled = disabled,
  pending = false,
  showDate = false,
  onSkip,
  onMoveToToday,
}: Props) {
  const reorderable = !todo.done && !todo.skipped && !showDate;
  const actions: TodoMenuAction[] = [
    { label: "编辑", icon: <Pencil size={16} />, onSelect: () => onEdit(todo) },
    ...(onMoveToToday ? [{ label: "移到今天", icon: <CalendarArrowUp size={16} />, onSelect: () => onMoveToToday(todo.id) }] : []),
    ...(onSkip && !todo.done && !todo.skipped && todo.seriesId && todo.repeat !== "none"
      ? [{ label: "跳过这次", icon: <SkipForward size={16} />, onSelect: () => onSkip(todo.id) }] : []),
    ...(reorderable ? [
      { label: "上移", icon: <ChevronUp size={16} />, disabled: !canMoveUp, onSelect: () => onMove(todo.id, -1) },
      { label: "下移", icon: <ChevronDown size={16} />, disabled: !canMoveDown, onSelect: () => onMove(todo.id, 1) },
    ] : []),
    { label: "删除", icon: <Trash2 size={16} />, danger: true, onSelect: () => onDelete(todo.id) },
  ];
  return (
    <div
      data-todo-id={todo.id}
      aria-busy={pending}
      draggable={reorderable && !disabled}
      onDragStart={() => onDragStart(todo.id)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => onDrop(todo.id)}
      onDragEnd={onDragEnd}
      className={cn(
        "group flex items-center gap-1 px-2 py-3 sm:flex-wrap sm:gap-3 sm:px-4",
        "hover:bg-white/[0.03]",
        reorderable && !disabled && "sm:cursor-grab sm:active:cursor-grabbing",
      )}
    >
      {reorderable && (
        <GripVertical size={15} className="hidden shrink-0 text-zinc-600 sm:block" aria-hidden />
      )}
      <button
        type="button"
        onClick={() => onToggle(todo.id)}
        disabled={toggleDisabled}
        aria-label={todo.skipped ? "恢复这次任务" : todo.done ? "标记未完成" : "标记完成"}
        aria-pressed={todo.done}
        className="button grid h-11 w-11 shrink-0 place-items-center rounded-xl focus-ring disabled:opacity-50"
      >
        <span className={cn(
          "grid h-5 w-5 place-items-center rounded-full border",
          todo.done
            ? "border-blue-600 bg-blue-600 text-white"
            : "border-[color:var(--border-default)] hover:border-teal-400/40",
        )}>
        {todo.done && <Check size={12} strokeWidth={3} />}
        </span>
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "break-words text-sm leading-relaxed",
            todo.done
              ? "text-zinc-500 line-through decoration-zinc-600"
              : "text-[color:var(--text-primary)]",
          )}
        >
          {todo.text}
        </p>
        {(showDate || todo.scheduledTime || todo.repeat !== "none" || todo.occurrenceDate !== undefined) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
            {showDate && <span className="status-warning">{todo.dueDate} · 逾期</span>}
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
        <Tag tone={PRIORITY_TONE[todo.priority]} className="mt-1.5 sm:hidden">
          P{todo.priority} · {PRIORITY_LABEL[todo.priority]}
        </Tag>
      </div>

      <Tag tone={PRIORITY_TONE[todo.priority]} className="hidden sm:inline-flex">
        P{todo.priority} · {PRIORITY_LABEL[todo.priority]}
      </Tag>

      <TodoMenu title={todo.text} disabled={disabled} actions={actions} />
      <div className="todo-actions hidden shrink-0 flex-wrap items-center justify-end sm:flex">
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
        "button icon-button focus-ring disabled:cursor-not-allowed disabled:opacity-25",
        danger
          ? "status-error"
          : "hover:bg-white/5 hover:text-zinc-100",
      )}
    >
      {children}
    </button>
  );
}
