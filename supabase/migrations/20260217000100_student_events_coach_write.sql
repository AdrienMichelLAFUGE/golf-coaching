-- Allow linked coaches to create/update/delete student calendar events.
-- Shared viewer access remains read-only.

drop policy if exists student_events_insert on public.student_events;
create policy student_events_insert on public.student_events
for insert to authenticated
with check (
  (
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
  )
  and student_events.created_by = auth.uid()
  and student_events.updated_by = auth.uid()
);

drop policy if exists student_events_update on public.student_events;
create policy student_events_update on public.student_events
for update to authenticated
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
)
with check (
  (
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
  )
  and student_events.updated_by = auth.uid()
);

drop policy if exists student_events_delete on public.student_events;
create policy student_events_delete on public.student_events
for delete to authenticated
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

