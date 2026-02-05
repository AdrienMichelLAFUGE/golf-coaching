-- Allow cross-workspace read for linked students (TPI + radar)

CREATE OR REPLACE FUNCTION public.can_access_student(_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.id = _student_id
      AND (
        (public.is_current_workspace(s.org_id) AND public.is_personal_workspace(s.org_id))
        OR (public.is_current_workspace(s.org_id) AND public.is_org_member(s.org_id))
        OR public.is_student_linked(s.id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_linked_student_ids(_student_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
  SELECT ARRAY(
    SELECT sa2.student_id
    FROM public.student_accounts sa
    JOIN public.student_accounts sa2 ON sa2.user_id = sa.user_id
    WHERE sa.student_id = _student_id
      AND public.can_access_student(_student_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_linked_student_visible(_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.student_accounts sa
    JOIN public.student_accounts sa2 ON sa2.user_id = sa.user_id
    WHERE sa.student_id = _student_id
      AND public.can_access_student(sa2.student_id)
  );
$$;

DROP POLICY IF EXISTS radar_files_linked_read ON public.radar_files;
CREATE POLICY radar_files_linked_read ON public.radar_files
  FOR SELECT TO authenticated
  USING (public.is_linked_student_visible(radar_files.student_id));

DROP POLICY IF EXISTS tpi_reports_linked_read ON public.tpi_reports;
CREATE POLICY tpi_reports_linked_read ON public.tpi_reports
  FOR SELECT TO authenticated
  USING (public.is_linked_student_visible(tpi_reports.student_id));

DROP POLICY IF EXISTS tpi_tests_linked_read ON public.tpi_tests;
CREATE POLICY tpi_tests_linked_read ON public.tpi_tests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tpi_reports tr
      WHERE tr.id = tpi_tests.report_id
        AND public.is_linked_student_visible(tr.student_id)
    )
  );
