import {
  computeAccess,
  resolveProQuotaPolicy,
  PRO_MONTHLY_AI_BUDGET_CENTS,
  PRO_YEARLY_AI_BUDGET_CENTS,
} from "./billing";

describe("computeAccess", () => {
  const future = new Date(Date.now() + 1000 * 60 * 60).toISOString();
  const past = new Date(Date.now() - 1000 * 60 * 60).toISOString();

  it("keeps Pro when active and period_end is future", () => {
    const result = computeAccess({
      stripe_status: "active",
      stripe_current_period_end: future,
    });
    expect(result.planTier).toBe("pro");
    expect(result.paymentIssue).toBe(false);
  });

  it("keeps Pro when canceled but period_end is future", () => {
    const result = computeAccess({
      stripe_status: "canceled",
      stripe_current_period_end: future,
    });
    expect(result.planTier).toBe("pro");
  });

  it("keeps Pro with payment issue on past_due", () => {
    const result = computeAccess({
      stripe_status: "past_due",
      stripe_current_period_end: future,
    });
    expect(result.planTier).toBe("pro");
    expect(result.paymentIssue).toBe(true);
  });

  it("downgrades on unpaid", () => {
    const result = computeAccess({
      stripe_status: "unpaid",
      stripe_current_period_end: future,
    });
    expect(result.planTier).toBe("free");
  });

  it("downgrades on incomplete_expired", () => {
    const result = computeAccess({
      stripe_status: "incomplete_expired",
      stripe_current_period_end: future,
    });
    expect(result.planTier).toBe("free");
  });

  it("downgrades when period_end is past", () => {
    const result = computeAccess({
      stripe_status: "active",
      stripe_current_period_end: past,
    });
    expect(result.planTier).toBe("free");
  });
});

describe("resolveProQuotaPolicy", () => {
  it("returns monthly policy for monthly Pro price", () => {
    const policy = resolveProQuotaPolicy("price_month_test");
    expect(policy).toEqual({
      interval: "month",
      windowDays: 30,
      budgetCents: PRO_MONTHLY_AI_BUDGET_CENTS,
    });
  });

  it("returns yearly policy for yearly Pro price", () => {
    const policy = resolveProQuotaPolicy("price_year_test");
    expect(policy).toEqual({
      interval: "year",
      windowDays: 365,
      budgetCents: PRO_YEARLY_AI_BUDGET_CENTS,
    });
  });

  it("returns null for unknown price", () => {
    expect(resolveProQuotaPolicy("price_unknown")).toBeNull();
  });
});
