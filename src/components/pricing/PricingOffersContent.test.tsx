import { render, screen } from "@testing-library/react";
import PricingOffersContent from "./PricingOffersContent";
import type { PricingPlan } from "@/lib/pricing/types";

const makePlan = (overrides: Partial<PricingPlan>): PricingPlan => ({
  id: "plan-id",
  slug: "free",
  label: "Free",
  price_cents: 0,
  currency: "EUR",
  interval: "month",
  badge: null,
  cta_label: "Commencer",
  features: ["Feature A"],
  is_highlighted: false,
  sort_order: 0,
  ...overrides,
});

describe("PricingOffersContent (marketing)", () => {
  it("sends Free CTA to /login without Stripe autostart", () => {
    const plans: PricingPlan[] = [
      makePlan({
        id: "free-month",
        slug: "free",
        label: "Free",
        interval: "month",
        cta_label: "Commencer",
      }),
      makePlan({
        id: "pro-month",
        slug: "pro",
        label: "Pro",
        interval: "month",
        price_cents: 1900,
        cta_label: "Choisir Pro",
        sort_order: 1,
      }),
    ];

    render(<PricingOffersContent variant="marketing" plans={plans} />);

    const freeLink = screen.getByRole("link", { name: "Choisir Free" });
    expect(freeLink).toHaveAttribute(
      "href",
      "/login"
    );
    expect(freeLink).toHaveTextContent("Commencer");

    const proHref =
      screen.getByRole("link", { name: "Choisir Pro" }).getAttribute("href") ?? "";
    expect(proHref).toContain("/login?next=");
    expect(decodeURIComponent(proHref)).toContain("/app/pricing?plan=pro");
    expect(decodeURIComponent(proHref)).toContain("autostart=1");
  });
});
