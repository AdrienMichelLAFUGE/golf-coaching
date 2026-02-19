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
  if (summary.monthAvailableCents !== null) {
    if (summary.monthAvailableCents <= 0) {
      usagePercentCurrentMonth = summary.monthSpentCents > 0 ? 100 : 0;
    } else {
      usagePercentCurrentMonth = Math.min(
        100,
        Math.max(
          0,
          Math.round((summary.monthSpentCents / summary.monthAvailableCents) * 100)
        )
      );
    }
  }

  return NextResponse.json({
    summary: {
      enabled: summary.enabled,
      monthly_budget_cents: summary.monthlyBudgetCents,
      spent_cents_current_month: summary.monthSpentCents,
      topup_cents_current_month: summary.monthTopupCents,
      topup_carryover_cents: summary.carryoverTopupCents,
      topup_remaining_cents_current_month: summary.topupRemainingCents,
      base_remaining_cents_current_month: summary.baseRemainingCents,
      available_cents_current_month: summary.monthAvailableCents,
      remaining_cents_current_month: summary.monthRemainingCents,
      usage_percent_current_month: usagePercentCurrentMonth,
      month_key: summary.monthKey,
      window_kind: summary.windowKind,
      window_days: summary.windowDays,
      window_start_iso: summary.windowStartIso,
      window_end_iso: summary.windowEndIso,
      quota_reset_at_iso: summary.windowEndIso,
    },
  });
}
