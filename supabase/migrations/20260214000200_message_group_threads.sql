alter table if exists public.message_threads
  add column if not exists group_id uuid references public.org_groups(id) on delete cascade;

alter table if exists public.message_threads
  drop constraint if exists message_threads_kind_check;

alter table if exists public.message_threads
  add constraint message_threads_kind_check
    check (kind = any (array['student_coach'::text, 'coach_coach'::text, 'group'::text]));

alter table if exists public.message_threads
  drop constraint if exists message_threads_student_required;

alter table if exists public.message_threads
  add constraint message_threads_student_required
    check (
      (kind = 'student_coach'::text and student_id is not null and group_id is null)
      or (kind = 'coach_coach'::text and student_id is null and group_id is null)
      or (kind = 'group'::text and group_id is not null and student_id is null)
    );

create index if not exists message_threads_group_idx
  on public.message_threads (group_id);

create unique index if not exists message_threads_unique_group_thread
  on public.message_threads (group_id)
  where kind = 'group'::text and group_id is not null;
