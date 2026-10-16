"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useNotes } from "@/components/notes/NotesProvider";
import { NoteTaskLink } from "@/components/notes/NoteTaskLink";
import { NoteBody } from "@/components/notes/NoteBody";
import { useNoteList } from "@/components/notes/useNoteList";
import { createClient } from "@/lib/supabase/client";
import { noteError, noteQuery, validNoteId, type NoteTask, type TaskNote } from "@/lib/notes";

export default function NotesPage() { return <Suspense fallback={null}><NotesWorkspace /></Suspense>; }
function NotesWorkspace() {
  const params = useSearchParams(), userId = useAuth().user?.id, notes = useNotes();
  const requested = params.get("task"), taskId = requested && validNoteId(requested) ? requested : null;
  const [task, setTask] = useState<{ id: string; value: NoteTask | null; error: string | null } | null>(null);
  const [search, setSearch] = useState(""), [filter, setFilter] = useState({ query: "", taskId, page: 0 });
  const page = filter.taskId === taskId ? filter.page : 0;
  const data = useNoteList(filter.query, taskId, page);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState<TaskNote | null>(null), [deleteError, setDeleteError] = useState<string | null>(null), [deleteBusy, setDeleteBusy] = useState(false);
  const deleteLock = useRef(false), heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!taskId || !userId) return;
    let current = true;
    void createClient().from("todos").select("id,text,due_date").eq("id", taskId).eq("user_id", userId).single().then(({ data: row, error }) => {
      if (!current) return;
      setTask({ id: taskId, value: row && !error ? { id: row.id, text: row.text, dueDate: row.due_date } : null, error: error ? "关联任务暂不可用，可查看已有笔记或改为独立记录。" : null });
    });
    return () => { current = false; };
  }, [taskId, userId]);
  const contextTask = task?.id === taskId ? task.value : null;
  const remove = async () => {
    if (!deleting || deleteLock.current) return;
    deleteLock.current = true; setDeleteBusy(true); setDeleteError(null);
    try {
      const { data: saved, error } = await createClient().rpc("note_delete", { p_id: deleting.id, p_version: deleting.version });
      if (error) throw error;
      if (saved !== deleting.id) throw new Error("未收到删除确认，请刷新列表核对。");
      setDeleting(null); notes.changed("笔记已删除，关联任务和时间记录仍保留。");
      requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
    } catch (failure) { setDeleteError(noteError(failure)); }
    finally { deleteLock.current = false; setDeleteBusy(false); }
  };
  const searchNotes = () => { setFilter({ query: noteQuery(search), taskId, page: 0 }); setExpanded(new Set()); };
  return <>
    <PageHeader eyebrow="沉淀 · 把行动变成积累" title="笔记" description="记录任务中的收获、问题和知识，也可以独立写下一段想法。不会改变任务完成状态。" action={<Button className="max-w-full min-w-0 whitespace-normal" variant="primary" disabled={Boolean(taskId && !contextTask)} onClick={() => notes.openNote(contextTask ? { task: contextTask } : {})}><Plus size={16} className="shrink-0" />{contextTask ? "为此任务写笔记" : "新建笔记"}</Button>} />
    {requested && !taskId && <p role="alert" className="mb-4 text-sm leading-6 status-warning">任务链接无效，当前显示全部笔记，不会关联错误的任务。</p>}
    {taskId && <Card className="mb-4 min-w-0"><p className="break-words text-sm font-medium">{contextTask ? `任务笔记：${contextTask.text} · ${contextTask.dueDate}` : "此任务的笔记"}</p>{task?.id === taskId && task.error && <p role="status" className="mt-2 text-xs leading-6 status-warning">{task.error}</p>}<div className="mt-2 flex flex-wrap gap-2"><Link href="/notes" className="quiet-link inline-flex min-h-11 items-center rounded-lg text-sm focus-ring">查看全部笔记 →</Link>{contextTask && <NoteTaskLink taskId={contextTask.id} />}</div></Card>}
    <Card className="mb-5 min-w-0 max-sm:!p-4"><form onSubmit={(event) => { event.preventDefault(); searchNotes(); }} className="flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 basis-48"><span className="mb-2 block text-sm font-medium">搜索笔记</span><Input type="search" maxLength={200} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="标题、正文或记录时的任务名" /></label><Button type="submit">搜索</Button>{(search || filter.query) && <Button variant="ghost" onClick={() => { setSearch(""); setFilter({ query: "", taskId, page: 0 }); }}>清除搜索</Button>}<Button variant="ghost" disabled={data.loading} onClick={() => void data.load()}><RefreshCw size={14} />刷新笔记</Button></form><p className="mt-2 text-xs leading-6 text-[color:var(--text-muted)]">搜索已保存笔记；多个关键词以空格分隔，全部匹配。每页最多50篇。</p></Card>
    <section aria-label="已保存的笔记"><h2 ref={heading} tabIndex={-1} className="mb-3 text-base font-semibold outline-none">{data.hasData ? `${data.total} 篇笔记${data.error || data.loading ? " · 上次结果" : ""}` : "已保存的笔记"}</h2>
      {data.loading && !data.hasData && <p className="py-6 text-sm text-[color:var(--text-muted)]">正在读取笔记…</p>}
      {data.error && <div role="alert" className="mb-4 space-y-2 rounded-xl bg-[var(--control-bg)] p-4 text-sm leading-6"><p className="break-words status-warning">{data.error}</p><p className="text-xs">{data.hasData ? "当前显示上次结果，可能不是最新状态。" : "数据未加载完成，不显示虚假的空列表。"}</p><Button disabled={data.loading} onClick={() => void data.load()}>重试加载笔记</Button></div>}
      {data.hasData && <div className="space-y-4">{data.notes.map((note) => <Card key={note.id} data-note-id={note.id} className="min-w-0 max-sm:!p-4">
        <h3 className="break-words text-base font-semibold">{note.title}</h3><p className="mt-2 text-xs leading-6 text-[color:var(--text-muted)]">更新于 {new Date(note.updated_at).toLocaleString("zh-CN")}</p>
        {(note.task_title || note.task_id) && <p className="mt-2 break-words text-xs leading-6 text-[color:var(--text-muted)]">记录时的任务：{note.task_title ?? "关联任务"}{note.task_date ? ` · ${note.task_date}` : ""}{!note.task_id ? "（已移除，笔记保留）" : ""}</p>}
        <NoteBody body={note.body} expanded={expanded.has(note.id)} onToggle={() => setExpanded((value) => { const next = new Set(value); if (next.has(note.id)) next.delete(note.id); else next.add(note.id); return next; })} />
        <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="ghost" onClick={() => notes.openNote({ initial: note })}>编辑笔记</Button><Button size="sm" variant="ghost" onClick={() => { setDeleting(note); setDeleteError(null); }}>删除笔记</Button>{note.task_id && <NoteTaskLink taskId={note.task_id} />}</div>
      </Card>)}{data.notes.length === 0 && <Card><h3 className="text-base font-semibold">{data.total ? "当前页没有笔记" : filter.query ? "没有匹配的笔记" : "还没有笔记"}</h3><p className="mt-3 text-sm leading-6 text-[color:var(--text-muted)]">{filter.query ? "换个关键词或清除搜索试试，原有笔记不会被删除。" : "完成一件事后，留下一点收获。也可以从任意任务的“写笔记”开始。"}</p></Card>}</div>}
      {data.hasData && (data.total > 50 || page > 0) && <div className="mt-4 flex flex-wrap items-center gap-3"><Button disabled={page === 0 || data.loading} onClick={() => setFilter({ query: filter.query, taskId, page: page - 1 })}>上一页</Button><span className="text-sm tabular-nums">第 {page + 1} 页</span><Button disabled={(page + 1) * 50 >= data.total || data.loading} onClick={() => setFilter({ query: filter.query, taskId, page: page + 1 })}>下一页</Button></div>}
    </section>
    <Modal open={Boolean(deleting)} onClose={() => { if (!deleteLock.current) setDeleting(null); }} title="删除笔记"><p className="break-words text-sm font-medium">{deleting?.title}</p><p className="mt-3 text-sm leading-6">删除后无法恢复。关联任务及其时间记录不会被删除。</p>{deleteError && <p role="alert" className="mt-3 text-sm leading-6 status-error">{deleteError}</p>}<div className="mt-5 flex flex-wrap gap-2"><Button disabled={deleteBusy} onClick={() => setDeleting(null)}>保留笔记</Button><Button disabled={deleteBusy} variant="danger" onClick={() => void remove()}>{deleteBusy ? "正在删除…" : "确认删除笔记"}</Button></div></Modal>
  </>;
}
