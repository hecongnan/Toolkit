-- Todo 3.0: calendar recurrence, per-occurrence exceptions, and skip/stop scopes.
-- Run after schema.sql (or Todo 2.0). Safe to run again; existing history is kept.
begin;

alter table public.todos add column if not exists occurrence_date date;
alter table public.todos add column if not exists skipped boolean not null default false;

update public.todos set series_id = id where repeat_rule <> 'none' and series_id is null;
update public.todos set occurrence_date = due_date where series_id is not null and occurrence_date is null;

create table if not exists public.todo_series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  root_id uuid not null,
  text text not null check (length(btrim(text)) > 0),
  priority int not null check (priority in (1, 2, 3)),
  scheduled_time time,
  repeat_rule text not null check (repeat_rule in ('daily', 'weekdays', 'weekly')),
  start_date date not null,
  end_date date,
  anchor_date date not null,
  created_at timestamptz not null default now(),
  -- Empty intervals retain a stopped-series marker so legacy inserts cannot restart it.
  check (end_date is null or end_date >= start_date - 1),
  unique (user_id, root_id, start_date)
);

alter table public.todo_series enable row level security;
drop policy if exists "todo_series_own" on public.todo_series;
create policy "todo_series_own" on public.todo_series
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.todo_series to authenticated;

-- Choose the latest known settings while retaining the original start date.
insert into public.todo_series (user_id, root_id, text, priority, scheduled_time, repeat_rule, start_date, anchor_date)
select latest.user_id, latest.series_id, latest.text, latest.priority,
  latest.scheduled_time, latest.repeat_rule, dates.first_date, dates.first_date
from (
  select distinct on (user_id, series_id) * from public.todos
  where series_id is not null and repeat_rule <> 'none'
  order by user_id, series_id, occurrence_date desc, updated_at desc
) latest
join (
  select user_id, series_id, min(occurrence_date) as first_date from public.todos
  where series_id is not null group by user_id, series_id
) dates on dates.user_id = latest.user_id and dates.series_id = latest.series_id
where not exists (
  select 1 from public.todo_series s where s.user_id = latest.user_id and s.root_id = latest.series_id
);

-- Identity follows the original occurrence date, not a manually rescheduled due date.
create unique index if not exists todos_series_occurrence_idx
  on public.todos (user_id, series_id, occurrence_date) where series_id is not null;
drop index if exists public.todos_series_date_idx;
create index if not exists todo_series_user_root_idx on public.todo_series (user_id, root_id, start_date);
create index if not exists todos_overdue_idx on public.todos (user_id, due_date) where not done and not skipped;

create or replace function public.todo_matches_date(p_rule text, p_anchor date, p_date date)
returns boolean language sql immutable strict set search_path = public as $$
  select case p_rule
    when 'daily' then true
    when 'weekdays' then extract(isodow from p_date) between 1 and 5
    when 'weekly' then mod(p_date - p_anchor, 7) = 0
    else false end;
$$;

-- Keep direct legacy imports compatible with the new occurrence identity.
create or replace function public.todo_prepare_insert()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.repeat_rule <> 'none' and new.series_id is null then new.series_id := new.id; end if;
  if new.series_id is not null then
    new.occurrence_date := coalesce(new.occurrence_date, new.due_date);
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || new.series_id::text, 0));
    if new.repeat_rule <> 'none' and not exists (
      select 1 from public.todo_series where user_id = new.user_id and root_id = new.series_id
    ) then
      insert into public.todo_series (user_id, root_id, text, priority, scheduled_time, repeat_rule, start_date, anchor_date)
      values (new.user_id, new.series_id, new.text, new.priority, new.scheduled_time,
        new.repeat_rule, new.occurrence_date, new.occurrence_date);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists todo_prepare_insert on public.todos;
create trigger todo_prepare_insert before insert on public.todos for each row execute function public.todo_prepare_insert();

-- Materialize only the selected day and a rolling 30-day catch-up window.
-- Serialized per series; retries, multiple tabs, and completion never duplicate occurrences.
create or replace function public.todo_ensure_occurrences(p_date date, p_today date)
returns integer language plpgsql security invoker set search_path = public as $$
declare v_user uuid := auth.uid(); v_root uuid; v_count int := 0; v_added int;
begin
  if v_user is null then raise exception '请先登录'; end if;
  if p_date is null or p_today is null then raise exception '请选择有效日期'; end if;
  for v_root in select distinct root_id from public.todo_series where user_id = v_user
    and (end_date is null or end_date >= start_date)
    and ((start_date <= p_today and (end_date is null or end_date >= p_today - 29))
      or (start_date <= p_date and (end_date is null or end_date >= p_date))) order by root_id loop
    perform pg_advisory_xact_lock(hashtextextended(v_user::text || v_root::text, 0));
    insert into public.todos (user_id, text, priority, due_date, scheduled_time, repeat_rule, series_id, occurrence_date, position)
    select v_user, s.text, s.priority, days.day, s.scheduled_time, s.repeat_rule,
      s.root_id, days.day, 1024
    from public.todo_series s
    cross join lateral (
      select greatest(s.start_date, p_today - 29) + n as day
      from generate_series(0, least(coalesce(s.end_date, p_today), p_today) - greatest(s.start_date, p_today - 29)) n
      union select p_date where p_date >= s.start_date and (s.end_date is null or p_date <= s.end_date)
    ) days
    where s.user_id = v_user and s.root_id = v_root
      and public.todo_matches_date(s.repeat_rule, s.anchor_date, days.day)
      and not exists (select 1 from public.todos existing where existing.user_id = v_user
        and existing.series_id = s.root_id and existing.occurrence_date = days.day)
    on conflict (user_id, series_id, occurrence_date) where series_id is not null do nothing;
    get diagnostics v_added = row_count;
    v_count := v_count + v_added;
  end loop;
  return v_count;
end;
$$;

create or replace function public.todo_create(
  p_id uuid, p_text text, p_priority int, p_due_date date, p_time time,
  p_repeat text, p_position bigint default 1024
)
returns public.todos language plpgsql security invoker set search_path = public as $$
declare v_user uuid := auth.uid(); v_due date := p_due_date; v_task public.todos;
begin
  if v_user is null then raise exception '请先登录'; end if;
  if p_id is null or p_due_date is null or p_text is null or length(btrim(p_text)) = 0
    or p_priority is null or p_priority not in (1,2,3)
    or p_repeat is null or p_repeat not in ('none','daily','weekdays','weekly') then
    raise exception '请检查任务内容、日期和重复规则';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || p_id::text, 0));
  select * into v_task from public.todos where id = p_id and user_id = v_user;
  if found then return v_task; end if;
  if p_repeat = 'weekdays' then
    while extract(isodow from v_due) > 5 loop v_due := v_due + 1; end loop;
  end if;
  if p_repeat <> 'none' then
    insert into public.todo_series (user_id, root_id, text, priority, scheduled_time, repeat_rule, start_date, anchor_date)
    values (v_user, p_id, btrim(p_text), p_priority, p_time, p_repeat, v_due, v_due);
  end if;
  insert into public.todos (id, user_id, text, priority, due_date, scheduled_time, repeat_rule, series_id, occurrence_date, position)
  values (p_id, v_user, btrim(p_text), p_priority, v_due, p_time, p_repeat,
    case when p_repeat <> 'none' then p_id end,
    case when p_repeat <> 'none' then v_due end, p_position)
  returning * into v_task;
  return v_task;
end;
$$;

create or replace function public.todo_edit(
  p_id uuid, p_text text, p_priority int, p_due_date date, p_time time,
  p_repeat text, p_scope text default 'single'
)
returns void language plpgsql security invoker set search_path = public as $$
declare v_user uuid := auth.uid(); v_task public.todos; v_cutoff date; v_end date; v_due date := p_due_date; v_root uuid;
begin
  if v_user is null then raise exception '请先登录'; end if;
  if p_due_date is null or p_text is null or length(btrim(p_text)) = 0
    or p_priority is null or p_priority not in (1,2,3)
    or p_repeat is null or p_repeat not in ('none','daily','weekdays','weekly')
    or p_scope is null or p_scope not in ('single','future') then raise exception '请检查任务内容和编辑范围'; end if;
  select * into v_task from public.todos where id = p_id and user_id = v_user;
  if not found then raise exception '任务已不存在，请刷新后重试'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || coalesce(v_task.series_id, v_task.id)::text, 0));
  select * into v_task from public.todos where id = p_id and user_id = v_user for update;
  if not found then raise exception '任务已不存在，请刷新后重试'; end if;

  if v_task.series_id is null or (v_task.repeat_rule = 'none' and p_repeat <> 'none' and p_scope = 'single') then
    v_root := case when v_task.series_id is null then v_task.id else gen_random_uuid() end;
    if p_repeat <> 'none' then
      if p_repeat = 'weekdays' then
        while extract(isodow from v_due) > 5 loop v_due := v_due + 1; end loop;
      end if;
      insert into public.todo_series (user_id, root_id, text, priority, scheduled_time, repeat_rule, start_date, anchor_date)
      values (v_user, v_root, btrim(p_text), p_priority, p_time, p_repeat, v_due, v_due);
    end if;
    update public.todos set text = btrim(p_text), priority = p_priority, due_date = v_due,
      scheduled_time = p_time, repeat_rule = p_repeat,
      series_id = case when p_repeat <> 'none' then v_root end,
      occurrence_date = case when p_repeat <> 'none' then v_due end, updated_at = now()
    where id = p_id and user_id = v_user;
    return;
  end if;
  if p_scope = 'single' then
    update public.todos set text = btrim(p_text), priority = p_priority, due_date = p_due_date,
      scheduled_time = p_time, updated_at = now() where id = p_id and user_id = v_user;
    return;
  end if;

  v_cutoff := v_task.occurrence_date;
  if p_due_date <> v_task.due_date then raise exception '修改系列时请保持日期不变，单次编辑可以改期'; end if;
  if not exists (select 1 from public.todo_series where user_id = v_user and root_id = v_task.series_id
    and start_date <= v_cutoff and (end_date is null or end_date >= v_cutoff)) then
    raise exception '该重复计划已停止，请选择仅修改这次';
  end if;
  select case when bool_or(end_date is null) then null else max(end_date) end into v_end
    from public.todo_series where user_id = v_user and root_id = v_task.series_id;
  -- Keep past versions and a stopped marker when the cutoff is the first occurrence.
  update public.todo_series set end_date = v_cutoff - 1
    where user_id = v_user and root_id = v_task.series_id and start_date <= v_cutoff
      and (end_date is null or end_date >= v_cutoff);
  delete from public.todo_series where user_id = v_user and root_id = v_task.series_id and start_date > v_cutoff;
  -- A segment starting exactly at the cutoff is replaced, not left overlapping.
  if p_repeat <> 'none' then
    delete from public.todo_series where user_id = v_user and root_id = v_task.series_id and start_date = v_cutoff;
    insert into public.todo_series (user_id, root_id, text, priority, scheduled_time, repeat_rule, start_date, end_date, anchor_date)
    values (v_user, v_task.series_id, btrim(p_text), p_priority, p_time, p_repeat, v_cutoff, v_end, v_cutoff);
  end if;
  -- Completed history and explicit skips survive rule changes.
  delete from public.todos where user_id = v_user and series_id = v_task.series_id
    and occurrence_date >= v_cutoff and not done and not skipped and id <> p_id;
  if p_repeat <> 'none' then
    update public.todos set text = btrim(p_text), priority = p_priority, scheduled_time = p_time,
      repeat_rule = p_repeat, updated_at = now()
    where user_id = v_user and series_id = v_task.series_id and occurrence_date >= v_cutoff and skipped;
  end if;
  if p_repeat = 'none' then
    update public.todos set text = btrim(p_text), priority = p_priority, scheduled_time = p_time,
      repeat_rule = 'none', updated_at = now() where id = p_id and user_id = v_user;
  elsif public.todo_matches_date(p_repeat, v_cutoff, v_cutoff) or v_task.done or v_task.skipped then
    update public.todos set text = btrim(p_text), priority = p_priority, scheduled_time = p_time,
      repeat_rule = p_repeat, updated_at = now() where id = p_id and user_id = v_user;
  else
    delete from public.todos where id = p_id and user_id = v_user;
  end if;
end;
$$;

create or replace function public.todo_remove(p_id uuid, p_scope text default 'single')
returns void language plpgsql security invoker set search_path = public as $$
declare v_user uuid := auth.uid(); v_task public.todos; v_cutoff date;
begin
  if v_user is null then raise exception '请先登录'; end if;
  if p_scope is null or p_scope not in ('single','future') then raise exception '请选择删除范围'; end if;
  select * into v_task from public.todos where id = p_id and user_id = v_user;
  if not found then raise exception '任务已不存在，请刷新后重试'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || coalesce(v_task.series_id, v_task.id)::text, 0));
  select * into v_task from public.todos where id = p_id and user_id = v_user for update;
  if not found then raise exception '任务已不存在，请刷新后重试'; end if;
  if v_task.series_id is null then
    delete from public.todos where id = p_id and user_id = v_user;
  elsif p_scope = 'single' then
    update public.todos set skipped = true, done = false, updated_at = now() where id = p_id and user_id = v_user;
  else
    v_cutoff := v_task.occurrence_date;
    update public.todo_series set end_date = v_cutoff - 1
      where user_id = v_user and root_id = v_task.series_id and start_date <= v_cutoff
        and (end_date is null or end_date >= v_cutoff);
    delete from public.todo_series where user_id = v_user and root_id = v_task.series_id and start_date > v_cutoff;
    delete from public.todos where user_id = v_user and series_id = v_task.series_id
      and occurrence_date >= v_cutoff and not done;
  end if;
end;
$$;

revoke all on function public.todo_prepare_insert() from public, anon;
revoke all on function public.todo_matches_date(text,date,date) from public, anon;
revoke all on function public.todo_ensure_occurrences(date,date) from public, anon;
revoke all on function public.todo_create(uuid,text,int,date,time,text,bigint) from public, anon;
revoke all on function public.todo_edit(uuid,text,int,date,time,text,text) from public, anon;
revoke all on function public.todo_remove(uuid,text) from public, anon;
grant execute on function public.todo_matches_date(text,date,date) to authenticated;
grant execute on function public.todo_ensure_occurrences(date,date) to authenticated;
grant execute on function public.todo_create(uuid,text,int,date,time,text,bigint) to authenticated;
grant execute on function public.todo_edit(uuid,text,int,date,time,text,text) to authenticated;
grant execute on function public.todo_remove(uuid,text) to authenticated;

notify pgrst, 'reload schema';
commit;
