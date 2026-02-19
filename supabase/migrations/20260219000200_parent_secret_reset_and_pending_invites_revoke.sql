-- V2 safety reset:
-- - force explicit secret generation (step 1 starts as not completed)
-- - revoke all pending parent invitations that were issued with previous secrets

update public.students
set
  parent_secret_code_plain = null,
  parent_secret_code_hash = null,
  parent_secret_code_rotated_at = null
where
  parent_secret_code_plain is not null
  or parent_secret_code_hash is not null
  or parent_secret_code_rotated_at is not null;

update public.parent_child_link_invitations
set
  status = 'revoked',
  revoked_at = coalesce(revoked_at, now()),
  revoked_by = null
where
  status = 'pending';
