import { z } from "zod";

export const pricingPlanSchema = z.object({
  id: z.string(),
  slug: z.string(),
  label: z.string(),
  price_cents: z.number().int().nonnegative(),
  currency: z.string(),
  interval: z.union([z.literal("month"), z.literal("year")]),
  badge: z.string().nullable(),
  cta_label: z.string().nullable(),
  features: z.array(z.string()).nullable(),
  is_active: z.boolean().optional(),
  is_highlighted: z.boolean(),
  sort_order: z.number().int(),
});

export type PricingPlan = z.infer<typeof pricingPlanSchema>;

export const pricingPlansSchema = z.array(pricingPlanSchema);

export const isEnterprisePlan = (plan: PricingPlan) => {
  const slug = plan.slug.toLowerCase();
  const label = plan.label.toLowerCase();
  return slug.includes("enterprise") || label.includes("entreprise");
};

export const isFreePlan = (plan: PricingPlan) => {
  const slug = plan.slug.toLowerCase();
  const label = plan.label.toLowerCase();
  return slug.includes("free") || label.includes("free");
};

export const isProPlan = (plan: PricingPlan) => {
  const slug = plan.slug.toLowerCase();
  const label = plan.label.toLowerCase();
  return slug.includes("pro") || label.includes("pro");
};

export const formatCurrency = (value: string) => {
  const upper = value.toUpperCase();
  if (upper === "EUR") return "€";
  if (upper === "USD") return "$";
  if (upper === "GBP") return "£";
  return upper;
};

export const formatPrice = (plan: PricingPlan) => {
  if (isEnterprisePlan(plan)) return "Sur devis";
  if (plan.price_cents === 0) {
    return isFreePlan(plan) ? "Gratuit" : "Prix a definir";
  }
  const amount = plan.price_cents / 100;
  const value =
    Number.isInteger(amount) || Number.isInteger(plan.price_cents / 100)
      ? `${Math.round(amount)}`
      : amount.toFixed(2);
  const intervalLabel = plan.interval === "year" ? "an" : "mois";
  return `${value} ${formatCurrency(plan.currency)} / ${intervalLabel}`;
};

export const toBaseSlug = (slug: string) => slug.replace(/-(annual|year)$/i, "");

export const formatMonthlyEquivalent = (plan: PricingPlan) => {
  const amount = plan.price_cents / 1200;
  const value = Number.isInteger(amount) ? `${Math.round(amount)}` : amount.toFixed(1);
  return `${value} ${formatCurrency(plan.currency)} / mois`;
};

export const parseFeature = (feature: string) => {
  const trimmed = feature.trim();
  const lowered = trimmed.toLowerCase();
  const isExcluded =
    /^(-|x)/i.test(trimmed) ||
    lowered.startsWith("non ") ||
    lowered.startsWith("pas ") ||
    lowered.startsWith("no ");
  const label = trimmed.replace(/^(-|x)\s*/i, "");
  return { label, isExcluded };
};

