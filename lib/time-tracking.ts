export const TIME_CATEGORIES = [
  { value: "work", label: "工作", color: "#2563eb" },
  { value: "study", label: "学习", color: "#7c3aed" },
  { value: "life", label: "生活", color: "#0f766e" },
  { value: "other", label: "其他", color: "#b45309" },
] as const;
export type TimeCategory = typeof TIME_CATEGORIES[number]["value"];
export interface TimeSegment { start: string; end: string; }
export interface TimeRecord {
  id: string; title: string; category: TimeCategory; task_id: string | null; task_title: string | null;
  source: "timer" | "manual"; started_at: string; ended_at: string | null; segments: TimeSegment[];
  running_since: string | null; finished_at: string | null; version: number;
}
export interface TimeSnapshot { record: TimeRecord | null; server_now: string; }

export function localTimeRange(start: string, end: string) {
  const parse = (date: string, offset = 0) => {
    const [y,m,d] = date.split("-").map(Number);
    return new Date(y,m-1,d+offset).toISOString();
  };
  return { from: parse(start), to: parse(end,1) };
}
export function recordedSeconds(record: TimeRecord, from = -Infinity, to = Infinity): number {
  return record.segments.reduce((total, segment) => {
    const start = Date.parse(segment.start), end = Date.parse(segment.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return total;
    return total + Math.max(0, Math.min(end,to)-Math.max(start,from))/1000;
  },0);
}
export function timeDistribution(records: TimeRecord[], from: string, to: string) {
  const start=Date.parse(from), end=Date.parse(to);
  const values=TIME_CATEGORIES.map((category) => ({ ...category, seconds: records.filter((record) => record.finished_at && record.category===category.value).reduce((sum,record)=>sum+recordedSeconds(record,start,end),0) }));
  const total=values.reduce((sum,item)=>sum+item.seconds,0);
  return { total, items: values.map((item)=>({ ...item, percent: total ? item.seconds/total*100 : 0 })) };
}
export function taskTimeTotals(records: TimeRecord[]) {
  const totals = new Map<string, { seconds: number; category: TimeCategory; latest: number }>();
  for (const record of records) {
    if (!record.finished_at || !record.task_id) continue;
    const previous = totals.get(record.task_id);
    const latest = Date.parse(record.started_at);
    totals.set(record.task_id, {
      seconds: (previous?.seconds ?? 0) + recordedSeconds(record),
      category: previous && previous.latest > latest ? previous.category : record.category,
      latest: Math.max(previous?.latest ?? -Infinity, latest),
    });
  }
  return totals;
}
export function durationLabel(seconds: number): string {
  if(seconds>0&&seconds<1)return "不足1秒";
  const value=Math.max(0,Math.floor(seconds));
  const hours=Math.floor(value/3600), minutes=Math.floor(value%3600/60);
  return hours ? `${hours}小时 ${minutes}分` : minutes ? `${minutes}分 ${value%60}秒` : `${value}秒`;
}
export function timerLabel(seconds: number): string {
  const value=Math.max(0,Math.floor(seconds));
  return [Math.floor(value/3600),Math.floor(value%3600/60),value%60].map((n)=>String(n).padStart(2,"0")).join(":");
}
export function timeError(error: unknown): string {
  const value=error as {code?:string;message?:string} | null;
  if (["PGRST202","PGRST205","42P01","42883"].includes(value?.code??"")) return "时间记录功能尚未就绪，请联系站点管理员完成数据库更新。";
  return value?.message || "未能保存，请检查网络后重试。";
}
export function localDateTime(value: string): string {
  const date=new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}T${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}`;
}
