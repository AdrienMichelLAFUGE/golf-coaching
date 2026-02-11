-- Create the storage bucket used for report media (images/videos).
-- Required by the report builder which uploads to bucket id "report-media".

create or replace function public.ensure_report_media_bucket()
returns void
language plpgsql
as $$
begin
  if not exists (select 1 from storage.buckets where id = 'report-media') then
    insert into storage.buckets (id, name, public)
    values ('report-media', 'report-media', true);
  end if;
end;
$$;

select public.ensure_report_media_bucket();

drop function public.ensure_report_media_bucket();
