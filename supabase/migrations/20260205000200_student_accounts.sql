-- Student accounts: link auth users to multiple students (personal + org)

CREATE TABLE public.student_accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  student_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT student_accounts_pkey PRIMARY KEY (id),
  CONSTRAINT student_accounts_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE,
  CONSTRAINT student_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT student_accounts_unique_student UNIQUE (student_id),
  CONSTRAINT student_accounts_unique_pair UNIQUE (student_id, user_id)
);

CREATE INDEX student_accounts_user_idx ON public.student_accounts (user_id);
CREATE INDEX student_accounts_student_idx ON public.student_accounts (student_id);

ALTER TABLE public.student_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY student_accounts_read ON public.student_accounts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_student_linked(_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.student_accounts sa
    WHERE sa.student_id = _student_id
      AND sa.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.backfill_student_accounts()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.student_accounts (student_id, user_id)
  SELECT s.id, p.id
  FROM public.students s
  JOIN auth.users u ON lower(u.email) = lower(s.email)
  JOIN public.profiles p ON p.id = u.id
  WHERE s.email IS NOT NULL
  ON CONFLICT (student_id) DO NOTHING;
END;
$$;

SELECT public.backfill_student_accounts();

DROP FUNCTION public.backfill_student_accounts();

DROP POLICY IF EXISTS students_read ON public.students;
CREATE POLICY students_read ON public.students
  FOR SELECT TO authenticated
  USING (
    (public.is_current_workspace(org_id) AND public.is_personal_workspace(org_id))
    OR (public.is_current_workspace(org_id) AND public.is_org_member(org_id))
    OR public.is_student_linked(students.id)
  );

DROP POLICY IF EXISTS students_update ON public.students;
CREATE POLICY students_update ON public.students
  FOR UPDATE TO authenticated
  USING (
    (public.is_current_workspace(org_id) AND public.is_personal_workspace(org_id))
    OR (public.is_current_workspace(org_id)
      AND public.is_org_member(org_id)
      AND public.is_org_premium_member(org_id)
      AND public.is_org_coach(org_id))
    OR public.is_student_linked(students.id)
  )
  WITH CHECK (
    (public.is_current_workspace(org_id) AND public.is_personal_workspace(org_id))
    OR (public.is_current_workspace(org_id)
      AND public.is_org_member(org_id)
      AND public.is_org_premium_member(org_id)
      AND public.is_org_coach(org_id))
    OR public.is_student_linked(students.id)
  );

DROP POLICY IF EXISTS reports_read ON public.reports;
CREATE POLICY reports_read ON public.reports
  FOR SELECT TO authenticated
  USING (
    (public.is_current_workspace(org_id) AND public.is_personal_workspace(org_id))
    OR (public.is_current_workspace(org_id) AND public.is_org_member(org_id))
    OR public.is_student_linked(reports.student_id)
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
        AND public.is_student_linked(r.student_id)
    )
  );

DROP POLICY IF EXISTS normalized_test_assignments_student_read ON public.normalized_test_assignments;
CREATE POLICY normalized_test_assignments_student_read ON public.normalized_test_assignments
  FOR SELECT TO authenticated
  USING (public.is_student_linked(normalized_test_assignments.student_id));

DROP POLICY IF EXISTS normalized_test_attempts_student_read ON public.normalized_test_attempts;
CREATE POLICY normalized_test_attempts_student_read ON public.normalized_test_attempts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.normalized_test_assignments a
      WHERE a.id = normalized_test_attempts.assignment_id
        AND public.is_student_linked(a.student_id)
    )
  );

DROP POLICY IF EXISTS student_shares_student_select ON public.student_shares;
CREATE POLICY student_shares_student_select ON public.student_shares
  FOR SELECT TO authenticated
  USING (public.is_student_linked(student_shares.student_id));

DROP POLICY IF EXISTS student_shares_student_update ON public.student_shares;
CREATE POLICY student_shares_student_update ON public.student_shares
  FOR UPDATE TO authenticated
  USING (status = 'pending_student'::text AND public.is_student_linked(student_shares.student_id))
  WITH CHECK (
    public.is_student_linked(student_shares.student_id)
    AND (
      (status = 'active'::text AND student_accepted_at IS NOT NULL)
      OR (status = 'rejected_student'::text AND student_declined_at IS NOT NULL)
    )
  );

DROP POLICY IF EXISTS student_shares_student_revoke ON public.student_shares;
CREATE POLICY student_shares_student_revoke ON public.student_shares
  FOR UPDATE TO authenticated
  USING (status = 'active'::text AND public.is_student_linked(student_shares.student_id))
  WITH CHECK (
    status = 'revoked'::text
    AND revoked_at IS NOT NULL
  );

DROP POLICY IF EXISTS organizations_workspace_read ON public.organizations;
CREATE POLICY organizations_workspace_read ON public.organizations
  FOR SELECT TO authenticated
  USING (
    public.is_personal_workspace(id)
    OR public.is_org_member(id)
    OR EXISTS (
      SELECT 1
      FROM public.student_accounts sa
      JOIN public.students s ON s.id = sa.student_id
      WHERE sa.user_id = auth.uid()
        AND s.org_id = organizations.id
    )
  );

DROP POLICY IF EXISTS tpi_reports_student_read ON public.tpi_reports;
CREATE POLICY tpi_reports_student_read ON public.tpi_reports
  FOR SELECT TO authenticated
  USING (public.is_student_linked(tpi_reports.student_id));

DROP POLICY IF EXISTS tpi_tests_student_read ON public.tpi_tests;
CREATE POLICY tpi_tests_student_read ON public.tpi_tests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tpi_reports tr
      WHERE tr.id = tpi_tests.report_id
        AND public.is_student_linked(tr.student_id)
    )
  );
