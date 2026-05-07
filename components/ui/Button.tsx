import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-brand-gradient text-white shadow-glow hover:brightness-110 active:brightness-95",
  secondary:
    "border border-[color:var(--border-default)] bg-[var(--control-bg)] text-[color:var(--text-primary)] hover:bg-[var(--control-hover)]",
  ghost:
    "text-[color:var(--text-secondary)] hover:bg-[var(--control-hover)] hover:text-[color:var(--text-primary)]",
  danger:
    "border border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-xs rounded-lg gap-1.5",
  md: "h-10 px-4 text-sm rounded-xl gap-2",
  lg: "h-12 px-6 text-base rounded-xl gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "secondary", size = "md", className, ...rest }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center font-medium transition focus-ring disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...rest}
    />
  ),
);
Button.displayName = "Button";
