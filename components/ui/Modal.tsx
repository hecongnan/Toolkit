"use client";

import { X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
  keepMounted?: boolean;
  presentation?: "sheet" | "drawer";
}

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  keepMounted = false,
  presentation = "sheet",
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const [mounted, setMounted] = useState(open || keepMounted);

  useEffect(() => {
    if (open || keepMounted) {
      setMounted(true);
      return;
    }
    // Only DOM cleanup waits for exit; input and focus restoration do not.
    const timeout = window.setTimeout(() => setMounted(false), 200);
    return () => window.clearTimeout(timeout);
  }, [open, keepMounted]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      // React's autoFocus runs while the native dialog is still display:none.
      dialog.querySelector<HTMLElement>("[data-autofocus], [autofocus]")?.focus({ preventScroll: true });
    }
    if (!open && dialog.open) {
      dialog.close();
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus({ preventScroll: true });
    }
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  if (!mounted) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-modal="true"
      className={cn("app-dialog", presentation === "drawer" && "drawer", className)}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )).filter((element) => !element.matches(":disabled") && element.tabIndex >= 0 && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
        const first = items[0];
        const last = items[items.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) {
          event.preventDefault(); first.focus();
        }
      }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="modal-panel">
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border-subtle)] px-6 py-4">
          <h2 id={titleId} className="text-base font-semibold tracking-tight">{title ?? "对话框"}</h2>
          <button
            type="button"
            onClick={onClose}
            className="button icon-button focus-ring"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>
        <div className={presentation === "drawer" ? "h-[calc(100%-5rem)]" : "px-6 py-6"}>{children}</div>
      </div>
    </dialog>
  );
}
