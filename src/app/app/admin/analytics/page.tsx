"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AdminGuard from "../../_components/admin-guard";
import PageBack from "../../_components/page-back";

type AnalyticsPayload = {
  windowDays: number;
  totals: {
    requests: number;
    tokens: number;
    avgTokens: number;
    activeCoaches: number;
    totalCoaches: number;
    totalStudents: number;
    activeStudents: number;
    studentsWithTpi: number;
    reportsTotal: number;
    tpiReportsTotal: number;
    tpiReportsReady: number;
    costUsd: number;
    reportCostUsd: number;
    tpiCostUsd: number;
    avgTokensPerRequest: number;
    avgTokensPerDay: number;
    avgTokensPerCoach: number;
    avgRequestsPerDay: number;
    avgRequestsPerCoach: number;
    avgDurationMs: number;
    adoptionCoachRate: number;
    tpiCoverageRate: number;
    tpiSuccessRate: number;
    costPerRequestUsd: number;
    costPerDayUsd: number;
    costPerCoachUsd: number;
    costPerStudentUsd: number;
    costPerReportUsd: number;
    costPerTpiUsd: number;
  };
  daily: Array<{ date: string; requests: number; tokens: number }>;
  topCoaches: Array<{
    user_id: string;
    full_name: string;
    org_name: string;
    requests: number;
    tokens: number;
    costUsd: number;
  }>;
  features: Array<{
    feature: string;
    requests: number;
    tokens: number;
    costUsd: number;
  }>;
};

type CoachAnalyticsPayload = {
  windowDays: number;
  user: {
    id: string;
    full_name: string;
    org_name: string;
  };
  totals: {
    requests: number;
    tokens: number;
    avgTokens: number;
    costUsd: number;
  };
  actions: Array<{ action: string; requests: number; tokens: number; costUsd: number }>;
  models: Array<{ model: string; requests: number; tokens: number; costUsd: number }>;
  features: Array<{
    feature: string;
    requests: number;
    tokens: number;
    costUsd: number;
  }>;
  daily: Array<{ date: string; requests: number; tokens: number }>;
};

export default function AdminAnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null);
  const [coachDetail, setCoachDetail] = useState<CoachAnalyticsPayload | null>(
    null
  );
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState("");

  const formatUsd = (value: number | string | null | undefined) => {
    const numeric = typeof value === "number" ? value : Number(value ?? 0);
    const safeValue = Number.isFinite(numeric) ? numeric : 0;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(safeValue);
  };

  const formatNumber = (value: number | string | null | undefined, decimals = 0) => {
    const numeric = typeof value === "number" ? value : Number(value ?? 0);
    const safeValue = Number.isFinite(numeric) ? numeric : 0;
    return new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(safeValue);
  };

  const formatPercent = (value: number | string | null | undefined, decimals = 1) =>
    `${formatNumber(value, decimals)}%`;

  useEffect(() => {
    const loadAnalytics = async () => {
      setLoading(true);
      setError("");

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        setError("Session invalide. Reconnecte toi.");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/admin/analytics?days=30", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json()) as AnalyticsPayload & {
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? "Chargement impossible.");
        setLoading(false);
        return;
      }

      setAnalytics(payload);
      setLoading(false);
    };

    loadAnalytics();
  }, []);

  const maxTokens = useMemo(() => {
    if (!analytics?.daily?.length) return 0;
    return Math.max(...analytics.daily.map((day) => day.tokens));
  }, [analytics?.daily]);

  const coachMaxTokens = useMemo(() => {
    if (!coachDetail?.daily?.length) return 0;
    return Math.max(...coachDetail.daily.map((day) => day.tokens));
  }, [coachDetail?.daily]);

  const loadCoachDetail = async (userId: string) => {
    setSelectedCoachId(userId);
    setCoachLoading(true);
    setCoachError("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setCoachError("Session invalide. Reconnecte toi.");
      setCoachLoading(false);
      return;
    }

    const response = await fetch(
      `/api/admin/analytics/coach?userId=${encodeURIComponent(userId)}&days=30`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    const payload = (await response.json()) as CoachAnalyticsPayload & {
      error?: string;
    };

    if (!response.ok) {
      setCoachError(payload.error ?? "Chargement impossible.");
      setCoachLoading(false);
      return;
    }

    setCoachDetail(payload);
    setCoachLoading(false);
  };

  const closeCoachDetail = () => {
    setSelectedCoachId(null);
    setCoachDetail(null);
    setCoachError("");
    setCoachLoading(false);
  };

  return (
    <AdminGuard>
      <div className="space-y-6">
        <section className="panel rounded-2xl p-6">
          <div className="flex items-center gap-2">
            <PageBack fallbackHref="/app/admin" />
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Analytics
            </p>
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
            Suivi IA
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Usage des appels IA sur les 30 derniers jours.
          </p>
        </section>

        {loading ? (
          <section className="panel rounded-2xl p-6">
            <p className="text-sm text-[var(--muted)]">Chargement...</p>
          </section>
        ) : error ? (
          <section className="panel rounded-2xl p-6">
            <p className="text-sm text-red-400">{error}</p>
          </section>
        ) : analytics ? (
          <>
            <section className="space-y-6">
              {(() => {
                const windowLabel = `Fenetre ${analytics.windowDays} jours`;
                const overviewStats = [
                  {
                    id: "overview-requests",
                    label: "Requetes",
                    value: formatNumber(analytics.totals.requests),
                    helper: windowLabel,
                    cost: formatUsd(analytics.totals.costUsd),
                  },
                  {
                    id: "overview-tokens",
                    label: "Tokens",
                    value: formatNumber(analytics.totals.tokens),
                    helper: windowLabel,
                    cost: formatUsd(analytics.totals.costUsd),
                  },
                  {
                    id: "overview-cost",
                    label: "Cout total",
                    value: formatUsd(analytics.totals.costUsd),
                    helper: windowLabel,
                    cost: formatUsd(analytics.totals.costUsd),
                  },
                  {
                    id: "overview-coaches-active",
                    label: "Coachs actifs",
                    value: formatNumber(analytics.totals.activeCoaches),
                    helper: `Sur ${formatNumber(analytics.totals.totalCoaches)} coachs`,
                    cost: formatUsd(analytics.totals.costPerCoachUsd),
                  },
                  {
                    id: "overview-students-active",
                    label: "Eleves actifs",
                    value: formatNumber(analytics.totals.activeStudents),
                    helper: `Sur ${formatNumber(analytics.totals.totalStudents)} eleves`,
                    cost: formatUsd(analytics.totals.costPerStudentUsd),
                  },
                  {
                    id: "overview-reports",
                    label: "Rapports generes",
                    value: formatNumber(analytics.totals.reportsTotal),
                    helper: windowLabel,
                    cost: formatUsd(analytics.totals.reportCostUsd),
                  },
                  {
                    id: "overview-tpi",
                    label: "TPI importes",
                    value: formatNumber(analytics.totals.tpiReportsReady),
                    helper: windowLabel,
                    cost: formatUsd(analytics.totals.tpiCostUsd),
                  },
                ];
                const adoptionStats = [
                  {
                    id: "adoption-coaches",
                    label: "Adoption IA",
                    value: formatPercent(analytics.totals.adoptionCoachRate, 1),
                    helper: `${formatNumber(
                      analytics.totals.activeCoaches
                    )} / ${formatNumber(analytics.totals.totalCoaches)} coachs`,
                    cost: formatUsd(analytics.totals.costPerCoachUsd),
                  },
                  {
                    id: "adoption-tpi-coverage",
                    label: "Couverture TPI",
                    value: formatPercent(analytics.totals.tpiCoverageRate, 1),
                    helper: `${formatNumber(
                      analytics.totals.studentsWithTpi
                    )} / ${formatNumber(analytics.totals.totalStudents)} eleves`,
                    cost: formatUsd(analytics.totals.costPerTpiUsd),
                  },
                  {
                    id: "adoption-tpi-success",
                    label: "Succes TPI",
                    value: formatPercent(analytics.totals.tpiSuccessRate, 1),
                    helper: `${formatNumber(
                      analytics.totals.tpiReportsReady
                    )} / ${formatNumber(analytics.totals.tpiReportsTotal)} imports`,
                    cost: formatUsd(analytics.totals.costPerTpiUsd),
                  },
                ];
                const usageStats = [
                  {
                    id: "usage-tokens-request",
                    label: "Tokens",
                    value: formatNumber(analytics.totals.avgTokensPerRequest),
                    helper: "Par requete",
                    cost: formatUsd(analytics.totals.costPerRequestUsd),
                  },
                  {
                    id: "usage-tokens-day",
                    label: "Tokens",
                    value: formatNumber(analytics.totals.avgTokensPerDay),
                    helper: "Par jour",
                    cost: formatUsd(analytics.totals.costPerDayUsd),
                  },
                  {
                    id: "usage-tokens-coach",
                    label: "Tokens",
                    value: formatNumber(analytics.totals.avgTokensPerCoach),
                    helper: "Par coach",
                    cost: formatUsd(analytics.totals.costPerCoachUsd),
                  },
                  {
                    id: "usage-requests-day",
                    label: "Requetes",
                    value: formatNumber(analytics.totals.avgRequestsPerDay, 2),
                    helper: "Par jour",
                    cost: formatUsd(analytics.totals.costPerDayUsd),
                  },
                  {
                    id: "usage-requests-coach",
                    label: "Requetes",
                    value: formatNumber(analytics.totals.avgRequestsPerCoach, 2),
                    helper: "Par coach",
                    cost: formatUsd(analytics.totals.costPerCoachUsd),
                  },
                  {
                    id: "usage-duration",
                    label: "Temps moyen IA",
                    value: `${formatNumber(
                      analytics.totals.avgDurationMs / 1000,
                      1
                    )} s`,
                    helper: "Par requete",
                    cost: formatUsd(analytics.totals.costPerRequestUsd),
                  },
                ];
                const costStats = [
                  {
                    id: "cost-request",
                    label: "Cout / requete",
                    value: formatUsd(analytics.totals.costPerRequestUsd),
                    helper: "Par requete",
                    cost: formatUsd(analytics.totals.costPerRequestUsd),
                  },
                  {
                    id: "cost-day",
                    label: "Cout / jour",
                    value: formatUsd(analytics.totals.costPerDayUsd),
                    helper: "Par jour",
                    cost: formatUsd(analytics.totals.costPerDayUsd),
                  },
                  {
                    id: "cost-coach",
                    label: "Cout / coach actif",
                    value: formatUsd(analytics.totals.costPerCoachUsd),
                    helper: "Par coach",
                    cost: formatUsd(analytics.totals.costPerCoachUsd),
                  },
                  {
                    id: "cost-student",
                    label: "Cout / eleve actif",
                    value: formatUsd(analytics.totals.costPerStudentUsd),
                    helper: "Par eleve",
                    cost: formatUsd(analytics.totals.costPerStudentUsd),
                  },
                  {
                    id: "cost-report",
                    label: "Cout / rapport",
                    value: formatUsd(analytics.totals.costPerReportUsd),
                    helper: `${formatNumber(analytics.totals.reportsTotal)} rapports`,
                    cost: formatUsd(analytics.totals.costPerReportUsd),
                  },
                  {
                    id: "cost-tpi",
                    label: "Cout / TPI",
                    value: formatUsd(analytics.totals.costPerTpiUsd),
                    helper: `${formatNumber(
                      analytics.totals.tpiReportsReady
                    )} imports`,
                    cost: formatUsd(analytics.totals.costPerTpiUsd),
                  },
                ];

                const renderCards = (
                  items: Array<{
                    id: string;
                    label: string;
                    value: string;
                    helper?: string;
                    cost?: string;
                  }>
                ) =>
                  items.map((item) => (
                    <div
                      key={item.id}
                      className="panel-soft relative rounded-2xl p-4 pb-10"
                    >
                      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                        {item.label}
                      </p>
                      <p className="mt-3 text-2xl font-semibold text-[var(--text)]">
                        {item.value}
                      </p>
                      {item.helper ? (
                        <p className="mt-2 text-xs text-[var(--muted)]">
                          {item.helper}
                        </p>
                      ) : null}
                      {item.cost ? (
                        <p className="absolute bottom-3 right-4 text-xs text-[var(--muted)]">
                          Cout {item.cost}
                        </p>
                      ) : null}
                    </div>
                  ));

                const renderSection = (
                  title: string,
                  subtitle: string,
                  items: Array<{
                    id: string;
                    label: string;
                    value: string;
                    helper?: string;
                    cost?: string;
                  }>
                ) => (
                  <div>
                    <div className="flex items-center justify-between text-xs uppercase tracking-wide text-[var(--muted)]">
                      <span>{title}</span>
                      <span>{subtitle}</span>
                    </div>
                    <div className="mt-3 grid gap-4 md:grid-cols-4">
                      {renderCards(items)}
                    </div>
                  </div>
                );

                return (
                  <>
                    {renderSection("Vue d'ensemble", windowLabel, overviewStats)}
                    {renderSection("Adoption & couverture", windowLabel, adoptionStats)}
                    {renderSection("Usage moyen", windowLabel, usageStats)}
                    {renderSection("Couts unitaires", windowLabel, costStats)}
                  </>
                );
              })()}
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
              <div className="panel rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-[var(--text)]">
                  Activite recente
                </h3>
                <div className="mt-4 space-y-3 text-xs text-[var(--muted)]">
                  {analytics.daily.length === 0 ? (
                    <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                      Aucune activite recente.
                    </div>
                  ) : (
                    analytics.daily.map((day) => (
                      <div
                        key={day.date}
                        className="flex items-center gap-3"
                      >
                        <span className="w-24">{day.date}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-emerald-300/70"
                            style={{
                              width: maxTokens
                                ? `${Math.max(
                                    5,
                                    (day.tokens / maxTokens) * 100
                                  )}%`
                                : "0%",
                            }}
                          />
                        </div>
                        <span className="w-28 text-right">
                          {day.tokens} tokens
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div className="panel rounded-2xl p-6">
                  <h3 className="text-lg font-semibold text-[var(--text)]">
                    Top coachs
                  </h3>
                  <div className="mt-4 space-y-3 text-sm text-[var(--muted)]">
                    {analytics.topCoaches.length === 0 ? (
                      <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                        Aucun usage detecte.
                      </div>
                    ) : (
                      analytics.topCoaches.map((coach) => (
                        <button
                          key={coach.user_id}
                          type="button"
                          onClick={() => loadCoachDetail(coach.user_id)}
                          className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                            selectedCoachId === coach.user_id
                              ? "border-emerald-300/40 bg-emerald-400/10"
                              : "border-white/5 bg-white/5 hover:border-white/20"
                          }`}
                        >
                          <p className="font-medium text-[var(--text)]">
                            {coach.full_name}
                          </p>
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            {coach.org_name || "Organisation"} - {coach.requests} req
                          </p>
                          <p className="mt-2 text-xs text-emerald-200">
                            {coach.tokens} tokens • {formatUsd(coach.costUsd)}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div className="panel rounded-2xl p-6">
                  <h3 className="text-lg font-semibold text-[var(--text)]">
                    Top features
                  </h3>
                  <div className="mt-4 space-y-3 text-sm text-[var(--muted)]">
                    {analytics.features.length === 0 ? (
                      <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                        Aucune consommation detectee.
                      </div>
                    ) : (
                      analytics.features.map((feature) => (
                        <div
                          key={feature.feature}
                          className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-4 py-2"
                        >
                          <span className="text-[var(--text)]">
                            {feature.feature}
                          </span>
                          <span>
                            {feature.requests} req - {feature.tokens} tokens •{" "}
                            {formatUsd(feature.costUsd)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </section>
            {selectedCoachId ? (
              <section className="panel rounded-2xl p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--text)]">
                      Details coach
                    </h3>
                    <p className="mt-2 text-sm text-[var(--muted)]">
                      Repartition par action et activite recente.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeCoachDetail}
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
                {coachLoading ? (
                  <div className="mt-4 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                    Chargement du detail...
                  </div>
                ) : coachError ? (
                  <div className="mt-4 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-red-300">
                    {coachError}
                  </div>
                ) : coachDetail ? (
                  <div className="mt-4 space-y-6">
                    <div className="grid gap-4 md:grid-cols-3">
                      {[
                        {
                          label: "Requetes",
                          value: coachDetail.totals.requests,
                        },
                        { label: "Tokens", value: coachDetail.totals.tokens },
                        {
                          label: "Moyenne tokens",
                          value: coachDetail.totals.avgTokens,
                        },
                      ].map((item) => (
                        <div key={item.label} className="panel-soft rounded-2xl p-4">
                          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                            {item.label}
                          </p>
                          <p className="mt-3 text-2xl font-semibold text-[var(--text)]">
                            {item.value}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                          Actions
                        </p>
                        <div className="mt-3 space-y-2 text-sm text-[var(--muted)]">
                          {coachDetail.actions.length === 0 ? (
                            <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                              Aucune action.
                            </div>
                          ) : (
                            coachDetail.actions.map((action) => (
                              <div
                                key={action.action}
                                className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-4 py-2"
                              >
                                <span className="text-[var(--text)]">
                                  {action.action}
                                </span>
                                <span>
                                  {action.requests} req - {action.tokens} tokens - {formatUsd(action.costUsd)}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                          Modeles
                        </p>
                        <div className="mt-3 space-y-2 text-sm text-[var(--muted)]">
                          {coachDetail.models.length === 0 ? (
                            <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                              Aucun modele.
                            </div>
                          ) : (
                            coachDetail.models.map((model) => (
                              <div
                                key={model.model}
                                className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-4 py-2"
                              >
                                <span className="text-[var(--text)]">
                                  {model.model}
                                </span>
                                <span>
                                  {model.requests} req - {model.tokens} tokens - {formatUsd(model.costUsd)}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                        <div className="mt-6">
                          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                            Par categorie de features
                          </p>
                          <div className="mt-3 space-y-2 text-sm text-[var(--muted)]">
                            {coachDetail.features.length === 0 ? (
                              <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                                Aucune categorie.
                              </div>
                            ) : (
                              coachDetail.features.map((feature) => (
                                <div
                                  key={feature.feature}
                                  className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-4 py-2"
                                >
                                  <span className="text-[var(--text)]">
                                    {feature.feature}
                                  </span>
                                  <span>
                                    {feature.requests} req - {feature.tokens} tokens - {formatUsd(feature.costUsd)}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                        Activite recente
                      </p>
                      <div className="mt-3 space-y-3 text-xs text-[var(--muted)]">
                        {coachDetail.daily.length === 0 ? (
                          <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                            Aucune activite recente.
                          </div>
                        ) : (
                          coachDetail.daily.map((day) => (
                            <div key={day.date} className="flex items-center gap-3">
                              <span className="w-24">{day.date}</span>
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                                <div
                                  className="h-full rounded-full bg-emerald-300/70"
                                  style={{
                                    width: coachMaxTokens
                                      ? `${Math.max(
                                          5,
                                          (day.tokens / coachMaxTokens) * 100
                                        )}%`
                                      : "0%",
                                  }}
                                />
                              </div>
                              <span className="w-28 text-right">
                                {day.tokens} tokens
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </AdminGuard>
  );
}
