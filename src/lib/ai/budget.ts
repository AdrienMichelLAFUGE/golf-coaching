import "server-only";

import {
  computeAiActionCountFromUsageRow,
  computeAiCostEurCentsFromUsageRow,
} from "@/lib/ai/pricing";
import {
  computeAccess,
  resolveAiCreditTopupActions,
  resolveProQuotaPolicy,
} from "@/lib/billing";
import { isPlanTierOverrideActive } from "@/lib/plans";

type AdminClient = ReturnType<
  typeof import("@/lib/supabase/server").createSupabaseAdminClient
>;

type PlanOverrideSummary = {
  tier: "free" | "pro" | "enterprise" | null;
  startsAtIso: string | null;
  endsAtIso: string | null;
  unlimited: boolean;
  isActive: boolean;
};

export type AiBudgetSummary = {
  enabled: boolean;
  monthlyBudgetActions: number | null;
  monthTopupActions: number;
  carryoverTopupActions: number;
  topupRemainingActions: number;
  baseRemainingActions: number;
  monthSpentActions: number;
  monthSpentCostCents: number;
  monthAvailableActions: number | null;
  monthRemainingActions: number | null;
  monthKey: string;
  monthStartIso: string;
  monthEndIso: string;
  windowKind: "calendar_month" | "sliding_pro";
  windowDays: number | null;
  windowStartIso: string;
  windowEndIso: string;
  planOverride: PlanOverrideSummary;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const toNumber = (value: number | string | null | undefined) => {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const parseIsoDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const emptyPlanOverrideSummary = (): PlanOverrideSummary => ({
  tier: null,
  startsAtIso: null,
  endsAtIso: null,
  unlimited: false,
  isActive: false,
});

export const getAiBudgetMonthWindow = (now: Date = new Date()) => {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  return {
    monthKey,
    monthStartIso: start.toISOString(),
    monthEndIso: end.toISOString(),
  };
};

const loadPersonalBillingContext = async (params: {
  admin: AdminClient;
  userId: string;
  now: Date;
}) => {
  const { admin, userId, now } = params;
  try {
    const orgResponse = (await admin
      .from("organizations")
      .select(
        "id, workspace_type, owner_profile_id, stripe_status, stripe_current_period_end, stripe_price_id, plan_tier_override, plan_tier_override_starts_at, plan_tier_override_expires_at, plan_tier_override_unlimited"
      )
      .eq("workspace_type", "personal")
      .eq("owner_profile_id", userId)
      .maybeSingle()) as {
      data?: {
        stripe_status?: string | null;
        stripe_current_period_end?: string | null;
        stripe_price_id?: string | null;
        plan_tier_override?: "free" | "pro" | "enterprise" | null;
        plan_tier_override_starts_at?: string | null;
        plan_tier_override_expires_at?: string | null;
        plan_tier_override_unlimited?: boolean | null;
      } | null;
    };

    const org = orgResponse.data;
    if (!org) {
      return {
        proWindow: null,
        planOverride: emptyPlanOverrideSummary(),
      };
    }

    const planOverrideTier = org.plan_tier_override ?? null;
    const planOverrideStartsAt = org.plan_tier_override_starts_at ?? null;
    const planOverrideExpiresAt = org.plan_tier_override_expires_at ?? null;
    const planOverrideUnlimited = Boolean(org.plan_tier_override_unlimited);
    const planOverride: PlanOverrideSummary = {
      tier: planOverrideTier,
      startsAtIso: planOverrideStartsAt,
      endsAtIso: planOverrideExpiresAt,
      unlimited: planOverrideUnlimited,
      isActive: isPlanTierOverrideActive({
        overrideTier: planOverrideTier,
        overrideStartsAt: planOverrideStartsAt,
        overrideExpiresAt: planOverrideExpiresAt,
        overrideUnlimited: planOverrideUnlimited,
        now,
      }),
    };

    const access = computeAccess(
      {
        stripe_status: org.stripe_status ?? null,
        stripe_current_period_end: org.stripe_current_period_end ?? null,
        stripe_price_id: org.stripe_price_id ?? null,
      },
      now
    );
    if (access.planTier !== "pro") {
      return {
        proWindow: null,
        planOverride,
      };
    }

    const quota = resolveProQuotaPolicy(org.stripe_price_id ?? null);
    if (!quota) {
      return {
        proWindow: null,
        planOverride,
      };
    }

    const periodEnd = parseIsoDate(org.stripe_current_period_end ?? null);
    if (!periodEnd || periodEnd.getTime() <= now.getTime()) {
      return {
        proWindow: null,
        planOverride,
      };
    }

    const periodStart = new Date(periodEnd.getTime() - quota.windowDays * DAY_MS);
    return {
      proWindow: {
        windowKind: "sliding_pro" as const,
        windowDays: quota.windowDays,
        windowStartIso: periodStart.toISOString(),
        windowEndIso: periodEnd.toISOString(),
        quotaActions: quota.quotaActions,
      },
      planOverride,
    };
  } catch {
    return {
      proWindow: null,
      planOverride: emptyPlanOverrideSummary(),
    };
  }
};

type BudgetEvent = {
  timestampMs: number;
  kind: "topup" | "usage";
  amountActions: number;
};

const sortBudgetEvents = (a: BudgetEvent, b: BudgetEvent) => {
  if (a.timestampMs !== b.timestampMs) {
    return a.timestampMs - b.timestampMs;
  }
  if (a.kind === b.kind) return 0;
  return a.kind === "topup" ? -1 : 1;
};

const createCalendarPeriodIndexResolver = (windowStartTs: number) => {
  const windowStartDate = new Date(windowStartTs);
  const startYear = windowStartDate.getUTCFullYear();
  const startMonth = windowStartDate.getUTCMonth();
  return (timestampMs: number) => {
    const date = new Date(timestampMs);
    return (
      (date.getUTCFullYear() - startYear) * 12 + (date.getUTCMonth() - startMonth)
    );
  };
};

const createFixedPeriodIndexResolver = (windowStartTs: number, periodMs: number) => {
  if (periodMs <= 0) {
    return () => 0;
  }
  return (timestampMs: number) => Math.floor((timestampMs - windowStartTs) / periodMs);
};

const consumeBudget = (params: {
  amountActions: number;
  topupBalanceActions: number;
  baseRemainingActions: number;
}) => {
  const amountActions = Math.max(0, params.amountActions);
  let remaining = amountActions;
  let topupBalanceActions = Math.max(0, params.topupBalanceActions);
  let baseRemainingActions = Math.max(0, params.baseRemainingActions);

  if (topupBalanceActions > 0 && remaining > 0) {
    const topupUsage = Math.min(remaining, topupBalanceActions);
    topupBalanceActions -= topupUsage;
    remaining -= topupUsage;
  }

  if (baseRemainingActions > 0 && remaining > 0) {
    const baseUsage = Math.min(remaining, baseRemainingActions);
    baseRemainingActions -= baseUsage;
    remaining -= baseUsage;
  }

  return {
    topupBalanceActions,
    baseRemainingActions,
    uncoveredActions: remaining,
  };
};

const resolveLegacyTopupActions = (rawAmount: number) => {
  const normalized = Math.max(0, Math.round(rawAmount));
  const mapped = resolveAiCreditTopupActions(normalized);
  if (mapped > 0) return mapped;
  return normalized;
};

export const loadAiBudgetSummary = async (params: {
  admin: AdminClient;
  userId: string;
  now?: Date;
  profileBudget?: {
    ai_budget_enabled?: boolean | null;
    ai_budget_monthly_cents?: number | null;
  } | null;
}): Promise<AiBudgetSummary> => {
  const { admin, userId } = params;
  const now = params.now ?? new Date();
  const { monthKey, monthStartIso, monthEndIso } = getAiBudgetMonthWindow(now);

  let enabled = Boolean(params.profileBudget?.ai_budget_enabled);
  let monthlyBudgetActions = params.profileBudget?.ai_budget_monthly_cents ?? null;
  if (!params.profileBudget) {
    let profileData:
      | {
          id: string;
          ai_budget_enabled?: boolean | null;
          ai_budget_monthly_cents?: number | null;
        }
      | null
      | undefined;
    try {
      const profileResponse = (await admin
        .from("profiles")
        .select("id, ai_budget_enabled, ai_budget_monthly_cents")
        .eq("id", userId)
        .maybeSingle()) as {
        data?: {
          id: string;
          ai_budget_enabled?: boolean | null;
          ai_budget_monthly_cents?: number | null;
        } | null;
      };
      profileData = profileResponse.data;
    } catch {
      profileData = null;
    }
    enabled = Boolean(profileData?.ai_budget_enabled);
    monthlyBudgetActions = profileData?.ai_budget_monthly_cents ?? null;
  }

  const billingContext = await loadPersonalBillingContext({ admin, userId, now });
  const proWindow = billingContext.proWindow;
  const planOverride = billingContext.planOverride;
  const windowKind = proWindow ? "sliding_pro" : "calendar_month";
  const windowStartIso = proWindow?.windowStartIso ?? monthStartIso;
  const windowEndIso = proWindow?.windowEndIso ?? monthEndIso;
  const windowDays = proWindow?.windowDays ?? null;

  const manualBudgetActions = Math.max(0, Math.round(toNumber(monthlyBudgetActions)));
  const resolvedBaseBudgetActions =
    manualBudgetActions > 0
      ? manualBudgetActions
      : Math.max(0, proWindow?.quotaActions ?? 0);

  // Personal Pro subscriptions always enforce quota. Admin value overrides if set.
  const budgetEnabled = proWindow ? true : enabled;
  const budgetValueActions = budgetEnabled ? resolvedBaseBudgetActions : null;

  if (!budgetEnabled) {
    return {
      enabled: false,
      monthlyBudgetActions: budgetValueActions,
      monthTopupActions: 0,
      carryoverTopupActions: 0,
      topupRemainingActions: 0,
      baseRemainingActions: 0,
      monthSpentActions: 0,
      monthSpentCostCents: 0,
      monthAvailableActions: null,
      monthRemainingActions: null,
      monthKey,
      monthStartIso,
      monthEndIso,
      windowKind,
      windowDays,
      windowStartIso,
      windowEndIso,
      planOverride,
    };
  }

  let topups:
    | Array<{ amount_cents?: number | null; created_at?: string | null }>
    | null
    | undefined = [];
  try {
    const topupsResponse = (await admin
      .from("ai_credit_topups")
      .select("amount_cents, created_at")
      .eq("profile_id", userId)
      .lt("created_at", windowEndIso)) as {
      data?: Array<{ amount_cents?: number | null; created_at?: string | null }> | null;
    };
    topups = topupsResponse.data;
  } catch {
    topups = [];
  }

  let usageRows:
    | Array<{
        created_at?: string | null;
        model?: string | null;
        input_tokens?: number | string | null;
        output_tokens?: number | string | null;
        total_tokens?: number | string | null;
        cost_eur_cents?: number | string | null;
      }>
    | null
    | undefined = [];
  try {
    const usageResponse = (await admin
      .from("ai_usage")
      .select("created_at, model, input_tokens, output_tokens, total_tokens, cost_eur_cents")
      .eq("user_id", userId)
      .lt("created_at", windowEndIso)) as {
      data?: Array<{
        created_at?: string | null;
        model?: string | null;
        input_tokens?: number | string | null;
        output_tokens?: number | string | null;
        total_tokens?: number | string | null;
        cost_eur_cents?: number | string | null;
      }> | null;
    };
    usageRows = usageResponse.data;
  } catch {
    usageRows = [];
  }

  const windowStartTs = parseIsoDate(windowStartIso)?.getTime() ?? now.getTime();
  const windowEndTs = parseIsoDate(windowEndIso)?.getTime() ?? now.getTime();
  const periodIndexResolver = proWindow
    ? createFixedPeriodIndexResolver(windowStartTs, proWindow.windowDays * DAY_MS)
    : createCalendarPeriodIndexResolver(windowStartTs);

  const pastEvents: BudgetEvent[] = [];
  const currentEvents: BudgetEvent[] = [];
  let currentTopupActions = 0;
  let currentSpentActions = 0;
  let currentSpentCostCents = 0;

  (topups ?? []).forEach((row) => {
    const amountActions = resolveLegacyTopupActions(toNumber(row.amount_cents));
    if (amountActions <= 0) return;
    const createdAt = parseIsoDate(row.created_at ?? null);
    if (!createdAt) return;
    const timestampMs = createdAt.getTime();
    if (timestampMs >= windowEndTs) return;
    const event: BudgetEvent = {
      timestampMs,
      kind: "topup",
      amountActions,
    };
    if (timestampMs >= windowStartTs) {
      currentTopupActions += amountActions;
      currentEvents.push(event);
      return;
    }
    pastEvents.push(event);
  });

  (usageRows ?? []).forEach((row) => {
    const amountActions = computeAiActionCountFromUsageRow(row);
    if (amountActions <= 0) return;
    const createdAt = parseIsoDate(row.created_at ?? null);
    if (!createdAt) return;
    const timestampMs = createdAt.getTime();
    if (timestampMs >= windowEndTs) return;
    const event: BudgetEvent = {
      timestampMs,
      kind: "usage",
      amountActions,
    };
    if (timestampMs >= windowStartTs) {
      currentSpentActions += amountActions;
      currentSpentCostCents += computeAiCostEurCentsFromUsageRow(row);
      currentEvents.push(event);
      return;
    }
    pastEvents.push(event);
  });

  pastEvents.sort(sortBudgetEvents);
  currentEvents.sort(sortBudgetEvents);

  let carryoverTopupActions = 0;
  let activePastPeriodIndex: number | null = null;
  let pastBaseRemainingActions = resolvedBaseBudgetActions;

  pastEvents.forEach((event) => {
    const periodIndex = periodIndexResolver(event.timestampMs);
    if (periodIndex >= 0) return;
    if (activePastPeriodIndex === null || periodIndex !== activePastPeriodIndex) {
      activePastPeriodIndex = periodIndex;
      pastBaseRemainingActions = resolvedBaseBudgetActions;
    }
    if (event.kind === "topup") {
      carryoverTopupActions += event.amountActions;
      return;
    }
    const consumed = consumeBudget({
      amountActions: event.amountActions,
      topupBalanceActions: carryoverTopupActions,
      baseRemainingActions: pastBaseRemainingActions,
    });
    carryoverTopupActions = consumed.topupBalanceActions;
    pastBaseRemainingActions = consumed.baseRemainingActions;
  });

  let topupRemainingActions = carryoverTopupActions;
  let baseRemainingActions = resolvedBaseBudgetActions;
  currentEvents.forEach((event) => {
    if (event.kind === "topup") {
      topupRemainingActions += event.amountActions;
      return;
    }
    const consumed = consumeBudget({
      amountActions: event.amountActions,
      topupBalanceActions: topupRemainingActions,
      baseRemainingActions,
    });
    topupRemainingActions = consumed.topupBalanceActions;
    baseRemainingActions = consumed.baseRemainingActions;
  });

  const monthAvailableActions = Math.max(
    0,
    resolvedBaseBudgetActions + carryoverTopupActions + currentTopupActions
  );
  const monthRemainingActions = monthAvailableActions - currentSpentActions;

  return {
    enabled: true,
    monthlyBudgetActions: budgetValueActions,
    monthTopupActions: currentTopupActions,
    carryoverTopupActions,
    topupRemainingActions,
    baseRemainingActions,
    monthSpentActions: currentSpentActions,
    monthSpentCostCents: currentSpentCostCents,
    monthAvailableActions,
    monthRemainingActions,
    monthKey,
    monthStartIso,
    monthEndIso,
    windowKind,
    windowDays,
    windowStartIso,
    windowEndIso,
    planOverride,
  };
};

export const isAiBudgetBlocked = (summary: AiBudgetSummary) =>
  summary.enabled &&
  summary.monthAvailableActions !== null &&
  summary.monthRemainingActions !== null &&
  summary.monthRemainingActions <= 0;
