-- Restrict students.email edits to the linked student account only.
-- Coach/staff/admin can still edit other student fields.

create or replace function public.guard_students_email_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.email is not distinct from old.email then
    return new;
  end if;

  -- Allow linked-row synchronization trigger to cascade email updates.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  -- Allow service/admin maintenance contexts.
  if coalesce(auth.role(), '') = 'service_role' or auth.uid() is null then
    return new;
  end if;

  if exists (
    select 1
    from public.student_accounts sa
    where sa.student_id = new.id
      and sa.user_id = auth.uid()
  ) then
    return new;
  end if;

  raise exception 'Seul l eleve peut modifier son email.'
    using errcode = '42501';
end;
$$;

drop trigger if exists guard_students_email_update_trigger on public.students;

create trigger guard_students_email_update_trigger
before update of email on public.students
for each row
execute function public.guard_students_email_update();
