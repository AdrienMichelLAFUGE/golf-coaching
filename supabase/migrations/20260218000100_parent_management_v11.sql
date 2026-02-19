-- Parent management V1.1
-- - soft revoke links
-- - per-module parent permissions
-- - RLS hardening
-- - stop persisting plain parent secret codes

alter table public.parent_child_links
add column if not exists status text not null default 'active';

alter table public.parent_child_links
add column if not exists permissions jsonb not null default
  '{"dashboard":true,"rapports":true,"tests":true,"calendrier":true,"messages":true}'::jsonb;

alter table public.parent_child_links
add column if not exists revoked_at timestamptz;

alter table public.parent_child_links
add column if not exists revoked_by uuid references public.profiles(id) on delete set null;

alter table public.parent_child_links
drop constraint if exists parent_child_links_status_check;

alter table public.parent_child_links
add constraint parent_child_links_status_check
check (status = any (array['active'::text, 'revoked'::text]));

alter table public.parent_child_links
drop constraint if exists parent_child_links_permissions_check;

alter table public.parent_child_links
add constraint parent_child_links_permissions_check
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

create index if not exists parent_child_links_status_idx
  on public.parent_child_links (status);

create index if not exists parent_child_links_parent_status_idx
  on public.parent_child_links (parent_user_id, status);

create index if not exists parent_child_links_student_status_idx
  on public.parent_child_links (student_id, status);

update public.students
set parent_secret_code_plain = null
where parent_secret_code_hash is not null
  and parent_secret_code_plain is not null;

alter table public.parent_child_links enable row level security;

drop policy if exists parent_child_links_select_self on public.parent_child_links;
drop policy if exists parent_child_links_insert_self on public.parent_child_links;
drop policy if exists parent_child_links_delete_self on public.parent_child_links;
drop policy if exists parent_child_links_update_self on public.parent_child_links;
drop policy if exists parent_child_links_select_parent_active on public.parent_child_links;
drop policy if exists parent_child_links_insert_parent_self on public.parent_child_links;
drop policy if exists parent_child_links_update_parent_self on public.parent_child_links;
drop policy if exists parent_child_links_manage_org_select on public.parent_child_links;
drop policy if exists parent_child_links_manage_org_insert on public.parent_child_links;
drop policy if exists parent_child_links_manage_org_update on public.parent_child_links;
drop policy if exists parent_child_links_manage_org_delete on public.parent_child_links;

create policy parent_child_links_select_parent_active
on public.parent_child_links
for select
to authenticated
using (
  parent_user_id = auth.uid()
  and status = 'active'::text
);

create policy parent_child_links_insert_parent_self
on public.parent_child_links
for insert
to authenticated
with check (
  parent_user_id = auth.uid()
  and status = 'active'::text
);

create policy parent_child_links_update_parent_self
on public.parent_child_links
for update
to authenticated
using (parent_user_id = auth.uid())
with check (parent_user_id = auth.uid());

create policy parent_child_links_manage_org_select
on public.parent_child_links
for select
to authenticated
using (
  exists (
    select 1
    from public.students s
    join public.org_memberships om
      on om.org_id = s.org_id
    where s.id = parent_child_links.student_id
      and om.user_id = auth.uid()
      and om.status = 'active'::text
      and om.role = any (array['admin'::text, 'coach'::text])
  )
);

create policy parent_child_links_manage_org_insert
on public.parent_child_links
for insert
to authenticated
with check (
  exists (
    select 1
    from public.students s
    join public.org_memberships om
      on om.org_id = s.org_id
    where s.id = parent_child_links.student_id
      and om.user_id = auth.uid()
      and om.status = 'active'::text
      and om.role = any (array['admin'::text, 'coach'::text])
  )
);

create policy parent_child_links_manage_org_update
on public.parent_child_links
for update
to authenticated
using (
  exists (
    select 1
    from public.students s
    join public.org_memberships om
      on om.org_id = s.org_id
    where s.id = parent_child_links.student_id
      and om.user_id = auth.uid()
      and om.status = 'active'::text
      and om.role = any (array['admin'::text, 'coach'::text])
  )
)
with check (
  exists (
    select 1
    from public.students s
    join public.org_memberships om
      on om.org_id = s.org_id
    where s.id = parent_child_links.student_id
      and om.user_id = auth.uid()
      and om.status = 'active'::text
      and om.role = any (array['admin'::text, 'coach'::text])
  )
);

create policy parent_child_links_manage_org_delete
on public.parent_child_links
for delete
to authenticated
using (
  exists (
    select 1
    from public.students s
    join public.org_memberships om
      on om.org_id = s.org_id
    where s.id = parent_child_links.student_id
      and om.user_id = auth.uid()
      and om.status = 'active'::text
      and om.role = any (array['admin'::text, 'coach'::text])
  )
);
