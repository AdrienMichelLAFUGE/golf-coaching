-- Student sharing between coaches (read-only for viewer, double consent)
create table if not exists public.student_shares (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  viewer_id uuid references public.profiles(id) on delete set null,
  viewer_email text not null,
  student_email text not null,
  status text not null default 'pending_coach'
    check (
      status in (
        'pending_coach',
        'pending_student',
        'active',
        'rejected_coach',
        'rejected_student',
        'revoked'
      )
    ),
  coach_accepted_at timestamp with time zone,
  coach_declined_at timestamp with time zone,
  student_accepted_at timestamp with time zone,
  student_declined_at timestamp with time zone,
  revoked_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint student_shares_viewer_email_lowercase check (viewer_email = lower(viewer_email)),
  constraint student_shares_student_email_lowercase check (student_email = lower(student_email))
);

alter table public.student_shares
  add column if not exists student_email text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'student_shares_student_email_lowercase'
  ) then
    alter table public.student_shares
      add constraint student_shares_student_email_lowercase
      check (student_email = lower(student_email));
  end if;
end $$;

-- Backfill student_email if the column was added to an existing table.
update public.student_shares ss
set student_email = lower(s.email)
from public.students s
where ss.student_id = s.id
  and ss.student_email is null;

alter table public.student_shares
  alter column student_email set not null;

create unique index if not exists student_shares_unique_viewer
  on public.student_shares (student_id, viewer_email);
create index if not exists student_shares_student_idx
  on public.student_shares (student_id);
create index if not exists student_shares_viewer_idx
  on public.student_shares (viewer_email, status);
create index if not exists student_shares_owner_idx
  on public.student_shares (owner_id, status);

alter table public.student_shares enable row level security;

drop policy if exists student_shares_student_select on public.student_shares;
drop policy if exists student_shares_student_update on public.student_shares;
drop policy if exists student_shares_student_revoke on public.student_shares;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'student_shares'
      and policyname = 'student_shares_owner_select'
  ) then
    create policy student_shares_owner_select
      on public.student_shares
      for select
      to authenticated
      using (owner_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'student_shares'
      and policyname = 'student_shares_viewer_select'
  ) then
    create policy student_shares_viewer_select
      on public.student_shares
      for select
      to authenticated
      using (
        lower(viewer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'student_shares'
      and policyname = 'student_shares_student_select'
  ) then
    create policy student_shares_student_select
      on public.student_shares
      for select
      to authenticated
      using (
        lower(student_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'student_shares'
      and policyname = 'student_shares_owner_insert'
  ) then
    create policy student_shares_owner_insert
      on public.student_shares
      for insert
      to authenticated
      with check (
        owner_id = auth.uid()
        and (
          select role from public.profiles where id = auth.uid()
        ) = 'owner'
        and exists (
          select 1
          from public.students s
          where s.id = student_shares.student_id
            and s.org_id = (
              select org_id from public.profiles where id = auth.uid()
            )
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'student_shares'
      and policyname = 'student_shares_viewer_update'
  ) then
    create policy student_shares_viewer_update
      on public.student_shares
      for update
      to authenticated
      using (
        status = 'pending_coach'
        and lower(viewer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
      with check (
        lower(viewer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and viewer_id = auth.uid()
        and (
          (status = 'pending_student' and coach_accepted_at is not null)
          or (status = 'rejected_coach' and coach_declined_at is not null)
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'student_shares'
      and policyname = 'student_shares_student_update'
  ) then
    create policy student_shares_student_update
      on public.student_shares
      for update
      to authenticated
      using (
        status = 'pending_student'
        and lower(student_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
      with check (
        lower(student_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and (
          (status = 'active' and student_accepted_at is not null)
          or (status = 'rejected_student' and student_declined_at is not null)
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'student_shares'
      and policyname = 'student_shares_owner_revoke'
  ) then
    create policy student_shares_owner_revoke
      on public.student_shares
      for update
      to authenticated
      using (owner_id = auth.uid())
      with check (status = 'revoked' and revoked_at is not null);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'student_shares'
      and policyname = 'student_shares_student_revoke'
  ) then
    create policy student_shares_student_revoke
      on public.student_shares
      for update
      to authenticated
      using (
        status = 'active'
        and lower(student_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
      with check (status = 'revoked' and revoked_at is not null);
  end if;
end $$;

-- Shared read access for students and content
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'students'
      and policyname = 'students_shared_read'
  ) then
    create policy students_shared_read
      on public.students
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.student_shares ss
          where ss.student_id = students.id
            and ss.status = 'active'
            and lower(ss.viewer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'reports'
      and policyname = 'reports_shared_read'
  ) then
    create policy reports_shared_read
      on public.reports
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.student_shares ss
          where ss.student_id = reports.student_id
            and ss.status = 'active'
            and lower(ss.viewer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'report_sections'
      and policyname = 'report_sections_shared_read'
  ) then
    create policy report_sections_shared_read
      on public.report_sections
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.reports r
          join public.student_shares ss on ss.student_id = r.student_id
          where r.id = report_sections.report_id
            and ss.status = 'active'
            and lower(ss.viewer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'radar_files'
      and policyname = 'radar_files_shared_read'
  ) then
    create policy radar_files_shared_read
      on public.radar_files
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.student_shares ss
          where ss.student_id = radar_files.student_id
            and ss.status = 'active'
            and lower(ss.viewer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tpi_reports'
      and policyname = 'tpi_reports_shared_read'
  ) then
    create policy tpi_reports_shared_read
      on public.tpi_reports
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.student_shares ss
          where ss.student_id = tpi_reports.student_id
            and ss.status = 'active'
            and lower(ss.viewer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tpi_tests'
      and policyname = 'tpi_tests_shared_read'
  ) then
    create policy tpi_tests_shared_read
      on public.tpi_tests
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.tpi_reports tr
          join public.student_shares ss on ss.student_id = tr.student_id
          where tr.id = tpi_tests.report_id
            and ss.status = 'active'
            and lower(ss.viewer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
      );
  end if;
end $$;
