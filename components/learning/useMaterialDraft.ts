"use client";

import { useEffect, useRef, useState } from "react";
import { uid } from "@/lib/storage";
import type { Material, MaterialStatus } from "@/lib/types";

export interface MaterialDraft {
  id: string;
  title: string;
  url: string;
  category: string;
  tagsText: string;
  status: MaterialStatus;
  priority: 1 | 2 | 3;
  notes: string;
}

function initialDraft(initial: Material | null): MaterialDraft {
  return { id: initial?.id ?? uid(), title: initial?.title ?? "", url: initial?.url ?? "",
    category: initial?.category ?? "", tagsText: initial?.tags.join(", ") ?? "",
    status: initial?.status ?? "todo", priority: initial?.priority ?? 2, notes: initial?.notes ?? "" };
}

function validDraft(value: unknown): value is MaterialDraft {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(item.id) &&
    ["title", "url", "category", "tagsText", "notes"].every((key) => typeof item[key] === "string") &&
    ["todo", "doing", "done"].includes(String(item.status)) && [1, 2, 3].includes(Number(item.priority)) && typeof item.priority === "number";
}

// Drafts are tab-local, account-scoped, and never treated as database records.
export function useMaterialDraft(userId: string, initial: Material | null, open: boolean) {
  const key = `toolkit:material-draft:${userId}:${initial?.id ?? "new"}`;
  const [base] = useState(() => initialDraft(initial));
  const [recovery] = useState(() => {
    try {
      const stored = JSON.parse(window.sessionStorage.getItem(key) ?? "null");
      if (validDraft(stored) && (!initial || stored.id === initial.id)) return { draft: stored, restored: true, unavailable: false };
      return { draft: base, restored: false, unavailable: false };
    } catch { return { draft: base, restored: false, unavailable: true }; }
  });
  const [draft, setDraft] = useState(recovery.draft);
  const [restored, setRestored] = useState(recovery.restored);
  const [storageFailed, setStorageFailed] = useState(recovery.unavailable);
  const savedRef = useRef(false);
  const dirty = ["title", "url", "category", "tagsText", "status", "priority", "notes"]
    .some((key) => draft[key as keyof MaterialDraft] !== base[key as keyof MaterialDraft]);

  useEffect(() => {
    if (savedRef.current) return;
    try {
      if (dirty) window.sessionStorage.setItem(key, JSON.stringify(draft));
      else window.sessionStorage.removeItem(key);
      setStorageFailed(false);
    } catch { setStorageFailed(true); }
  }, [draft, dirty, key]);

  useEffect(() => {
    if (!dirty || !open) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (savedRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, open]);

  const clear = () => {
    try { window.sessionStorage.removeItem(key); } catch { /* the warning remains visible */ }
    setDraft(base);
    setRestored(false);
  };
  const markSaved = () => {
    savedRef.current = true;
    try { window.sessionStorage.removeItem(key); } catch { /* saving to the database still succeeded */ }
  };
  const change = <K extends keyof MaterialDraft>(field: K, value: MaterialDraft[K]) => {
    setDraft((previous) => ({ ...previous, [field]: value }));
  };
  return { draft, change, dirty, restored, storageFailed, clear, markSaved };
}
