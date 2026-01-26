"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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
};

type PremiumOfferModalProps = {
  open: boolean;
  onClose: () => void;
};

const formatPrice = (plan: PricingPlan) => {
  const amount = plan.price_cents / 100;
  const value =
    Number.isInteger(amount) || Number.isInteger(plan.price_cents / 100)
      ? `${Math.round(amount)}`
      : amount.toFixed(2);
  const intervalLabel = plan.interval === "year" ? "an" : "mois";
  return `${value} ${plan.currency} / ${intervalLabel}`;
};

const toBaseSlug = (slug: string) => slug.replace(/-(annual|year)$/i, "");

const formatMonthlyEquivalent = (plan: PricingPlan) => {
  const amount = plan.price_cents / 1200;
  const value = Number.isInteger(amount) ? `${Math.round(amount)}` : amount.toFixed(1);
  return `${value} ${plan.currency} / mois`;
};

const getPlanCategory = (plan: PricingPlan) => {
  const badge = (plan.badge ?? "").toLowerCase();
  const slug = plan.slug.toLowerCase();
  if (badge.includes("base") || slug.startsWith("premium")) return "base";
  if (badge.includes("pack") || slug.startsWith("pack")) return "pack";
  if (badge.includes("add") || slug.startsWith("addon")) return "addon";
  return "other";
};

export default function PremiumOfferModal({
  open,
  onClose,
}: PremiumOfferModalProps) {
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [billingInterval, setBillingInterval] = useState<"month" | "year">(
    "month"
  );

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

  if (!open) return null;

  const monthlyBySlug = new Map(
    plans
      .filter((plan) => plan.interval === "month")
      .map((plan) => [toBaseSlug(plan.slug), plan])
  );
  const visiblePlans = plans.filter(
    (plan) => plan.interval === billingInterval
  );
  const groupedPlans = visiblePlans.reduce(
    (acc, plan) => {
      const key = getPlanCategory(plan);
      acc[key].push(plan);
      return acc;
    },
    {
      base: [] as PricingPlan[],
      addon: [] as PricingPlan[],
      pack: [] as PricingPlan[],
      other: [] as PricingPlan[],
    }
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 px-4 py-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col rounded-3xl border border-white/10 bg-[var(--bg-elevated)] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between gap-4 p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Premium
            </p>
            <h3 className="mt-2 text-xl font-semibold text-[var(--text)]">
              Debloque l assistant IA
            </h3>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Generation de layouts, resume automatique, propagation
              multi-sections et outils IA avances.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)]"
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
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-4">
          <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1 text-xs">
            <button
              type="button"
              onClick={() => setBillingInterval("month")}
              className={`rounded-full px-4 py-1.5 font-semibold uppercase tracking-wide transition ${
                billingInterval === "month"
                  ? "bg-white/15 text-[var(--text)]"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              Mensuel
            </button>
            <button
              type="button"
              onClick={() => setBillingInterval("year")}
              className={`relative rounded-full px-4 py-1.5 font-semibold uppercase tracking-wide transition ${
                billingInterval === "year"
                  ? "bg-emerald-300/20 text-emerald-100"
                  : "text-emerald-200/80 hover:text-emerald-100"
              }`}
            >
              Annuel
              <span className="ml-2 rounded-full border border-emerald-300/40 bg-emerald-400/10 px-2 py-0.5 text-[0.55rem] uppercase tracking-wide text-emerald-100">
                Meilleur deal
              </span>
            </button>
          </div>
          <p className="text-xs text-[var(--muted)]">
            Choisis la facturation {billingInterval === "year" ? "annuelle" : "mensuelle"}.
          </p>
        </div>
        <div className="space-y-6 px-6 pb-6">
          {loading ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-[var(--muted)]">
              Chargement des offres...
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-red-300">
              {error}
            </div>
          ) : visiblePlans.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-[var(--muted)]">
              Aucune offre disponible.
            </div>
          ) : (
            ([
              { key: "base", label: "Base" },
              { key: "addon", label: "Add-ons" },
              { key: "pack", label: "Packs" },
              { key: "other", label: "Autres" },
            ] as const).map((section) => {
              const sectionPlans = groupedPlans[section.key];
              if (sectionPlans.length === 0) return null;
              return (
                <div key={section.key}>
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                    {section.label}
                  </p>
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    {sectionPlans.map((plan) => {
                      const highlight = plan.is_highlighted;
                      const baseSlug = toBaseSlug(plan.slug);
                      const monthlyPlan =
                        billingInterval === "year"
                          ? monthlyBySlug.get(baseSlug)
                          : null;
                      const annualSavings =
                        monthlyPlan && monthlyPlan.price_cents > 0
                          ? Math.round(
                              (1 -
                                plan.price_cents /
                                  (monthlyPlan.price_cents * 12)) *
                                100
                            )
                          : null;
                      return (
                        <div
                          key={plan.id}
                          className={`flex h-full flex-col rounded-2xl border p-5 ${
                            highlight
                              ? "border-emerald-300/30 bg-emerald-400/10"
                              : "border-white/10 bg-white/5"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p
                                className={`text-xs uppercase tracking-[0.2em] ${
                                  highlight
                                    ? "text-emerald-100"
                                    : "text-[var(--muted)]"
                                }`}
                              >
                                {plan.label}
                              </p>
                              <p className="mt-2 text-2xl font-semibold text-[var(--text)]">
                                {formatPrice(plan)}
                              </p>
                              {billingInterval === "year" && monthlyPlan ? (
                                <p className="mt-2 text-xs text-emerald-100/80">
                                  Facture annuellement - Equiv{" "}
                                  {formatMonthlyEquivalent(plan)}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              {plan.badge ? (
                                <span
                                  className={`rounded-full border px-3 py-1 text-[0.55rem] uppercase tracking-wide ${
                                    highlight
                                      ? "border-emerald-300/30 bg-emerald-400/20 text-emerald-100"
                                      : "border-amber-300/30 bg-amber-400/10 text-amber-200"
                                  }`}
                                >
                                  {plan.badge}
                                </span>
                              ) : null}
                              {billingInterval === "year" &&
                              annualSavings !== null &&
                              annualSavings > 0 ? (
                                <span className="rounded-full border border-emerald-300/40 bg-emerald-400/15 px-2 py-0.5 text-[0.55rem] uppercase tracking-wide text-emerald-100">
                                  Economise {annualSavings}%
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <ul
                            className={`mt-4 flex-1 space-y-2 text-xs ${
                              highlight
                                ? "text-emerald-100/80"
                                : "text-[var(--muted)]"
                            }`}
                          >
                            {(plan.features ?? []).length === 0 ? (
                              <li>Aucune feature specifiee.</li>
                            ) : (
                              (plan.features ?? []).map((feature, idx) => (
                                <li key={`${plan.id}-feature-${idx}`}>
                                  {feature}
                                </li>
                              ))
                            )}
                          </ul>
                          <button
                            type="button"
                            className={`mt-5 w-full rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                              highlight
                                ? "bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 text-zinc-900 hover:opacity-90"
                                : "border border-white/10 bg-white/10 text-[var(--text)] hover:bg-white/20"
                            }`}
                          >
                            {plan.cta_label || "Choisir"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="border-t border-white/10 px-6 py-4 text-xs text-[var(--muted)]">
          Besoin d un plan equipe ou club ? Contacte-nous pour une offre sur
          mesure.
        </div>
      </div>
    </div>
  );
}
