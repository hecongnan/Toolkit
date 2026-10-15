"use client";

import { useEffect, useState } from "react";
import { uid } from "@/lib/storage";
import { isDateKey } from "@/lib/todo-dates";
import type { TodoRepeat } from "@/lib/types";

export interface TodoDraft {
  id: string;
  text: string;
  dueDate: string;
  scheduledTime: string;
  priority: 1 | 2 | 3;
  repeat: TodoRepeat;
}

function emptyDraft(date: string): TodoDraft {
  return { id: uid(), text: "", dueDate: date, scheduledTime: "", priority: 2, repeat: "none" };
}
function validDraft(value: unknown): value is TodoDraft {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(item.id) &&
    typeof item.text === "string" && typeof item.dueDate === "string" &&
    // An unfinished date field is allowed in a draft, never in a submission.
    (item.dueDate === "" || isDateKey(item.dueDate)) && typeof item.scheduledTime === "string" &&
    (item.scheduledTime === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(item.scheduledTime)) &&
    [1, 2, 3].includes(item.priority as number) && ["none", "daily", "weekdays", "weekly"].includes(String(item.repeat));
}

export function useTodoDraft(userId: string, date: string) {
  const key = `toolkit:todo-draft:${userId}:new`;
  const [recovery] = useState(() => {
    try {
      const value = JSON.parse(window.sessionStorage.getItem(key) ?? "null");
      if (value?.version === 1 && validDraft(value.draft) && isDateKey(value.baselineDate)) {
        return { draft: value.draft, baselineDate: value.baselineDate as string, restored: true };
      }
    } catch { /* Invalid or unavailable storage must not prevent adding tasks. */ }
    return { draft: emptyDraft(date), baselineDate: date, restored: false };
  });
  const [draft, setDraft] = useState<TodoDraft>(recovery.draft);
  const [baselineDate, setBaselineDate] = useState(recovery.baselineDate);
  const [restored, setRestored] = useState(recovery.restored);
  const [storageFailed, setStorageFailed] = useState(false);
  const [clearFailed, setClearFailed] = useState(false);
  const dirty = Boolean(draft.text || draft.scheduledTime || draft.priority !== 2 || draft.repeat !== "none" || draft.dueDate !== baselineDate);

  useEffect(() => {
    if (!dirty && date !== baselineDate) {
      setBaselineDate(date);
      setDraft((previous) => ({ ...previous, dueDate: date }));
    }
  }, [date, baselineDate, dirty]);

  useEffect(() => {
    try {
      if (dirty) window.sessionStorage.setItem(key, JSON.stringify({ version: 1, baselineDate, draft }));
      else window.sessionStorage.removeItem(key);
      setStorageFailed(false);
    } catch { setStorageFailed(true); }
  }, [draft, baselineDate, dirty, key]);

  const change = <K extends keyof TodoDraft>(field: K, value: TodoDraft[K]) => {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setClearFailed(false);
  };
  const reset = () => {
    setDraft(emptyDraft(date));
    setBaselineDate(date);
    setRestored(false);
    setClearFailed(false);
  };
  const clear = () => {
    try { window.sessionStorage.removeItem(key); }
    catch { setClearFailed(true); return false; }
    reset();
    return true;
  };
  const markSaved = () => {
    // Even if storage cleanup is unavailable, the same UUID makes a recovered
    // retry idempotent. A storage failure cannot undo a successful server save.
    try { window.sessionStorage.removeItem(key); } catch { /* Database result is authoritative. */ }
    reset();
  };
  return { draft, dirty, restored, storageFailed, clearFailed, change, clear, markSaved };
}
