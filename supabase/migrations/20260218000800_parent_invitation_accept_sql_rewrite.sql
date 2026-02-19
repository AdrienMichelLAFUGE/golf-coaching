-- Rewrite secure invitation acceptance as SQL function.
-- Goal: remove PL/pgSQL variable ambiguities and keep atomic update + upsert.

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
language sql
security definer
set search_path = public
as $$
  with accepted as (
    update public.parent_child_link_invitations as i
    set
      status = 'accepted',
      accepted_at = now(),
      accepted_by_user_id = _parent_user_id,
      accepted_parent_email = lower(trim(coalesce(_parent_email, '')))
    from public.students as s
    where _token_hash ~ '^[0-9a-f]{64}$'
      and _parent_user_id is not null
      and lower(trim(coalesce(_parent_email, ''))) <> ''
      and upper(trim(coalesce(_secret_code, ''))) ~ '^[A-Z0-9]{8}$'
      and i.token_hash = _token_hash
      and i.status = 'pending'
      and i.expires_at > now()
      and s.id = i.student_id
      and s.parent_secret_code_hash is not null
      and s.parent_secret_code_hash ~ '^sha256\$[0-9a-f]{32}\$[0-9a-f]{64}$'
      and s.parent_secret_code_hash = public.hash_parent_secret_code(
        upper(trim(coalesce(_secret_code, ''))),
        nullif(split_part(s.parent_secret_code_hash, '$', 2), '')
      )
      and (
        i.target_parent_email is null
        or i.target_parent_email = lower(trim(coalesce(_parent_email, '')))
      )
    returning
      i.id,
      i.student_id,
      i.permissions,
      lower(trim(coalesce(_parent_email, ''))) as normalized_email
  ),
  upsert_link as (
    insert into public.parent_child_links (
      parent_user_id,
      student_id,
      parent_email,
      status,
      permissions,
      revoked_at,
      revoked_by
    )
    select
      _parent_user_id,
      a.student_id,
      a.normalized_email,
      'active',
      a.permissions,
      null,
      null
    from accepted as a
    on conflict on constraint parent_child_links_unique
    do update
      set
        parent_email = excluded.parent_email,
        status = 'active',
        permissions = excluded.permissions,
        revoked_at = null,
        revoked_by = null
    returning 1
  )
  select
    a.id::uuid as invitation_id,
    a.student_id::uuid as student_id,
    a.permissions::jsonb as permissions
  from accepted as a;
$$;

revoke all on function public.accept_parent_child_invitation_secure(text, uuid, text, text) from public;
grant execute on function public.accept_parent_child_invitation_secure(text, uuid, text, text) to authenticated, service_role;
