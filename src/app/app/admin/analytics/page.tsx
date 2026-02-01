"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import AdminGuard from "../../_components/admin-guard";
import PageBack from "../../_components/page-back";

type Period = "day" | "week" | "month";

type CostSeriesPoint = {
  label: string;
  costUsd: number;
  requests: number;
};

type CostRow = {
  key: string;
  label: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costPerRequestUsd: number;
};

type CoachCostRow = CostRow & {
  orgName: string;
};

type PerformanceRow = {
  endpoint: string;
  requests: number;
  p50DurationMs: number;
  p95DurationMs: number;
  errorCount: number;
  errorRatePct: number;
};

type AnalyticsPayload = {
  period: Period;
  windowDays: number;
  totals: {
    costUsd: number;
    costDeltaPct: number | null;
    requests: number;
    p95DurationMs: number;
    errorRatePct: number;
  };
  costSeries: CostSeriesPoint[];
  costBreakdown: {
    endpoints: CostRow[];
    coaches: CoachCostRow[];
    orgs: CostRow[];
  };
  performance: {
    endpoints: PerformanceRow[];
  };
};

const periodLabels: Record<Period, string> = {
  day: "Jour",
  week: "Semaine",
  month: "Mois",
};

const endpointLabels: Record<string, string> = {
  ai: "Rapports",
  radar_ai: "IA Radar",
  radar_extract: "Import Datas",
  radar_extract_verify: "Verif Datas",
  tpi_extract: "Import TPI",
  tpi_verify: "Verif TPI",
  radar_questions: "Radar Questions",
  radar_auto: "Radar Auto",
  radar_auto_retry: "Radar Auto (retry)",
};

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

const formatDuration = (value: number | null | undefined) => {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "0 ms";
  if (numeric >= 1000) {
    return `${formatNumber(numeric / 1000, 1)} s`;
  }
  return `${formatNumber(numeric, 0)} ms`;
};

const resolveEndpointLabel = (value: string) => endpointLabels[value] ?? value;

const sortByCost = <T extends { costUsd: number }>(
  rows: T[],
  direction: "asc" | "desc"
) =>
  [...rows].sort((a, b) =>
    direction === "asc" ? a.costUsd - b.costUsd : b.costUsd - a.costUsd
  );

export default function AdminAnalyticsPage() {
  const [period, setPeriod] = useState<Period>("month");
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [endpointSort, setEndpointSort] = useState<"asc" | "desc">("desc");
  const [coachSort, setCoachSort] = useState<"asc" | "desc">("desc");
  const [orgSort, setOrgSort] = useState<"asc" | "desc">("desc");

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

      const response = await fetch(`/api/admin/analytics?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json()) as AnalyticsPayload & { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Chargement impossible.");
        setLoading(false);
        return;
      }

      setAnalytics(payload);
      setLoading(false);
    };

    loadAnalytics();
  }, [period]);

  const costSeries = analytics?.costSeries ?? [];
  const performanceRows = useMemo(
    () => analytics?.performance.endpoints ?? [],
    [analytics]
  );

  const maxCost = costSeries.length
    ? Math.max(...costSeries.map((entry) => entry.costUsd))
    : 0;
  const maxLatency = performanceRows.length
    ? Math.max(...performanceRows.map((entry) => entry.p95DurationMs))
    : 0;
  const maxErrorRate = performanceRows.length
    ? Math.max(...performanceRows.map((entry) => entry.errorRatePct))
    : 0;

  const sortedEndpoints = useMemo(
    () => sortByCost(analytics?.costBreakdown.endpoints ?? [], endpointSort),
    [analytics, endpointSort]
  );
  const sortedCoaches = useMemo(
    () => sortByCost(analytics?.costBreakdown.coaches ?? [], coachSort),
    [analytics, coachSort]
  );
  const sortedOrgs = useMemo(
    () => sortByCost(analytics?.costBreakdown.orgs ?? [], orgSort),
    [analytics, orgSort]
  );

  const errorSorted = useMemo(
    () => [...performanceRows].sort((a, b) => b.errorRatePct - a.errorRatePct),
    [performanceRows]
  );

  return (
    <AdminGuard>
      <div className="space-y-6">
        <section className="panel rounded-2xl p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <PageBack fallbackHref="/app/admin" />
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                Analytics
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(Object.keys(periodLabels) as Period[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPeriod(value)}
                  className={`rounded-full border px-4 py-1 text-xs uppercase tracking-wide transition ${
                    period === value
                      ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-100"
                      : "border-white/10 bg-white/5 text-[var(--muted)] hover:border-white/30"
                  }`}
                >
                  {periodLabels[value]}
                </button>
              ))}
            </div>
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
            Analytics IA & performance
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Vue synthese + detail par endpoint, coach et organisation.
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
            <section className="grid gap-4 md:grid-cols-4">
              {(() => {
                const delta = analytics.totals.costDeltaPct;
                const deltaLabel =
                  delta === null
                    ? "—"
                    : `${delta > 0 ? "+" : ""}${formatNumber(delta, 1)}%`;
                const deltaTone =
                  delta === null
                    ? "text-[var(--muted)]"
                    : delta > 0
                      ? "text-emerald-200"
                      : "text-orange-200";
                const summary = [
                  {
                    label: "Cout IA total",
                    value: formatUsd(analytics.totals.costUsd),
                    helper: `Variation ${deltaLabel}`,
                    helperTone: deltaTone,
                  },
                  {
                    label: "Appels IA",
                    value: formatNumber(analytics.totals.requests),
                    helper: `Periode ${periodLabels[analytics.period]}`,
                    helperTone: "text-[var(--muted)]",
                  },
                  {
                    label: "Latence p95",
                    value: formatDuration(analytics.totals.p95DurationMs),
                    helper: "Tous endpoints",
                    helperTone: "text-[var(--muted)]",
                  },
                  {
                    label: "Erreurs systeme",
                    value: formatPercent(analytics.totals.errorRatePct, 2),
                    helper: "5xx + timeouts + exceptions IA",
                    helperTone: "text-[var(--muted)]",
                  },
                ];
                return summary.map((item) => (
                  <div key={item.label} className="panel-soft rounded-2xl p-4">
                    <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      {item.label}
                    </p>
                    <p className="mt-3 text-2xl font-semibold text-[var(--text)]">
                      {item.value}
                    </p>
                    <p className={`mt-2 text-xs ${item.helperTone}`}>{item.helper}</p>
                  </div>
                ));
              })()}
            </section>

            <section className="space-y-6">
              <div className="panel rounded-2xl p-6">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold text-[var(--text)]">Couts IA</h3>
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                    {periodLabels[analytics.period]}
                  </p>
                </div>
                <div className="mt-4 space-y-3 text-xs text-[var(--muted)]">
                  {costSeries.length === 0 ? (
                    <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                      Aucune donnee sur la periode.
                    </div>
                  ) : (
                    costSeries.map((point) => (
                      <div key={point.label} className="flex items-center gap-3">
                        <span className="w-28">{point.label}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-emerald-300/70"
                            style={{
                              width: maxCost
                                ? `${Math.max(4, (point.costUsd / maxCost) * 100)}%`
                                : "0%",
                            }}
                          />
                        </div>
                        <span className="w-28 text-right">
                          {formatUsd(point.costUsd)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="panel rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-[var(--text)]">
                  Detail des couts
                </h3>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Triable par cout total.
                </p>

                <div className="mt-6 space-y-6">
                  <div>
                    <div className="flex items-center justify-between text-xs uppercase tracking-wide text-[var(--muted)]">
                      <span>Endpoints</span>
                      <button
                        type="button"
                        onClick={() =>
                          setEndpointSort(endpointSort === "asc" ? "desc" : "asc")
                        }
                        className="rounded-full border border-white/10 px-3 py-1 text-[10px] text-[var(--muted)] transition hover:border-white/40"
                      >
                        Tri {endpointSort === "asc" ? "asc" : "desc"}
                      </button>
                    </div>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left text-xs text-[var(--muted)]">
                        <thead>
                          <tr className="border-b border-white/5">
                            <th className="py-2">Endpoint</th>
                            <th className="py-2">Cout total</th>
                            <th className="py-2">Cout / appel</th>
                            <th className="py-2">Tokens in</th>
                            <th className="py-2">Tokens out</th>
                            <th className="py-2 text-right">Appels</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedEndpoints.length === 0 ? (
                            <tr>
                              <td
                                colSpan={6}
                                className="py-3 text-sm text-[var(--muted)]"
                              >
                                Aucun endpoint.
                              </td>
                            </tr>
                          ) : (
                            sortedEndpoints.map((row) => (
                              <tr key={row.key} className="border-b border-white/5">
                                <td className="py-2 text-[var(--text)]">
                                  {resolveEndpointLabel(row.label)}
                                </td>
                                <td className="py-2">{formatUsd(row.costUsd)}</td>
                                <td className="py-2">
                                  {formatUsd(row.costPerRequestUsd)}
                                </td>
                                <td className="py-2">{formatNumber(row.inputTokens)}</td>
                                <td className="py-2">{formatNumber(row.outputTokens)}</td>
                                <td className="py-2 text-right">
                                  {formatNumber(row.requests)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs uppercase tracking-wide text-[var(--muted)]">
                      <span>Coachs</span>
                      <button
                        type="button"
                        onClick={() => setCoachSort(coachSort === "asc" ? "desc" : "asc")}
                        className="rounded-full border border-white/10 px-3 py-1 text-[10px] text-[var(--muted)] transition hover:border-white/40"
                      >
                        Tri {coachSort === "asc" ? "asc" : "desc"}
                      </button>
                    </div>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left text-xs text-[var(--muted)]">
                        <thead>
                          <tr className="border-b border-white/5">
                            <th className="py-2">Coach</th>
                            <th className="py-2">Organisation</th>
                            <th className="py-2">Cout total</th>
                            <th className="py-2">Cout / appel</th>
                            <th className="py-2 text-right">Appels</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedCoaches.length === 0 ? (
                            <tr>
                              <td
                                colSpan={5}
                                className="py-3 text-sm text-[var(--muted)]"
                              >
                                Aucun coach.
                              </td>
                            </tr>
                          ) : (
                            sortedCoaches.map((row) => (
                              <tr key={row.key} className="border-b border-white/5">
                                <td className="py-2 text-[var(--text)]">{row.label}</td>
                                <td className="py-2">{row.orgName || "-"}</td>
                                <td className="py-2">{formatUsd(row.costUsd)}</td>
                                <td className="py-2">
                                  {formatUsd(row.costPerRequestUsd)}
                                </td>
                                <td className="py-2 text-right">
                                  {formatNumber(row.requests)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs uppercase tracking-wide text-[var(--muted)]">
                      <span>Organisations</span>
                      <button
                        type="button"
                        onClick={() => setOrgSort(orgSort === "asc" ? "desc" : "asc")}
                        className="rounded-full border border-white/10 px-3 py-1 text-[10px] text-[var(--muted)] transition hover:border-white/40"
                      >
                        Tri {orgSort === "asc" ? "asc" : "desc"}
                      </button>
                    </div>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left text-xs text-[var(--muted)]">
                        <thead>
                          <tr className="border-b border-white/5">
                            <th className="py-2">Organisation</th>
                            <th className="py-2">Cout total</th>
                            <th className="py-2">Cout / appel</th>
                            <th className="py-2 text-right">Appels</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedOrgs.length === 0 ? (
                            <tr>
                              <td
                                colSpan={4}
                                className="py-3 text-sm text-[var(--muted)]"
                              >
                                Aucune organisation.
                              </td>
                            </tr>
                          ) : (
                            sortedOrgs.map((row) => (
                              <tr key={row.key} className="border-b border-white/5">
                                <td className="py-2 text-[var(--text)]">{row.label}</td>
                                <td className="py-2">{formatUsd(row.costUsd)}</td>
                                <td className="py-2">
                                  {formatUsd(row.costPerRequestUsd)}
                                </td>
                                <td className="py-2 text-right">
                                  {formatNumber(row.requests)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <div className="panel rounded-2xl p-6">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold text-[var(--text)]">
                    Performance
                  </h3>
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                    Par endpoint
                  </p>
                </div>

                <div className="mt-4 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                      Latence p50 / p95
                    </p>
                    <div className="mt-3 space-y-3 text-xs text-[var(--muted)]">
                      {performanceRows.length === 0 ? (
                        <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                          Aucune donnee de latence.
                        </div>
                      ) : (
                        performanceRows.map((row) => (
                          <div key={row.endpoint} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[var(--text)]">
                                {resolveEndpointLabel(row.endpoint)}
                              </span>
                              <span>
                                {formatDuration(row.p50DurationMs)} /{" "}
                                {formatDuration(row.p95DurationMs)}
                              </span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                              <div
                                className="h-full rounded-full bg-sky-300/70"
                                style={{
                                  width: maxLatency
                                    ? `${Math.max(
                                        4,
                                        (row.p95DurationMs / maxLatency) * 100
                                      )}%`
                                    : "0%",
                                }}
                              />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                      Erreurs systeme
                    </p>
                    <div className="mt-3 space-y-3 text-xs text-[var(--muted)]">
                      {performanceRows.length === 0 ? (
                        <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                          Aucune donnee d erreur.
                        </div>
                      ) : (
                        performanceRows.map((row) => (
                          <div key={`${row.endpoint}-errors`} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[var(--text)]">
                                {resolveEndpointLabel(row.endpoint)}
                              </span>
                              <span>{formatPercent(row.errorRatePct, 2)}</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                              <div
                                className="h-full rounded-full bg-rose-300/70"
                                style={{
                                  width: maxErrorRate
                                    ? `${Math.max(
                                        4,
                                        (row.errorRatePct / maxErrorRate) * 100
                                      )}%`
                                    : "0%",
                                }}
                              />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="panel rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-[var(--text)]">
                  Endpoints les plus lents
                </h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs text-[var(--muted)]">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="py-2">Endpoint</th>
                        <th className="py-2">p50</th>
                        <th className="py-2">p95</th>
                        <th className="py-2">Erreurs</th>
                        <th className="py-2 text-right">Appels</th>
                      </tr>
                    </thead>
                    <tbody>
                      {performanceRows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-3 text-sm text-[var(--muted)]">
                            Aucun endpoint.
                          </td>
                        </tr>
                      ) : (
                        performanceRows.map((row) => (
                          <tr
                            key={`${row.endpoint}-slow`}
                            className="border-b border-white/5"
                          >
                            <td className="py-2 text-[var(--text)]">
                              {resolveEndpointLabel(row.endpoint)}
                            </td>
                            <td className="py-2">{formatDuration(row.p50DurationMs)}</td>
                            <td className="py-2">{formatDuration(row.p95DurationMs)}</td>
                            <td className="py-2">{formatPercent(row.errorRatePct, 2)}</td>
                            <td className="py-2 text-right">
                              {formatNumber(row.requests)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="panel rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-[var(--text)]">
                  Endpoints avec erreurs elevees
                </h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs text-[var(--muted)]">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="py-2">Endpoint</th>
                        <th className="py-2">Erreurs</th>
                        <th className="py-2">p95</th>
                        <th className="py-2 text-right">Appels</th>
                      </tr>
                    </thead>
                    <tbody>
                      {errorSorted.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-3 text-sm text-[var(--muted)]">
                            Aucun endpoint.
                          </td>
                        </tr>
                      ) : (
                        errorSorted.map((row) => (
                          <tr
                            key={`${row.endpoint}-error`}
                            className="border-b border-white/5"
                          >
                            <td className="py-2 text-[var(--text)]">
                              {resolveEndpointLabel(row.endpoint)}
                            </td>
                            <td className="py-2">{formatPercent(row.errorRatePct, 2)}</td>
                            <td className="py-2">{formatDuration(row.p95DurationMs)}</td>
                            <td className="py-2 text-right">
                              {formatNumber(row.requests)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </AdminGuard>
  );
}
