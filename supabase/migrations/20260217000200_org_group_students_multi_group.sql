-- Allow one student to belong to multiple groups in the same organization.
-- Keep one row max per (group, student) to avoid duplicates.

alter table public.org_group_students
drop constraint if exists org_group_students_unique_student;

alter table public.org_group_students
add constraint org_group_students_unique_group_student unique (group_id, student_id);

create index if not exists org_group_students_student_idx
  on public.org_group_students (student_id);
