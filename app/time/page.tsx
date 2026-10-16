"use client";

import Link from "next/link";
import { Suspense,useCallback,useEffect,useRef,useState } from "react";
import { useSearchParams } from "next/navigation";
import { Pause,Play,Plus,RefreshCw,Square } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { TimeRecordEditor } from "@/components/time/TimeRecordEditor";
import { TimeHistory } from "@/components/time/TimeHistory";
import { useTimeTracker } from "@/components/time/TimeProvider";
import { useTimeRecords } from "@/components/time/useTimeRecords";
import { RangeFeedback } from "@/components/workspace/RangeFeedback";
import { useToday } from "@/components/workspace/useTaskRange";
import { createClient } from "@/lib/supabase/client";
import { toTodo,type TodoRow } from "@/lib/supabase/mappers";
import { uid } from "@/lib/storage";
import { shiftDate } from "@/lib/todo-dates";
import { taskHref } from "@/lib/task-workspace";
import { TIME_CATEGORIES,timeError,timerLabel,type TimeCategory,type TimeRecord } from "@/lib/time-tracking";
import type { Todo } from "@/lib/types";

export default function TimePage(){return <Suspense fallback={null}><TimeWorkspace/></Suspense>;}
function TimeWorkspace(){
  const {user}=useAuth(),tracker=useTimeTracker(),params=useSearchParams();
  const today=useToday(),requested=params.get("task");
  const [duration,setDuration]=useState(7);
  const history=useTimeRecords(shiftDate(today,1-duration),today);
  const [tasks,setTasks]=useState<Todo[]>([]),[taskError,setTaskError]=useState<string|null>(null),[taskLoading,setTaskLoading]=useState(true);
  const [title,setTitle]=useState(""),[category,setCategory]=useState<TimeCategory>("work"),[task,setTask]=useState("");
  const [startId,setStartId]=useState(uid);
  const [editor,setEditor]=useState<{initial:TimeRecord|null}|null>(null),[deleting,setDeleting]=useState<TimeRecord|null>(null),[discard,setDiscard]=useState(false);
  const [deleteError,setDeleteError]=useState<string|null>(null),[deletingBusy,setDeletingBusy]=useState(false),[notice,setNotice]=useState("");
  const deleteLock=useRef(false),historyHeading=useRef<HTMLHeadingElement>(null);
  const taskRead=useRef({version:0});
  const preselectedTask=useRef<string|null>(null);
  const accountId=user?.id;
  const loadTasks=useCallback(async()=>{
    if(!accountId)return;
    const version=++taskRead.current.version;
    setTaskLoading(true);setTaskError(null);
    try{
      const client=createClient();
      const {data,error}=await client.from("todos").select("*").eq("user_id",accountId).eq("due_date",today).eq("skipped",false).order("position");
      if(error)throw error;
      const options=((data??[]) as TodoRow[]).map(toTodo);
      if(requested){
        if(!/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(requested))throw new Error("关联任务地址无效，可以选择独立记录。");
        let selected=options.find((item)=>item.id===requested);
        if(!selected){const response=await client.from("todos").select("*").eq("id",requested).eq("user_id",accountId).single();if(response.error)throw response.error;selected=toTodo(response.data as TodoRow);options.unshift(selected);}
        if(version!==taskRead.current.version)return;
        const changed=preselectedTask.current!==requested;
        preselectedTask.current=requested;
        setTask(selected.id);setTitle((previous)=>changed?selected!.text:previous||selected!.text);
      }
      if(version===taskRead.current.version)setTasks(options);
    }catch(error){if(version===taskRead.current.version)setTaskError(timeError(error));}finally{if(version===taskRead.current.version)setTaskLoading(false);}
  },[accountId,requested,today]);
  // The route is account-keyed by AppShell. A task link preselects once; ordinary
  // input is not reinitialized by subsequent timer syncs.
  useEffect(()=>{const sequence=taskRead.current;void loadTasks();return()=>{sequence.version++;};},[loadTasks]);
  const selected=tasks.find((item)=>item.id===task);
  const active=tracker.active;
  useEffect(()=>{
    if(active)setStartId((previous)=>previous===active.id?uid():previous);
  },[active]);
  const control=async(action:"pause"|"resume"|"finish"|"discard")=>{
    if(await tracker.control(action)){
      if(action==="finish")setNotice("用时已保存，任务完成状态保持原样。");
      if(action==="discard"){setDiscard(false);setNotice("未结束的计时已放弃。");}
    }
  };
  const remove=async()=>{
    if(!deleting||deleteLock.current)return;deleteLock.current=true;setDeletingBusy(true);setDeleteError(null);
    try{const {data,error}=await createClient().rpc("time_delete",{p_id:deleting.id,p_version:deleting.version});if(error)throw error;if(data!==deleting.id)throw new Error("未收到删除确认，请重试。");setDeleting(null);setNotice("时间记录已删除，回顾统计会随之更新。");tracker.refreshSaved();window.requestAnimationFrame(()=>historyHeading.current?.focus({preventScroll:true}));}
    catch(error){setDeleteError(timeError(error));}finally{deleteLock.current=false;setDeletingBusy(false);}
  };
  return <>
    <PageHeader eyebrow="执行 · 看见实际投入" title="时间记录" description="为正在做的事计时，也可以事后补记。可关联待办，计时结束后不会自动完成任务。"
      action={<Button variant="secondary" disabled={!tracker.ready||tracker.busy} onClick={()=>setEditor({initial:null})}><Plus size={16}/>补记时间</Button>}/>
    {notice&&<p role="status" className="mb-4 rounded-xl bg-[var(--accent-soft)] p-4 text-sm leading-6">{notice}</p>}
    <Card className="mb-6 min-w-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">{active?"当前计时":"开始记录一段投入"}</h2><Button className="max-w-full min-w-0 whitespace-normal" size="sm" variant="ghost" disabled={tracker.loading||tracker.busy} onClick={()=>void tracker.load()}><RefreshCw size={14}/>同步计时状态</Button></div>
      {tracker.error&&<p role="alert" className="mb-4 break-words text-sm leading-6 status-error">{tracker.error}</p>}
      {tracker.loading&&!active&&<p className="py-4 text-sm text-[color:var(--text-muted)]">正在读取计时状态…</p>}
      {active?<div className="space-y-4"><div><p className="break-words text-lg font-medium">{active.title}</p><p className="mt-2 text-sm text-[color:var(--text-muted)]">{TIME_CATEGORIES.find((item)=>item.value===active.category)?.label} · {active.running_since?"正在计时":"已暂停"}{active.task_title?" · "+active.task_title:""}</p></div>
        <p aria-label="本次累计用时" className="break-all font-mono text-[clamp(1rem,7vw,3rem)] font-semibold tabular-nums">{timerLabel(tracker.elapsed)}</p>
        <p className="text-xs leading-6 text-[color:var(--text-muted)]">切换页面或刷新后仍会继续。暂停不计时；请在活动结束时结束保存。</p>
        <div className="grid gap-2" style={{gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,12rem),1fr))"}}><Button variant="primary" disabled={tracker.busy||!tracker.ready||tracker.loading} onClick={()=>void control(active.running_since?"pause":"resume")}>{active.running_since?<Pause size={16}/>:<Play size={16}/>} {active.running_since?"暂停计时":"继续计时"}</Button><Button disabled={tracker.busy||!tracker.ready||tracker.loading} onClick={()=>void control("finish")}><Square size={15}/>结束并保存</Button><Button variant="ghost" disabled={tracker.busy||!tracker.ready} onClick={()=>setDiscard(true)}>放弃计时</Button></div>
      </div>:<form className="space-y-4" onSubmit={async(event)=>{event.preventDefault();if(!title.trim()||tracker.busy||taskLoading)return;if(await tracker.start(startId,title.trim(),category,task||null)){setStartId(uid());setNotice("");}}}>
        <fieldset disabled={!tracker.ready||tracker.busy||tracker.loading} className="min-w-0 space-y-4">
          <label className="block"><span className="mb-2 block text-sm font-medium">正在做什么</span><Input required maxLength={200} value={title} onChange={(event)=>setTitle(event.target.value)} placeholder="例如：阅读技术文档"/></label>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2"><label className="block min-w-0"><span className="mb-2 block text-sm font-medium">时间分类</span><select aria-label="时间分类" value={category} onChange={(event)=>setCategory(event.target.value as TimeCategory)} className="field-control min-h-11 w-full min-w-0 px-3 text-sm focus-ring">{TIME_CATEGORIES.map((item)=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="block min-w-0"><span className="mb-2 block text-sm font-medium">关联任务</span><select aria-label="关联任务" value={task} disabled={taskLoading} onChange={(event)=>{setTask(event.target.value);const next=tasks.find((item)=>item.id===event.target.value);if(next)setTitle(next.text);}} className="field-control min-h-11 w-full min-w-0 px-3 text-sm focus-ring"><option value="">独立记录，不关联任务</option>{tasks.map((item)=><option key={item.id} value={item.id}>{item.text}</option>)}</select></label></div>
          {taskError&&<div className="text-xs leading-6"><p className="status-warning">任务暂不可用：{taskError} 可重试加载，或独立记录时间。</p><Button type="button" size="sm" variant="ghost" onClick={()=>void loadTasks()}>重试任务列表</Button></div>}
          {selected&&<Link href={taskHref(selected)} className="quiet-link inline-flex min-h-11 items-center rounded-lg text-xs focus-ring">查看关联的每日待办 →</Link>}
          <div><Button type="submit" variant="primary" disabled={!title.trim()||tracker.busy||taskLoading}><Play size={16}/>开始计时</Button></div>
        </fieldset>
      </form>}
    </Card>
    <section aria-label="已保存的时间记录"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 ref={historyHeading} tabIndex={-1} className="text-lg font-semibold outline-none">已保存的记录</h2><div className="flex flex-wrap gap-2"><select aria-label="时间记录范围" value={duration} onChange={(event)=>setDuration(Number(event.target.value))} className="field-control min-h-11 px-3 text-sm focus-ring"><option value={7}>近 7 天</option><option value={30}>近 30 天</option></select><Button variant="ghost" disabled={history.loading} onClick={()=>void history.load()}>刷新记录</Button></div></div>
      <RangeFeedback {...history} onRetry={()=>void history.load()}/>
      {history.hasData&&<Card><TimeHistory records={history.records} from={history.range.from} to={history.range.to} onEdit={(initial)=>setEditor({initial})} onDelete={(record)=>{setDeleting(record);setDeleteError(null);}}/></Card>}
      <Link href="/review" className="quiet-link mt-3 inline-flex min-h-11 items-center rounded-lg text-sm focus-ring">去行动回顾查看时间占比 →</Link>
    </section>
    {editor&&<TimeRecordEditor initial={editor.initial} tasks={tasks} defaultTask={selected} onClose={()=>setEditor(null)} onSaved={()=>{setNotice("时间记录已保存，可在行动回顾中查看。");}}/>}
    <Modal open={discard} onClose={()=>{if(!tracker.busy)setDiscard(false);}} title="放弃当前计时"><p className="text-sm leading-6">这次计时及其暂停前的时段都会移除，不会进入回顾。需要保留用时，请选择结束并保存。</p>{tracker.error&&<p role="alert" className="mt-3 text-sm status-error">{tracker.error}</p>}<div className="mt-5 flex flex-wrap gap-2"><Button disabled={tracker.busy} onClick={()=>setDiscard(false)}>保留计时</Button><Button variant="danger" disabled={tracker.busy||!tracker.ready} onClick={()=>void control("discard")}>确认放弃计时</Button></div></Modal>
    <Modal open={Boolean(deleting)} onClose={()=>{if(!deleteLock.current)setDeleting(null);}} title="删除时间记录"><p className="break-words font-medium">{deleting?.title}</p><p className="mt-3 text-sm leading-6">删除后无法恢复，相应用时会从回顾统计中移除；关联待办仍会保留。</p>{deleteError&&<p role="alert" className="mt-3 text-sm status-error">{deleteError}</p>}<div className="mt-5 flex flex-wrap gap-2"><Button disabled={deletingBusy} onClick={()=>setDeleting(null)}>保留记录</Button><Button variant="danger" disabled={deletingBusy} onClick={()=>void remove()}>{deletingBusy?"正在删除…":"确认删除记录"}</Button></div></Modal>
  </>;
}
