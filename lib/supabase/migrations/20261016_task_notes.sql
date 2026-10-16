-- Additive migration, after 20261002_todo_recurrence.sql. Safe to rerun.
begin;

create table if not exists public.task_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  body text not null check (length(body) between 1 and 20000 and body ~ '[^[:space:]]'),
  task_id uuid references public.todos(id) on delete set null,
  task_title text,
  task_date date,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists task_notes_user_updated on public.task_notes(user_id, updated_at desc, id);
create index if not exists task_notes_user_task on public.task_notes(user_id, task_id, updated_at desc, id);
alter table public.task_notes enable row level security;
drop policy if exists task_notes_own on public.task_notes;
create policy task_notes_own on public.task_notes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.task_notes to authenticated;

create or replace function public.task_note_check()
returns trigger language plpgsql security invoker set search_path = public as $$
declare t public.todos;
begin
  if new.task_id is not null and (tg_op='INSERT' or new.task_id is distinct from old.task_id) then
    select * into t from public.todos where id=new.task_id and user_id=new.user_id;
    if not found then raise exception '关联任务不存在或不属于当前账号，笔记内容已保留，请重新选择任务'; end if;
    new.task_title := t.text; new.task_date := t.due_date;
  end if;
  return new;
end;
$$;
drop trigger if exists task_note_check_trigger on public.task_notes;
create trigger task_note_check_trigger before insert or update on public.task_notes
  for each row execute function public.task_note_check();

create or replace function public.note_save(p_id uuid,p_title text,p_body text,p_task_id uuid default null,p_version integer default null)
returns public.task_notes language plpgsql security invoker set search_path = public as $$
declare r public.task_notes; v_user uuid := auth.uid(); v_title text := btrim(p_title,E' \n\r\t'); v_body text := p_body;
begin
  if v_user is null then raise exception '请先登录'; end if;
  if v_body is null or length(v_body)>20000 or v_body !~ '[^[:space:]]' then raise exception '请填写笔记正文，最多20000字'; end if;
  if coalesce(v_title,'')='' then v_title:=left(split_part(btrim(v_body,E' \n\r\t'),E'\n',1),80); end if;
  if length(v_title)>120 then raise exception '笔记标题最多120字'; end if;
  perform pg_advisory_xact_lock(hashtextextended('note:'||v_user::text,0));
  select * into r from public.task_notes where id=p_id and user_id=v_user for update;
  if found then
    if p_version is null then
      if r.title is distinct from v_title or r.body is distinct from v_body or r.task_id is distinct from p_task_id then
        raise exception '这条笔记可能已保存，请在笔记页核对后编辑已有笔记，当前内容不要丢弃';
      end if;
      return r;
    end if;
    if p_version<>r.version then raise exception '笔记已在其他页面更新，当前内容已保留；请先核对最新版本，不会自动覆盖'; end if;
    update public.task_notes set title=v_title,body=v_body,task_id=p_task_id,
      task_title=case when p_task_id is null and r.task_id is not null then null else task_title end,
      task_date=case when p_task_id is null and r.task_id is not null then null else task_date end,
      version=version+1,updated_at=clock_timestamp() where id=p_id returning * into r;
  else
    if p_version is not null then raise exception '笔记已被删除，当前内容已保留，请另建笔记保存'; end if;
    insert into public.task_notes(id,user_id,title,body,task_id)
      values(p_id,v_user,v_title,v_body,p_task_id) returning * into r;
  end if;
  return r;
end;
$$;

create or replace function public.note_list(p_query text default '',p_task_id uuid default null,p_offset integer default 0,p_limit integer default 50)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_total bigint; v_rows jsonb; v_query text := lower(btrim(coalesce(p_query,'')));
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  if length(v_query)>200 or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then raise exception '笔记查询条件无效'; end if;
  -- A single statement gives the count and current page one MVCC snapshot.
  with matching as materialized (
    select n.* from public.task_notes n where n.user_id=auth.uid() and (p_task_id is null or n.task_id=p_task_id)
      and not exists (select 1 from regexp_split_to_table(v_query,E'\\s+') term
        where term<>'' and strpos(lower(n.title||E'\n'||n.body||E'\n'||coalesce(n.task_title,'')),term)=0)
  ), paged as (select * from matching order by updated_at desc,id limit p_limit offset p_offset)
  select (select count(*) from matching),coalesce((select jsonb_agg(to_jsonb(p) order by p.updated_at desc,p.id) from paged p),'[]'::jsonb)
    into v_total,v_rows;
  return jsonb_build_object('notes',v_rows,'total',v_total);
end;
$$;

create or replace function public.note_delete(p_id uuid,p_version integer)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  delete from public.task_notes where id=p_id and user_id=auth.uid() and version=p_version returning id into v_id;
  if v_id is null then raise exception '笔记已改变或不存在，请刷新后重试'; end if;
  return v_id;
end;
$$;
revoke all on function public.note_save(uuid,text,text,uuid,integer),public.note_list(text,uuid,integer,integer),public.note_delete(uuid,integer) from public,anon;
grant execute on function public.note_save(uuid,text,text,uuid,integer),public.note_list(text,uuid,integer,integer),public.note_delete(uuid,integer) to authenticated;
commit;
