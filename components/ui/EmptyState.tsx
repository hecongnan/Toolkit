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
        "surface flex flex-col items-center gap-3 px-6 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-gradient-soft text-fuchsia-200 ring-1 ring-white/10">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <p className="text-base font-semibold text-zinc-100">{title}</p>
        {description && <p className="text-sm text-zinc-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}
