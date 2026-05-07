"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
  keepMounted?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  keepMounted = false,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open && !keepMounted) return null;

  return (
    <div
      hidden={!open}
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center animate-fade-in sm:items-center",
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
      )}
      aria-hidden={!open}
    >
      <button
        aria-label="Close overlay"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 w-full sm:max-w-lg max-h-[92vh] overflow-y-auto",
          "rounded-t-2xl sm:rounded-2xl border border-[color:var(--border-default)] bg-[var(--surface-panel)] backdrop-blur-2xl shadow-2xl",
          "animate-slide-up",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--border-subtle)] px-5 py-4">
          <h3 className="text-base font-semibold text-[color:var(--text-primary)]">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[color:var(--text-tertiary)] hover:bg-[var(--control-hover)] hover:text-[color:var(--text-primary)] focus-ring"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
