"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AdminGuard from "../../_components/admin-guard";
import PageBack from "../../_components/page-back";

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
  is_active: boolean;
  is_highlighted: boolean;
  sort_order: number;
};

type EditablePlan = {
  id?: string;
  slug: string;
  label: string;
  price: string;
  currency: string;
  interval: "month" | "year";
  badge: string;
  cta_label: string;
  featuresText: string;
  is_active: boolean;
  is_highlighted: boolean;
  sort_order: number;
  is_dirty?: boolean;
};

const parseFeatures = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const toPlanCategory = (plan: EditablePlan) => {
  const badge = plan.badge.toLowerCase();
  const slug = plan.slug.toLowerCase();
  if (badge.includes("add") || slug.startsWith("addon")) return "addon";
  if (badge.includes("pack") || slug.startsWith("pack")) return "pack";
  if (badge.includes("base") || slug.startsWith("premium")) return "base";
  return "other";
};

const formatPrice = (plan: EditablePlan) => {
  const amount = Number(plan.price);
  if (!Number.isFinite(amount)) return "-";
  const intervalLabel = plan.interval === "year" ? "an" : "mois";
  return `${amount} ${plan.currency.toUpperCase()} / ${intervalLabel}`;
};

export default function AdminPricingPage() {
  const [plans, setPlans] = useState<EditablePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [intervalFilter, setIntervalFilter] = useState<
    "all" | "month" | "year"
  >("all");
  const [typeFilter, setTypeFilter] = useState<
    "all" | "base" | "addon" | "pack" | "other"
  >("all");
  const [activeFilter, setActiveFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [priceSort, setPriceSort] = useState<
    "order" | "price-asc" | "price-desc"
  >("order");
  const hasDirtyPlans = plans.some((plan) => plan.is_dirty);
  const filteredPlans = plans
    .filter((plan) => {
      if (intervalFilter !== "all" && plan.interval !== intervalFilter) {
        return false;
      }
      if (activeFilter === "active" && !plan.is_active) return false;
      if (activeFilter === "inactive" && plan.is_active) return false;
      if (typeFilter !== "all" && toPlanCategory(plan) !== typeFilter) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (priceSort === "order") return a.sort_order - b.sort_order;
      const aPrice = Number(a.price);
      const bPrice = Number(b.price);
      const aValue = Number.isFinite(aPrice) ? aPrice : 0;
      const bValue = Number.isFinite(bPrice) ? bPrice : 0;
      return priceSort === "price-asc" ? aValue - bValue : bValue - aValue;
    });

  const loadPlans = async () => {
    setLoading(true);
    setError("");
    setMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setError("Session invalide. Reconnecte toi.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/admin/pricing", {
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

    const mapped =
      payload.plans?.map((plan) => ({
        id: plan.id,
        slug: plan.slug ?? "",
        label: plan.label ?? "",
        price: (plan.price_cents / 100).toString(),
        currency: plan.currency ?? "EUR",
        interval: plan.interval ?? "month",
        badge: plan.badge ?? "",
        cta_label: plan.cta_label ?? "",
        featuresText: (plan.features ?? []).join("\n"),
        is_active: plan.is_active ?? true,
        is_highlighted: plan.is_highlighted ?? false,
        sort_order: plan.sort_order ?? 0,
        is_dirty: false,
      })) ?? [];

    mapped.sort((a, b) => a.sort_order - b.sort_order);
    setPlans(mapped);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      void loadPlans();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePlanChange = (index: number, patch: Partial<EditablePlan>) => {
    setPlans((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch, is_dirty: true };
      return next;
    });
  };

  const handleSave = async (plan: EditablePlan) => {
    if (!plan.is_dirty && plan.id) return;
    setSavingId(plan.id ?? "new");
    setError("");
    setMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setError("Session invalide. Reconnecte toi.");
      setSavingId(null);
      return;
    }

    const priceValue = Number(plan.price);
    const priceCents =
      Number.isFinite(priceValue) && priceValue >= 0
        ? Math.round(priceValue * 100)
        : 0;

    const response = await fetch("/api/admin/pricing", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        id: plan.id ?? null,
        slug: plan.slug,
        label: plan.label,
        price_cents: priceCents,
        currency: plan.currency,
        interval: plan.interval,
        badge: plan.badge || null,
        cta_label: plan.cta_label || null,
        features: parseFeatures(plan.featuresText),
        is_active: plan.is_active,
        is_highlighted: plan.is_highlighted,
        sort_order: Number(plan.sort_order) || 0,
      }),
    });

    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Sauvegarde impossible.");
      setSavingId(null);
      return;
    }

    setMessage("Plan sauvegarde.");
    setSavingId(null);
    await loadPlans();
  };

  const handleSaveAll = async () => {
    setSavingAll(true);
    setError("");
    setMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setError("Session invalide. Reconnecte toi.");
      setSavingAll(false);
      return;
    }

    const dirtyPlans = plans.filter((plan) => plan.is_dirty);
    if (dirtyPlans.length === 0) {
      setSavingAll(false);
      return;
    }

    const errors: string[] = [];
    for (const plan of dirtyPlans) {
      const priceValue = Number(plan.price);
      const priceCents =
        Number.isFinite(priceValue) && priceValue >= 0
          ? Math.round(priceValue * 100)
          : 0;

      const response = await fetch("/api/admin/pricing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: plan.id ?? null,
          slug: plan.slug,
          label: plan.label,
          price_cents: priceCents,
          currency: plan.currency,
          interval: plan.interval,
          badge: plan.badge || null,
          cta_label: plan.cta_label || null,
          features: parseFeatures(plan.featuresText),
          is_active: plan.is_active,
          is_highlighted: plan.is_highlighted,
          sort_order: Number(plan.sort_order) || 0,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        errors.push(payload.error ?? `Erreur sur ${plan.label || plan.slug}.`);
      }
    }

    setSavingAll(false);

    if (errors.length > 0) {
      setError(errors[0]);
      return;
    }

    setMessage("Plans sauvegardes.");
    await loadPlans();
  };

  const handleDelete = async (plan: EditablePlan) => {
    if (!plan.id) return;
    const confirmed = window.confirm(
      `Supprimer le plan "${plan.label || plan.slug}" ?`
    );
    if (!confirmed) return;

    setDeletingId(plan.id);
    setError("");
    setMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setError("Session invalide. Reconnecte toi.");
      setDeletingId(null);
      return;
    }

    const response = await fetch("/api/admin/pricing", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id: plan.id }),
    });

    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Suppression impossible.");
      setDeletingId(null);
      return;
    }

    setMessage("Plan supprime.");
    setDeletingId(null);
    await loadPlans();
  };

  const handleAddPlan = () => {
    setPlans((prev) => [
      ...prev,
      {
        slug: `plan-${prev.length + 1}`,
        label: "Nouveau plan",
        price: "0",
        currency: "EUR",
        interval: "month",
        badge: "",
        cta_label: "",
        featuresText: "",
        is_active: true,
        is_highlighted: false,
        sort_order: prev.length,
        is_dirty: true,
      },
    ]);
  };

  return (
    <AdminGuard>
      <div className="space-y-6">
        <section className="panel rounded-2xl p-6">
          <div className="flex items-center gap-2">
            <PageBack fallbackHref="/app/admin" />
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Tarifs
            </p>
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
            Prix et features
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Les cartes premium utilisees dans l app sont alimentees ici.
          </p>
        </section>

        <section className="panel-soft rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--muted)]">
              {plans.length} plan(s) configures
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={savingAll || loading || !hasDirtyPlans}
                className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
              >
                {savingAll ? "Sauvegarde..." : "Sauvegarder tout"}
              </button>
              <button
                type="button"
                onClick={handleAddPlan}
                className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
              >
                Ajouter un plan
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Intervalle
              </label>
              <select
                value={intervalFilter}
                onChange={(event) =>
                  setIntervalFilter(
                    event.target.value as "all" | "month" | "year"
                  )
                }
                className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
              >
                <option value="all">Tous</option>
                <option value="month">Mensuel</option>
                <option value="year">Annuel</option>
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Type
              </label>
              <select
                value={typeFilter}
                onChange={(event) =>
                  setTypeFilter(
                    event.target.value as
                      | "all"
                      | "base"
                      | "addon"
                      | "pack"
                      | "other"
                  )
                }
                className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
              >
                <option value="all">Tous</option>
                <option value="base">Base</option>
                <option value="addon">Add-on</option>
                <option value="pack">Pack</option>
                <option value="other">Autre</option>
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Statut
              </label>
              <select
                value={activeFilter}
                onChange={(event) =>
                  setActiveFilter(
                    event.target.value as "all" | "active" | "inactive"
                  )
                }
                className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
              >
                <option value="all">Tous</option>
                <option value="active">Actif</option>
                <option value="inactive">Inactif</option>
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Prix
              </label>
              <select
                value={priceSort}
                onChange={(event) =>
                  setPriceSort(
                    event.target.value as
                      | "order"
                      | "price-asc"
                      | "price-desc"
                  )
                }
                className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
              >
                <option value="order">Ordre</option>
                <option value="price-asc">Croissant</option>
                <option value="price-desc">Decroissant</option>
              </select>
            </div>
          </div>
          {error ? (
            <p className="mt-3 text-sm text-red-400">{error}</p>
          ) : null}
          {message ? (
            <p className="mt-3 text-sm text-emerald-200">{message}</p>
          ) : null}
        </section>

        {loading ? (
          <section className="panel rounded-2xl p-6">
            <p className="text-sm text-[var(--muted)]">
              Chargement des plans...
            </p>
          </section>
        ) : plans.length === 0 ? (
          <section className="panel rounded-2xl p-6">
            <p className="text-sm text-[var(--muted)]">
              Aucun plan en base. Ajoute un plan pour commencer.
            </p>
          </section>
        ) : filteredPlans.length === 0 ? (
          <section className="panel rounded-2xl p-6">
            <p className="text-sm text-[var(--muted)]">
              Aucun plan ne correspond aux filtres.
            </p>
          </section>
        ) : (
          filteredPlans.map((plan, index) => (
            <section
              key={plan.id ?? `new-${index}`}
              className="panel rounded-2xl p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--text)]">
                    {plan.label || "Plan sans nom"}
                  </h3>
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                    {formatPrice(plan)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {plan.id ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(plan)}
                      disabled={deletingId === plan.id}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-red-300 transition hover:text-red-200 disabled:opacity-60"
                    >
                      {deletingId === plan.id ? "Suppression..." : "Supprimer"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => handleSave(plan)}
                    disabled={
                      savingId === (plan.id ?? "new") ||
                      (!plan.is_dirty && Boolean(plan.id))
                    }
                    className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
                  >
                    {savingId === (plan.id ?? "new")
                      ? "Sauvegarde..."
                      : "Sauvegarder"}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
                <div className="space-y-4">
                  <div>
                    <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      Label
                    </label>
                    <input
                      type="text"
                      value={plan.label}
                      onChange={(event) =>
                        handlePlanChange(index, { label: event.target.value })
                      }
                      className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                    />
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                        Prix
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={plan.price}
                        onChange={(event) =>
                          handlePlanChange(index, { price: event.target.value })
                        }
                        className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                        Devise
                      </label>
                      <input
                        type="text"
                        value={plan.currency}
                        onChange={(event) =>
                          handlePlanChange(index, {
                            currency: event.target.value.toUpperCase(),
                          })
                        }
                        className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                        Intervalle
                      </label>
                      <select
                        value={plan.interval}
                        onChange={(event) =>
                          handlePlanChange(index, {
                            interval: event.target.value as "month" | "year",
                          })
                        }
                        className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                      >
                        <option value="month">Mensuel</option>
                        <option value="year">Annuel</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                        Badge
                      </label>
                      <input
                        type="text"
                        value={plan.badge}
                        onChange={(event) =>
                          handlePlanChange(index, { badge: event.target.value })
                        }
                        placeholder="Flexible"
                        className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                        CTA
                      </label>
                      <input
                        type="text"
                        value={plan.cta_label}
                        onChange={(event) =>
                          handlePlanChange(index, {
                            cta_label: event.target.value,
                          })
                        }
                        placeholder="Choisir"
                        className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="flex items-center gap-2">
                      <input
                        id={`active-${index}`}
                        type="checkbox"
                        checked={plan.is_active}
                        onChange={(event) =>
                          handlePlanChange(index, {
                            is_active: event.target.checked,
                          })
                        }
                        className="h-4 w-4 rounded border-white/10 bg-white/10"
                      />
                      <label
                        htmlFor={`active-${index}`}
                        className="text-xs uppercase tracking-wide text-[var(--muted)]"
                      >
                        Actif
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        id={`highlight-${index}`}
                        type="checkbox"
                        checked={plan.is_highlighted}
                        onChange={(event) =>
                          handlePlanChange(index, {
                            is_highlighted: event.target.checked,
                          })
                        }
                        className="h-4 w-4 rounded border-white/10 bg-white/10"
                      />
                      <label
                        htmlFor={`highlight-${index}`}
                        className="text-xs uppercase tracking-wide text-[var(--muted)]"
                      >
                        Mis en avant
                      </label>
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                        Ordre
                      </label>
                      <input
                        type="number"
                        value={plan.sort_order}
                        onChange={(event) =>
                          handlePlanChange(index, {
                            sort_order: Number(event.target.value),
                          })
                        }
                        className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      Slug
                    </label>
                    <input
                      type="text"
                      value={plan.slug}
                      onChange={(event) =>
                        handlePlanChange(index, { slug: event.target.value })
                      }
                      className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Features (1 par ligne)
                  </label>
                  <textarea
                    rows={10}
                    value={plan.featuresText}
                    onChange={(event) =>
                      handlePlanChange(index, {
                        featuresText: event.target.value,
                      })
                    }
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                  />
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    Ces lignes alimentent la liste visible dans le modal Premium.
                  </p>
                </div>
              </div>
            </section>
          ))
        )}
      </div>
    </AdminGuard>
  );
}
