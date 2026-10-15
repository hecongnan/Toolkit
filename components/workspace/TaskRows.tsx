import Link from "next/link";
import { ArrowUpRight, Check, Clock3, Repeat2 } from "lucide-react";
import type { Todo } from "@/lib/types";
import { taskHref } from "@/lib/task-workspace";

export function TaskRows({ tasks, onToggle, pending = new Set(), errors = {}, disabled = false }: {
  tasks: Todo[]; onToggle?: (task: Todo) => void; pending?: Set<string>; errors?: Record<string, string>; disabled?: boolean;
}) {
  return <ul className="divide-y divide-[color:var(--border-subtle)]">
    {tasks.map((task) => <li key={task.id} data-workspace-task={task.id} className="px-3 py-3 sm:px-5" aria-busy={pending.has(task.id)}>
      <div className="flex items-center gap-2">
        {onToggle && !task.skipped && <button type="button" aria-label={`${task.done ? "恢复任务" : "完成任务"}：${task.text}`} aria-pressed={task.done} disabled={disabled || pending.has(task.id)} onClick={() => onToggle(task)} className="button icon-button !h-[44px] !w-[44px] focus-ring disabled:opacity-50">
          <span className={"grid h-5 w-5 place-items-center rounded-full border " + (task.done ? "border-blue-600 bg-blue-600 text-white" : "border-[color:var(--border-default)]")}>{task.done && <Check size={13} aria-hidden />}</span>
        </button>}
        <div className="min-w-0 flex-1"><Link href={taskHref(task)} className="quiet-link inline-flex min-h-11 max-w-full items-center rounded-lg text-sm font-medium leading-6 focus-ring"><span className={"break-words " + (task.done ? "text-[color:var(--text-muted)] line-through" : "text-[color:var(--text-primary)]")}>{task.text}</span></Link>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[color:var(--text-muted)]">
            <span>{task.skipped ? "已跳过" : task.done ? "已完成" : "待完成"}</span>
            {task.priority === 1 && <span className="status-warning">优先处理</span>}
            {task.scheduledTime && <span className="inline-flex items-center gap-1"><Clock3 size={12} aria-hidden />{task.scheduledTime}</span>}
            {task.repeat !== "none" && <span className="inline-flex items-center gap-1"><Repeat2 size={12} aria-hidden />{task.repeat === "daily" ? "每天" : task.repeat === "weekly" ? "每周" : "周一至周五"}</span>}
          </div>
        </div>
        <Link href={taskHref(task)} aria-label={`查看并编辑：${task.text}`} className="button icon-button hidden !h-[44px] !w-[44px] focus-ring sm:inline-grid"><ArrowUpRight size={17} aria-hidden /></Link>
      </div>
      {errors[task.id] && <p role="alert" className="mt-2 break-words text-xs leading-6 status-error">{errors[task.id]} 可再次点击任务勾选按钮重试。</p>}
    </li>)}
  </ul>;
}
