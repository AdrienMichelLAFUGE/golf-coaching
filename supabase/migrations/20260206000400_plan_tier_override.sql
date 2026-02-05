ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS plan_tier_override text;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS plan_tier_override_expires_at timestamptz;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_plan_tier_override_check
    CHECK (
      plan_tier_override IS NULL
      OR plan_tier_override IN ('free', 'pro', 'enterprise')
    );
