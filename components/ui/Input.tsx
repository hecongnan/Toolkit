import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-xl border border-[color:var(--border-default)] bg-[var(--control-bg)] px-3.5 text-sm text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)] transition focus-ring hover:border-[color:var(--border-hover)] focus:border-fuchsia-400/50 focus:bg-[var(--control-active)]",
        className,
      )}
      {...rest}
    />
  ),
);
Input.displayName = "Input";
