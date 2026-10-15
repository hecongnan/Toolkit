-- Fresh installs only: run this file, then migrations/20261002_todo_recurrence.sql.
-- Existing Todo 3.0 databases need no SQL for the action-workspace redesign.
-- Retired materials/report tables in existing databases are deliberately not dropped.
create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  done boolean not null default false,
  priority int not null check (priority in (1, 2, 3)),
  due_date date not null,
  scheduled_time time,
  repeat_rule text not null default 'none'
    constraint todos_repeat_rule_check check (repeat_rule in ('none', 'daily', 'weekdays', 'weekly')),
  series_id uuid,
  position bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.todos add column if not exists scheduled_time time;
alter table public.todos add column if not exists repeat_rule text not null default 'none';
alter table public.todos add column if not exists series_id uuid;
alter table public.todos add column if not exists position bigint not null default 0;
alter table public.todos add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'todos_repeat_rule_check'
  ) then
    alter table public.todos add constraint todos_repeat_rule_check
      check (repeat_rule in ('none', 'daily', 'weekdays', 'weekly'));
  end if;
end $$;

alter table public.todos enable row level security;

drop policy if exists "todos_select_own" on public.todos;
drop policy if exists "todos_insert_own" on public.todos;
drop policy if exists "todos_update_own" on public.todos;
drop policy if exists "todos_delete_own" on public.todos;

create policy "todos_select_own" on public.todos
  for select using (auth.uid() = user_id);
create policy "todos_insert_own" on public.todos
  for insert with check (auth.uid() = user_id);
create policy "todos_update_own" on public.todos
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "todos_delete_own" on public.todos
  for delete using (auth.uid() = user_id);

create index if not exists todos_user_due_date_idx on public.todos (user_id, due_date);
create index if not exists todos_user_due_order_idx on public.todos (user_id, due_date, done, position);
create unique index if not exists todos_series_date_idx
  on public.todos (user_id, series_id, due_date) where series_id is not null;
