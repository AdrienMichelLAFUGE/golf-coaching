-- Parent accounts MVP:
-- - add `parent` role
-- - add student secret code columns
-- - create parent_child_links table + RLS

alter table public.profiles
drop constraint if exists profiles_role_check;

alter table public.profiles
add constraint profiles_role_check
check (role = any (array['owner'::text, 'coach'::text, 'staff'::text, 'student'::text, 'parent'::text]));

alter table public.students
add column if not exists parent_secret_code_plain text;

alter table public.students
add column if not exists parent_secret_code_hash text;

alter table public.students
add column if not exists parent_secret_code_rotated_at timestamptz;

alter table public.students
drop constraint if exists students_parent_secret_code_plain_check;

alter table public.students
add constraint students_parent_secret_code_plain_check
check (
  parent_secret_code_plain is null
  or parent_secret_code_plain ~ '^[A-Z0-9]{8}$'
);

alter table public.students
drop constraint if exists students_parent_secret_code_hash_check;

alter table public.students
add constraint students_parent_secret_code_hash_check
check (
  parent_secret_code_hash is null
  or parent_secret_code_hash ~ '^sha256\$[0-9a-f]{32}\$[0-9a-f]{64}$'
);

create or replace function public.generate_parent_secret_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  bytes bytea := gen_random_bytes(8);
  i integer;
  idx integer;
begin
  for i in 0..7 loop
    idx := get_byte(bytes, i) % length(alphabet);
    result := result || substr(alphabet, idx + 1, 1);
  end loop;
  return result;
end;
$$;

create or replace function public.hash_parent_secret_code(_code text, _salt text default null)
returns text
language plpgsql
as $$
declare
  normalized_code text := upper(coalesce(_code, ''));
  effective_salt text := coalesce(_salt, encode(gen_random_bytes(16), 'hex'));
begin
  return 'sha256$'
    || effective_salt
    || '$'
    || encode(digest(effective_salt || ':' || normalized_code, 'sha256'), 'hex');
end;
$$;

with generated as (
  select
    s.id,
    public.generate_parent_secret_code() as code,
    encode(gen_random_bytes(16), 'hex') as salt
  from public.students s
  where s.parent_secret_code_plain is null
     or s.parent_secret_code_hash is null
)
update public.students as s
set
  parent_secret_code_plain = generated.code,
  parent_secret_code_hash = public.hash_parent_secret_code(generated.code, generated.salt),
  parent_secret_code_rotated_at = coalesce(s.parent_secret_code_rotated_at, now())
from generated
where s.id = generated.id;

create table if not exists public.parent_child_links (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  parent_email text not null,
  created_at timestamptz not null default now(),
  constraint parent_child_links_unique unique (parent_user_id, student_id)
);

create index if not exists parent_child_links_parent_user_idx
  on public.parent_child_links (parent_user_id);

create index if not exists parent_child_links_student_idx
  on public.parent_child_links (student_id);

alter table public.parent_child_links enable row level security;

drop policy if exists parent_child_links_select_self on public.parent_child_links;
create policy parent_child_links_select_self
on public.parent_child_links
for select
to authenticated
using (parent_user_id = auth.uid());

drop policy if exists parent_child_links_insert_self on public.parent_child_links;
create policy parent_child_links_insert_self
on public.parent_child_links
for insert
to authenticated
with check (parent_user_id = auth.uid());

drop policy if exists parent_child_links_delete_self on public.parent_child_links;
create policy parent_child_links_delete_self
on public.parent_child_links
for delete
to authenticated
using (parent_user_id = auth.uid());
