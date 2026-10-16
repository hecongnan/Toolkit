"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { noteError, type TaskNote } from "@/lib/notes";
import { useNotes } from "./NotesProvider";

export function useNoteList(query: string, taskId: string | null, page: number) {
  const userId = useAuth().user?.id;
  const { revision } = useNotes();
  const key = JSON.stringify([userId, query, taskId, page]);
  const [result, setResult] = useState<{ key: string; notes: TaskNote[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState<{ key: string; message: string } | null>(null);
  const request = useRef({ version: 0 });
  const load = useCallback(async () => {
    if (!userId) return;
    const version = ++request.current.version;
    setLoading(true); setError(null);
    try {
      const { data, error: failure } = await createClient().rpc("note_list", { p_query: query, p_task_id: taskId, p_offset: page * 50, p_limit: 50 });
      if (version !== request.current.version) return;
      if (failure) throw failure;
      if (!data || !Array.isArray(data.notes) || !Number.isSafeInteger(data.total) || data.total < 0 || data.notes.some((n: TaskNote) => typeof n.id !== "string" || typeof n.title !== "string" || typeof n.body !== "string")) throw new Error("未收到有效的笔记列表，请重试。");
      setResult({ key, notes: data.notes, total: data.total });
    } catch (failure) { if (version === request.current.version) setError({ key, message: noteError(failure) }); }
    finally { if (version === request.current.version) setLoading(false); }
  }, [userId, query, taskId, page, key]);
  useEffect(() => { const sequence = request.current; void load(); return () => { sequence.version++; }; }, [load, revision]);
  return { notes: result?.key === key ? result.notes : [], total: result?.key === key ? result.total : 0, hasData: result?.key === key, loading, error: error?.key === key ? error.message : null, load };
}
