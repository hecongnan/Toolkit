"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { recordedSeconds, timeError, timerLabel, type TimeCategory, type TimeRecord, type TimeSnapshot } from "@/lib/time-tracking";

interface Tracker {
  active: TimeRecord | null; elapsed: number; loading: boolean; busy: boolean; error: string | null; ready: boolean;
  load: () => Promise<void>;
  start: (id:string,title:string,category:TimeCategory,taskId:string|null) => Promise<boolean>;
  control: (action:"pause"|"resume"|"finish"|"discard") => Promise<boolean>;
}
const Context=createContext<Tracker | null>(null);

export function TimeProvider({ userId, children }: { userId:string; children:ReactNode }) {
  const [active,setActive]=useState<TimeRecord|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [elapsed,setElapsed]=useState(0);
  const lock=useRef(false);
  const sequence=useRef({version:0});
  const baseline=useRef({server:0,monotonic:0});
  const lastSync=useRef(0);
  const apply=useCallback((snapshot:TimeSnapshot) => {
    if (!snapshot || !Number.isFinite(Date.parse(snapshot.server_now)) || (snapshot.record && !Array.isArray(snapshot.record.segments))) throw new Error("未收到有效的计时状态，请重试。");
    baseline.current={server:Date.parse(snapshot.server_now),monotonic:performance.now()};
    setActive(snapshot.record?.finished_at ? null : snapshot.record);
    setReady(true);
    lastSync.current=Date.now();
  },[]);
  const load=useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    if (lock.current) return;
    const version=++sequence.current.version;
    setLoading(true);
    try {
      const {data,error:failure}=await createClient().rpc("time_active");
      if (failure) throw failure;
      if (version!==sequence.current.version) return;
      apply(data as TimeSnapshot); setError(null);
    } catch(failure) {
      if(version===sequence.current.version) {setError(timeError(failure));setReady(false);}
    } finally {if(version===sequence.current.version)setLoading(false);}
  },[apply,userId]);
  useEffect(()=>{
    const version=sequence.current;
    void load();
    const focus=()=>{if(document.visibilityState==="visible"&&Date.now()-lastSync.current>10_000)void load();};
    const online=()=>void load();
    const storage=(event:StorageEvent)=>{if(event.key===`toolkit:time-sync:${userId}`)void load();};
    window.addEventListener("focus",focus);window.addEventListener("storage",storage);window.addEventListener("online",online);document.addEventListener("visibilitychange",focus);
    return()=>{version.version++;window.removeEventListener("focus",focus);window.removeEventListener("storage",storage);window.removeEventListener("online",online);document.removeEventListener("visibilitychange",focus);};
  },[load,userId]);
  useEffect(()=>{
    const tick=()=>setElapsed(active ? recordedSeconds(active)+(active.running_since ? Math.max(0,baseline.current.server+performance.now()-baseline.current.monotonic-Date.parse(active.running_since))/1000 : 0) : 0);
    tick();
    if(!active?.running_since)return;
    const timer=window.setInterval(tick,1000);
    return()=>window.clearInterval(timer);
  },[active]);
  const mutate=async(name:string,params:Record<string,unknown>)=>{
    if(lock.current||!ready)return false;
    lock.current=true;setBusy(true);setError(null);sequence.current.version++;
    try{
      const {data,error:failure}=await createClient().rpc(name,params);
      if(failure)throw failure;
      apply(data as TimeSnapshot);
      try{window.localStorage.setItem(`toolkit:time-sync:${userId}`,String(Date.now()));}catch{/* Server remains authoritative. */}
      return true;
    }catch(failure){
      // The server may have saved a request whose response was lost. Reconcile
      // before permitting another action; never reset an uncertain timer locally.
      setReady(false);
      const message=timeError(failure);
      try{
        const {data,error:syncError}=await createClient().rpc("time_active");
        if(syncError)throw syncError;
        apply(data as TimeSnapshot);
      }catch{/* Explicit sync is required before more controls become available. */}
      setError(message+" 已尝试同步最新状态，请核对后继续。");return false;
    }finally{lock.current=false;setBusy(false);setLoading(false);}
  };
  const value:Tracker={active,elapsed,loading,busy,error,ready,load,
    start:(id,title,category,taskId)=>mutate("time_start",{p_id:id,p_title:title,p_category:category,p_task_id:taskId}),
    control:(action)=>active ? mutate("time_control",{p_id:active.id,p_action:action,p_version:active.version}) : Promise.resolve(false)};
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useTimeTracker(){const value=useContext(Context);if(!value)throw new Error("TimeProvider is required");return value;}

export function ActiveTimeBar(){
  const {active,elapsed,ready}=useTimeTracker();
  if(!active)return null;
  return <aside aria-label="当前计时" className="border-b border-[color:var(--border-subtle)] bg-[var(--accent-soft)] px-4 py-2 sm:px-8 lg:px-10">
    <Link href="/time" className="quiet-link flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg text-sm focus-ring"><span className="min-w-0 break-words">{!ready?"计时状态待同步":active.running_since?"正在计时":"计时已暂停"} · {active.title}</span><span className="shrink-0 tabular-nums">{timerLabel(elapsed)} · 查看计时 →</span></Link>
  </aside>;
}
