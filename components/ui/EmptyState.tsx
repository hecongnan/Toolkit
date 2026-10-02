import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 px-6 py-14 text-center",
        className,
      )}
    >
      {icon && (
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[color:var(--accent)]">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <p className="text-base font-semibold text-zinc-100">{title}</p>
        {description && <p className="mx-auto max-w-sm text-sm leading-6 text-[color:var(--text-muted)]">{description}</p>}
      </div>
      {action}
    </div>
  );
}
