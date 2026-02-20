alter table public.bug_reports
  add column if not exists request_type text not null default 'bug';

alter table public.bug_reports
  drop constraint if exists bug_reports_request_type_check;

alter table public.bug_reports
  add constraint bug_reports_request_type_check
  check (
    request_type = any (
      array[
        'bug'::text,
        'question'::text,
        'billing'::text,
        'feature_request'::text
      ]
    )
  );

create index if not exists bug_reports_request_type_created_at_idx
  on public.bug_reports (request_type, created_at desc);
