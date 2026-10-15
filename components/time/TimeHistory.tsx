import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { durationLabel,recordedSeconds,TIME_CATEGORIES,type TimeRecord } from "@/lib/time-tracking";

export function TimeHistory({records,from,to,onEdit,onDelete}:{records:TimeRecord[];from:string;to:string;onEdit?:(record:TimeRecord)=>void;onDelete?:(record:TimeRecord)=>void}){
  const rows=records.filter((record)=>recordedSeconds(record,Date.parse(from),Date.parse(to))>0);
  return rows.length?<ul className="divide-y divide-[color:var(--border-subtle)]">{rows.map((record)=><li key={record.id} className="flex flex-wrap items-center justify-between gap-3 py-4" data-time-record={record.id}>
    <div className="min-w-0 w-full sm:flex-1"><p className="break-words text-sm font-medium">{record.title}</p><p className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">{TIME_CATEGORIES.find((item)=>item.value===record.category)?.label} · {new Date(record.started_at).toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})} · 范围内 {durationLabel(recordedSeconds(record,Date.parse(from),Date.parse(to)))}</p>
      {record.task_id&&<Link href={`/time?task=${record.task_id}`} className="quiet-link mt-1 inline-flex min-h-11 max-w-full items-center rounded-lg text-xs focus-ring"><span className="break-words">为此任务继续记录：{record.task_title}</span></Link>}
      {!record.task_id&&record.task_title&&<p className="mt-1 text-xs text-[color:var(--text-muted)]">原关联任务：{record.task_title}（已移除）</p>}
    </div>
    {onEdit&&<Button size="sm" variant="ghost" onClick={()=>onEdit(record)}>编辑记录</Button>}{onDelete&&<Button size="sm" variant="ghost" onClick={()=>onDelete(record)}>删除记录</Button>}
  </li>)}</ul>:<p className="py-6 text-sm text-[color:var(--text-muted)]">此范围内还没有已保存的时间记录。</p>;
}
