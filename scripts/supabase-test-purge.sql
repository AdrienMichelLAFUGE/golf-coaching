-- Purge RLS integration test artifacts (run in test project only)
delete from public.student_shares
where viewer_email like 'viewer+%';

delete from public.students
where email like 'student+%';

delete from public.profiles
where id in (
  select id
  from auth.users
  where email like 'owner+%' or email like 'viewer+%'
);

delete from public.organizations
where name like 'rls-org-%';

-- Optional: remove auth users created by tests
delete from auth.users
where email like 'owner+%' or email like 'viewer+%';
