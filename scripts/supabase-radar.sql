-- Radar files (Flightscope/Trackman) extraction storage
create table if not exists public.radar_files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null,
  source text not null default 'flightscope'
    check (source in ('flightscope', 'trackman', 'unknown')),
  status text not null default 'processing'
    check (status in ('processing', 'ready', 'error')),
  original_name text,
  file_url text not null,
  file_mime text,
  columns jsonb not null default '[]',
  shots jsonb not null default '[]',
  stats jsonb not null default '{}',
  config jsonb not null default '{}',
  summary text,
  error text,
  extracted_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists radar_files_org_idx
  on public.radar_files (org_id, created_at desc);
create index if not exists radar_files_student_idx
  on public.radar_files (student_id, created_at desc);
create index if not exists radar_files_report_idx
  on public.radar_files (report_id);

alter table public.radar_files enable row level security;

drop policy if exists radar_files_org_select on public.radar_files;
drop policy if exists radar_files_org_insert on public.radar_files;
drop policy if exists radar_files_org_update on public.radar_files;
drop policy if exists radar_files_org_delete on public.radar_files;

create policy radar_files_org_select
  on public.radar_files
  for select
  to authenticated
  using (
    org_id::text = (
      select org_id::text from public.profiles where id = auth.uid()
    )
  );

create policy radar_files_org_insert
  on public.radar_files
  for insert
  to authenticated
  with check (
    org_id::text = (
      select org_id::text from public.profiles where id = auth.uid()
    )
  );

create policy radar_files_org_update
  on public.radar_files
  for update
  to authenticated
  using (
    org_id::text = (
      select org_id::text from public.profiles where id = auth.uid()
    )
  )
  with check (
    org_id::text = (
      select org_id::text from public.profiles where id = auth.uid()
    )
  );

create policy radar_files_org_delete
  on public.radar_files
  for delete
  to authenticated
  using (
    org_id::text = (
      select org_id::text from public.profiles where id = auth.uid()
    )
  );

-- Report sections link to radar files + per-report config override
alter table public.report_sections
  add column if not exists radar_file_id uuid
    references public.radar_files(id) on delete set null,
  add column if not exists radar_config jsonb;
