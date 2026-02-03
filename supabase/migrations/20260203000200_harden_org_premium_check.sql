-- Harden org premium gating to rely on plan_tier (not feature toggles)

CREATE OR REPLACE FUNCTION public.is_org_premium_member(_org_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
  select exists (
    select 1
    from public.organizations o
    where o.id = _org_id
      and o.plan_tier <> 'free'
  );
$$;
