-- Normalized tests: assignments + attempts (Pelz putting MVP)
create table if not exists public.normalized_test_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  test_slug text not null,
  index_or_flag_label text,
  status text not null default 'assigned'
    check (status in ('assigned', 'in_progress', 'finalized')),
  assigned_at timestamp with time zone not null default now(),
  started_at timestamp with time zone,
  finalized_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists normalized_test_assignments_org_idx
  on public.normalized_test_assignments (org_id);
create index if not exists normalized_test_assignments_student_idx
  on public.normalized_test_assignments (student_id);
create index if not exists normalized_test_assignments_coach_idx
  on public.normalized_test_assignments (coach_id);
create index if not exists normalized_test_assignments_status_idx
  on public.normalized_test_assignments (status);

alter table public.normalized_test_assignments enable row level security;

alter table public.normalized_test_assignments
  add column if not exists index_or_flag_label text;

alter table public.normalized_test_assignments
  add column if not exists clubs_used text;

create table if not exists public.normalized_test_attempts (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.normalized_test_assignments(id) on delete cascade,
  subtest_key text not null,
  attempt_index integer not null check (attempt_index between 1 and 18),
  result_value text not null,
  points integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create unique index if not exists normalized_test_attempts_unique
  on public.normalized_test_attempts (assignment_id, subtest_key, attempt_index);
create index if not exists normalized_test_attempts_assignment_idx
  on public.normalized_test_attempts (assignment_id);

alter table public.normalized_test_attempts enable row level security;

alter table public.normalized_test_attempts
  drop constraint if exists normalized_test_attempts_attempt_index_check;

alter table public.normalized_test_attempts
  add constraint normalized_test_attempts_attempt_index_check
  check (attempt_index between 1 and 18);

-- Read access: org members, students, shared coaches
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'normalized_test_assignments'
      and policyname = 'normalized_test_assignments_org_read'
  ) then
    create policy normalized_test_assignments_org_read
      on public.normalized_test_assignments
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.org_id = normalized_test_assignments.org_id
            and p.role in ('owner', 'coach', 'staff')
        )
      );
  end if;
end $$;

-- Explicitly deny writes from authenticated clients (service role bypasses RLS)
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'normalized_test_assignments'
      and policyname = 'normalized_test_assignments_no_insert'
  ) then
    create policy normalized_test_assignments_no_insert
      on public.normalized_test_assignments
      for insert
      to authenticated
      with check (false);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'normalized_test_assignments'
      and policyname = 'normalized_test_assignments_no_update'
  ) then
    create policy normalized_test_assignments_no_update
      on public.normalized_test_assignments
      for update
      to authenticated
      using (false)
      with check (false);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'normalized_test_assignments'
      and policyname = 'normalized_test_assignments_no_delete'
  ) then
    create policy normalized_test_assignments_no_delete
      on public.normalized_test_assignments
      for delete
      to authenticated
      using (false);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'normalized_test_assignments'
      and policyname = 'normalized_test_assignments_student_read'
  ) then
    create policy normalized_test_assignments_student_read
      on public.normalized_test_assignments
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.students s
          where s.id = normalized_test_assignments.student_id
            and lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
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
      and tablename = 'normalized_test_attempts'
      and policyname = 'normalized_test_attempts_no_insert'
  ) then
    create policy normalized_test_attempts_no_insert
      on public.normalized_test_attempts
      for insert
      to authenticated
      with check (false);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'normalized_test_attempts'
      and policyname = 'normalized_test_attempts_no_update'
  ) then
    create policy normalized_test_attempts_no_update
      on public.normalized_test_attempts
      for update
      to authenticated
      using (false)
      with check (false);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'normalized_test_attempts'
      and policyname = 'normalized_test_attempts_no_delete'
  ) then
    create policy normalized_test_attempts_no_delete
      on public.normalized_test_attempts
      for delete
      to authenticated
      using (false);
  end if;
end $$;
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'normalized_test_assignments'
      and policyname = 'normalized_test_assignments_shared_read'
  ) then
    create policy normalized_test_assignments_shared_read
      on public.normalized_test_assignments
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.student_shares ss
          where ss.student_id = normalized_test_assignments.student_id
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
      and tablename = 'normalized_test_attempts'
      and policyname = 'normalized_test_attempts_org_read'
  ) then
    create policy normalized_test_attempts_org_read
      on public.normalized_test_attempts
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.normalized_test_assignments a
          join public.profiles p on p.id = auth.uid()
          where a.id = normalized_test_attempts.assignment_id
            and p.org_id = a.org_id
            and p.role in ('owner', 'coach', 'staff')
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
      and tablename = 'normalized_test_attempts'
      and policyname = 'normalized_test_attempts_student_read'
  ) then
    create policy normalized_test_attempts_student_read
      on public.normalized_test_attempts
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.normalized_test_assignments a
          join public.students s on s.id = a.student_id
          where a.id = normalized_test_attempts.assignment_id
            and lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
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
      and tablename = 'normalized_test_attempts'
      and policyname = 'normalized_test_attempts_shared_read'
  ) then
    create policy normalized_test_attempts_shared_read
      on public.normalized_test_attempts
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.normalized_test_assignments a
          join public.student_shares ss on ss.student_id = a.student_id
          where a.id = normalized_test_attempts.assignment_id
            and ss.status = 'active'
            and lower(ss.viewer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
      );
  end if;
end $$;
