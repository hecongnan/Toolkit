import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...rest }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-[88px] w-full rounded-lg border border-[color:var(--border-default)] bg-[var(--control-bg)] px-3.5 py-2.5 text-sm text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)] transition focus-ring hover:border-[color:var(--border-hover)] focus:border-teal-400/60 focus:bg-[var(--control-active)] resize-y",
      className,
    )}
    {...rest}
  />
));
Textarea.displayName = "Textarea";
