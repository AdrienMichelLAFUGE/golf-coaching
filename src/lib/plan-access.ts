import "server-only";

import { resolveEffectivePlanTier, type PlanTier } from "@/lib/plans";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export const loadPersonalPlanTier = async (
  admin: AdminClient,
  userId: string
): Promise<PlanTier> => {
  const { data, error } = await admin
    .from("organizations")
    .select(
      "plan_tier, plan_tier_override, plan_tier_override_starts_at, plan_tier_override_expires_at, plan_tier_override_unlimited"
    )
    .eq("workspace_type", "personal")
    .eq("owner_profile_id", userId)
    .maybeSingle();

  if (error || !data) return "free";
  return resolveEffectivePlanTier(
    data.plan_tier,
    data.plan_tier_override,
    data.plan_tier_override_expires_at,
    new Date(),
    data.plan_tier_override_starts_at,
    data.plan_tier_override_unlimited
  ).tier;
};
