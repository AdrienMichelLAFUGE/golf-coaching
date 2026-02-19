import "server-only";

import { env } from "@/env";
import type { PlanTier } from "@/lib/plans";

export type StripeAccessFields = {
  stripe_status?: string | null;
  stripe_current_period_end?: string | null;
  stripe_cancel_at_period_end?: boolean | null;
  stripe_price_id?: string | null;
};

export type StripeAccessResult = {
  planTier: PlanTier;
  paymentIssue: boolean;
};

export type ProQuotaPolicy = {
  interval: "month" | "year";
  windowDays: number;
  quotaActions: number;
};

export const PRO_MONTHLY_AI_QUOTA_ACTIONS = 1800;
export const PRO_YEARLY_AI_QUOTA_ACTIONS = 18_000;
export const PRO_MONTHLY_AI_WINDOW_DAYS = 30;
export const PRO_YEARLY_AI_WINDOW_DAYS = 365;

export const isProPriceId = (priceId?: string | null) =>
  Boolean(
    priceId &&
      (priceId === env.STRIPE_PRO_PRICE_MONTH_ID ||
        priceId === env.STRIPE_PRO_PRICE_YEAR_ID)
  );

export const resolveProPriceId = (interval: "month" | "year") =>
  interval === "month" ? env.STRIPE_PRO_PRICE_MONTH_ID : env.STRIPE_PRO_PRICE_YEAR_ID;

export const resolveProQuotaPolicy = (
  stripePriceId?: string | null
): ProQuotaPolicy | null => {
  if (!stripePriceId) return null;
  if (stripePriceId === env.STRIPE_PRO_PRICE_MONTH_ID) {
    return {
      interval: "month",
      windowDays: PRO_MONTHLY_AI_WINDOW_DAYS,
      quotaActions: PRO_MONTHLY_AI_QUOTA_ACTIONS,
    };
  }
  if (stripePriceId === env.STRIPE_PRO_PRICE_YEAR_ID) {
    return {
      interval: "year",
      windowDays: PRO_YEARLY_AI_WINDOW_DAYS,
      quotaActions: PRO_YEARLY_AI_QUOTA_ACTIONS,
    };
  }
  return null;
};

export const AI_CREDIT_TOPUP_OPTIONS_CENTS = [500, 1000, 2000] as const;
export type AiCreditTopupAmountCents = (typeof AI_CREDIT_TOPUP_OPTIONS_CENTS)[number];
export const AI_CREDIT_TOPUP_ACTIONS_BY_CENTS: Record<
  AiCreditTopupAmountCents,
  number
> = {
  500: 150,
  1000: 350,
  2000: 800,
};

export const resolveAiCreditTopupActions = (amountCents: number) => {
  if (amountCents === 500) return AI_CREDIT_TOPUP_ACTIONS_BY_CENTS[500];
  if (amountCents === 1000) return AI_CREDIT_TOPUP_ACTIONS_BY_CENTS[1000];
  if (amountCents === 2000) return AI_CREDIT_TOPUP_ACTIONS_BY_CENTS[2000];
  return 0;
};

export const resolveAiCreditTopupPriceId = (
  amountCents: number
): string | null => {
  if (amountCents === 500) return env.STRIPE_AI_CREDIT_PRICE_5_ID ?? null;
  if (amountCents === 1000) return env.STRIPE_AI_CREDIT_PRICE_10_ID ?? null;
  if (amountCents === 2000) return env.STRIPE_AI_CREDIT_PRICE_20_ID ?? null;
  return null;
};

const toTimestamp = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
};

export const computeAccess = (
  fields: StripeAccessFields,
  now: Date = new Date()
): StripeAccessResult => {
  const status = (fields.stripe_status ?? "").toLowerCase();
  const periodEnd = toTimestamp(fields.stripe_current_period_end);
  const nowTs = now.getTime();
  const isActiveWindow = periodEnd !== null && periodEnd > nowTs;

  if (status === "unpaid" || status === "incomplete_expired") {
    return { planTier: "free", paymentIssue: false };
  }

  if (!isActiveWindow) {
    return { planTier: "free", paymentIssue: false };
  }

  const allowedStatuses = new Set(["active", "trialing", "canceled", "past_due"]);
  if (!allowedStatuses.has(status)) {
    return { planTier: "free", paymentIssue: false };
  }

  return {
    planTier: "pro",
    paymentIssue: status === "past_due",
  };
};

export const resolveAbsoluteUrl = (value: string) => {
  if (!value) return env.NEXT_PUBLIC_SITE_URL;
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  const base = env.NEXT_PUBLIC_SITE_URL.endsWith("/")
    ? env.NEXT_PUBLIC_SITE_URL
    : `${env.NEXT_PUBLIC_SITE_URL}/`;
  const cleaned = value.replace(/^\//, "");
  return new URL(cleaned, base).toString();
};

export const resolveSuccessUrl = () => resolveAbsoluteUrl(env.STRIPE_SUCCESS_URL);

export const resolveCancelUrl = () => resolveAbsoluteUrl(env.STRIPE_CANCEL_URL);
