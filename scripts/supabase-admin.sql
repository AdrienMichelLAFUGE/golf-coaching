-- Pricing plans for premium modal
create table if not exists public.pricing_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  price_cents integer not null default 0,
  currency text not null default 'EUR',
  interval text not null check (interval in ('month', 'year')),
  badge text,
  cta_label text,
  features text[] not null default '{}',
  is_active boolean not null default true,
  is_highlighted boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists pricing_plans_active_idx
  on public.pricing_plans (is_active, sort_order);

alter table public.pricing_plans enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pricing_plans'
      and policyname = 'pricing_plans_read_authenticated'
  ) then
    create policy pricing_plans_read_authenticated
      on public.pricing_plans
      for select
      to authenticated
      using (true);
  end if;
end $$;

-- AI usage tracking
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  action text,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,
  duration_ms integer,
  created_at timestamp with time zone not null default now()
);

create index if not exists ai_usage_created_idx
  on public.ai_usage (created_at desc);
create index if not exists ai_usage_org_idx
  on public.ai_usage (org_id);
create index if not exists ai_usage_user_idx
  on public.ai_usage (user_id);

alter table public.ai_usage enable row level security;

-- Feature access flags (add-ons)
alter table public.organizations
  add column if not exists tpi_enabled boolean not null default false,
  add column if not exists radar_enabled boolean not null default false,
  add column if not exists coaching_dynamic_enabled boolean not null default false;

-- Students metadata
alter table public.students
  add column if not exists playing_hand text
  check (playing_hand in ('right', 'left'));
