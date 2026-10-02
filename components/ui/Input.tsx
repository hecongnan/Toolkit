import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input
      ref={ref}
      data-autofocus={rest.autoFocus || undefined}
      className={cn(
        "field-control min-h-11 min-w-0 w-full px-3.5 text-sm placeholder:text-[color:var(--text-muted)] focus-ring",
        className,
      )}
      {...rest}
    />
  ),
);
Input.displayName = "Input";
