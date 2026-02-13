create table if not exists public.app_activity_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  level text not null default 'info',
  action text not null,
  source text not null default 'api',
  actor_user_id uuid references public.profiles(id) on delete set null,
  org_id uuid references public.organizations(id) on delete set null,
  entity_type text,
  entity_id uuid,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  constraint app_activity_logs_level_check
    check (level = any (array['info'::text, 'warn'::text, 'error'::text]))
);

create index if not exists app_activity_logs_created_at_idx
  on public.app_activity_logs (created_at desc);

create index if not exists app_activity_logs_action_created_at_idx
  on public.app_activity_logs (action, created_at desc);

create index if not exists app_activity_logs_actor_created_at_idx
  on public.app_activity_logs (actor_user_id, created_at desc);

create index if not exists app_activity_logs_org_created_at_idx
  on public.app_activity_logs (org_id, created_at desc);

alter table public.app_activity_logs enable row level security;

drop policy if exists app_activity_logs_no_read on public.app_activity_logs;
create policy app_activity_logs_no_read
on public.app_activity_logs
for select to authenticated
using (false);

drop policy if exists app_activity_logs_no_insert on public.app_activity_logs;
create policy app_activity_logs_no_insert
on public.app_activity_logs
for insert to authenticated
with check (false);

drop policy if exists app_activity_logs_no_update on public.app_activity_logs;
create policy app_activity_logs_no_update
on public.app_activity_logs
for update to authenticated
using (false)
with check (false);

drop policy if exists app_activity_logs_no_delete on public.app_activity_logs;
create policy app_activity_logs_no_delete
on public.app_activity_logs
for delete to authenticated
using (false);
