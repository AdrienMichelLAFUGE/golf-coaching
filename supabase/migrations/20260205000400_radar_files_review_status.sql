ALTER TABLE public.radar_files
  DROP CONSTRAINT IF EXISTS radar_files_status_check;

ALTER TABLE public.radar_files
  ADD CONSTRAINT radar_files_status_check
  CHECK (status = ANY (ARRAY['processing'::text, 'ready'::text, 'error'::text, 'review'::text]));
