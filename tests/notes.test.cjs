const {test}=require("node:test");
const assert=require("node:assert/strict");
const {randomUUID}=require("node:crypto");
const {readFileSync}=require("node:fs");
const path=require("node:path");
const Module=require("node:module");
const ts=require("typescript");
const {PGlite}=require("@electric-sql/pglite");
const root=path.resolve(__dirname,"..");
const filename=path.join(root,"lib/notes.ts"),mod=new Module(filename,module);
mod._compile(ts.transpileModule(readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const {noteQuery,noteTitle,parseNoteDraft,noteDraftKey}=mod.exports;
const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222";
const migration=readFileSync(path.join(root,"lib/supabase/migrations/20261016_task_notes.sql"),"utf8");

test("note search normalization and account-scoped draft validation reject corrupt data",()=>{
  assert.equal(noteQuery("  React \n 状态  "),"React 状态");assert.equal(noteTitle(" ","\n知识总结\n内容"),"知识总结");
  const draft={userId:a,id:randomUUID(),title:"",body:"草稿\n第二行",task:null,initial:null};
  assert.deepEqual(parseNoteDraft(JSON.stringify(draft),a),draft);assert.equal(parseNoteDraft(JSON.stringify(draft),b),null);
  assert.equal(parseNoteDraft("{",a),null);assert.equal(parseNoteDraft(JSON.stringify({...draft,body:"x".repeat(20001)}),a),null);
  assert.equal(parseNoteDraft(JSON.stringify({...draft,initial:{id:draft.id,version:-1}}),a),null);
  assert.notEqual(noteDraftKey(a),noteDraftKey(b));
});

test("notes PostgreSQL: association, safe retries, literal search, versions and RLS",async(t)=>{
  const db=new PGlite();
  const user=(id)=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  const rpc=async(name,args)=>(await db.query(`select to_jsonb(public.${name}(${args.map((_,i)=>"$"+(i+1)).join(",")})) as result`,args)).rows[0].result;
  const save=(id,title,body,task=null,version=null)=>rpc("note_save",[id,title,body,task,version]);
  const list=(q="",task=null,offset=0,limit=50)=>rpc("note_list",[q,task,offset,limit]);
  const task=randomUUID(),nextTask=randomUUID();let note;
  try{
    await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,anon;insert into auth.users values('${a}'),('${b}');`);
    await db.exec(readFileSync(path.join(root,"lib/supabase/schema.sql"),"utf8"));await db.exec(migration);await db.exec(migration);
    await db.exec("grant select,insert,update,delete on public.todos to authenticated;set role authenticated;");await user(a);
    await db.query("insert into todos(id,user_id,text,priority,due_date,done) values($1,$2,'每天读书',2,'2026-10-16',true),($3,$2,'每天读书',2,'2026-10-17',false)",[task,a,nextTask]);
    await t.test("linked notes use task snapshots but do not change completion, and repeated days remain separate",async()=>{
      note=await save(randomUUID(),"React收获","状态更新\n函数式更新\n<img src=x onerror=alert(1)>",task);
      assert.equal(note.task_title,"每天读书");assert.equal(note.task_date,"2026-10-16");assert.equal(note.version,1);
      assert.equal((await db.query("select done from todos where id=$1",[task])).rows[0].done,true);
      assert.equal((await list("",task)).total,1);assert.equal((await list("",nextTask)).total,0);
      await db.query("update todos set text='改名后的任务',due_date='2026-10-18' where id=$1",[task]);
      assert.equal((await list("每天读书")).total,1,"original context stays searchable after a task rename");
    });
    await t.test("create retries keep one row, changed retry does not silently discard input, edits use versions",async()=>{
      assert.equal((await save(note.id,note.title,note.body,task)).id,note.id);
      await assert.rejects(save(note.id,note.title,"响应丢失后修改",task),/可能已保存/);
      const edited=await save(note.id,"修改标题",note.body,task,1);assert.equal(edited.version,2);
      await assert.rejects(save(note.id,"旧页面","正文",task,1),/其他页面更新/);
      await assert.rejects(save(randomUUID(),"","  "),/正文/);await assert.rejects(save(randomUUID(),"x".repeat(121),"正文"),/标题/);
      await assert.rejects(save(randomUUID(),"","\n\t\r"),/正文/);
      await assert.rejects(save(randomUUID(),"标题","x".repeat(20001)),/正文/);
      note=edited;
    });
    await t.test("search treats punctuation literally, uses AND across title/body, and pagination returns a consistent total",async()=>{
      await save(randomUUID(),"SQL 100%_safe","a,b.(c)\n知识记录");await save(randomUUID(),"独立想法","今天的另一个收获");
      assert.equal((await list("修改标题 状态")).total,1);assert.equal((await list("100%_")).total,1);
      assert.equal((await list("a,b.(c)")).total,1);assert.equal((await list("不存在")).total,0);
      const first=await list("",null,0,2),second=await list("",null,2,2);
      assert.equal(first.total,3);assert.equal(second.total,3);assert.equal(first.notes.length,2);assert.equal(second.notes.length,1);
      assert.equal(new Set([...first.notes,...second.notes].map(x=>x.id)).size,3);
      await assert.rejects(list("",null,-1),/查询条件/);
      const code="    const knowledge = true;\n\n";
      const exact=await save(randomUUID(),"保留代码缩进",code);assert.equal(exact.body,code);
    });
    await t.test("task deletion preserves note content and original context; unlink and note deletion never delete tasks",async()=>{
      await db.query("delete from todos where id=$1",[task]);
      const orphan=(await list("修改标题")).notes[0];assert.equal(orphan.task_id,null);assert.equal(orphan.task_title,"每天读书");assert.equal(orphan.body,note.body);
      const edited=await save(note.id,note.title,"孤立笔记仍可编辑",null,note.version);assert.equal(edited.task_title,"每天读书");
      const linked=await save(randomUUID(),"解除关联","正文",nextTask);const unlinked=await save(linked.id,linked.title,linked.body,null,1);assert.equal(unlinked.task_title,null);
      await assert.rejects(rpc("note_delete",[note.id,1]),/已改变/);
      assert.equal(await rpc("note_delete",[note.id,edited.version]),note.id);
      assert.equal((await db.query("select count(*)::int as n from todos where id=$1",[nextTask])).rows[0].n,1);
    });
    await t.test("other accounts cannot read or mutate notes, spoof ownership, or attach foreign tasks; anonymous RPCs are denied",async()=>{
      const mine=await save(randomUUID(),"我的笔记","私有正文",nextTask);await user(b);
      assert.equal((await list()).total,0);await assert.rejects(save(mine.id,"越权","正文",null,1),/已被删除/);
      await assert.rejects(save(randomUUID(),"越权关联","正文",nextTask),/不属于当前账号/);
      await assert.rejects(rpc("note_delete",[mine.id,1]),/已改变/);
      await assert.rejects(db.query("insert into task_notes(user_id,title,body) values($1,'冒名','正文')",[a]),/row-level security/);
      await db.exec("reset role;set role anon;");await user("");await assert.rejects(list(),/permission denied/);await assert.rejects(save(randomUUID(),"标题","正文"),/permission denied/);
    });
  }finally{await db.close();}
});
