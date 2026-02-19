-- Fix ambiguous student_id reference in invitation acceptance upsert.
-- Use explicit constraint target to avoid name collision with function output columns.

create or replace function public.accept_parent_child_invitation_secure(
  _token_hash text,
  _parent_user_id uuid,
  _parent_email text,
  _secret_code text
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
  normalized_secret_code text := upper(trim(coalesce(_secret_code, '')));
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

  if normalized_secret_code !~ '^[A-Z0-9]{8}$' then
    return;
  end if;

  update public.parent_child_link_invitations as i
  set
    status = 'accepted',
    accepted_at = now(),
    accepted_by_user_id = _parent_user_id,
    accepted_parent_email = normalized_email
  from public.students as s
  where i.token_hash = _token_hash
    and i.status = 'pending'
    and i.expires_at > now()
    and s.id = i.student_id
    and s.parent_secret_code_hash is not null
    and s.parent_secret_code_hash ~ '^sha256\$[0-9a-f]{32}\$[0-9a-f]{64}$'
    and s.parent_secret_code_hash = public.hash_parent_secret_code(
      normalized_secret_code,
      nullif(split_part(s.parent_secret_code_hash, '$', 2), '')
    )
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
  on conflict on constraint parent_child_links_unique
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

revoke all on function public.accept_parent_child_invitation_secure(text, uuid, text, text) from public;
grant execute on function public.accept_parent_child_invitation_secure(text, uuid, text, text) to authenticated, service_role;
