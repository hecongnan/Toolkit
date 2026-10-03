"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";

export interface TodoMenuAction {
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
}

export function TodoMenu({ title, disabled, actions }: {
  title: string;
  disabled: boolean;
  actions: TodoMenuAction[];
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, maxHeight: 0 });

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  };

  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    const margin = 12;
    const maxHeight = Math.max(44, height - margin * 2);
    const menuHeight = Math.min(menu.current.scrollHeight, maxHeight);
    const below = anchor.bottom + 4;
    const top = below + menuHeight <= viewportTop + height - margin
      ? below : Math.max(viewportTop + margin, anchor.top - menuHeight - 4);
    const left = Math.max(viewportLeft + margin, Math.min(anchor.right - menu.current.offsetWidth, viewportLeft + width - menu.current.offsetWidth - margin));
    setPosition({ top, left, maxHeight });
  }, [open]);

  useLayoutEffect(() => {
    if (open && position.maxHeight) menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    const initialScroll = { x: window.scrollX, y: window.scrollY };
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    };
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && menu.current?.contains(event.target)) return;
      // Focus may have scrolled the trigger into view before opening, with its
      // scroll event delivered afterwards. Only dismiss for a new movement.
      if (event.type === "scroll" && (event.target === document || event.target === window)
        && window.scrollX === initialScroll.x && window.scrollY === initialScroll.y) return;
      setOpen(false);
    };
    const focusOutside = (event: FocusEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", focusOutside);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    window.visualViewport?.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", focusOutside);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      window.visualViewport?.removeEventListener("resize", dismiss);
    };
  }, [open]);

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  return <div className="shrink-0 sm:hidden">
    <button ref={trigger} type="button" disabled={disabled}
      aria-label={`更多操作：${title}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen((value) => !value)}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); }
      }}
      className="button icon-button focus-ring disabled:opacity-25">
      <MoreHorizontal size={20} aria-hidden />
    </button>
    {open && createPortal(<div ref={menu} id={id} role="menu" aria-label={`任务操作：${title}`}
      style={{ ...position, visibility: position.maxHeight ? "visible" : "hidden" }}
      className="surface fixed z-50 w-48 max-w-[calc(100vw-1.5rem)] overflow-y-auto overscroll-contain p-1.5 shadow-lg sm:hidden"
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); return; }
        if (event.key === "Tab") {
          // Return to the trigger, then let the browser follow normal tab order.
          close(true);
          return;
        }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
          : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[index]?.focus();
      }}>
      {actions.map((action) => <button key={action.label} type="button" role="menuitem" tabIndex={-1}
        disabled={action.disabled} onClick={() => { close(true); action.onSelect(); }}
        className={cn("button flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm focus-ring focus:bg-[var(--control-hover)] disabled:opacity-30", action.danger ? "status-error" : "text-[color:var(--text-primary)]")}>
        <span aria-hidden>{action.icon}</span>{action.label}
      </button>)}
    </div>, document.body)}
  </div>;
}
