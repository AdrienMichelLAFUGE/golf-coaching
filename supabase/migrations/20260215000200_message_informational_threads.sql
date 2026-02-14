alter table if exists public.message_threads
  drop constraint if exists message_threads_kind_check;

alter table if exists public.message_threads
  add constraint message_threads_kind_check
    check (
      kind = any (
        array[
          'student_coach'::text,
          'coach_coach'::text,
          'group'::text,
          'group_info'::text,
          'org_info'::text,
          'org_coaches'::text
        ]
      )
    );

alter table if exists public.message_threads
  drop constraint if exists message_threads_student_required;

alter table if exists public.message_threads
  add constraint message_threads_student_required
    check (
      (kind = 'student_coach'::text and student_id is not null and group_id is null)
      or (kind = 'coach_coach'::text and student_id is null and group_id is null)
      or (kind = 'group'::text and group_id is not null and student_id is null)
      or (kind = 'group_info'::text and group_id is not null and student_id is null)
      or (kind = 'org_info'::text and group_id is null and student_id is null)
      or (kind = 'org_coaches'::text and group_id is null and student_id is null)
    );

drop index if exists message_threads_unique_kind_student_pair;

create unique index if not exists message_threads_unique_kind_student_pair
  on public.message_threads (kind, student_id, participant_a_id, participant_b_id)
  where kind = any (array['student_coach'::text, 'coach_coach'::text]);

create unique index if not exists message_threads_unique_group_info_thread
  on public.message_threads (group_id)
  where kind = 'group_info'::text and group_id is not null;

create unique index if not exists message_threads_unique_org_info_thread
  on public.message_threads (workspace_org_id)
  where kind = 'org_info'::text;

create unique index if not exists message_threads_unique_org_coaches_thread
  on public.message_threads (workspace_org_id)
  where kind = 'org_coaches'::text;
