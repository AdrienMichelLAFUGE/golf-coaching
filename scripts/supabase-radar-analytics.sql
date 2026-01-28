-- Add analytics payload for radar files
alter table public.radar_files
  add column if not exists analytics jsonb;
