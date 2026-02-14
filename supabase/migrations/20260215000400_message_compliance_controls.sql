alter table if exists public.organizations
  add column if not exists messaging_guard_mode text not null default 'flag',
  add column if not exists messaging_sensitive_words text[] not null default '{}'::text[],
  add column if not exists messaging_retention_days integer not null default 365,
  add column if not exists messaging_charter_version integer not null default 1,
  add column if not exists messaging_supervision_enabled boolean not null default true;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_messaging_guard_mode_check'
  ) then
    alter table public.organizations
      add constraint organizations_messaging_guard_mode_check
      check (messaging_guard_mode = any (array['flag'::text, 'block'::text]));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_messaging_retention_days_check'
  ) then
    alter table public.organizations
      add constraint organizations_messaging_retention_days_check
      check (messaging_retention_days between 30 and 3650);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_messaging_charter_version_check'
  ) then
    alter table public.organizations
      add constraint organizations_messaging_charter_version_check
      check (messaging_charter_version >= 1);
  end if;
end
$$;

alter table if exists public.message_threads
  add column if not exists frozen_at timestamptz,
  add column if not exists frozen_by uuid references public.profiles(id) on delete set null,
  add column if not exists frozen_reason text;

create index if not exists message_threads_frozen_idx
  on public.message_threads (workspace_org_id, frozen_at desc nulls last);

create table if not exists public.message_user_charter_acceptances (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  charter_version integer not null check (charter_version >= 1),
  accepted_at timestamptz not null default now(),
  constraint message_user_charter_acceptances_org_user_version_unique
    unique (org_id, user_id, charter_version)
);

create index if not exists message_user_charter_acceptances_org_user_idx
  on public.message_user_charter_acceptances (org_id, user_id, accepted_at desc);

create table if not exists public.message_reports (
  id uuid primary key default gen_random_uuid(),
  workspace_org_id uuid not null references public.organizations(id) on delete cascade,
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  message_id bigint references public.message_messages(id) on delete set null,
  reported_by uuid references public.profiles(id) on delete set null,
  reason text not null,
  details text,
  snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  freeze_applied boolean not null default false,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_reports_reason_check
    check (char_length(trim(reason)) between 3 and 200),
  constraint message_reports_details_check
    check (details is null or char_length(trim(details)) <= 1000),
  constraint message_reports_status_check
    check (status = any (array['open'::text, 'in_review'::text, 'resolved'::text]))
);

create index if not exists message_reports_workspace_status_idx
  on public.message_reports (workspace_org_id, status, created_at desc);

create index if not exists message_reports_thread_idx
  on public.message_reports (thread_id, created_at desc);

create index if not exists message_reports_reported_by_idx
  on public.message_reports (reported_by, created_at desc);

drop trigger if exists set_message_reports_updated_at on public.message_reports;
create trigger set_message_reports_updated_at
before update on public.message_reports
for each row
execute function public.set_updated_at();

create table if not exists public.message_moderation_audit (
  id uuid primary key default gen_random_uuid(),
  workspace_org_id uuid not null references public.organizations(id) on delete cascade,
  report_id uuid references public.message_reports(id) on delete set null,
  thread_id uuid references public.message_threads(id) on delete set null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists message_moderation_audit_workspace_idx
  on public.message_moderation_audit (workspace_org_id, created_at desc);

create index if not exists message_moderation_audit_action_idx
  on public.message_moderation_audit (action, created_at desc);

create table if not exists public.message_content_flags (
  id uuid primary key default gen_random_uuid(),
  workspace_org_id uuid not null references public.organizations(id) on delete cascade,
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  message_id bigint not null references public.message_messages(id) on delete cascade,
  sender_user_id uuid references public.profiles(id) on delete set null,
  flag_type text not null,
  matched_value text not null,
  created_at timestamptz not null default now(),
  constraint message_content_flags_type_check
    check (flag_type = any (array['email'::text, 'phone'::text, 'url'::text, 'keyword'::text]))
);

create index if not exists message_content_flags_workspace_created_idx
  on public.message_content_flags (workspace_org_id, created_at desc);

create index if not exists message_content_flags_sender_created_idx
  on public.message_content_flags (sender_user_id, created_at desc);

create index if not exists message_content_flags_message_idx
  on public.message_content_flags (message_id);

alter table public.message_user_charter_acceptances enable row level security;
alter table public.message_reports enable row level security;
alter table public.message_moderation_audit enable row level security;
alter table public.message_content_flags enable row level security;

drop policy if exists message_user_charter_acceptances_no_select on public.message_user_charter_acceptances;
create policy message_user_charter_acceptances_no_select
on public.message_user_charter_acceptances
for select to authenticated
using (false);

drop policy if exists message_user_charter_acceptances_no_insert on public.message_user_charter_acceptances;
create policy message_user_charter_acceptances_no_insert
on public.message_user_charter_acceptances
for insert to authenticated
with check (false);

drop policy if exists message_user_charter_acceptances_no_update on public.message_user_charter_acceptances;
create policy message_user_charter_acceptances_no_update
on public.message_user_charter_acceptances
for update to authenticated
using (false)
with check (false);

drop policy if exists message_user_charter_acceptances_no_delete on public.message_user_charter_acceptances;
create policy message_user_charter_acceptances_no_delete
on public.message_user_charter_acceptances
for delete to authenticated
using (false);

drop policy if exists message_reports_no_select on public.message_reports;
create policy message_reports_no_select
on public.message_reports
for select to authenticated
using (false);

drop policy if exists message_reports_no_insert on public.message_reports;
create policy message_reports_no_insert
on public.message_reports
for insert to authenticated
with check (false);

drop policy if exists message_reports_no_update on public.message_reports;
create policy message_reports_no_update
on public.message_reports
for update to authenticated
using (false)
with check (false);

drop policy if exists message_reports_no_delete on public.message_reports;
create policy message_reports_no_delete
on public.message_reports
for delete to authenticated
using (false);

drop policy if exists message_moderation_audit_no_select on public.message_moderation_audit;
create policy message_moderation_audit_no_select
on public.message_moderation_audit
for select to authenticated
using (false);

drop policy if exists message_moderation_audit_no_insert on public.message_moderation_audit;
create policy message_moderation_audit_no_insert
on public.message_moderation_audit
for insert to authenticated
with check (false);

drop policy if exists message_moderation_audit_no_update on public.message_moderation_audit;
create policy message_moderation_audit_no_update
on public.message_moderation_audit
for update to authenticated
using (false)
with check (false);

drop policy if exists message_moderation_audit_no_delete on public.message_moderation_audit;
create policy message_moderation_audit_no_delete
on public.message_moderation_audit
for delete to authenticated
using (false);

drop policy if exists message_content_flags_no_select on public.message_content_flags;
create policy message_content_flags_no_select
on public.message_content_flags
for select to authenticated
using (false);

drop policy if exists message_content_flags_no_insert on public.message_content_flags;
create policy message_content_flags_no_insert
on public.message_content_flags
for insert to authenticated
with check (false);

drop policy if exists message_content_flags_no_update on public.message_content_flags;
create policy message_content_flags_no_update
on public.message_content_flags
for update to authenticated
using (false)
with check (false);

drop policy if exists message_content_flags_no_delete on public.message_content_flags;
create policy message_content_flags_no_delete
on public.message_content_flags
for delete to authenticated
using (false);

create or replace function public.purge_message_data()
returns table (
  redacted_messages bigint,
  deleted_reports bigint
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  redacted_count bigint := 0;
  deleted_reports_count bigint := 0;
begin
  with to_redact as (
    select mm.id
    from public.message_messages mm
    join public.message_threads mt on mt.id = mm.thread_id
    join public.organizations org on org.id = mt.workspace_org_id
    where
      mm.created_at < now() - make_interval(days => org.messaging_retention_days)
      and mm.body <> '[message purge - retention]'
  )
  update public.message_messages mm
  set body = '[message purge - retention]'
  from to_redact
  where mm.id = to_redact.id;

  get diagnostics redacted_count = row_count;

  delete from public.message_reports reports
  where
    reports.status = 'resolved'
    and reports.created_at < now() - interval '730 days';

  get diagnostics deleted_reports_count = row_count;

  return query
  select redacted_count, deleted_reports_count;
end;
$$;
