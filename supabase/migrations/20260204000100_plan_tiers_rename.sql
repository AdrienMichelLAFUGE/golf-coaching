-- Plan tiers rename (Standard -> Pro, Pro -> Entreprise) + pricing refresh

-- Update existing organizations plan tiers
UPDATE public.organizations
SET plan_tier = 'enterprise'
WHERE plan_tier = 'pro';

UPDATE public.organizations
SET plan_tier = 'pro'
WHERE plan_tier = 'standard';

-- Refresh plan tier constraint
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_plan_tier_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_plan_tier_check
  CHECK (plan_tier IN ('free', 'pro', 'enterprise'));

-- Entitlements + quotas (personal plan tier is the source of truth)
CREATE OR REPLACE FUNCTION public.is_org_premium_member(_org_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
  select case
    when auth.uid() is null then false
    else exists (
      select 1
      from public.organizations o
      where o.workspace_type = 'personal'
        and o.owner_profile_id = auth.uid()
        and o.plan_tier <> 'free'
    )
  end;
$$;

CREATE OR REPLACE FUNCTION public.is_within_report_quota(_org_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
DECLARE
  tier text;
  limit_count integer;
  used_count integer;
BEGIN
  if auth.uid() is null then
    return false;
  end if;

  select plan_tier into tier
  from public.organizations o
  where o.workspace_type = 'personal'
    and o.owner_profile_id = auth.uid()
  limit 1;

  if tier is null or tier = 'free' or tier = 'enterprise' then
    return true;
  elsif tier = 'pro' then
    limit_count := 100;
  else
    limit_count := 100;
  end if;

  select count(*) into used_count
  from public.reports r
  where r.author_id = auth.uid()
    and r.created_at >= now() - interval '30 days';

  return used_count < limit_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_within_tpi_quota(_org_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
DECLARE
  tier text;
  limit_count integer;
  used_count integer;
BEGIN
  if auth.uid() is null then
    return false;
  end if;

  select plan_tier into tier
  from public.organizations o
  where o.workspace_type = 'personal'
    and o.owner_profile_id = auth.uid()
  limit 1;

  if tier is null or tier = 'free' then
    return false;
  elsif tier = 'enterprise' then
    return true;
  elsif tier = 'pro' then
    limit_count := 30;
  else
    limit_count := 30;
  end if;

  select count(*) into used_count
  from public.tpi_reports tr
  where tr.uploaded_by = auth.uid()
    and tr.created_at >= now() - interval '30 days';

  return used_count < limit_count;
END;
$$;

-- Pricing plans: rename tiers + refresh features
UPDATE public.pricing_plans
SET slug = 'legacy-pro',
    is_active = false,
    is_highlighted = false,
    sort_order = 90
WHERE slug = 'pro';

UPDATE public.pricing_plans
SET slug = 'legacy-pro-year',
    is_active = false,
    is_highlighted = false,
    sort_order = 90
WHERE slug = 'pro-year';

UPDATE public.pricing_plans
SET slug = 'pro',
    label = 'Pro',
    badge = 'Populaire',
    cta_label = 'Choisir Pro',
    is_active = true,
    is_highlighted = true,
    sort_order = 2
WHERE slug = 'standard';

UPDATE public.pricing_plans
SET slug = 'pro-year',
    label = 'Pro',
    badge = 'Populaire',
    cta_label = 'Choisir Pro',
    is_active = true,
    is_highlighted = true,
    sort_order = 2
WHERE slug = 'standard-year';

UPDATE public.pricing_plans
SET label = 'Free',
    badge = NULL,
    cta_label = 'Commencer',
    is_active = true,
    is_highlighted = false,
    sort_order = 1
WHERE slug = 'free';

UPDATE public.pricing_plans
SET label = 'Entreprise',
    badge = 'Sur mesure',
    cta_label = 'Contact',
    is_active = true,
    is_highlighted = false,
    sort_order = 3
WHERE slug = 'enterprise';

UPDATE public.pricing_plans
SET features = ARRAY[
  'Generation modulaire de rapports',
  'Coaching dynamique',
  'Relecture IA des sections',
  '2 tests Pelz (Putting, Approches)',
  '- Profil TPI',
  '- Extraction datas (Trackman, FlightScope, S2M)',
  '- Creation d organisation'
]
WHERE slug = 'free';

UPDATE public.pricing_plans
SET features = ARRAY[
  'Assistant IA complet (generation, propagation, resume, plan)',
  'Profil TPI',
  'Extraction datas (Trackman, FlightScope, S2M)',
  'Tests catalogue complet',
  'Creation d organisation + edition en org',
  'Quotas 100 rapports / 30 TPI / 100 extractions (30 jours)'
]
WHERE slug IN ('pro', 'pro-year');

UPDATE public.pricing_plans
SET features = ARRAY[
  'Tout Pro',
  'Illimite (rapports, TPI, extractions)',
  'CRM a venir (non implemente)',
  'Accompagnement sur mesure'
]
WHERE slug = 'enterprise';
