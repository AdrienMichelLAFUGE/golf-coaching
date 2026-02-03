-- Use personal plan tier for org entitlements + quotas

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
  elsif tier = 'standard' then
    limit_count := 30;
  elsif tier = 'pro' then
    limit_count := 100;
  else
    limit_count := 30;
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
  elsif tier = 'standard' then
    limit_count := 10;
  elsif tier = 'pro' then
    limit_count := 30;
  else
    limit_count := 10;
  end if;

  select count(*) into used_count
  from public.tpi_reports tr
  where tr.uploaded_by = auth.uid()
    and tr.created_at >= now() - interval '30 days';

  return used_count < limit_count;
END;
$$;
