-- Store formatted report content + hash for selective reformatting.
alter table public.report_sections
  add column if not exists content_formatted text,
  add column if not exists content_format_hash text;
