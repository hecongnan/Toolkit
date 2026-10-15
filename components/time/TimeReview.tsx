"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { RangeFeedback } from "@/components/workspace/RangeFeedback";
import { TimePie } from "./TimePie";
import { useTimeRecords } from "./useTimeRecords";
import { useTimeTracker } from "./TimeProvider";
import { TimeHistory } from "./TimeHistory";

export function TimeReview({start,end}:{start:string;end:string}){
  const data=useTimeRecords(start,end);
  const {active}=useTimeTracker();
  const [expanded,setExpanded]=useState(false);
  return <Card className="mb-5" role="region" aria-label="实际时间回顾">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold">时间花在哪里</h2><p className="mt-2 text-xs leading-6 text-[color:var(--text-muted)]">统计此时间范围内已保存的实际用时，与任务完成率分开计算。</p></div><Link href="/time" className="quiet-link inline-flex min-h-11 items-center rounded-lg text-sm focus-ring">记录时间 →</Link></div>
    <RangeFeedback {...data} onRetry={()=>void data.load()}/>
    {data.hasData&&<><TimePie records={data.records} from={data.range.from} to={data.range.to}/><p className="mt-5 text-xs leading-6 text-[color:var(--text-muted)]">暂停不计时；跨天只计算落在当前范围的时段。正在进行或暂停的计时，结束保存后才纳入统计。分类占比为四舍五入结果。</p>
      {active&&<p className="mt-2 text-xs status-warning">有一条未结束的计时，尚未计入饼图。</p>}
      <div className="mt-3 flex flex-wrap gap-2"><Button className="max-w-full min-w-0 whitespace-normal" variant="ghost" size="sm" onClick={()=>setExpanded(!expanded)} aria-expanded={expanded}>{expanded?"收起时间明细":"查看时间明细"}</Button><Button className="max-w-full min-w-0 whitespace-normal" variant="ghost" size="sm" disabled={data.loading} onClick={()=>void data.load()}>刷新时间统计</Button></div>
      {expanded&&<TimeHistory records={data.records} from={data.range.from} to={data.range.to}/>}
    </>}
  </Card>;
}
