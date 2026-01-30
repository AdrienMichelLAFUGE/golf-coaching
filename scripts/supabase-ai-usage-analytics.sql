-- AI usage analytics columns (endpoint + status)
alter table public.ai_usage
  add column if not exists endpoint text,
  add column if not exists status_code integer,
  add column if not exists error_type text;

create index if not exists ai_usage_endpoint_idx
  on public.ai_usage (endpoint);
create index if not exists ai_usage_status_idx
  on public.ai_usage (status_code);

