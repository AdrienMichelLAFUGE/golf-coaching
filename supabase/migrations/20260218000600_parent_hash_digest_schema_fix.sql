-- Fix hash helper: pgcrypto digest is installed in schema `extensions`.
-- Ensure the function works even with search_path limited to public.

create or replace function public.hash_parent_secret_code(_code text, _salt text default null)
returns text
language plpgsql
set search_path = public
as $$
declare
  normalized_code text := upper(coalesce(_code, ''));
  effective_salt text := nullif(_salt, '');
begin
  if effective_salt is null then
    effective_salt := replace(gen_random_uuid()::text, '-', '');
  end if;

  return 'sha256$'
    || effective_salt
    || '$'
    || encode(extensions.digest(effective_salt || ':' || normalized_code, 'sha256'), 'hex');
end;
$$;
