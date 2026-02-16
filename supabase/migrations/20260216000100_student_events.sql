-- Student calendar events (V1)

create table if not exists public.student_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  title text not null,
  type text not null,
  start_at timestamptz not null,
  end_at timestamptz null,
  all_day boolean not null default false,
  location text null,
  notes text null,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  constraint student_events_time_check check (end_at is null or end_at >= start_at),
  constraint student_events_type_check check (
    type in ('tournament', 'competition', 'training', 'other')
  )
);

create index if not exists student_events_student_start_idx
  on public.student_events(student_id, start_at);

drop trigger if exists set_student_events_updated_at on public.student_events;
create trigger set_student_events_updated_at
before update on public.student_events
for each row execute function public.set_updated_at();

alter table public.student_events enable row level security;

drop policy if exists student_events_read on public.student_events;
create policy student_events_read on public.student_events
for select to authenticated
using (
  public.is_student_linked(student_events.student_id)
  or exists (
    select 1
    from public.students s
    join public.organizations o on o.id = s.org_id
    left join public.org_memberships m
      on m.org_id = s.org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
    left join public.student_assignments a
      on a.student_id = s.id
      and a.coach_id = auth.uid()
    where s.id = student_events.student_id
      and (
        (o.workspace_type = 'personal' and o.owner_profile_id = auth.uid())
        or (o.workspace_type = 'org' and m.user_id is not null and a.student_id is not null)
      )
  )
);

drop policy if exists student_events_insert on public.student_events;
create policy student_events_insert on public.student_events
for insert to authenticated
with check (
  public.is_student_linked(student_events.student_id)
  and student_events.created_by = auth.uid()
  and student_events.updated_by = auth.uid()
);

drop policy if exists student_events_update on public.student_events;
create policy student_events_update on public.student_events
for update to authenticated
using (public.is_student_linked(student_events.student_id))
with check (
  public.is_student_linked(student_events.student_id)
  and student_events.updated_by = auth.uid()
);

drop policy if exists student_events_delete on public.student_events;
create policy student_events_delete on public.student_events
for delete to authenticated
using (public.is_student_linked(student_events.student_id));
