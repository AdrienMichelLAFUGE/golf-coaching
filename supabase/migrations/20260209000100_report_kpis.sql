-- Add AI-generated KPI snapshots per published report.

create table if not exists public.report_kpis (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  status text not null check (status in ('pending', 'ready', 'error')),
  input_hash text not null,
  prompt_version text not null default 'v1',
  model text,
  kpis_short jsonb not null default '[]'::jsonb,
  kpis_long jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create unique index if not exists report_kpis_report_id_key on public.report_kpis (report_id);
create index if not exists report_kpis_student_updated_idx on public.report_kpis (student_id, updated_at desc);
create index if not exists report_kpis_org_updated_idx on public.report_kpis (org_id, updated_at desc);

drop trigger if exists set_report_kpis_updated_at on public.report_kpis;
create trigger set_report_kpis_updated_at
before update on public.report_kpis
for each row execute function public.set_updated_at();

alter table public.report_kpis enable row level security;

drop policy if exists report_kpis_read on public.report_kpis;
create policy report_kpis_read
on public.report_kpis
for select
to authenticated
using (
  (
    public.is_current_workspace(org_id)
    and public.is_personal_workspace(org_id)
  )
  or (
    public.is_current_workspace(org_id)
    and public.is_org_member(org_id)
  )
  or exists (
    select 1
    from public.reports r
    join public.students s on s.id = r.student_id
    where r.id = report_kpis.report_id
      and lower(s.email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text))
  )
);

