create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  url text,
  category text not null default '未分类',
  tags text[] not null default '{}',
  status text not null check (status in ('todo', 'doing', 'done')),
  priority int not null check (priority in (1, 2, 3)),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  done boolean not null default false,
  priority int not null check (priority in (1, 2, 3)),
  due_date date not null,
  created_at timestamptz not null default now()
);

create table if not exists public.analysis_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  repo_url text not null,
  owner text not null,
  repo text not null,
  branch text not null,
  summary text not null default '',
  markdown text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.analysis_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_id uuid not null references public.analysis_reports(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.materials enable row level security;
alter table public.todos enable row level security;
alter table public.analysis_reports enable row level security;
alter table public.analysis_chats enable row level security;

drop policy if exists "materials_select_own" on public.materials;
drop policy if exists "materials_insert_own" on public.materials;
drop policy if exists "materials_update_own" on public.materials;
drop policy if exists "materials_delete_own" on public.materials;
drop policy if exists "todos_select_own" on public.todos;
drop policy if exists "todos_insert_own" on public.todos;
drop policy if exists "todos_update_own" on public.todos;
drop policy if exists "todos_delete_own" on public.todos;
drop policy if exists "analysis_reports_select_own" on public.analysis_reports;
drop policy if exists "analysis_reports_insert_own" on public.analysis_reports;
drop policy if exists "analysis_reports_update_own" on public.analysis_reports;
drop policy if exists "analysis_reports_delete_own" on public.analysis_reports;
drop policy if exists "analysis_chats_select_own" on public.analysis_chats;
drop policy if exists "analysis_chats_insert_own" on public.analysis_chats;
drop policy if exists "analysis_chats_delete_own" on public.analysis_chats;

create policy "materials_select_own" on public.materials
  for select using (auth.uid() = user_id);
create policy "materials_insert_own" on public.materials
  for insert with check (auth.uid() = user_id);
create policy "materials_update_own" on public.materials
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "materials_delete_own" on public.materials
  for delete using (auth.uid() = user_id);

create policy "todos_select_own" on public.todos
  for select using (auth.uid() = user_id);
create policy "todos_insert_own" on public.todos
  for insert with check (auth.uid() = user_id);
create policy "todos_update_own" on public.todos
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "todos_delete_own" on public.todos
  for delete using (auth.uid() = user_id);

create policy "analysis_reports_select_own" on public.analysis_reports
  for select using (auth.uid() = user_id);
create policy "analysis_reports_insert_own" on public.analysis_reports
  for insert with check (auth.uid() = user_id);
create policy "analysis_reports_update_own" on public.analysis_reports
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "analysis_reports_delete_own" on public.analysis_reports
  for delete using (auth.uid() = user_id);

create policy "analysis_chats_select_own" on public.analysis_chats
  for select using (auth.uid() = user_id);
create policy "analysis_chats_insert_own" on public.analysis_chats
  for insert with check (auth.uid() = user_id);
create policy "analysis_chats_delete_own" on public.analysis_chats
  for delete using (auth.uid() = user_id);

create index if not exists materials_user_updated_idx on public.materials (user_id, updated_at desc);
create index if not exists todos_user_due_date_idx on public.todos (user_id, due_date);
create index if not exists analysis_reports_user_created_idx on public.analysis_reports (user_id, created_at desc);
create index if not exists analysis_chats_report_created_idx on public.analysis_chats (user_id, report_id, created_at);
