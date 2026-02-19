-- Fix shared coach visibility for linked student reads (reports, tpi, radar).
-- Personal coach-to-coach shares must be treated as accessible students.

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
        OR EXISTS (
          SELECT 1
          FROM public.student_shares ss
          WHERE ss.student_id = s.id
            AND ss.status = 'active'::text
            AND (
              ss.viewer_id = auth.uid()
              OR lower(ss.viewer_email) = lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text))
            )
        )
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
  SELECT CASE
    WHEN public.can_access_student(_student_id) THEN
      ARRAY(
        SELECT DISTINCT linked.student_id
        FROM (
          SELECT sa2.student_id
          FROM public.student_accounts sa
          JOIN public.student_accounts sa2 ON sa2.user_id = sa.user_id
          WHERE sa.student_id = _student_id
          UNION ALL
          SELECT _student_id
        ) linked
      )
    ELSE ARRAY[]::uuid[]
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_linked_student_visible(_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
  SELECT
    public.can_access_student(_student_id)
    OR EXISTS (
      SELECT 1
      FROM public.student_accounts sa
      JOIN public.student_accounts sa2 ON sa2.user_id = sa.user_id
      WHERE sa.student_id = _student_id
        AND public.can_access_student(sa2.student_id)
    );
$$;
