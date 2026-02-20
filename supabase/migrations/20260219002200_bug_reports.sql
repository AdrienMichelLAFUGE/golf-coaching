create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reporter_user_id uuid references public.profiles(id) on delete set null,
  workspace_org_id uuid references public.organizations(id) on delete set null,
  reporter_role text,
  title text not null,
  description text not null,
  severity text not null default 'medium',
  status text not null default 'new',
  page_path text not null,
  user_agent text,
  context jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  constraint bug_reports_severity_check
    check (severity = any (array['low'::text, 'medium'::text, 'high'::text, 'critical'::text])),
  constraint bug_reports_status_check
    check (status = any (array['new'::text, 'in_progress'::text, 'fixed'::text, 'closed'::text])),
  constraint bug_reports_title_length_check
    check (char_length(btrim(title)) between 3 and 160),
  constraint bug_reports_description_length_check
    check (char_length(btrim(description)) between 10 and 6000),
  constraint bug_reports_page_path_length_check
    check (char_length(btrim(page_path)) between 1 and 400)
);

create index if not exists bug_reports_created_at_idx
  on public.bug_reports (created_at desc);

create index if not exists bug_reports_status_created_at_idx
  on public.bug_reports (status, created_at desc);

create index if not exists bug_reports_severity_created_at_idx
  on public.bug_reports (severity, created_at desc);

create index if not exists bug_reports_workspace_created_at_idx
  on public.bug_reports (workspace_org_id, created_at desc);

alter table public.bug_reports enable row level security;

drop policy if exists bug_reports_no_read on public.bug_reports;
create policy bug_reports_no_read
on public.bug_reports
for select to authenticated
using (false);

drop policy if exists bug_reports_no_insert on public.bug_reports;
create policy bug_reports_no_insert
on public.bug_reports
for insert to authenticated
with check (false);

drop policy if exists bug_reports_no_update on public.bug_reports;
create policy bug_reports_no_update
on public.bug_reports
for update to authenticated
using (false)
with check (false);

drop policy if exists bug_reports_no_delete on public.bug_reports;
create policy bug_reports_no_delete
on public.bug_reports
for delete to authenticated
using (false);
