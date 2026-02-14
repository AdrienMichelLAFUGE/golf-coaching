alter table public.reports
  alter column student_id drop not null;

alter table public.reports
  drop constraint if exists reports_student_required_or_share;

alter table public.reports
  add constraint reports_student_required_or_share
  check (student_id is not null or origin_share_id is not null);
