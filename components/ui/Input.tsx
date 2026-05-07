import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-sm text-zinc-100 placeholder:text-zinc-500 transition focus-ring hover:border-white/20 focus:border-fuchsia-400/50 focus:bg-white/[0.05]",
        className,
      )}
      {...rest}
    />
  ),
);
Input.displayName = "Input";
