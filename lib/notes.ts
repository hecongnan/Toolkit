export interface TaskNote {
  id: string; title: string; body: string; task_id: string | null;
  task_title: string | null; task_date: string | null;
  version: number; created_at: string; updated_at: string;
}
export interface NoteTask { id: string; text: string; dueDate: string }
export const noteDraftKey = (userId: string) => `toolkit:note-draft:${userId}`;
export const validNoteId = (id: string) => /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id);
export const noteQuery = (value: string) => value.trim().replace(/\s+/g, " ").slice(0, 200);
export function noteTitle(title: string, body: string) {
  return title.trim() || body.trim().split("\n")[0].slice(0, 80);
}
export function noteError(error: unknown) {
  const value = error as { code?: string; message?: string } | null;
  if (["PGRST202", "PGRST205", "42P01", "42883"].includes(value?.code ?? "")) return "笔记功能尚未就绪，请联系站点管理员完成笔记数据库更新。";
  return value?.message || "笔记未能保存，请检查网络后重试，当前内容已保留。";
}
export interface NoteDraft {
  userId: string; id: string; title: string; body: string;
  task: NoteTask | null; initial: TaskNote | null;
}
export function parseNoteDraft(raw: string, userId: string): NoteDraft | null {
  try {
    const d = JSON.parse(raw) as NoteDraft;
    if (!d || d.userId !== userId || !validNoteId(d.id) || typeof d.title !== "string" || d.title.length > 120 || typeof d.body !== "string" || d.body.length > 20000) return null;
    if (d.task !== null && (!d.task || !validNoteId(d.task.id) || typeof d.task.text !== "string" || d.task.text.length > 200 || !/^\d{4}-\d{2}-\d{2}$/.test(d.task.dueDate))) return null;
    const n = d.initial;
    if (n !== null && (!n || n.id !== d.id || !Number.isInteger(n.version) || n.version < 1 || typeof n.title !== "string" || n.title.length > 120 || typeof n.body !== "string" || n.body.length > 20000 || (n.task_id !== null && !validNoteId(n.task_id)) || (n.task_title !== null && typeof n.task_title !== "string") || (n.task_date !== null && typeof n.task_date !== "string") || typeof n.updated_at !== "string" || typeof n.created_at !== "string")) return null;
    return d;
  } catch { return null; }
}
