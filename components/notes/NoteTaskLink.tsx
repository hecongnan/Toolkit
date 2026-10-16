"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { toTodo, type TodoRow } from "@/lib/supabase/mappers";
import { taskHref } from "@/lib/task-workspace";

export function NoteTaskLink({ taskId }: { taskId: string }) {
  const userId = useAuth().user?.id, router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const open = async () => {
    if (lock.current || !userId) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      const { data, error: failure } = await createClient().from("todos").select("*").eq("id", taskId).eq("user_id", userId).single();
      if (failure || !data) throw new Error(failure?.code === "PGRST116" ? "关联任务已移除或不可用，笔记仍会保留。" : "暂时无法读取任务，请重试。笔记内容不受影响。");
      router.push(taskHref(toTodo(data as TodoRow)));
    } catch (failure) { setError((failure as Error).message); }
    finally { lock.current = false; setBusy(false); }
  };
  return <><Button className="max-w-full min-w-0" variant="ghost" size="sm" disabled={busy} onClick={() => void open()}>{busy ? "正在定位任务…" : "返回关联任务"}</Button>{error && <p role="alert" className="break-words text-xs leading-6 status-warning">{error}</p>}</>;
}
