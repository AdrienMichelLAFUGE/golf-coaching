-- Keep linked student profile fields synchronized across all organizations.
-- A "linked student" is any student row sharing the same student_accounts.user_id.

CREATE OR REPLACE FUNCTION public.sync_linked_students_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Prevent recursive cascades when the trigger updates sibling rows.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF
    NEW.first_name IS NOT DISTINCT FROM OLD.first_name
    AND NEW.last_name IS NOT DISTINCT FROM OLD.last_name
    AND NEW.email IS NOT DISTINCT FROM OLD.email
    AND NEW.playing_hand IS NOT DISTINCT FROM OLD.playing_hand
    AND NEW.avatar_url IS NOT DISTINCT FROM OLD.avatar_url
    AND NEW.notes IS NOT DISTINCT FROM OLD.notes
  THEN
    RETURN NEW;
  END IF;

  UPDATE public.students s
  SET
    first_name = NEW.first_name,
    last_name = NEW.last_name,
    email = NEW.email,
    playing_hand = NEW.playing_hand,
    avatar_url = NEW.avatar_url,
    notes = NEW.notes
  WHERE s.id <> NEW.id
    AND EXISTS (
      SELECT 1
      FROM public.student_accounts sa_current
      JOIN public.student_accounts sa_linked
        ON sa_linked.user_id = sa_current.user_id
      WHERE sa_current.student_id = NEW.id
        AND sa_linked.student_id = s.id
    )
    AND (
      s.first_name IS DISTINCT FROM NEW.first_name
      OR s.last_name IS DISTINCT FROM NEW.last_name
      OR s.email IS DISTINCT FROM NEW.email
      OR s.playing_hand IS DISTINCT FROM NEW.playing_hand
      OR s.avatar_url IS DISTINCT FROM NEW.avatar_url
      OR s.notes IS DISTINCT FROM NEW.notes
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_linked_students_profile_fields_trigger ON public.students;

CREATE TRIGGER sync_linked_students_profile_fields_trigger
AFTER UPDATE ON public.students
FOR EACH ROW
EXECUTE FUNCTION public.sync_linked_students_profile_fields();
