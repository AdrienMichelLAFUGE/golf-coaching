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

export const isProPriceId = (priceId?: string | null) =>
  Boolean(
    priceId &&
      (priceId === env.STRIPE_PRO_PRICE_MONTH_ID ||
        priceId === env.STRIPE_PRO_PRICE_YEAR_ID)
  );

export const resolveProPriceId = (interval: "month" | "year") =>
  interval === "month" ? env.STRIPE_PRO_PRICE_MONTH_ID : env.STRIPE_PRO_PRICE_YEAR_ID;

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
