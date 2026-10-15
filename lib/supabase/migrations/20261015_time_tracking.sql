-- Run after 20261002_todo_recurrence.sql. Additive and safe to rerun.
begin;

create or replace function public.time_segments_valid(p_segments jsonb)
returns boolean language plpgsql immutable set search_path = public as $$
declare s jsonb; a timestamptz; b timestamptz; previous_end timestamptz;
begin
  if jsonb_typeof(p_segments) <> 'array' or jsonb_array_length(p_segments) > 1000 then return false; end if;
  for s in select value from jsonb_array_elements(p_segments) loop
    if jsonb_typeof(s) <> 'object' or coalesce(s->>'start','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
      or coalesce(s->>'end','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then return false; end if;
    a := (s->>'start')::timestamptz; b := (s->>'end')::timestamptz;
    if not isfinite(a) or not isfinite(b) or b <= a or (previous_end is not null and a < previous_end) then return false; end if;
    previous_end := b;
  end loop;
  return true;
exception when others then return false;
end;
$$;

create table if not exists public.time_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  category text not null check (category in ('work','study','life','other')),
  task_id uuid references public.todos(id) on delete set null,
  task_title text,
  source text not null check (source in ('timer','manual')),
  started_at timestamptz not null,
  ended_at timestamptz,
  segments jsonb not null default '[]' check (public.time_segments_valid(segments)),
  running_since timestamptz,
  finished_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  check (finished_at is null or (running_since is null and ended_at is not null and jsonb_array_length(segments) > 0)),
  check (ended_at is null or ended_at >= started_at)
);
create unique index if not exists time_records_one_active on public.time_records(user_id) where finished_at is null;
create index if not exists time_records_user_range on public.time_records(user_id, started_at, ended_at) where finished_at is not null;
alter table public.time_records enable row level security;
drop policy if exists time_records_own on public.time_records;
create policy time_records_own on public.time_records for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.time_records to authenticated;

create or replace function public.time_record_check()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_title text; first_start timestamptz; last_end timestamptz;
begin
  if new.task_id is not null and (tg_op = 'INSERT' or new.task_id is distinct from old.task_id) then
    select text into v_title from public.todos where id = new.task_id and user_id = new.user_id;
    if not found then raise exception '关联任务不存在或不属于当前账号'; end if;
    new.task_title := v_title;
  end if;
  if jsonb_array_length(new.segments) > 0 then
    first_start := (new.segments->0->>'start')::timestamptz;
    last_end := (new.segments->(jsonb_array_length(new.segments)-1)->>'end')::timestamptz;
    if first_start <> new.started_at or new.ended_at is distinct from last_end
      or (new.running_since is not null and new.running_since < last_end) then raise exception '记录时段不一致'; end if;
  elsif new.finished_at is not null then raise exception '请记录实际投入的时间';
  end if;
  return new;
end;
$$;
drop trigger if exists time_record_check_trigger on public.time_records;
create trigger time_record_check_trigger before insert or update on public.time_records
  for each row execute function public.time_record_check();

create or replace function public.time_active()
returns jsonb language plpgsql security invoker set search_path = public as $$
declare r public.time_records;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  select * into r from public.time_records where user_id = auth.uid() and finished_at is null;
  return jsonb_build_object('record',case when r.id is null then null else to_jsonb(r) end,'server_now',clock_timestamp());
end;
$$;

create or replace function public.time_start(p_id uuid, p_title text, p_category text, p_task_id uuid default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare r public.time_records; v_now timestamptz; v_user uuid := auth.uid();
begin
  if v_user is null then raise exception '请先登录'; end if;
  perform pg_advisory_xact_lock(hashtextextended('time:'||v_user::text,0));
  v_now := clock_timestamp();
  select * into r from public.time_records where id = p_id and user_id = v_user;
  if found then return jsonb_build_object('record',to_jsonb(r),'server_now',clock_timestamp()); end if;
  if exists(select 1 from public.time_records where user_id=v_user and finished_at is null) then raise exception '已有计时，请先继续或结束当前计时'; end if;
  insert into public.time_records(id,user_id,title,category,task_id,source,started_at,running_since)
    values(p_id,v_user,btrim(p_title),p_category,p_task_id,'timer',v_now,v_now) returning * into r;
  return jsonb_build_object('record',to_jsonb(r),'server_now',clock_timestamp());
end;
$$;

create or replace function public.time_control(p_id uuid, p_action text, p_version integer)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare r public.time_records; v_now timestamptz; v_user uuid := auth.uid();
begin
  if v_user is null then raise exception '请先登录'; end if;
  perform pg_advisory_xact_lock(hashtextextended('time:'||v_user::text,0));
  v_now := clock_timestamp();
  select * into r from public.time_records where id=p_id and user_id=v_user for update;
  if not found then raise exception '记录已不存在，请刷新'; end if;
  if r.version is distinct from p_version then raise exception '计时已在其他页面更新，请同步最新状态'; end if;
  if p_action is null or p_action not in ('pause','resume','finish','discard') or r.finished_at is not null then raise exception '计时状态已改变，请刷新'; end if;
  if p_action='discard' then
    delete from public.time_records where id=r.id;
    return jsonb_build_object('record',null,'server_now',clock_timestamp());
  end if;
  if p_action in ('pause','finish') and r.running_since is not null then
    if v_now <= r.running_since then raise exception '计时尚未开始，请稍后重试'; end if;
    r.segments := r.segments || jsonb_build_array(jsonb_build_object('start',r.running_since,'end',v_now));
    r.ended_at := v_now; r.running_since := null;
  elsif p_action='resume' and r.running_since is null then
    r.running_since := v_now;
  end if;
  if p_action='finish' then r.finished_at := v_now; end if;
  update public.time_records set segments=r.segments, ended_at=r.ended_at, running_since=r.running_since,
    finished_at=r.finished_at, version=version+1 where id=r.id returning * into r;
  return jsonb_build_object('record',to_jsonb(r),'server_now',clock_timestamp());
end;
$$;

create or replace function public.time_save_manual(p_id uuid,p_title text,p_category text,p_task_id uuid,
  p_start timestamptz,p_end timestamptz,p_version integer default null)
returns public.time_records language plpgsql security invoker set search_path = public as $$
declare r public.time_records; v_user uuid := auth.uid(); v_now timestamptz;
begin
  if v_user is null then raise exception '请先登录'; end if;
  perform pg_advisory_xact_lock(hashtextextended('time:'||v_user::text,0));
  v_now := clock_timestamp();
  select * into r from public.time_records where id=p_id and user_id=v_user for update;
  if found then
    if r.finished_at is null then raise exception '请先结束计时再编辑记录'; end if;
    -- A retried create returns its original row instead of duplicating it.
    if p_version is null then
      if r.title<>btrim(p_title) or r.category<>p_category or r.task_id is distinct from p_task_id
        or r.started_at is distinct from p_start or r.ended_at is distinct from p_end then
        raise exception '这条记录可能已保存，请先刷新记录核对，再编辑已有记录';
      end if;
      return r;
    end if;
    if r.version <> p_version then raise exception '记录已更新，请关闭后重新打开'; end if;
  elsif p_version is not null then raise exception '记录已不存在，请刷新';
  end if;
  if p_start is not null or p_end is not null then
    if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end)
      or p_end <= p_start or p_end > v_now or p_end-p_start > interval '24 hours' then raise exception '请选择过去的有效时段，结束需晚于开始，单次补记不超过24小时'; end if;
    if exists(select 1 from public.time_records other, lateral jsonb_array_elements(other.segments) s
      where other.user_id=v_user and other.id<>p_id and (s->>'start')::timestamptz<p_end and (s->>'end')::timestamptz>p_start)
      or exists(select 1 from public.time_records other where other.user_id=v_user and other.id<>p_id
        and other.running_since is not null and other.running_since<p_end and v_now>p_start)
      then raise exception '这个时段与已有记录或当前计时重叠，请调整起止时间'; end if;
    r.segments := jsonb_build_array(jsonb_build_object('start',p_start,'end',p_end));
    r.started_at := p_start; r.ended_at := p_end; r.source := 'manual';
  elsif r.id is null then raise exception '请填写开始和结束时间'; end if;
  if r.id is null then
    insert into public.time_records(id,user_id,title,category,task_id,source,started_at,ended_at,segments,finished_at)
      values(p_id,v_user,btrim(p_title),p_category,p_task_id,'manual',r.started_at,r.ended_at,r.segments,v_now) returning * into r;
  else
    update public.time_records set title=btrim(p_title),category=p_category,task_id=p_task_id,
      started_at=r.started_at,ended_at=r.ended_at,segments=r.segments,source=r.source,version=version+1 where id=r.id returning * into r;
  end if;
  return r;
end;
$$;

create or replace function public.time_delete(p_id uuid,p_version integer)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  delete from public.time_records where id=p_id and user_id=auth.uid() and finished_at is not null and version=p_version returning id into v_id;
  if v_id is null then raise exception '记录已改变或不存在，请刷新后重试'; end if;
  return v_id;
end;
$$;

revoke all on function public.time_active() from public,anon;
revoke all on function public.time_start(uuid,text,text,uuid) from public,anon;
revoke all on function public.time_control(uuid,text,integer) from public,anon;
revoke all on function public.time_save_manual(uuid,text,text,uuid,timestamptz,timestamptz,integer) from public,anon;
revoke all on function public.time_delete(uuid,integer) from public,anon;
grant execute on function public.time_active(),public.time_start(uuid,text,text,uuid),public.time_control(uuid,text,integer),
  public.time_save_manual(uuid,text,text,uuid,timestamptz,timestamptz,integer),public.time_delete(uuid,integer) to authenticated;
commit;
