create table if not exists public.api_rate_limits (
  key text primary key,
  bucket_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists api_rate_limits_updated_at_idx
  on public.api_rate_limits (updated_at);

create or replace function public.consume_rate_limit(
  limit_key text,
  window_seconds integer,
  max_requests integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer,
  current_count integer
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  now_ts timestamptz := now();
  bucket_ts timestamptz;
  next_bucket_ts timestamptz;
  new_count integer;
begin
  if limit_key is null or char_length(limit_key) = 0 then
    raise exception 'limit_key is required';
  end if;

  if window_seconds <= 0 then
    raise exception 'window_seconds must be > 0';
  end if;

  if max_requests <= 0 then
    raise exception 'max_requests must be > 0';
  end if;

  bucket_ts := to_timestamp(
    floor(extract(epoch from now_ts) / window_seconds) * window_seconds
  );
  next_bucket_ts := bucket_ts + make_interval(secs => window_seconds);

  insert into public.api_rate_limits (key, bucket_start, count, updated_at)
  values (limit_key, bucket_ts, 1, now_ts)
  on conflict (key) do update
  set
    bucket_start = excluded.bucket_start,
    count = case
      when public.api_rate_limits.bucket_start = excluded.bucket_start
        then public.api_rate_limits.count + 1
      else 1
    end,
    updated_at = now_ts
  returning count into new_count;

  allowed := new_count <= max_requests;
  remaining := greatest(max_requests - new_count, 0);
  if allowed then
    retry_after_seconds := 0;
  else
    retry_after_seconds := greatest(
      1,
      ceil(extract(epoch from (next_bucket_ts - now_ts)))::integer
    );
  end if;
  current_count := new_count;
  return next;
end;
$$;

alter table public.api_rate_limits enable row level security;

drop policy if exists api_rate_limits_no_select on public.api_rate_limits;
create policy api_rate_limits_no_select
on public.api_rate_limits
for select to authenticated
using (false);

drop policy if exists api_rate_limits_no_insert on public.api_rate_limits;
create policy api_rate_limits_no_insert
on public.api_rate_limits
for insert to authenticated
with check (false);

drop policy if exists api_rate_limits_no_update on public.api_rate_limits;
create policy api_rate_limits_no_update
on public.api_rate_limits
for update to authenticated
using (false)
with check (false);

drop policy if exists api_rate_limits_no_delete on public.api_rate_limits;
create policy api_rate_limits_no_delete
on public.api_rate_limits
for delete to authenticated
using (false);

