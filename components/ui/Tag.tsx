import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "default" | "teal" | "emerald" | "amber" | "rose" | "sky";

interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  children: ReactNode;
}

const toneClasses: Record<Tone, string> = {
  default: "border-transparent bg-[var(--control-bg)] text-[color:var(--text-secondary)]",
  teal: "border-transparent bg-[var(--accent-soft)] text-[color:var(--accent)]",
  emerald: "border-transparent bg-emerald-500/10 text-[color:var(--success)]",
  amber: "border-transparent bg-amber-500/10 text-[color:var(--warning)]",
  rose: "border-transparent bg-rose-500/10 text-[color:var(--danger)]",
  sky: "border-transparent bg-[var(--accent-soft)] text-[color:var(--accent)]",
};

export function Tag({ tone = "default", className, children, ...rest }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        toneClasses[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
