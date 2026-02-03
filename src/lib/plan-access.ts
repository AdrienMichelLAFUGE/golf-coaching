import "server-only";

import { resolvePlanTier, type PlanTier } from "@/lib/plans";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export const loadPersonalPlanTier = async (
  admin: AdminClient,
  userId: string
): Promise<PlanTier> => {
  const { data, error } = await admin
    .from("organizations")
    .select("plan_tier")
    .eq("workspace_type", "personal")
    .eq("owner_profile_id", userId)
    .maybeSingle();

  if (error || !data) return "free";
  return resolvePlanTier(data.plan_tier);
};
