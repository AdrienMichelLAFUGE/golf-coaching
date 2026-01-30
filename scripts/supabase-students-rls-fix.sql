-- Fix RLS: restrict updates on students to org members + self
alter table public.students enable row level security;
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'students'
      and cmd = 'UPDATE'
  loop
    execute format('drop policy if exists %I on public.students', r.policyname);
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'students'
      and policyname = 'students_org_update'
  ) then
    create policy students_org_update
      on public.students
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.org_id = students.org_id
            and p.role in ('owner', 'coach', 'staff')
        )
      )
      with check (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.org_id = students.org_id
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
      and tablename = 'students'
      and policyname = 'students_self_update'
  ) then
    create policy students_self_update
      on public.students
      for update
      to authenticated
      using (
        students.deleted_at is null
        and lower(students.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'student'
        )
      )
      with check (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'student'
        )
        and (
          lower(students.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          or (
            students.deleted_at is not null
            and lower(students.email) like 'deleted+%'
          )
        )
      );
  end if;
end $$;
