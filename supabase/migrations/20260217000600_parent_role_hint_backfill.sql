-- Parent accounts hardening:
-- 1) Make auth trigger accept `parent` role hint (instead of coercing to coach)
-- 2) Backfill already-created parent accounts that were stamped as coach

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  student_org_id uuid;
  personal_org_id uuid;
  base_name text;
  role_hint text;
begin
  select org_id
  into student_org_id
  from public.students
  where lower(email) = lower(new.email)
  limit 1;

  if student_org_id is not null then
    insert into public.profiles (id, org_id, role, full_name, active_workspace_id)
    values (
      new.id,
      student_org_id,
      'student',
      new.raw_user_meta_data->>'full_name',
      student_org_id
    )
    on conflict (id) do nothing;

    return new;
  end if;

  role_hint := lower(coalesce(new.raw_user_meta_data->>'role', ''));
  if role_hint not in ('coach', 'owner', 'parent') then
    role_hint := 'coach';
  end if;

  base_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));

  insert into public.organizations (name, workspace_type, owner_profile_id)
  values (coalesce(base_name, 'Espace personnel'), 'personal', null)
  returning id into personal_org_id;

  insert into public.profiles (id, org_id, role, full_name, active_workspace_id)
  values (
    new.id,
    personal_org_id,
    role_hint,
    new.raw_user_meta_data->>'full_name',
    personal_org_id
  )
  on conflict (id) do update set
    org_id = excluded.org_id,
    role = excluded.role,
    full_name = excluded.full_name,
    active_workspace_id = excluded.active_workspace_id;

  update public.organizations
  set owner_profile_id = new.id
  where id = personal_org_id;

  insert into public.org_memberships (org_id, user_id, role, status, premium_active)
  values (personal_org_id, new.id, 'admin', 'active', true)
  on conflict (org_id, user_id) do nothing;

  return new;
end;
$$;

update public.profiles as p
set role = 'parent'
from auth.users as u
where u.id = p.id
  and p.role = 'coach'
  and lower(coalesce(u.raw_user_meta_data->>'role', '')) = 'parent';
