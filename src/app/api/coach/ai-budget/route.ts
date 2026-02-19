import { NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { loadAiBudgetSummary } from "@/lib/ai/budget";

export const runtime = "nodejs";

const allowedRoles = new Set(["owner", "coach", "staff"]);

export async function GET(request: Request) {
  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;

  if (userError || !userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, role, ai_budget_enabled, ai_budget_monthly_cents")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profil introuvable." }, { status: 403 });
  }

  if (!allowedRoles.has(profile.role ?? "")) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const summary = await loadAiBudgetSummary({
    admin,
    userId,
    profileBudget: {
      ai_budget_enabled: profile.ai_budget_enabled,
      ai_budget_monthly_cents: profile.ai_budget_monthly_cents,
    },
  });

  let usagePercentCurrentMonth: number | null = null;
  if (summary.monthAvailableActions !== null) {
    if (summary.monthAvailableActions <= 0) {
      usagePercentCurrentMonth = summary.monthSpentActions > 0 ? 100 : 0;
    } else {
      usagePercentCurrentMonth = Math.min(
        100,
        Math.max(
          0,
          Math.round((summary.monthSpentActions / summary.monthAvailableActions) * 100)
        )
      );
    }
  }

  return NextResponse.json({
    summary: {
      enabled: summary.enabled,
      monthly_budget_actions: summary.monthlyBudgetActions,
      spent_actions_current_month: summary.monthSpentActions,
      spent_cost_cents_current_month: summary.monthSpentCostCents,
      topup_actions_current_month: summary.monthTopupActions,
      topup_carryover_actions: summary.carryoverTopupActions,
      topup_remaining_actions_current_month: summary.topupRemainingActions,
      base_remaining_actions_current_month: summary.baseRemainingActions,
      available_actions_current_month: summary.monthAvailableActions,
      remaining_actions_current_month: summary.monthRemainingActions,
      usage_percent_current_month: usagePercentCurrentMonth,
      month_key: summary.monthKey,
      window_kind: summary.windowKind,
      window_days: summary.windowDays,
      window_start_iso: summary.windowStartIso,
      window_end_iso: summary.windowEndIso,
      quota_reset_at_iso: summary.windowEndIso,
      plan_override_tier: summary.planOverride.tier,
      plan_override_starts_at_iso: summary.planOverride.startsAtIso,
      plan_override_expires_at_iso: summary.planOverride.endsAtIso,
      plan_override_unlimited: summary.planOverride.unlimited,
      plan_override_active: summary.planOverride.isActive,
    },
  });
}
