"use client";

import { useEffect,useRef,useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase/client";
import { uid } from "@/lib/storage";
import { durationLabel,localDateTime,recordedSeconds,TIME_CATEGORIES,timeError,type TimeCategory,type TimeRecord } from "@/lib/time-tracking";
import type { Todo } from "@/lib/types";

export function TimeRecordEditor({initial,tasks,defaultTask,onClose,onSaved}:{initial:TimeRecord|null;tasks:Todo[];defaultTask?:Todo;onClose:()=>void;onSaved:()=>void}){
  const [id]=useState(()=>initial?.id??uid());
  const [base]=useState(()=>({title:initial?.title??"",category:initial?.category??"work" as TimeCategory,task:initial?.task_id??defaultTask?.id??"",
    start:localDateTime(initial?.started_at??new Date(Date.now()-1800_000).toISOString()),end:localDateTime(initial?.ended_at??new Date().toISOString())}));
  const [title,setTitle]=useState(base.title),[category,setCategory]=useState<TimeCategory>(base.category),[task,setTask]=useState(base.task);
  const [start,setStart]=useState(base.start),[end,setEnd]=useState(base.end);
  const [adjust,setAdjust]=useState(!initial||initial.source==="manual");
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[closing,setClosing]=useState(false);
  const lock=useRef(false),keep=useRef<HTMLButtonElement>(null);
  const dirty=title!==base.title||category!==base.category||task!==base.task||start!==base.start||end!==base.end||Boolean(initial?.source==="timer"&&adjust);
  const startMs=new Date(start).getTime(),endMs=new Date(end).getTime();
  const invalid=adjust&&(!Number.isFinite(startMs)||!Number.isFinite(endMs)||endMs<=startMs||endMs>Date.now()||endMs-startMs>86400_000);
  useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[dirty]);
  const close=()=>{if(lock.current)return;if(!dirty){onClose();return;}setClosing(true);window.requestAnimationFrame(()=>keep.current?.focus());};
  const save=async(event:React.FormEvent)=>{
    event.preventDefault();if(lock.current||!title.trim()||invalid)return;
    lock.current=true;setBusy(true);setError(null);
    try{
      const {data,error:failure}=await createClient().rpc("time_save_manual",{p_id:id,p_title:title.trim(),p_category:category,p_task_id:task||null,
        p_start:adjust?new Date(startMs).toISOString():null,p_end:adjust?new Date(endMs).toISOString():null,p_version:initial?.version??null}).single();
      if(failure)throw failure;
      const saved=data as TimeRecord|null;
      if(!saved||saved.id!==id)throw new Error("未收到保存确认，当前输入已保留，请重试。");
      onSaved();onClose();
    }catch(failure){setError(timeError(failure));}finally{lock.current=false;setBusy(false);}
  };
  return <Modal open onClose={close} title={initial?"编辑时间记录":"补记时间"} className="task-dialog">
    {closing?<section role="alert" aria-label="未保存的时间记录" className="space-y-4"><p className="text-sm leading-6">还有未保存的内容，放弃后不会写入时间记录。</p><div className="flex flex-wrap gap-2"><Button ref={keep} onClick={()=>setClosing(false)}>继续编辑</Button><Button variant="danger" onClick={onClose}>放弃修改并关闭</Button></div></section>:<form onSubmit={save} className="space-y-4"><fieldset disabled={busy} className="min-w-0 space-y-4">
      <label className="block"><span className="mb-2 block text-sm font-medium">记录内容</span><Input autoFocus required maxLength={200} value={title} onChange={(event)=>setTitle(event.target.value)} placeholder="例如：阅读、写作、处理生活事务"/></label>
      <label className="block"><span className="mb-2 block text-sm font-medium">时间分类</span><select aria-label="时间分类" value={category} onChange={(event)=>setCategory(event.target.value as TimeCategory)} className="field-control min-h-11 w-full min-w-0 px-3 text-sm focus-ring">{TIME_CATEGORIES.map((item)=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label className="block"><span className="mb-2 block text-sm font-medium">关联任务</span><select aria-label="关联任务" value={task} onChange={(event)=>setTask(event.target.value)} className="field-control min-h-11 w-full min-w-0 px-3 text-sm focus-ring"><option value="">独立记录，不关联任务</option>{task&&!tasks.some((item)=>item.id===task)&&<option value={task}>{initial?.task_title??defaultTask?.text??"原关联任务"}</option>}{tasks.map((item)=><option key={item.id} value={item.id}>{item.text}</option>)}</select></label>
      {initial?.source==="timer"&&<div className="rounded-xl bg-[var(--control-bg)] p-3"><p className="text-sm">原计时用时：{durationLabel(recordedSeconds(initial))}</p><label className="mt-2 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={adjust} onChange={(event)=>setAdjust(event.target.checked)}/>调整起止时间</label>{adjust&&<p className="text-xs leading-6 status-warning">保存后将按连续时段重新计算用时，原来的暂停区间将不再扣除。</p>}</div>}
      {adjust&&<div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <label className="block min-w-0"><span className="mb-2 block text-sm font-medium">开始日期</span><Input type="date" required value={start.split("T")[0]} onChange={(event)=>setStart(event.target.value+"T"+(start.split("T")[1]??""))} className="min-w-0 max-sm:px-2"/></label>
        <label className="block min-w-0"><span className="mb-2 block text-sm font-medium">开始时间</span><Input type="time" required value={start.split("T")[1]??""} onChange={(event)=>setStart(start.split("T")[0]+"T"+event.target.value)} className="min-w-0"/></label>
        <label className="block min-w-0"><span className="mb-2 block text-sm font-medium">结束日期</span><Input type="date" required value={end.split("T")[0]} onChange={(event)=>setEnd(event.target.value+"T"+(end.split("T")[1]??""))} className="min-w-0 max-sm:px-2"/></label>
        <label className="block min-w-0"><span className="mb-2 block text-sm font-medium">结束时间</span><Input type="time" required value={end.split("T")[1]??""} onChange={(event)=>setEnd(end.split("T")[0]+"T"+event.target.value)} className="min-w-0"/></label>
      </div>}
      {adjust&&<p className={"text-xs leading-6 "+(invalid?"status-warning":"text-[color:var(--text-muted)]")}>{invalid?"结束时间需晚于开始，不能在未来，单次补记不超过24小时。":"本次记录 "+durationLabel((endMs-startMs)/1000)+"；时间按当前设备时区保存。"}</p>}
      {error&&<p role="alert" className="text-sm leading-6 status-error">{error}</p>}
      <div className="sticky bottom-0 grid gap-2 border-t border-[color:var(--border-subtle)] bg-[var(--surface)] py-3" style={{gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,10rem),1fr))"}}><Button type="button" variant="ghost" onClick={close}>取消</Button><Button type="submit" variant="primary" disabled={!title.trim()||invalid||busy||(Boolean(initial)&&!dirty)}>{busy?"正在保存…":"保存记录"}</Button></div>
    </fieldset></form>}
  </Modal>;
}
