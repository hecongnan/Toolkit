"use client";

import { useCallback,useEffect,useRef,useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { readSavedTime } from "@/lib/time-data";
import { useTimeTracker } from "./TimeProvider";
import { localTimeRange,timeError,type TimeRecord } from "@/lib/time-tracking";

export function useTimeRecords(start:string,end:string){
  const {user}=useAuth();
  const userId=user?.id;
  const {historyRevision}=useTimeTracker();
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
      const records=await readSavedTime(userId,{range:{from:range.from,to:range.to}},()=>version===request.current.version);
      if(records)setResult({key,records});
    }catch(failure){if(version===request.current.version)setError({key,message:timeError(failure)});}
    finally{if(version===request.current.version)setLoading(false);}
  },[userId,key,range.from,range.to]);
  useEffect(()=>{const sequence=request.current;void load();return()=>{sequence.version++;};},[load,historyRevision]);
  return{records:result?.key===key?result.records:[],hasData:result?.key===key,loading,error:error?.key===key?error.message:null,load,range};
}
