-- Extend radar_files.source to support Smart2move.
alter table public.radar_files
  drop constraint if exists radar_files_source_check;

alter table public.radar_files
  add constraint radar_files_source_check
  check (source in ('flightscope', 'trackman', 'smart2move', 'unknown'));
