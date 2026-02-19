-- Allow the invited coach (viewer) to remove an active shared student from their own workspace.

DROP POLICY IF EXISTS student_shares_viewer_revoke ON public.student_shares;
CREATE POLICY student_shares_viewer_revoke ON public.student_shares
  FOR UPDATE TO authenticated
  USING (
    status = 'active'::text
    AND (
      viewer_id = auth.uid()
      OR lower(viewer_email) = lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text))
    )
  )
  WITH CHECK (
    status = 'revoked'::text
    AND revoked_at IS NOT NULL
  );
