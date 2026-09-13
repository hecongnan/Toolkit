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

create index if not exists todos_user_due_order_idx
  on public.todos (user_id, due_date, done, position);

create unique index if not exists todos_series_date_idx
  on public.todos (user_id, series_id, due_date) where series_id is not null;
