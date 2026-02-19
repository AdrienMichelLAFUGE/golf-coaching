-- Personal coach-to-coach student link requests.
-- This blocks direct duplicate imports by email and requires owner approval.

CREATE TABLE IF NOT EXISTS public.personal_student_link_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  source_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_owner_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requester_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requester_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requester_email text NOT NULL,
  student_email text NOT NULL,
  requested_first_name text,
  requested_last_name text,
  requested_playing_hand text,
  status text NOT NULL DEFAULT 'pending',
  decision text,
  decided_at timestamptz,
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personal_student_link_requests_status_check
    CHECK (
      status = ANY (
        ARRAY[
          'pending'::text,
          'accepted_share'::text,
          'accepted_transfer'::text,
          'rejected'::text,
          'cancelled'::text
        ]
      )
    ),
  CONSTRAINT personal_student_link_requests_decision_check
    CHECK (decision IS NULL OR decision = ANY (ARRAY['share'::text, 'transfer'::text, 'reject'::text])),
  CONSTRAINT personal_student_link_requests_requester_email_lowercase
    CHECK (requester_email = lower(requester_email)),
  CONSTRAINT personal_student_link_requests_student_email_lowercase
    CHECK (student_email = lower(student_email)),
  CONSTRAINT personal_student_link_requests_playing_hand_check
    CHECK (
      requested_playing_hand IS NULL
      OR requested_playing_hand = ANY (ARRAY['right'::text, 'left'::text])
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS personal_student_link_requests_pending_unique
  ON public.personal_student_link_requests (source_student_id, requester_user_id)
  WHERE (status = 'pending');

CREATE INDEX IF NOT EXISTS personal_student_link_requests_source_owner_idx
  ON public.personal_student_link_requests (source_owner_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS personal_student_link_requests_requester_idx
  ON public.personal_student_link_requests (requester_user_id, status, created_at DESC);

ALTER TABLE public.personal_student_link_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS personal_student_link_requests_select ON public.personal_student_link_requests;
CREATE POLICY personal_student_link_requests_select
ON public.personal_student_link_requests
FOR SELECT TO authenticated
USING (
  source_owner_user_id = auth.uid()
  OR requester_user_id = auth.uid()
);

DROP POLICY IF EXISTS personal_student_link_requests_insert_requester ON public.personal_student_link_requests;
CREATE POLICY personal_student_link_requests_insert_requester
ON public.personal_student_link_requests
FOR INSERT TO authenticated
WITH CHECK (
  requester_user_id = auth.uid()
  AND status = 'pending'
);

DROP POLICY IF EXISTS personal_student_link_requests_update_owner ON public.personal_student_link_requests;
CREATE POLICY personal_student_link_requests_update_owner
ON public.personal_student_link_requests
FOR UPDATE TO authenticated
USING (source_owner_user_id = auth.uid())
WITH CHECK (source_owner_user_id = auth.uid());

DROP POLICY IF EXISTS personal_student_link_requests_update_requester_cancel ON public.personal_student_link_requests;
CREATE POLICY personal_student_link_requests_update_requester_cancel
ON public.personal_student_link_requests
FOR UPDATE TO authenticated
USING (requester_user_id = auth.uid())
WITH CHECK (
  requester_user_id = auth.uid()
  AND status = 'cancelled'
);

-- Transfer ownership of a personal student across personal workspaces.
-- Keeps the same student id and updates student-scoped org fields.
CREATE OR REPLACE FUNCTION public.transfer_personal_student_to_workspace(
  _student_id uuid,
  _target_org_id uuid,
  _target_coach_user_id uuid,
  _actor_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  _source_org_id uuid;
  _source_workspace_type text;
  _target_workspace_type text;
  _target_owner_id uuid;
  _table_name text;
BEGIN
  IF _student_id IS NULL OR _target_org_id IS NULL OR _target_coach_user_id IS NULL THEN
    RAISE EXCEPTION 'missing transfer parameters';
  END IF;

  SELECT s.org_id
  INTO _source_org_id
  FROM public.students s
  WHERE s.id = _student_id
  FOR UPDATE;

  IF _source_org_id IS NULL THEN
    RAISE EXCEPTION 'student_not_found';
  END IF;

  IF _source_org_id = _target_org_id THEN
    RETURN;
  END IF;

  SELECT o.workspace_type
  INTO _source_workspace_type
  FROM public.organizations o
  WHERE o.id = _source_org_id;

  IF _source_workspace_type IS DISTINCT FROM 'personal' THEN
    RAISE EXCEPTION 'source_workspace_not_personal';
  END IF;

  SELECT o.workspace_type, o.owner_profile_id
  INTO _target_workspace_type, _target_owner_id
  FROM public.organizations o
  WHERE o.id = _target_org_id;

  IF _target_workspace_type IS DISTINCT FROM 'personal' THEN
    RAISE EXCEPTION 'target_workspace_not_personal';
  END IF;

  IF _target_owner_id IS DISTINCT FROM _target_coach_user_id THEN
    RAISE EXCEPTION 'target_owner_mismatch';
  END IF;

  UPDATE public.students
  SET org_id = _target_org_id
  WHERE id = _student_id
    AND org_id = _source_org_id;

  FOR _table_name IN
    SELECT quote_ident(c.table_schema) || '.' || quote_ident(c.table_name)
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'student_id'
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns c2
        WHERE c2.table_schema = c.table_schema
          AND c2.table_name = c.table_name
          AND c2.column_name = 'org_id'
      )
      AND c.table_name <> 'students'
    GROUP BY c.table_schema, c.table_name
  LOOP
    EXECUTE format(
      'UPDATE %s SET org_id = $1 WHERE student_id = $2 AND org_id = $3',
      _table_name
    )
    USING _target_org_id, _student_id, _source_org_id;
  END LOOP;

  FOR _table_name IN
    SELECT quote_ident(c.table_schema) || '.' || quote_ident(c.table_name)
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'student_id'
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns c2
        WHERE c2.table_schema = c.table_schema
          AND c2.table_name = c.table_name
          AND c2.column_name = 'workspace_org_id'
      )
    GROUP BY c.table_schema, c.table_name
  LOOP
    EXECUTE format(
      'UPDATE %s SET workspace_org_id = $1 WHERE student_id = $2 AND workspace_org_id = $3',
      _table_name
    )
    USING _target_org_id, _student_id, _source_org_id;
  END LOOP;

  UPDATE public.report_sections rs
  SET org_id = _target_org_id
  FROM public.reports r
  WHERE rs.report_id = r.id
    AND r.student_id = _student_id
    AND rs.org_id = _source_org_id;

  INSERT INTO public.student_assignments (org_id, student_id, coach_id, created_by)
  VALUES (
    _target_org_id,
    _student_id,
    _target_coach_user_id,
    COALESCE(_actor_user_id, _target_coach_user_id)
  )
  ON CONFLICT (student_id, coach_id)
  DO UPDATE SET
    org_id = EXCLUDED.org_id,
    created_by = EXCLUDED.created_by;

  DELETE FROM public.student_assignments
  WHERE student_id = _student_id
    AND coach_id <> _target_coach_user_id;
END;
$$;

-- Ensure shared students are visible to invited coaches in listing screens.
DROP POLICY IF EXISTS students_read ON public.students;
CREATE POLICY students_read ON public.students
FOR SELECT TO authenticated
USING (
  (public.is_current_workspace(org_id) AND public.is_personal_workspace(org_id))
  OR (public.is_current_workspace(org_id) AND public.is_org_member(org_id))
  OR public.is_student_linked(students.id)
  OR EXISTS (
    SELECT 1
    FROM public.student_shares ss
    WHERE ss.student_id = students.id
      AND ss.status = 'active'::text
      AND lower(ss.viewer_email) = lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text))
  )
);
