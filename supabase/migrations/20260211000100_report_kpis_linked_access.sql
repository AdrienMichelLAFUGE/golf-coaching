-- Allow cross-workspace reads of report_kpis when the underlying report is visible via linked students.

drop policy if exists report_kpis_read on public.report_kpis;
create policy report_kpis_read
on public.report_kpis
for select
to authenticated
using (
  (
    public.is_current_workspace(org_id)
    and public.is_personal_workspace(org_id)
  )
  or (
    public.is_current_workspace(org_id)
    and public.is_org_member(org_id)
  )
  or exists (
    select 1
    from public.reports r
    where r.id = report_kpis.report_id
      and public.is_linked_student_visible(r.student_id)
  )
  or exists (
    select 1
    from public.reports r
    join public.students s on s.id = r.student_id
    where r.id = report_kpis.report_id
      and lower(s.email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text))
  )
);

