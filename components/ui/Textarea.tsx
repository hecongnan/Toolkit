import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...rest }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "field-control min-h-[100px] w-full px-3.5 py-3 text-sm placeholder:text-[color:var(--text-muted)] focus-ring resize-y",
      className,
    )}
    {...rest}
  />
));
Textarea.displayName = "Textarea";
