"use client";

import { useEffect, useState } from "react";

export function TodoNotice({ message, undoLabel, onUndo, onDismiss }: {
  message: string;
  undoLabel?: string;
  onUndo?: () => void;
  onDismiss: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (hovered || focused || hidden) return;
    // Restart the reading window when returning to the toast or browser tab.
    const timer = window.setTimeout(onDismiss, undoLabel ? 8_000 : 5_000);
    return () => window.clearTimeout(timer);
  }, [message, undoLabel, hovered, focused, hidden, onDismiss]);

  return <div role="status" aria-live="polite" aria-atomic="true"
    onPointerEnter={(event) => { if (event.pointerType !== "touch") setHovered(true); }}
    onPointerLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)}
    onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocused(false); }}
    className="surface pointer-events-none fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex items-center gap-2 rounded-2xl px-3 py-2 text-sm shadow-lg sm:left-auto sm:max-w-md">
    <span title={message} className="min-w-0 flex-1 break-words line-clamp-2">{message}</span>
    {onUndo && <button type="button" aria-label={undoLabel} onClick={onUndo}
      className="button pointer-events-auto min-h-11 shrink-0 rounded-xl px-3 font-medium text-[color:var(--accent)] focus-ring">撤销完成</button>}
    <button type="button" onClick={onDismiss}
      className="button pointer-events-auto min-h-11 shrink-0 rounded-xl px-3 text-xs focus-ring">关闭</button>
  </div>;
}
