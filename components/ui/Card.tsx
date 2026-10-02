import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "surface p-5 sm:p-6",
        className,
      )}
      {...rest}
    />
  );
}
