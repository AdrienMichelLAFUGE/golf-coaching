-- Student settings: avatar + anonymization
alter table public.students
  add column if not exists avatar_url text,
  add column if not exists deleted_at timestamp with time zone;

alter table public.profiles
  add column if not exists deleted_at timestamp with time zone;

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

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_student_update'
  ) then
    create policy profiles_student_update
      on public.profiles
      for update
      to authenticated
      using (
        id = auth.uid()
        and role = 'student'
        and deleted_at is null
      )
      with check (
        id = auth.uid()
        and role = 'student'
      );
  end if;
end $$;
