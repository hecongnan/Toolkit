const {test}=require("node:test");
const assert=require("node:assert/strict");
const {randomUUID}=require("node:crypto");
const {readFileSync}=require("node:fs");
const path=require("node:path");
const Module=require("node:module");
const ts=require("typescript");
const {PGlite}=require("@electric-sql/pglite");
const root=path.resolve(__dirname,"..");
const filename=path.join(root,"lib/time-tracking.ts");
const mod=new Module(filename,module);
mod._compile(ts.transpileModule(readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const {recordedSeconds,timeDistribution,localTimeRange,timerLabel,taskTimeTotals}=mod.exports;
const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222";
const migration=readFileSync(path.join(root,"lib/supabase/migrations/20261015_time_tracking.sql"),"utf8");

test("time statistics clip actual intervals across midnight and exclude pauses and unfinished records",()=>{
  const records=[{category:"study",finished_at:"2026-10-16T00:00:00Z",segments:[{start:"2026-10-14T23:50:00+08:00",end:"2026-10-15T00:20:00+08:00"},{start:"2026-10-15T01:00:00+08:00",end:"2026-10-15T01:10:00+08:00"}]},
    {category:"work",finished_at:null,segments:[{start:"2026-10-15T02:00:00+08:00",end:"2026-10-15T04:00:00+08:00"}]}];
  const result=timeDistribution(records,"2026-10-15T00:00:00+08:00","2026-10-16T00:00:00+08:00");
  assert.equal(result.total,1800);assert.equal(result.items.find(x=>x.value==="study").percent,100);
  assert.equal(recordedSeconds(records[0]),2400);
  assert.equal(timeDistribution([],"2026-01-01","2026-01-02").total,0);
  assert.equal(timerLabel(3661),"01:01:01");
  const range=localTimeRange("2026-10-15","2026-10-15");
  assert.equal(Date.parse(range.to)-Date.parse(range.from),86400000);
});

test("task totals include all saved history for only that occurrence and retain its latest category",()=>{
  const segment=(start,end)=>[{start,end}];
  const old={task_id:"first",finished_at:"2026-09-01",category:"work",started_at:"2026-09-01T09:00:00Z",segments:segment("2026-09-01T09:00:00Z","2026-09-01T09:30:00Z")};
  const recent={task_id:"first",finished_at:"2026-10-16",category:"study",started_at:"2026-10-16T09:00:00Z",segments:[...segment("2026-10-16T09:00:00Z","2026-10-16T09:10:00Z"),...segment("2026-10-16T10:00:00Z","2026-10-16T10:05:00Z")]};
  const result=taskTimeTotals([recent,{...old,task_id:"next-occurrence"},old,{...old,task_id:null},{...old,finished_at:null}]);
  assert.equal(result.size,2);assert.equal(result.get("first").seconds,2700);assert.equal(result.get("first").category,"study");
  assert.equal(result.get("next-occurrence").seconds,1800);assert.equal(taskTimeTotals([]).size,0);
});

test("time tracking PostgreSQL, idempotency, conflict handling and ownership",async(t)=>{
  const db=new PGlite();
  const user=(id)=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  const rpc=async(name,args)=> (await db.query(`select to_jsonb(public.${name}(${args.map((_,i)=>"$"+(i+1)).join(",")})) as result`,args)).rows[0].result;
  const start=(id,title="读文档",task=null)=>rpc("time_start",[id,title,"study",task]);
  const control=(id,action,version)=>rpc("time_control",[id,action,version]);
  const now=Date.now(),before=new Date(now-3600000).toISOString(),end=new Date(now-1800000).toISOString();
  try{
    await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,anon;insert into auth.users values('${a}'),('${b}');`);
    await db.exec(readFileSync(path.join(root,"lib/supabase/schema.sql"),"utf8"));
    await db.exec(migration);await db.exec(migration);
    await db.exec("grant select,insert,update,delete on public.todos to authenticated;set role authenticated;");await user(a);

    await t.test("manual retry saves one record, editing uses versions, and invalid intervals roll back",async()=>{
      const id=randomUUID();
      const first=await rpc("time_save_manual",[id,"写作","work",null,before,end,null]);
      assert.equal(first.title,"写作");
      await rpc("time_save_manual",[id,"写作","work",null,before,end,null]);
      await assert.rejects(rpc("time_save_manual",[id,"修改后的重试","work",null,before,end,null]),/可能已保存/);
      assert.equal((await db.query("select count(*)::int as n from time_records where id=$1",[id])).rows[0].n,1);
      const updated=await rpc("time_save_manual",[id,"修改分类","study",null,null,null,1]);
      assert.equal(updated.version,2);assert.equal(updated.segments.length,1);
      await assert.rejects(rpc("time_save_manual",[randomUUID(),"重复时段","work",null,before,end,null]),/重叠/);
      await assert.rejects(rpc("time_save_manual",[id,"旧页面","work",null,before,end,1]),/记录已更新/);
      await assert.rejects(rpc("time_save_manual",[randomUUID(),"未来记录","work",null,before,new Date(now+86400000).toISOString(),null]),/有效时段/);
      await assert.rejects(rpc("time_save_manual",[randomUUID(),"倒序记录","work",null,end,before,null]),/有效时段/);
      await assert.rejects(rpc("time_save_manual",[randomUUID(),"过长记录","work",null,new Date(now-172800000).toISOString(),end,null]),/有效时段/);
    });

    await t.test("one active timer per account, pause/resume retain intervals, finish never completes a task",async()=>{
      const task=randomUUID();await db.query("insert into todos(id,user_id,text,priority,due_date) values($1,$2,'关联任务',2,current_date)",[task,a]);
      const id=randomUUID();const first=await start(id,"关联任务用时",task);
      assert.equal(first.record.task_title,"关联任务");
      assert.equal((await start(id)).record.id,id);
      await assert.rejects(start(randomUUID()),/已有计时/);
      await db.query("update time_records set started_at=statement_timestamp()-interval '120 seconds',running_since=statement_timestamp()-interval '120 seconds' where id=$1",[id]);
      const overlapEnd=new Date().toISOString();
      await assert.rejects(rpc("time_save_manual",[randomUUID(),"运行时重复补记","work",null,new Date(Date.now()-60000).toISOString(),overlapEnd,null]),/重叠/);
      await db.query("update time_records set started_at=statement_timestamp()-interval '120 seconds',running_since=statement_timestamp()-interval '120 seconds' where id=$1",[id]);
      const paused=await control(id,"pause",1);assert.equal(paused.record.running_since,null);assert.equal(paused.record.segments.length,1);
      await db.query("update time_records set started_at=statement_timestamp()-interval '120 seconds',ended_at=statement_timestamp()-interval '60 seconds',segments=jsonb_build_array(jsonb_build_object('start',statement_timestamp()-interval '120 seconds','end',statement_timestamp()-interval '60 seconds')) where id=$1",[id]);
      const resumed=await control(id,"resume",2);assert.ok(resumed.record.running_since);
      await assert.rejects(control(id,"pause",2),/其他页面更新/);
      const finished=await control(id,"finish",3);assert.ok(finished.record.finished_at);assert.equal(finished.record.segments.length,2);
      assert.ok(recordedSeconds(finished.record)<65,"paused gap must be excluded");
      assert.equal((await db.query("select done from todos where id=$1",[task])).rows[0].done,false);
      await db.query("delete from todos where id=$1",[task]);
      const kept=(await db.query("select task_id,task_title from time_records where id=$1",[id])).rows[0];
      assert.equal(kept.task_id,null);assert.equal(kept.task_title,"关联任务");
    });

    await t.test("paused finish excludes idle time and discard removes an unfinished record",async()=>{
      const id=randomUUID();await start(id);const paused=await control(id,"pause",1);const finished=await control(id,"finish",2);
      assert.deepEqual(finished.record.segments,paused.record.segments);
      const other=randomUUID();await start(other);await control(other,"discard",1);
      assert.equal((await rpc("time_active",[])).record,null);
      await assert.rejects(rpc("time_delete",[id,1]),/记录已改变/);
      assert.equal(await rpc("time_delete",[id,finished.record.version]),id);
    });

    await t.test("RLS and task ownership reject another account and unauthenticated RPCs",async()=>{
      const id=randomUUID();await start(id);
      const foreignTask=randomUUID();await db.query("insert into todos(id,user_id,text,priority,due_date) values($1,$2,'私有任务',2,current_date)",[foreignTask,a]);
      await user(b);assert.equal((await rpc("time_active",[])).record,null);
      await assert.rejects(control(id,"discard",1),/记录已不存在/);
      await assert.rejects(start(randomUUID(),"越权关联",foreignTask),/不属于当前账号/);
      assert.equal((await db.query("select count(*)::int as n from time_records")).rows[0].n,0);
      await db.exec("reset role;set role anon;");await user("");await assert.rejects(rpc("time_active",[]),/permission denied/);
    });
  }finally{await db.close();}
});
