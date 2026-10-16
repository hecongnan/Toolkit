import { createClient } from "@/lib/supabase/client";
import type { TimeRecord } from "@/lib/time-tracking";

interface TimeFilter {
  range?: { from: string; to: string };
  taskIds?: readonly string[];
}

// Fetch by date or batch of tasks, never one request per rendered row. Task
// totals have no date limit: effort may have been recorded over 30 days ago.
export async function readSavedTime(userId: string, filter: TimeFilter, current: () => boolean) {
  const ids = [...new Set(filter.taskIds ?? [])].sort();
  const batches: (string[] | undefined)[] = filter.taskIds
    ? Array.from({ length: Math.ceil(ids.length / 50) }, (_, i) => ids.slice(i * 50, i * 50 + 50))
    : [undefined];
  const records = new Map<string, TimeRecord>();
  for (const batch of batches) {
    let expected: number | null = null;
    const rows = new Map<string, TimeRecord>();
    for (let offset = 0; ; offset += 500) {
      let query = createClient().from("time_records").select("*", { count: "exact" })
        .eq("user_id", userId).not("finished_at", "is", null);
      if (filter.range) query = query.lt("started_at", filter.range.to).gt("ended_at", filter.range.from);
      if (batch) query = query.in("task_id", batch);
      const { data, count, error } = await query.order("started_at", { ascending: false }).order("id").range(offset, offset + 499);
      if (!current()) return null;
      if (error) throw error;
      if (count === null || (expected !== null && count !== expected)) throw new Error("记录在加载期间发生变化，请刷新后查看完整统计。");
      expected = count;
      for (const row of (data ?? []) as TimeRecord[]) rows.set(row.id, row);
      if (offset + (data?.length ?? 0) >= count) break;
      if (!data?.length) throw new Error("时间记录未加载完整，请重试。");
    }
    if (rows.size !== expected) throw new Error("记录在加载期间发生变化，请刷新后查看完整统计。");
    for (const [id, row] of rows) records.set(id, row);
  }
  return [...records.values()];
}
