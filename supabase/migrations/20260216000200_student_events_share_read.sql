-- Allow active shared coaches to read student calendar events.

drop policy if exists student_events_read on public.student_events;
create policy student_events_read on public.student_events
for select to authenticated
using (
  public.is_student_linked(student_events.student_id)
  or exists (
    select 1
    from public.student_shares ss
    where ss.student_id = student_events.student_id
      and ss.status = 'active'
      and (
        ss.viewer_id = auth.uid()
        or lower(ss.viewer_email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
      )
  )
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
