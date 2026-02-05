DROP POLICY IF EXISTS reports_read ON public.reports;
CREATE POLICY reports_read ON public.reports
  FOR SELECT TO authenticated
  USING (
    (public.is_current_workspace(org_id) AND public.is_personal_workspace(org_id))
    OR (public.is_current_workspace(org_id) AND public.is_org_member(org_id))
    OR public.is_linked_student_visible(reports.student_id)
  );

DROP POLICY IF EXISTS report_sections_read ON public.report_sections;
CREATE POLICY report_sections_read ON public.report_sections
  FOR SELECT TO authenticated
  USING (
    (public.is_current_workspace(org_id) AND public.is_personal_workspace(org_id))
    OR (public.is_current_workspace(org_id) AND public.is_org_member(org_id))
    OR EXISTS (
      SELECT 1
      FROM public.reports r
      WHERE r.id = report_sections.report_id
        AND public.is_linked_student_visible(r.student_id)
    )
  );
