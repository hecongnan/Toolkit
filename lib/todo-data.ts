import { createClient } from "./supabase/client";
import type { Todo } from "./types";

export async function createTodo(todo: Todo, position = todo.position): Promise<void> {
  const { data, error } = await createClient().rpc("todo_create", {
    p_id: todo.id, p_text: todo.text, p_priority: todo.priority, p_due_date: todo.dueDate,
    p_time: todo.scheduledTime ?? null, p_repeat: todo.repeat, p_position: position,
  }).single();
  if (error) throw error;
  if (!data || typeof data !== "object" || !("id" in data) || data.id !== todo.id) {
    throw new Error("未收到任务创建确认，输入已保留，请重试。");
  }
}
