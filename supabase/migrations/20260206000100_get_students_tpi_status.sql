CREATE OR REPLACE FUNCTION public.get_students_tpi_status(_student_ids uuid[])
RETURNS TABLE(student_id uuid, tpi_active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
  SELECT s_id AS student_id,
    EXISTS (
      SELECT 1
      FROM public.tpi_reports tr
      WHERE tr.status = 'ready'
        AND tr.student_id = ANY(public.get_linked_student_ids(s_id))
    ) AS tpi_active
  FROM unnest(_student_ids) AS s_id
  WHERE public.can_access_student(s_id);
$$;

GRANT EXECUTE ON FUNCTION public.get_students_tpi_status(uuid[]) TO authenticated;
