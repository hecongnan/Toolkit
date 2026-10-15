import { durationLabel,timeDistribution,type TimeRecord } from "@/lib/time-tracking";

export function TimePie({records,from,to}:{records:TimeRecord[];from:string;to:string}){
  const data=timeDistribution(records,from,to);
  let accumulated=0;
  const stops=data.items.filter((item)=>item.seconds>0).map((item)=>{
    const start=accumulated;accumulated+=item.percent;
    return `${item.color} ${start}% ${accumulated}%`;
  });
  return <figure aria-label="时间分类占比" className="grid min-w-0 grid-cols-1 items-center gap-6 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
    <div className="mx-auto aspect-square w-52 max-w-full rounded-full border border-[color:var(--border-subtle)]" role="img"
      aria-label={data.total?`已记录 ${durationLabel(data.total)}。`+data.items.filter((item)=>item.seconds>0).map((item)=>`${item.label} ${item.percent.toFixed(1)}%`).join("，"):"暂无已保存的时间记录，暂不计算占比。"}
      style={{background:data.total?`conic-gradient(${stops.join(",")})`:"var(--control-bg)"}} />
    <figcaption className="min-w-0"><p className="text-xs text-[color:var(--text-muted)]">已记录实际用时</p><p className="mt-2 break-words text-2xl font-semibold tabular-nums">{durationLabel(data.total)}</p>
      {data.total ? <ul className="mt-4 space-y-3">{data.items.filter((item)=>item.seconds>0).map((item)=><li key={item.value} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="inline-flex items-center gap-2"><span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{background:item.color}}/>{item.label}</span><span className="tabular-nums text-[color:var(--text-secondary)]">{durationLabel(item.seconds)} · {item.percent.toFixed(1)}%</span></li>)}</ul>
        : <p className="mt-3 text-sm leading-6 text-[color:var(--text-muted)]">还没有已保存的用时。记录一次活动后，这里会显示各类时间的占比。</p>}
    </figcaption>
  </figure>;
}
