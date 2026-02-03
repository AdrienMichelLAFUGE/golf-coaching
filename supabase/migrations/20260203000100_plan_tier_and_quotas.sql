-- Plan tiers + quotas for Freemium/Standard/Pro/Entreprise

ALTER TABLE public.organizations
  ADD COLUMN plan_tier text;

UPDATE public.organizations
SET plan_tier = CASE WHEN ai_enabled THEN 'standard' ELSE 'free' END
WHERE plan_tier IS NULL;

ALTER TABLE public.organizations
  ALTER COLUMN plan_tier SET DEFAULT 'free',
  ALTER COLUMN plan_tier SET NOT NULL;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_plan_tier_check
  CHECK (plan_tier IN ('free', 'standard', 'pro', 'enterprise'));

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
  where o.id = _org_id;

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
  where o.id = _org_id;

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

CREATE OR REPLACE FUNCTION public.set_tpi_uploaded_by() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  if new.uploaded_by is null then
    new.uploaded_by := auth.uid();
  end if;
  return new;
END;
$$;

DROP TRIGGER IF EXISTS set_tpi_uploaded_by ON public.tpi_reports;
CREATE TRIGGER set_tpi_uploaded_by
  BEFORE INSERT ON public.tpi_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_tpi_uploaded_by();

DROP POLICY IF EXISTS reports_write ON public.reports;
CREATE POLICY reports_write ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      (public.is_current_workspace(org_id) AND public.is_personal_workspace(org_id))
      OR
      (public.is_current_workspace(org_id)
        AND public.is_org_member(org_id)
        AND public.is_org_premium_member(org_id)
        AND (public.is_org_admin(org_id) OR public.is_assigned_coach(student_id)))
    )
    AND public.is_within_report_quota(org_id)
  );

DROP POLICY IF EXISTS tpi_reports_insert ON public.tpi_reports;
CREATE POLICY tpi_reports_insert ON public.tpi_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    (org_id IN (SELECT profiles.org_id FROM public.profiles WHERE profiles.id = auth.uid()))
    AND public.is_org_premium_member(org_id)
    AND public.is_within_tpi_quota(org_id)
    AND uploaded_by = auth.uid()
  );

DROP POLICY IF EXISTS radar_files_org_insert ON public.radar_files;
CREATE POLICY radar_files_org_insert ON public.radar_files
  FOR INSERT TO authenticated
  WITH CHECK (
    ((org_id)::text = (SELECT (profiles.org_id)::text AS org_id FROM public.profiles WHERE (profiles.id = auth.uid())))
    AND public.is_org_premium_member(org_id)
  );

DROP POLICY IF EXISTS radar_files_insert ON storage.objects;
CREATE POLICY radar_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    (bucket_id = 'radar-files'::text)
    AND (split_part(name, '/'::text, 1) = (
      SELECT (profiles.org_id)::text AS org_id
      FROM public.profiles
      WHERE (profiles.id = auth.uid())
    ))
    AND public.is_org_premium_member((
      SELECT profiles.org_id
      FROM public.profiles
      WHERE (profiles.id = auth.uid())
    ))
  );

DROP POLICY IF EXISTS radar_files_storage_insert ON storage.objects;
CREATE POLICY radar_files_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    (bucket_id = 'radar-files'::text)
    AND ((split_part(name, '/'::text, 1))::uuid = (
      SELECT profiles.org_id
      FROM public.profiles
      WHERE (profiles.id = auth.uid())
    ))
    AND public.is_org_premium_member((
      SELECT profiles.org_id
      FROM public.profiles
      WHERE (profiles.id = auth.uid())
    ))
  );

DROP POLICY IF EXISTS tpi_reports_upload ON storage.objects;
CREATE POLICY tpi_reports_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    (bucket_id = 'tpi-reports'::text)
    AND ((storage.foldername(name))[1] = (
      SELECT (profiles.org_id)::text AS org_id
      FROM public.profiles
      WHERE (profiles.id = auth.uid())
    ))
    AND public.is_org_premium_member((
      SELECT profiles.org_id
      FROM public.profiles
      WHERE (profiles.id = auth.uid())
    ))
  );
