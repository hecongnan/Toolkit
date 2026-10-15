"use client";

import { useCallback,useEffect,useRef,useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { localTimeRange,timeError,type TimeRecord } from "@/lib/time-tracking";

export function useTimeRecords(start:string,end:string){
  const {user}=useAuth();
  const userId=user?.id;
  const range=localTimeRange(start,end);
  const key=`${userId}:${range.from}:${range.to}`;
  const [result,setResult]=useState<{key:string;records:TimeRecord[]}|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<{key:string;message:string}|null>(null);
  const request=useRef({version:0});
  const load=useCallback(async()=>{
    if(!userId)return;
    const version=++request.current.version;
    setLoading(true);setError(null);
    try{
      const rows=new Map<string,TimeRecord>();let expected:number|null=null;
      for(let offset=0;;offset+=500){
        const {data,count,error:failure}=await createClient().from("time_records").select("*",{count:"exact"}).eq("user_id",userId)
          .not("finished_at","is",null).lt("started_at",range.to).gt("ended_at",range.from).order("started_at",{ascending:false}).order("id").range(offset,offset+499);
        if(failure)throw failure;
        if(version!==request.current.version)return;
        if(count===null||(expected!==null&&count!==expected))throw new Error("记录在加载期间发生变化，请刷新后查看完整统计。");
        expected=count;
        for(const row of (data??[]) as TimeRecord[])rows.set(row.id,row);
        if(offset+(data?.length??0)>=count)break;
        if(!data?.length)throw new Error("时间记录未加载完整，请重试。");
      }
      if(rows.size!==expected)throw new Error("记录在加载期间发生变化，请刷新后查看完整统计。");
      setResult({key,records:[...rows.values()]});
    }catch(failure){if(version===request.current.version)setError({key,message:timeError(failure)});}
    finally{if(version===request.current.version)setLoading(false);}
  },[userId,key,range.from,range.to]);
  useEffect(()=>{const sequence=request.current;void load();return()=>{sequence.version++;};},[load]);
  return{records:result?.key===key?result.records:[],hasData:result?.key===key,loading,error:error?.key===key?error.message:null,load,range};
}
