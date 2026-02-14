create table if not exists public.message_user_suspensions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  suspended_until timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  lifted_at timestamptz,
  lifted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_user_suspensions_reason_check
    check (char_length(trim(reason)) between 3 and 500),
  constraint message_user_suspensions_window_check
    check (suspended_until is null or suspended_until > created_at)
);

create unique index if not exists message_user_suspensions_active_unique
  on public.message_user_suspensions (org_id, user_id)
  where lifted_at is null;

create index if not exists message_user_suspensions_org_created_idx
  on public.message_user_suspensions (org_id, created_at desc);

create index if not exists message_user_suspensions_user_created_idx
  on public.message_user_suspensions (user_id, created_at desc);

drop trigger if exists set_message_user_suspensions_updated_at on public.message_user_suspensions;
create trigger set_message_user_suspensions_updated_at
before update on public.message_user_suspensions
for each row
execute function public.set_updated_at();

alter table public.message_user_suspensions enable row level security;

drop policy if exists message_user_suspensions_no_select on public.message_user_suspensions;
create policy message_user_suspensions_no_select
on public.message_user_suspensions
for select to authenticated
using (false);

drop policy if exists message_user_suspensions_no_insert on public.message_user_suspensions;
create policy message_user_suspensions_no_insert
on public.message_user_suspensions
for insert to authenticated
with check (false);

drop policy if exists message_user_suspensions_no_update on public.message_user_suspensions;
create policy message_user_suspensions_no_update
on public.message_user_suspensions
for update to authenticated
using (false)
with check (false);

drop policy if exists message_user_suspensions_no_delete on public.message_user_suspensions;
create policy message_user_suspensions_no_delete
on public.message_user_suspensions
for delete to authenticated
using (false);
