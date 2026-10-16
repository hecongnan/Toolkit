"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Notice } from "@/components/ui/Notice";
import { uid } from "@/lib/storage";
import type { NoteTask, TaskNote } from "@/lib/notes";
import { NoteEditor } from "./NoteEditor";

interface NotesContext {
  revision: number;
  openNote: (options?: { initial?: TaskNote; task?: NoteTask }) => void;
  changed: (message: string) => void;
}
const Context = createContext<NotesContext | null>(null);
export function NotesProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [editor, setEditor] = useState<{ key: string; initial?: TaskNote; task?: NoteTask } | null>(null);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const dismiss = useCallback(() => setMessage(null), []);
  const changed = useCallback((notice: string) => {
    setRevision((value) => value + 1); setMessage(notice);
    try { localStorage.setItem(`toolkit:notes-sync:${userId}`, uid()); } catch { /* Local refresh still works. */ }
  }, [userId]);
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === `toolkit:notes-sync:${userId}`) setRevision((value) => value + 1); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [userId]);
  return <Context.Provider value={{ revision, changed, openNote: (options = {}) => { setMessage(null); setEditor({ key: uid(), ...options }); } }}>
    {children}
    {editor && userId && <NoteEditor key={editor.key} userId={userId} initial={editor.initial ?? null} task={editor.task ?? null} onClose={() => setEditor(null)} onSaved={(warning) => { setEditor(null); changed(warning || "笔记已保存，可在笔记页或关联任务中查看。"); }} />}
    {message && <Notice message={message} onDismiss={dismiss} />}
  </Context.Provider>;
}
export function useNotes() {
  const context = useContext(Context);
  if (!context) throw new Error("NotesProvider is required");
  return context;
}
