"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useProfile } from "./profile-context";

type PricingPlan = {
  id: string;
  slug: string;
  label: string;
  price_cents: number;
  currency: string;
  interval: "month" | "year";
  badge: string | null;
  cta_label: string | null;
  features: string[] | null;
  is_highlighted: boolean;
  sort_order: number;
};

type PremiumOfferModalProps = {
  open: boolean;
  onClose: () => void;
  notice?: {
    title: string;
    description: string;
    tags?: string[];
    status?: { label: string; value: string }[];
  } | null;
};

const isEnterprisePlan = (plan: PricingPlan) => {
  const slug = plan.slug.toLowerCase();
  const label = plan.label.toLowerCase();
  return slug.includes("enterprise") || label.includes("entreprise");
};

const isFreePlan = (plan: PricingPlan) => {
  const slug = plan.slug.toLowerCase();
  const label = plan.label.toLowerCase();
  return slug.includes("free") || label.includes("free");
};

const isProPlan = (plan: PricingPlan) => {
  const slug = plan.slug.toLowerCase();
  const label = plan.label.toLowerCase();
  return slug.includes("pro") || label.includes("pro");
};

const formatCurrency = (value: string) => {
  const upper = value.toUpperCase();
  if (upper === "EUR") return "€";
  if (upper === "USD") return "$";
  if (upper === "GBP") return "£";
  return upper;
};

const formatPrice = (plan: PricingPlan) => {
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

const toBaseSlug = (slug: string) => slug.replace(/-(annual|year)$/i, "");

const formatMonthlyEquivalent = (plan: PricingPlan) => {
  const amount = plan.price_cents / 1200;
  const value = Number.isInteger(amount) ? `${Math.round(amount)}` : amount.toFixed(1);
  return `${value} ${formatCurrency(plan.currency)} / mois`;
};

const parseFeature = (feature: string) => {
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

export default function PremiumOfferModal({
  open,
  onClose,
  notice = null,
}: PremiumOfferModalProps) {
  const { planTier, planTierOverrideActive } = useProfile();
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [billingInterval, setBillingInterval] = useState<"month" | "year">("month");
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState("");

  useEffect(() => {
    if (!open) return;

    const loadPlans = async () => {
      setLoading(true);
      setError("");

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        setError("Session invalide. Reconnecte toi.");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/pricing", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json()) as {
        plans?: PricingPlan[];
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? "Chargement impossible.");
        setLoading(false);
        return;
      }

      setPlans(payload.plans ?? []);
      setLoading(false);
    };

    loadPlans();
  }, [open]);

  const requestBilling = async (
    endpoint: "checkout" | "portal",
    payload?: { interval: "month" | "year" }
  ) => {
    setBillingLoading(true);
    setBillingError("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setBillingError("Session invalide. Reconnecte toi.");
      setBillingLoading(false);
      return;
    }

    const response = await fetch(`/api/billing/${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });

    const data = (await response.json()) as { url?: string; error?: string };

    if (!response.ok || !data.url) {
      setBillingError(data.error ?? "Impossible d ouvrir la page Stripe.");
      setBillingLoading(false);
      return;
    }

    window.location.assign(data.url);
  };

  if (!open) return null;

  const badgeClassForTag = (tag: string) => {
    const key = tag.toLowerCase();
    if (key.includes("datas") || key.includes("radar")) {
      return "border-violet-300/30 bg-violet-400/10 text-violet-100";
    }
    if (key.includes("tpi")) {
      return "border-rose-300/30 bg-rose-400/10 text-rose-100";
    }
    if (key.includes("premium") || key.includes("ia")) {
      return "border-emerald-300/30 bg-emerald-400/10 text-emerald-100";
    }
    return "border-white/10 bg-white/5 text-[var(--muted)]";
  };

  const hasMonthly = plans.some((plan) => plan.interval === "month");
  const hasYearly = plans.some((plan) => plan.interval === "year");
  const showIntervalToggle = hasMonthly && hasYearly;

  const plansByBase = new Map<
    string,
    {
      baseSlug: string;
      sortOrder: number;
      monthly?: PricingPlan;
      yearly?: PricingPlan;
    }
  >();

  plans.forEach((plan) => {
    const baseSlug = toBaseSlug(plan.slug);
    const existing = plansByBase.get(baseSlug) ?? {
      baseSlug,
      sortOrder: plan.sort_order ?? 0,
    };
    if (plan.interval === "month") existing.monthly = plan;
    if (plan.interval === "year") existing.yearly = plan;
    existing.sortOrder = Math.min(existing.sortOrder, plan.sort_order ?? 0);
    plansByBase.set(baseSlug, existing);
  });

  const planCards = Array.from(plansByBase.values())
    .map((group) => {
      const plan =
        (billingInterval === "month" ? group.monthly : group.yearly) ??
        group.monthly ??
        group.yearly ??
        null;
      if (!plan) return null;
      return {
        plan,
        monthlyPlan: group.monthly ?? null,
        yearlyPlan: group.yearly ?? null,
        sortOrder: group.sortOrder,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 px-4 py-10 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-7xl overflow-hidden rounded-[32px] border border-black/10 bg-gradient-to-br from-[#f3efe6] via-[#f6f2ea] to-[#ece2cc] text-slate-900 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
        <div className="flex flex-wrap items-center justify-between gap-4 px-7 py-6">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Pricing</p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-900">
              Plans et tarifs
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Compare les offres et choisis le plan qui correspond a ton coaching.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {showIntervalToggle ? (
              <div className="inline-flex rounded-full border border-black/10 bg-white/70 p-1 text-xs shadow-sm">
                <button
                  type="button"
                  onClick={() => setBillingInterval("year")}
                  className={`rounded-full px-4 py-1.5 font-semibold uppercase tracking-wide transition ${
                    billingInterval === "year"
                      ? "bg-slate-900 text-white shadow"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Annuel
                </button>
                <button
                  type="button"
                  onClick={() => setBillingInterval("month")}
                  className={`rounded-full px-4 py-1.5 font-semibold uppercase tracking-wide transition ${
                    billingInterval === "month"
                      ? "bg-slate-900 text-white shadow"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Mensuel
                </button>
              </div>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white/70 text-slate-600 transition hover:bg-white hover:text-slate-900"
              aria-label="Fermer"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6L6 18" />
                <path d="M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        {notice ? (
          <div className="mx-7 mb-4 rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-slate-800 shadow-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
              {notice.title}
            </p>
            <p className="mt-2 text-sm text-slate-800">{notice.description}</p>
            {notice.tags && notice.tags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {notice.tags.map((tag) => (
                  <span
                    key={tag}
                    className={`rounded-full border px-3 py-1 text-[0.6rem] uppercase tracking-wide ${badgeClassForTag(
                      tag
                    )}`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            {notice.status && notice.status.length > 0 ? (
              <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                {notice.status.map((line) => (
                  <div key={line.label} className="flex items-center gap-2">
                    <span className="uppercase tracking-[0.2em] text-[0.6rem] text-slate-500">
                      {line.label}
                    </span>
                    <span className="rounded-full border border-black/10 bg-white/60 px-2 py-0.5 text-[0.6rem] uppercase tracking-wide text-slate-700">
                      {line.value}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="px-7 pb-10 pt-2">
          {loading ? (
            <div className="rounded-2xl border border-black/10 bg-white/70 p-5 text-sm text-slate-600">
              Chargement des offres...
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-black/10 bg-white/70 p-5 text-sm text-red-600">
              {error}
            </div>
          ) : planCards.length === 0 ? (
            <div className="rounded-2xl border border-black/10 bg-white/70 p-5 text-sm text-slate-600">
              Aucune offre disponible.
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {planCards.map(({ plan, monthlyPlan, yearlyPlan }) => {
                const highlight = plan.is_highlighted;
                const isFree = isFreePlan(plan);
                const isPro = isProPlan(plan);
                const isEnterprise = isEnterprisePlan(plan);
                const showMonthlyEquivalent =
                  plan.interval === "year" &&
                  monthlyPlan &&
                  plan.price_cents > 0 &&
                  !isEnterprise;
                const annualSavings =
                  plan.interval === "year" && monthlyPlan && monthlyPlan.price_cents > 0
                    ? Math.round(
                        (1 - plan.price_cents / (monthlyPlan.price_cents * 12)) * 100
                      )
                    : null;
                const priceLabel = formatPrice(plan);
                const priceParts = priceLabel.split(" /");
                const amountLabel = priceParts[0] ?? priceLabel;
                const intervalLabel = priceParts[1] ?? "";
                const badgeLabel =
                  plan.badge ?? (highlight && !isEnterprise ? "Populaire" : null);
                const billedYearlyTotal = yearlyPlan
                  ? `${Math.round(yearlyPlan.price_cents / 100)} ${formatCurrency(
                      yearlyPlan.currency
                    )} facture annuellement`
                  : null;
                const isCurrentPlan =
                  (planTier === "free" && isFree) ||
                  (planTier === "pro" && isPro) ||
                  (planTier === "enterprise" && isEnterprise);
                const canManage = planTier === "pro" && isPro && !planTierOverrideActive;
                const canCheckout = planTier === "free" && isPro && !planTierOverrideActive;
                const canContact = isEnterprise && !isCurrentPlan;
                const ctaLabel = (() => {
                  if (isCurrentPlan) {
                    if (planTierOverrideActive && planTier === "pro") return "Plan offert";
                    if (planTier === "pro") return "Gerer mon abonnement";
                    return "Plan actuel";
                  }
                  if (isEnterprise) return "Nous contacter";
                  return plan.cta_label || "Choisir";
                })();
                const isDisabled =
                  billingLoading ||
                  (isCurrentPlan && (planTier !== "pro" || planTierOverrideActive)) ||
                  (!isCurrentPlan && !canManage && !canCheckout && !canContact);
                const handleCta = () => {
                  if (canContact) {
                    window.location.assign("mailto:adrien.lafuge@outlook.fr");
                    return;
                  }
                  if (canManage) {
                    void requestBilling("portal");
                    return;
                  }
                  if (canCheckout) {
                    void requestBilling("checkout", { interval: billingInterval });
                  }
                };
                return (
                  <div
                    key={plan.id}
                    className={`relative flex h-full flex-col rounded-3xl border px-5 py-6 transition ${
                      highlight
                        ? "border-[#f2d68a] bg-[#2c2c2c] text-white shadow-[0_25px_60px_rgba(15,23,42,0.45)]"
                        : "border-black/10 bg-white/85 text-slate-900 shadow-sm"
                    }`}
                  >
                    {badgeLabel ? (
                      <span
                        className={`absolute -right-px -top-px rounded-bl-2xl rounded-tr-[28px] rounded-br-sm rounded-tl-sm border px-3.5 py-1.5 text-[0.6rem] uppercase tracking-[0.2em] shadow-md ${
                          highlight
                            ? "border-white/25 bg-[#3a3a3a] text-white"
                            : "border-black/10 bg-[#f0e6cf] text-slate-700"
                        }`}
                      >
                        {badgeLabel}
                      </span>
                    ) : null}
                    <div className="min-h-[120px]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p
                            className={`text-xs uppercase tracking-[0.2em] ${
                              highlight ? "text-white/70" : "text-slate-500"
                            }`}
                          >
                            {plan.label}
                          </p>
                          <div className="mt-3 flex items-end gap-2">
                            <span
                              className={`text-3xl font-semibold ${
                                highlight ? "text-[#f2d68a]" : "text-slate-900"
                              }`}
                            >
                              {amountLabel}
                            </span>
                              {intervalLabel && !isFree ? (
                                <span
                                  className={`pb-1 text-xs uppercase tracking-wide ${
                                    highlight ? "text-white/60" : "text-slate-500"
                                  }`}
                                >
                                  / {intervalLabel}
                                </span>
                              ) : null}
                            </div>
                            {billingInterval === "year" && showMonthlyEquivalent && !isFree ? (
                              <p
                                className={`mt-2 text-xs ${
                                  highlight ? "text-white/60" : "text-slate-500"
                                }`}
                              >
                                Equiv {formatMonthlyEquivalent(plan)}
                              </p>
                            ) : billingInterval === "month" && !isFree ? (
                              <p
                                className={`mt-2 text-xs ${
                                  highlight ? "text-white/60" : "text-slate-500"
                                }`}
                              >
                                Facturation mensuelle.
                              </p>
                            ) : null}
                        </div>
                      </div>
                    </div>
                    <ul
                      className={`mt-5 flex-1 space-y-2 text-[0.7rem] ${
                        highlight ? "text-white/85" : "text-slate-700"
                      }`}
                    >
                      {(plan.features ?? []).length === 0 ? (
                        <li>Aucune feature specifiee.</li>
                      ) : (
                        (plan.features ?? []).map((feature, idx) => {
                          const { label, isExcluded } = parseFeature(feature);
                          return (
                            <li
                              key={`${plan.id}-feature-${idx}`}
                              className="flex items-start gap-2"
                            >
                              <span
                                className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-[0.6rem] font-semibold leading-none ${
                                  isExcluded
                                    ? highlight
                                      ? "bg-white/10 text-white/40"
                                      : "bg-slate-300 text-slate-500"
                                    : "bg-emerald-500 text-white"
                                }`}
                                aria-hidden
                              >
                                {isExcluded ? "x" : "+"}
                              </span>
                              <span
                                className={
                                  isExcluded
                                    ? highlight
                                      ? "text-white/50"
                                      : "text-slate-500"
                                    : ""
                                }
                              >
                                {label}
                              </span>
                            </li>
                          );
                        })
                      )}
                    </ul>
                      {billingInterval === "year" &&
                      billedYearlyTotal &&
                      annualSavings !== null &&
                      annualSavings > 0 &&
                      !isFree ? (
                        <p
                          className={`mt-4 text-xs ${
                            highlight ? "text-white/60" : "text-slate-500"
                          }`}
                        >
                        {billedYearlyTotal}. Economise {annualSavings}%.
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleCta}
                      disabled={isDisabled}
                      className={`mt-5 w-full rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                        highlight
                          ? "bg-white text-slate-900 hover:bg-white/90"
                          : "border border-black/10 bg-white text-slate-900 hover:bg-slate-50"
                      } ${isDisabled ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      {billingLoading && planTier === "pro" && isCurrentPlan
                        ? "Ouverture..."
                        : ctaLabel}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {billingError ? (
          <div className="mx-7 mb-6 rounded-2xl border border-amber-300/30 bg-amber-200/40 px-4 py-3 text-xs text-amber-800">
            {billingError}
          </div>
        ) : null}
        <div className="border-t border-black/10 px-7 py-4 text-xs text-slate-600">
          Besoin d&apos;un plan equipe ou club ? Contacte-nous pour une offre sur mesure : adrien.lafuge@outlook.fr
        </div>
      </div>
    </div>
  );
}
