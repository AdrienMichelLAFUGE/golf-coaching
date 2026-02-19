import "server-only";

import { computeAiCostEurCentsFromUsageRow } from "@/lib/ai/pricing";
import { computeAccess, resolveProQuotaPolicy } from "@/lib/billing";

type AdminClient = ReturnType<
  typeof import("@/lib/supabase/server").createSupabaseAdminClient
>;

type AiBudgetSummary = {
  enabled: boolean;
  monthlyBudgetCents: number | null;
  monthTopupCents: number;
  carryoverTopupCents: number;
  topupRemainingCents: number;
  baseRemainingCents: number;
  monthSpentCents: number;
  monthAvailableCents: number | null;
  monthRemainingCents: number | null;
  monthKey: string;
  monthStartIso: string;
  monthEndIso: string;
  windowKind: "calendar_month" | "sliding_pro";
  windowDays: number | null;
  windowStartIso: string;
  windowEndIso: string;
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

const loadProSlidingWindow = async (params: {
  admin: AdminClient;
  userId: string;
  now: Date;
}) => {
  const { admin, userId, now } = params;
  try {
    const orgResponse = (await admin
      .from("organizations")
      .select(
        "id, workspace_type, owner_profile_id, stripe_status, stripe_current_period_end, stripe_price_id"
      )
      .eq("workspace_type", "personal")
      .eq("owner_profile_id", userId)
      .maybeSingle()) as {
      data?: {
        stripe_status?: string | null;
        stripe_current_period_end?: string | null;
        stripe_price_id?: string | null;
      } | null;
    };

    const org = orgResponse.data;
    if (!org) return null;

    const access = computeAccess(
      {
        stripe_status: org.stripe_status ?? null,
        stripe_current_period_end: org.stripe_current_period_end ?? null,
        stripe_price_id: org.stripe_price_id ?? null,
      },
      now
    );
    if (access.planTier !== "pro") {
      return null;
    }

    const quota = resolveProQuotaPolicy(org.stripe_price_id ?? null);
    if (!quota) {
      return null;
    }

    const periodEnd = parseIsoDate(org.stripe_current_period_end ?? null);
    if (!periodEnd || periodEnd.getTime() <= now.getTime()) {
      return null;
    }

    const periodStart = new Date(periodEnd.getTime() - quota.windowDays * DAY_MS);
    return {
      windowKind: "sliding_pro" as const,
      windowDays: quota.windowDays,
      windowStartIso: periodStart.toISOString(),
      windowEndIso: periodEnd.toISOString(),
      budgetCents: quota.budgetCents,
    };
  } catch {
    return null;
  }
};

type BudgetEvent = {
  timestampMs: number;
  kind: "topup" | "usage";
  amountCents: number;
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
  amountCents: number;
  topupBalanceCents: number;
  baseRemainingCents: number;
}) => {
  const amountCents = Math.max(0, params.amountCents);
  let remaining = amountCents;
  let topupBalanceCents = Math.max(0, params.topupBalanceCents);
  let baseRemainingCents = Math.max(0, params.baseRemainingCents);

  if (topupBalanceCents > 0 && remaining > 0) {
    const topupUsage = Math.min(remaining, topupBalanceCents);
    topupBalanceCents -= topupUsage;
    remaining -= topupUsage;
  }

  if (baseRemainingCents > 0 && remaining > 0) {
    const baseUsage = Math.min(remaining, baseRemainingCents);
    baseRemainingCents -= baseUsage;
    remaining -= baseUsage;
  }

  return {
    topupBalanceCents,
    baseRemainingCents,
    uncoveredCents: remaining,
  };
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
  let monthlyBudgetCents = params.profileBudget?.ai_budget_monthly_cents ?? null;
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
    monthlyBudgetCents = profileData?.ai_budget_monthly_cents ?? null;
  }

  const proWindow = await loadProSlidingWindow({ admin, userId, now });
  const windowKind = proWindow ? "sliding_pro" : "calendar_month";
  const windowStartIso = proWindow?.windowStartIso ?? monthStartIso;
  const windowEndIso = proWindow?.windowEndIso ?? monthEndIso;
  const windowDays = proWindow?.windowDays ?? null;
  const baseBudgetCents = Math.max(
    0,
    proWindow?.budgetCents ?? (monthlyBudgetCents ?? 0)
  );

  // Pro personal subscriptions always enforce the quota budget policy.
  const budgetEnabled = proWindow ? true : enabled;
  const budgetValueCents = proWindow ? proWindow.budgetCents : monthlyBudgetCents;

  if (!budgetEnabled) {
    return {
      enabled: false,
      monthlyBudgetCents: budgetValueCents,
      monthTopupCents: 0,
      carryoverTopupCents: 0,
      topupRemainingCents: 0,
      baseRemainingCents: 0,
      monthSpentCents: 0,
      monthAvailableCents: null,
      monthRemainingCents: null,
      monthKey,
      monthStartIso,
      monthEndIso,
      windowKind,
      windowDays,
      windowStartIso,
      windowEndIso,
    };
  }

  let topups: Array<{ amount_cents?: number | null; created_at?: string | null }> | null | undefined =
    [];
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
  let currentTopupCents = 0;
  let currentSpentCents = 0;

  (topups ?? []).forEach((row) => {
    const amountCents = toNumber(row.amount_cents);
    if (amountCents <= 0) return;
    const createdAt = parseIsoDate(row.created_at ?? null);
    if (!createdAt) return;
    const timestampMs = createdAt.getTime();
    if (timestampMs >= windowEndTs) return;
    const event: BudgetEvent = {
      timestampMs,
      kind: "topup",
      amountCents,
    };
    if (timestampMs >= windowStartTs) {
      currentTopupCents += amountCents;
      currentEvents.push(event);
      return;
    }
    pastEvents.push(event);
  });

  (usageRows ?? []).forEach((row) => {
    const amountCents = computeAiCostEurCentsFromUsageRow(row);
    if (amountCents <= 0) return;
    const createdAt = parseIsoDate(row.created_at ?? null);
    if (!createdAt) return;
    const timestampMs = createdAt.getTime();
    if (timestampMs >= windowEndTs) return;
    const event: BudgetEvent = {
      timestampMs,
      kind: "usage",
      amountCents,
    };
    if (timestampMs >= windowStartTs) {
      currentSpentCents += amountCents;
      currentEvents.push(event);
      return;
    }
    pastEvents.push(event);
  });

  pastEvents.sort(sortBudgetEvents);
  currentEvents.sort(sortBudgetEvents);

  let carryoverTopupCents = 0;
  let activePastPeriodIndex: number | null = null;
  let pastBaseRemainingCents = baseBudgetCents;

  pastEvents.forEach((event) => {
    const periodIndex = periodIndexResolver(event.timestampMs);
    if (periodIndex >= 0) return;
    if (activePastPeriodIndex === null || periodIndex !== activePastPeriodIndex) {
      activePastPeriodIndex = periodIndex;
      pastBaseRemainingCents = baseBudgetCents;
    }
    if (event.kind === "topup") {
      carryoverTopupCents += event.amountCents;
      return;
    }
    const consumed = consumeBudget({
      amountCents: event.amountCents,
      topupBalanceCents: carryoverTopupCents,
      baseRemainingCents: pastBaseRemainingCents,
    });
    carryoverTopupCents = consumed.topupBalanceCents;
    pastBaseRemainingCents = consumed.baseRemainingCents;
  });

  let topupRemainingCents = carryoverTopupCents;
  let baseRemainingCents = baseBudgetCents;
  currentEvents.forEach((event) => {
    if (event.kind === "topup") {
      topupRemainingCents += event.amountCents;
      return;
    }
    const consumed = consumeBudget({
      amountCents: event.amountCents,
      topupBalanceCents: topupRemainingCents,
      baseRemainingCents,
    });
    topupRemainingCents = consumed.topupBalanceCents;
    baseRemainingCents = consumed.baseRemainingCents;
  });

  const monthAvailableCents = Math.max(
    0,
    baseBudgetCents + carryoverTopupCents + currentTopupCents
  );
  const monthRemainingCents = monthAvailableCents - currentSpentCents;

  return {
    enabled: true,
    monthlyBudgetCents: budgetValueCents,
    monthTopupCents: currentTopupCents,
    carryoverTopupCents,
    topupRemainingCents,
    baseRemainingCents,
    monthSpentCents: currentSpentCents,
    monthAvailableCents,
    monthRemainingCents,
    monthKey,
    monthStartIso,
    monthEndIso,
    windowKind,
    windowDays,
    windowStartIso,
    windowEndIso,
  };
};

export const isAiBudgetBlocked = (summary: AiBudgetSummary) =>
  summary.enabled &&
  summary.monthAvailableCents !== null &&
  summary.monthRemainingCents !== null &&
  summary.monthRemainingCents <= 0;
