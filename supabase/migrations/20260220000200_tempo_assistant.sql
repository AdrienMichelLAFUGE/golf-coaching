-- Tempo assistant sessions, notes, and decision runs.

create or replace function public.can_use_tempo_student(_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $$
  with viewer as (
    select
      p.id,
      p.role,
      coalesce(p.active_workspace_id, p.org_id) as workspace_id
    from public.profiles p
    where p.id = auth.uid()
  ),
  student_org as (
    select s.id, s.org_id
    from public.students s
    where s.id = _student_id
  ),
  workspace as (
    select o.id, o.workspace_type, o.owner_profile_id
    from public.organizations o
    join student_org so on so.org_id = o.id
  )
  select exists (
    select 1
    from viewer v
    join student_org so on so.org_id = v.workspace_id
    join workspace w on w.id = so.org_id
    where v.role in ('owner', 'coach', 'staff')
      and (
        (w.workspace_type = 'personal' and w.owner_profile_id = v.id)
        or (
          w.workspace_type = 'org'
          and exists (
            select 1
            from public.org_memberships m
            where m.org_id = w.id
              and m.user_id = v.id
              and m.status = 'active'
              and (
                m.role = 'admin'
                or v.role = 'staff'
                or exists (
                  select 1
                  from public.student_assignments a
                  where a.org_id = w.id
                    and a.student_id = so.id
                    and a.coach_id = v.id
                )
              )
          )
        )
      )
  );
$$;

create table if not exists public.tempo_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null default 'notes',
  title text not null default 'Session Tempo',
  club text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tempo_sessions_mode_check
    check (mode = any (array['notes'::text, 'decision'::text, 'report'::text])),
  constraint tempo_sessions_status_check
    check (status = any (array['active'::text, 'archived'::text])),
  constraint tempo_sessions_title_length_check
    check (char_length(btrim(title)) between 1 and 140),
  constraint tempo_sessions_club_length_check
    check (club is null or char_length(btrim(club)) between 1 and 120)
);

create or replace function public.set_tempo_session_defaults()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  student_org_id uuid;
begin
  if new.coach_id is null then
    new.coach_id := auth.uid();
  end if;

  select s.org_id into student_org_id
  from public.students s
  where s.id = new.student_id;

  if student_org_id is not null then
    new.org_id := student_org_id;
  end if;

  if new.title is null or btrim(new.title) = '' then
    new.title := case
      when new.mode = 'decision' then 'Aide a la decision'
      when new.mode = 'report' then 'Preparation rapport'
      else 'Prise de notes'
    end;
  end if;

  return new;
end;
$$;

create index if not exists tempo_sessions_student_coach_updated_idx
  on public.tempo_sessions (student_id, coach_id, updated_at desc);

create index if not exists tempo_sessions_coach_mode_updated_idx
  on public.tempo_sessions (coach_id, mode, updated_at desc);

drop trigger if exists set_tempo_sessions_defaults on public.tempo_sessions;
create trigger set_tempo_sessions_defaults
before insert on public.tempo_sessions
for each row execute function public.set_tempo_session_defaults();

drop trigger if exists set_tempo_sessions_updated_at on public.tempo_sessions;
create trigger set_tempo_sessions_updated_at
before update on public.tempo_sessions
for each row execute function public.set_updated_at();

alter table public.tempo_sessions enable row level security;

drop policy if exists tempo_sessions_select on public.tempo_sessions;
create policy tempo_sessions_select on public.tempo_sessions
for select to authenticated
using (
  coach_id = auth.uid()
  and public.can_use_tempo_student(student_id)
);

drop policy if exists tempo_sessions_insert on public.tempo_sessions;
create policy tempo_sessions_insert on public.tempo_sessions
for insert to authenticated
with check (
  coach_id = auth.uid()
  and public.can_use_tempo_student(student_id)
  and public.is_current_workspace(org_id)
);

drop policy if exists tempo_sessions_update on public.tempo_sessions;
create policy tempo_sessions_update on public.tempo_sessions
for update to authenticated
using (
  coach_id = auth.uid()
  and public.can_use_tempo_student(student_id)
)
with check (
  coach_id = auth.uid()
  and public.can_use_tempo_student(student_id)
);

drop policy if exists tempo_sessions_delete on public.tempo_sessions;
create policy tempo_sessions_delete on public.tempo_sessions
for delete to authenticated
using (
  coach_id = auth.uid()
  and public.can_use_tempo_student(student_id)
);

create or replace function public.can_manage_tempo_session(_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $$
  select exists (
    select 1
    from public.tempo_sessions s
    where s.id = _session_id
      and s.coach_id = auth.uid()
      and public.can_use_tempo_student(s.student_id)
  );
$$;

create table if not exists public.tempo_note_cards (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.tempo_sessions(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  card_type text not null default 'libre',
  content text not null,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tempo_note_cards_type_check
    check (
      card_type = any (
        array['constat'::text, 'consigne'::text, 'objectif'::text, 'mesure'::text, 'libre'::text]
      )
    ),
  constraint tempo_note_cards_content_length_check
    check (char_length(btrim(content)) between 1 and 8000)
);

create or replace function public.set_tempo_note_defaults()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.coach_id is null then
    new.coach_id := auth.uid();
  end if;

  if new.occurred_at is null then
    new.occurred_at := now();
  end if;

  if new.order_index is null then
    select coalesce(max(order_index), -1) + 1 into new.order_index
    from public.tempo_note_cards
    where session_id = new.session_id;
  end if;

  return new;
end;
$$;

create index if not exists tempo_note_cards_session_order_idx
  on public.tempo_note_cards (session_id, order_index, occurred_at);

create index if not exists tempo_note_cards_coach_created_idx
  on public.tempo_note_cards (coach_id, created_at desc);

drop trigger if exists set_tempo_note_defaults on public.tempo_note_cards;
create trigger set_tempo_note_defaults
before insert on public.tempo_note_cards
for each row execute function public.set_tempo_note_defaults();

drop trigger if exists set_tempo_note_cards_updated_at on public.tempo_note_cards;
create trigger set_tempo_note_cards_updated_at
before update on public.tempo_note_cards
for each row execute function public.set_updated_at();

alter table public.tempo_note_cards enable row level security;

drop policy if exists tempo_note_cards_select on public.tempo_note_cards;
create policy tempo_note_cards_select on public.tempo_note_cards
for select to authenticated
using (
  coach_id = auth.uid()
  and public.can_manage_tempo_session(session_id)
);

drop policy if exists tempo_note_cards_insert on public.tempo_note_cards;
create policy tempo_note_cards_insert on public.tempo_note_cards
for insert to authenticated
with check (
  coach_id = auth.uid()
  and public.can_manage_tempo_session(session_id)
);

drop policy if exists tempo_note_cards_update on public.tempo_note_cards;
create policy tempo_note_cards_update on public.tempo_note_cards
for update to authenticated
using (
  coach_id = auth.uid()
  and public.can_manage_tempo_session(session_id)
)
with check (
  coach_id = auth.uid()
  and public.can_manage_tempo_session(session_id)
);

drop policy if exists tempo_note_cards_delete on public.tempo_note_cards;
create policy tempo_note_cards_delete on public.tempo_note_cards
for delete to authenticated
using (
  coach_id = auth.uid()
  and public.can_manage_tempo_session(session_id)
);

create table if not exists public.tempo_decision_runs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.tempo_sessions(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  club text not null,
  constat text not null,
  coach_intent text,
  clarifications_json jsonb not null default '[]'::jsonb,
  axes_json jsonb not null default '[]'::jsonb,
  context_snapshot_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint tempo_decision_runs_club_length_check
    check (char_length(btrim(club)) between 1 and 120),
  constraint tempo_decision_runs_constat_length_check
    check (char_length(btrim(constat)) between 1 and 8000),
  constraint tempo_decision_runs_coach_intent_length_check
    check (coach_intent is null or char_length(btrim(coach_intent)) between 1 and 8000)
);

create index if not exists tempo_decision_runs_session_created_idx
  on public.tempo_decision_runs (session_id, created_at desc);

create index if not exists tempo_decision_runs_coach_created_idx
  on public.tempo_decision_runs (coach_id, created_at desc);

alter table public.tempo_decision_runs enable row level security;

drop policy if exists tempo_decision_runs_select on public.tempo_decision_runs;
create policy tempo_decision_runs_select on public.tempo_decision_runs
for select to authenticated
using (
  coach_id = auth.uid()
  and public.can_manage_tempo_session(session_id)
);

drop policy if exists tempo_decision_runs_insert on public.tempo_decision_runs;
create policy tempo_decision_runs_insert on public.tempo_decision_runs
for insert to authenticated
with check (
  coach_id = auth.uid()
  and public.can_manage_tempo_session(session_id)
);

drop policy if exists tempo_decision_runs_update on public.tempo_decision_runs;
create policy tempo_decision_runs_update on public.tempo_decision_runs
for update to authenticated
using (
  coach_id = auth.uid()
  and public.can_manage_tempo_session(session_id)
)
with check (
  coach_id = auth.uid()
  and public.can_manage_tempo_session(session_id)
);

drop policy if exists tempo_decision_runs_delete on public.tempo_decision_runs;
create policy tempo_decision_runs_delete on public.tempo_decision_runs
for delete to authenticated
using (
  coach_id = auth.uid()
  and public.can_manage_tempo_session(session_id)
);
