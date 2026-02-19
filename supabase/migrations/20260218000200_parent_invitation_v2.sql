-- Parent invitation V2:
-- - tokenized invitation flow (hash-only storage)
-- - student or coach can issue parent invitations
-- - atomic invitation acceptance + parent_child_links upsert

create table if not exists public.parent_child_link_invitations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_by_role text not null,
  target_parent_email text,
  token_hash text not null unique,
  permissions jsonb not null default
    '{"dashboard":true,"rapports":true,"tests":true,"calendrier":true,"messages":true}'::jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by_user_id uuid references public.profiles(id) on delete set null,
  accepted_parent_email text,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null
);

alter table public.parent_child_link_invitations
  drop constraint if exists parent_child_link_invitations_created_by_role_check;

alter table public.parent_child_link_invitations
  add constraint parent_child_link_invitations_created_by_role_check
  check (created_by_role = any (array['owner'::text, 'coach'::text, 'staff'::text, 'student'::text]));

alter table public.parent_child_link_invitations
  drop constraint if exists parent_child_link_invitations_status_check;

alter table public.parent_child_link_invitations
  add constraint parent_child_link_invitations_status_check
  check (status = any (array['pending'::text, 'accepted'::text, 'revoked'::text]));

alter table public.parent_child_link_invitations
  drop constraint if exists parent_child_link_invitations_token_hash_check;

alter table public.parent_child_link_invitations
  add constraint parent_child_link_invitations_token_hash_check
  check (token_hash ~ '^[0-9a-f]{64}$');

alter table public.parent_child_link_invitations
  drop constraint if exists parent_child_link_invitations_target_parent_email_check;

alter table public.parent_child_link_invitations
  add constraint parent_child_link_invitations_target_parent_email_check
  check (
    target_parent_email is null
    or target_parent_email = lower(target_parent_email)
  );

alter table public.parent_child_link_invitations
  drop constraint if exists parent_child_link_invitations_accepted_parent_email_check;

alter table public.parent_child_link_invitations
  add constraint parent_child_link_invitations_accepted_parent_email_check
  check (
    accepted_parent_email is null
    or accepted_parent_email = lower(accepted_parent_email)
  );

alter table public.parent_child_link_invitations
  drop constraint if exists parent_child_link_invitations_permissions_check;

alter table public.parent_child_link_invitations
  add constraint parent_child_link_invitations_permissions_check
  check (
    jsonb_typeof(permissions) = 'object'
    and permissions ?& array['dashboard', 'rapports', 'tests', 'calendrier', 'messages']
    and (permissions - 'dashboard' - 'rapports' - 'tests' - 'calendrier' - 'messages') = '{}'::jsonb
    and jsonb_typeof(permissions -> 'dashboard') = 'boolean'
    and jsonb_typeof(permissions -> 'rapports') = 'boolean'
    and jsonb_typeof(permissions -> 'tests') = 'boolean'
    and jsonb_typeof(permissions -> 'calendrier') = 'boolean'
    and jsonb_typeof(permissions -> 'messages') = 'boolean'
  );

alter table public.parent_child_link_invitations
  drop constraint if exists parent_child_link_invitations_expiration_check;

alter table public.parent_child_link_invitations
  add constraint parent_child_link_invitations_expiration_check
  check (expires_at > created_at);

create index if not exists parent_child_link_invitations_student_status_idx
  on public.parent_child_link_invitations (student_id, status);

create index if not exists parent_child_link_invitations_status_expires_idx
  on public.parent_child_link_invitations (status, expires_at);

create index if not exists parent_child_link_invitations_created_by_idx
  on public.parent_child_link_invitations (created_by_user_id, created_at desc);

create or replace function public.accept_parent_child_invitation(
  _token_hash text,
  _parent_user_id uuid,
  _parent_email text
)
returns table (
  invitation_id uuid,
  student_id uuid,
  permissions jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(coalesce(_parent_email, '')));
  accepted_invitation record;
begin
  if _token_hash is null or _token_hash !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  if _parent_user_id is null then
    return;
  end if;

  if normalized_email = '' then
    return;
  end if;

  update public.parent_child_link_invitations as i
  set
    status = 'accepted',
    accepted_at = now(),
    accepted_by_user_id = _parent_user_id,
    accepted_parent_email = normalized_email
  where i.token_hash = _token_hash
    and i.status = 'pending'
    and i.expires_at > now()
    and (i.target_parent_email is null or i.target_parent_email = normalized_email)
  returning i.id, i.student_id, i.permissions
  into accepted_invitation;

  if not found then
    return;
  end if;

  insert into public.parent_child_links (
    parent_user_id,
    student_id,
    parent_email,
    status,
    permissions,
    revoked_at,
    revoked_by
  )
  values (
    _parent_user_id,
    accepted_invitation.student_id,
    normalized_email,
    'active',
    accepted_invitation.permissions,
    null,
    null
  )
  on conflict (parent_user_id, student_id)
  do update set
    parent_email = excluded.parent_email,
    status = 'active',
    permissions = excluded.permissions,
    revoked_at = null,
    revoked_by = null;

  return query
  select
    accepted_invitation.id::uuid,
    accepted_invitation.student_id::uuid,
    accepted_invitation.permissions::jsonb;
end;
$$;

revoke all on function public.accept_parent_child_invitation(text, uuid, text) from public;
grant execute on function public.accept_parent_child_invitation(text, uuid, text) to authenticated, service_role;

alter table public.parent_child_link_invitations enable row level security;

drop policy if exists parent_child_link_invitations_manage_select on public.parent_child_link_invitations;
drop policy if exists parent_child_link_invitations_manage_insert on public.parent_child_link_invitations;
drop policy if exists parent_child_link_invitations_manage_update on public.parent_child_link_invitations;
drop policy if exists parent_child_link_invitations_manage_delete on public.parent_child_link_invitations;

create policy parent_child_link_invitations_manage_select
on public.parent_child_link_invitations
for select
to authenticated
using (
  exists (
    select 1
    from public.student_accounts sa
    where sa.student_id = parent_child_link_invitations.student_id
      and sa.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.students s
    join public.org_memberships om
      on om.org_id = s.org_id
    where s.id = parent_child_link_invitations.student_id
      and om.user_id = auth.uid()
      and om.status = 'active'::text
      and om.role = any (array['admin'::text, 'coach'::text])
  )
);

create policy parent_child_link_invitations_manage_insert
on public.parent_child_link_invitations
for insert
to authenticated
with check (
  created_by_user_id = auth.uid()
  and (
    exists (
      select 1
      from public.student_accounts sa
      where sa.student_id = parent_child_link_invitations.student_id
        and sa.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.students s
      join public.org_memberships om
        on om.org_id = s.org_id
      where s.id = parent_child_link_invitations.student_id
        and om.user_id = auth.uid()
        and om.status = 'active'::text
        and om.role = any (array['admin'::text, 'coach'::text])
    )
  )
);

create policy parent_child_link_invitations_manage_update
on public.parent_child_link_invitations
for update
to authenticated
using (
  exists (
    select 1
    from public.student_accounts sa
    where sa.student_id = parent_child_link_invitations.student_id
      and sa.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.students s
    join public.org_memberships om
      on om.org_id = s.org_id
    where s.id = parent_child_link_invitations.student_id
      and om.user_id = auth.uid()
      and om.status = 'active'::text
      and om.role = any (array['admin'::text, 'coach'::text])
  )
)
with check (
  exists (
    select 1
    from public.student_accounts sa
    where sa.student_id = parent_child_link_invitations.student_id
      and sa.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.students s
    join public.org_memberships om
      on om.org_id = s.org_id
    where s.id = parent_child_link_invitations.student_id
      and om.user_id = auth.uid()
      and om.status = 'active'::text
      and om.role = any (array['admin'::text, 'coach'::text])
  )
);

create policy parent_child_link_invitations_manage_delete
on public.parent_child_link_invitations
for delete
to authenticated
using (
  exists (
    select 1
    from public.student_accounts sa
    where sa.student_id = parent_child_link_invitations.student_id
      and sa.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.students s
    join public.org_memberships om
      on om.org_id = s.org_id
    where s.id = parent_child_link_invitations.student_id
      and om.user_id = auth.uid()
      and om.status = 'active'::text
      and om.role = any (array['admin'::text, 'coach'::text])
  )
);
