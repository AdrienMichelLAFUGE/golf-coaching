create table if not exists public.report_shares (
  id uuid primary key default gen_random_uuid(),
  source_report_id uuid not null references public.reports(id) on delete cascade,
  source_org_id uuid not null references public.organizations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_email text not null,
  recipient_user_id uuid references public.profiles(id) on delete set null,
  recipient_org_id uuid references public.organizations(id) on delete set null,
  status text not null default 'pending',
  delivery text not null default 'in_app',
  payload jsonb not null default '{}'::jsonb,
  decided_at timestamptz,
  copied_report_id uuid references public.reports(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_shares_status_check
    check (status = any (array['pending'::text, 'accepted'::text, 'rejected'::text, 'emailed'::text])),
  constraint report_shares_delivery_check
    check (delivery = any (array['in_app'::text, 'email'::text])),
  constraint report_shares_recipient_email_lowercase
    check (recipient_email = lower(recipient_email))
);

create index if not exists report_shares_recipient_status_idx
  on public.report_shares (recipient_user_id, status, created_at desc);

create index if not exists report_shares_sender_idx
  on public.report_shares (sender_id, created_at desc);

create unique index if not exists report_shares_pending_unique
  on public.report_shares (source_report_id, recipient_email)
  where status = 'pending';

drop trigger if exists set_report_shares_updated_at on public.report_shares;
create trigger set_report_shares_updated_at
before update on public.report_shares
for each row execute function public.set_updated_at();

alter table public.report_shares enable row level security;

drop policy if exists report_shares_read on public.report_shares;
create policy report_shares_read
on public.report_shares
for select to authenticated
using (sender_id = auth.uid() or recipient_user_id = auth.uid());

drop policy if exists report_shares_insert on public.report_shares;
create policy report_shares_insert
on public.report_shares
for insert to authenticated
with check (sender_id = auth.uid());

drop policy if exists report_shares_no_update on public.report_shares;
create policy report_shares_no_update
on public.report_shares
for update to authenticated
using (false)
with check (false);

alter table public.reports
  add column if not exists origin_share_id uuid references public.report_shares(id) on delete set null;

create index if not exists reports_origin_share_id_idx
  on public.reports (origin_share_id);

create or replace function public.prevent_shared_report_mutation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  target_report_id uuid;
  linked_share_id uuid;
begin
  if auth.role() <> 'authenticated' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_table_name = 'reports' then
    if old.origin_share_id is not null then
      raise exception 'Ce rapport partage est en lecture seule.';
    end if;
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    target_report_id := new.report_id;
  else
    target_report_id := old.report_id;
  end if;

  select r.origin_share_id
  into linked_share_id
  from public.reports r
  where r.id = target_report_id;

  if linked_share_id is not null then
    raise exception 'Les sections d un rapport partage sont en lecture seule.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_shared_reports_update_delete on public.reports;
create trigger prevent_shared_reports_update_delete
before update or delete on public.reports
for each row execute function public.prevent_shared_report_mutation();

drop trigger if exists prevent_shared_report_sections_mutation on public.report_sections;
create trigger prevent_shared_report_sections_mutation
before insert or update or delete on public.report_sections
for each row execute function public.prevent_shared_report_mutation();
