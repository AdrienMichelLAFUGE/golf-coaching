"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import RoleGuard from "../_components/role-guard";
import { useProfile } from "../_components/profile-context";
import PageHeader from "../_components/page-header";
import { z } from "zod";
import {
  ReportKpiRowSchema,
  type ReportKpiRow,
  pickReportTime,
} from "@/lib/reports-kpis";
import {
  ReportKpisRowSchema,
  ReportKpisStatusSchema,
  type ReportKpisRow,
  type ReportKpisStatus,
} from "@/lib/report-kpis-ai";
import {
  ReportSectionKpiSchema,
  buildLongTermHighlights,
  buildReportHighlights,
  type LongTermHighlights,
  type ReportHighlights,
} from "@/lib/report-highlights";

type Student = {
  id: string;
  org_id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  tpi_report_id: string | null;
  created_at?: string | null;
};

type TpiReport = {
  id: string;
  status: "processing" | "ready" | "error";
  created_at?: string;
  org_id: string;
  organizations?: { name: string | null }[] | { name: string | null } | null;
};

type TpiTest = {
  id: string;
  test_name: string;
  result_color: "green" | "orange" | "red";
  mini_summary: string | null;
  position: number;
};

type ActiveShare = {
  id: string;
  viewer_email: string;
  created_at: string;
};

const tpiColorRank: Record<TpiTest["result_color"], number> = {
  red: 0,
  orange: 1,
  green: 2,
};

const formatDate = (
  value?: string | null,
  locale?: string | null,
  timezone?: string | null
) => {
  if (!value) return "-";
  const options = timezone ? { timeZone: timezone } : undefined;
  return new Date(value).toLocaleDateString(locale ?? "fr-FR", options);
};

export default function StudentDashboardPage() {
  const { organization } = useProfile();
  const [student, setStudent] = useState<Student | null>(null);
  const [reports, setReports] = useState<ReportKpiRow[]>([]);
  const [reportsError, setReportsError] = useState("");
  const [aiKpisRow, setAiKpisRow] = useState<ReportKpisRow | null>(null);
  const [aiKpisStatus, setAiKpisStatus] = useState<ReportKpisStatus | "missing">("missing");
  const [aiKpisLoading, setAiKpisLoading] = useState(false);
  const [aiKpisError, setAiKpisError] = useState("");
  const [reportHighlightsShort, setReportHighlightsShort] = useState<ReportHighlights>({
    strength: null,
    weakness: null,
    physical: null,
    technical: null,
  });
  const [reportHighlightsLong, setReportHighlightsLong] = useState<LongTermHighlights>({
    strength: { snippet: null, mentions: 0 },
    weakness: { snippet: null, mentions: 0 },
    physical: { snippet: null, mentions: 0 },
    technical: { snippet: null, mentions: 0 },
  });
  const [highlightsLoading, setHighlightsLoading] = useState(false);
  const [highlightsError, setHighlightsError] = useState("");
  const [tpiReport, setTpiReport] = useState<TpiReport | null>(null);
  const [tpiTests, setTpiTests] = useState<TpiTest[]>([]);
  const [activeShares, setActiveShares] = useState<ActiveShare[]>([]);
  const [shareError, setShareError] = useState("");
  const [shareRevokingId, setShareRevokingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [noStudent, setNoStudent] = useState(false);
  const locale = organization?.locale ?? "fr-FR";
  const timezone = organization?.timezone ?? "Europe/Paris";
  const formatSourceLabel = useMemo(() => {
    return (orgId?: string | null, orgName?: string | null) => {
      if (orgName) return orgName;
      if (!orgId) return null;
      if (orgId === organization?.id) return "Workspace actuel";
      return "Autre workspace";
    };
  }, [organization?.id]);
  const tpiOrganizationsRef: TpiReport["organizations"] = tpiReport?.organizations ?? null;
  const tpiOrganizationName = Array.isArray(tpiOrganizationsRef)
    ? tpiOrganizationsRef[0]?.name ?? null
    : tpiOrganizationsRef?.name ?? null;
  const tpiSourceLabel = formatSourceLabel(tpiReport?.org_id, tpiOrganizationName);

  const studentName = useMemo(() => {
    if (!student) return "Eleve";
    return `${student.first_name} ${student.last_name ?? ""}`.trim();
  }, [student]);

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      setError("");
      setReportsError("");
      setShareError("");

      const { data: userData, error: userError } = await supabase.auth.getUser();

      const userId = userData.user?.id;
      if (userError || !userId) {
        setError("Impossible de charger ton profil.");
        setLoading(false);
        return;
      }

      const { data: accountRows, error: accountError } = await supabase
        .from("student_accounts")
        .select("student_id")
        .eq("user_id", userId);

      if (accountError) {
        setError(accountError.message);
        setLoading(false);
        return;
      }

      const studentIds = (accountRows ?? []).map((row) => row.student_id);
      if (studentIds.length === 0) {
        setNoStudent(true);
        setLoading(false);
        return;
      }

      const { data: studentsData, error: studentsError } = await supabase
        .from("students")
        .select("id, org_id, first_name, last_name, email, tpi_report_id, created_at")
        .in("id", studentIds)
        .order("created_at", { ascending: false });

      if (studentsError) {
        setError(studentsError.message);
        setLoading(false);
        return;
      }

      const primaryStudent = (studentsData ?? [])[0] as Student | undefined;
      if (!primaryStudent) {
        setNoStudent(true);
        setLoading(false);
        return;
      }

      setStudent(primaryStudent);

      const { data: shareData } = await supabase
        .from("student_shares")
        .select("id, viewer_email, created_at")
        .eq("status", "active")
        .order("created_at", { ascending: false });
      setActiveShares((shareData ?? []) as ActiveShare[]);

      let reportData: TpiReport | null = null;

      const { data: latestData } = await supabase
        .from("tpi_reports")
        .select("id, status, created_at, org_id, organizations(name)")
        .in("student_id", studentIds)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestData) reportData = latestData as TpiReport;

      if (reportData && reportData.status !== "ready") {
        const { data: readyData } = await supabase
          .from("tpi_reports")
          .select("id, status, created_at, org_id, organizations(name)")
          .in("student_id", studentIds)
          .eq("status", "ready")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (readyData) reportData = readyData as TpiReport;
      }

      if (reportData) {
        setTpiReport(reportData);
        const { data: testsData } = await supabase
          .from("tpi_tests")
          .select("id, test_name, result_color, mini_summary, position")
          .eq("report_id", reportData.id)
          .order("position", { ascending: true });
        const normalizedTests = (testsData ?? []) as TpiTest[];
        const sorted = [...normalizedTests].sort((a, b) => {
          const rank = tpiColorRank[a.result_color] - tpiColorRank[b.result_color];
          if (rank !== 0) return rank;
          return a.position - b.position;
        });
        setTpiTests(sorted);
      } else {
        setTpiReport(null);
        setTpiTests([]);
      }

      const { data: reportsData, error: reportsError } = await supabase
        .from("reports")
        .select(
          "id, title, report_date, created_at, org_id, sent_at, organizations(name), coach_observations, coach_work, coach_club"
        )
        .in("student_id", studentIds)
        .not("sent_at", "is", null)
        .order("report_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (reportsError) {
        // Non-blocking: keep the rest of the dashboard usable (TPI, shares, etc.).
        setReportsError(reportsError.message);
        setReports([]);
        setLoading(false);
        return;
      }

      const raw = (reportsData ?? []) as unknown[];
      const parsed: ReportKpiRow[] = [];
      let invalidCount = 0;
      for (const row of raw) {
        const item = ReportKpiRowSchema.safeParse(row);
        if (item.success) parsed.push(item.data);
        else invalidCount += 1;
      }

      if (invalidCount > 0) {
        setReportsError(`Certaines donnees de rapports sont invalides (${invalidCount}).`);
      }
      setReports(parsed);
      setLoading(false);
    };

    loadDashboard();
  }, []);

  const tpiCounts = useMemo(() => {
    const total = tpiTests.length;
    const green = tpiTests.filter((t) => t.result_color === "green").length;
    const orange = tpiTests.filter((t) => t.result_color === "orange").length;
    const red = tpiTests.filter((t) => t.result_color === "red").length;
    return { total, green, orange, red };
  }, [tpiTests]);

  const publishedReports = useMemo(() => {
    const eligible = reports.filter((report) => Boolean(report.sent_at));
    return [...eligible].sort((a, b) => pickReportTime(b) - pickReportTime(a));
  }, [reports]);
  const latestPublishedReport = useMemo(() => publishedReports[0] ?? null, [publishedReports]);
  const latestPublishedReportId = latestPublishedReport?.id ?? null;
  const lastFivePublishedIds = useMemo(
    () => publishedReports.slice(0, 5).map((r) => r.id),
    [publishedReports]
  );

  useEffect(() => {
    let cancelled = false;

    if (lastFivePublishedIds.length === 0) {
      // Avoid synchronous setState inside effect body (ESLint rule).
      Promise.resolve().then(() => {
        if (cancelled) return;
        setReportHighlightsShort({
          strength: null,
          weakness: null,
          physical: null,
          technical: null,
        });
        setReportHighlightsLong({
          strength: { snippet: null, mentions: 0 },
          weakness: { snippet: null, mentions: 0 },
          physical: { snippet: null, mentions: 0 },
          technical: { snippet: null, mentions: 0 },
        });
        setHighlightsError("");
        setHighlightsLoading(false);
      });

      return () => {
        cancelled = true;
      };
    }

    const loadHighlights = async () => {
      setHighlightsLoading(true);
      setHighlightsError("");

      const { data, error } = await supabase
        .from("report_sections")
        .select("id, report_id, title, content, content_formatted, position, created_at")
        .in("report_id", lastFivePublishedIds)
        .order("position", { ascending: true });

      if (cancelled) return;

      if (error) {
        setHighlightsError(error.message);
        setHighlightsLoading(false);
        return;
      }

      const parsed = z.array(ReportSectionKpiSchema).safeParse(data ?? []);
      if (!parsed.success) {
        setHighlightsError("Donnees de sections invalides.");
        setHighlightsLoading(false);
        return;
      }

      const sections = parsed.data;
      const short = latestPublishedReportId
        ? buildReportHighlights(sections.filter((s) => s.report_id === latestPublishedReportId))
        : {
            strength: null,
            weakness: null,
            physical: null,
            technical: null,
          };
      const long = buildLongTermHighlights(lastFivePublishedIds, sections);

      setReportHighlightsShort(short);
      setReportHighlightsLong(long);
      setHighlightsLoading(false);
    };

    Promise.resolve().then(() => {
      if (cancelled) return;
      void loadHighlights();
    });

    return () => {
      cancelled = true;
    };
  }, [lastFivePublishedIds, latestPublishedReportId]);

  useEffect(() => {
    let cancelled = false;

    if (!latestPublishedReportId) {
      Promise.resolve().then(() => {
        if (cancelled) return;
        setAiKpisRow(null);
        setAiKpisStatus("missing");
        setAiKpisError("");
        setAiKpisLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    const loadAiKpis = async () => {
      setAiKpisLoading(true);
      setAiKpisError("");

      const { data, error } = await supabase
        .from("report_kpis")
        .select(
          "id, org_id, student_id, report_id, status, input_hash, prompt_version, model, kpis_short, kpis_long, error, created_at, updated_at"
        )
        .eq("report_id", latestPublishedReportId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setAiKpisRow(null);
        setAiKpisStatus("missing");
        setAiKpisError("KPI IA indisponibles.");
        setAiKpisLoading(false);
        return;
      }

      if (!data) {
        setAiKpisRow(null);
        setAiKpisStatus("missing");
        setAiKpisLoading(false);
        return;
      }

      const parsed = ReportKpisRowSchema.safeParse(data);
      if (!parsed.success) {
        setAiKpisRow(null);
        setAiKpisStatus("missing");
        setAiKpisError("Donnees KPI invalides.");
        setAiKpisLoading(false);
        return;
      }

      const statusParsed = ReportKpisStatusSchema.safeParse(parsed.data.status);
      const status: ReportKpisStatus =
        statusParsed.success ? statusParsed.data : ("error" as const);

      setAiKpisRow(parsed.data);
      setAiKpisStatus(status);
      setAiKpisLoading(false);
    };

    Promise.resolve().then(() => {
      if (cancelled) return;
      void loadAiKpis();
    });

    return () => {
      cancelled = true;
    };
  }, [latestPublishedReportId]);

  const handleRevokeShare = async (shareId: string) => {
    setShareError("");
    setShareRevokingId(shareId);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setShareError("Session invalide.");
      setShareRevokingId(null);
      return;
    }

    const response = await fetch("/api/student-shares/revoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ shareId }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setShareError(payload.error ?? "Revoquer impossible.");
      setShareRevokingId(null);
      return;
    }

    setActiveShares((prev) => prev.filter((share) => share.id !== shareId));
    setShareRevokingId(null);
  };

  return (
    <RoleGuard
      allowedRoles={["student"]}
      fallback={
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-[var(--muted)]">Acces reserve aux eleves.</p>
        </section>
      }
    >
      {loading ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-[var(--muted)]">Chargement du dashboard...</p>
        </section>
      ) : error ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-red-400">{error}</p>
        </section>
      ) : noStudent ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-[var(--muted)]">
            Ce compte n est pas associe a un eleve. Connecte toi avec un email eleve ou
            demande au coach de t associer.
          </p>
        </section>
      ) : (
        <div className="space-y-6">
          <PageHeader
            overline={
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                Dashboard eleve
              </p>
            }
            title={`Bienvenue ${studentName}`}
            subtitle="Acces direct a tes rapports et points clefs."
            actions={
              <>
                <Link
                  href="/app/eleve/rapports"
                  className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
                >
                  Rapports
                </Link>
                <Link
                  href="/app/eleve/tests"
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                >
                  Tests
                </Link>
                <Link
                  href="/app/eleve/parametres"
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                >
                  Parametres
                </Link>
              </>
            }
            meta={
              student?.email ? (
                <div className="text-sm text-[var(--muted)]">{student.email}</div>
              ) : null
            }
          />

          <section className="panel relative overflow-hidden rounded-3xl p-6">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(110,231,183,0.10),transparent_55%),radial-gradient(circle_at_85%_0%,rgba(186,230,253,0.12),transparent_58%)]"
            />
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                  Synthese eleve
                </p>
                <h3 className="mt-2 text-lg font-semibold text-[var(--text)]">
                  Vue rapide, priorites, dernieres donnees.
                </h3>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.65rem] uppercase tracking-[0.25em] text-[var(--muted)]">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                    {latestPublishedReport
                      ? `Dernier rapport: ${formatDate(
                          latestPublishedReport.report_date ??
                            latestPublishedReport.created_at,
                          locale,
                          timezone
                        )}`
                      : "Aucun rapport publie"}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                    TPI: {tpiCounts.red} rouge, {tpiCounts.orange} orange
                  </span>
                  <span
                    className={`rounded-full border px-3 py-1 ${
                      aiKpisStatus === "ready"
                        ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200"
                        : aiKpisStatus === "pending"
                          ? "border-amber-300/30 bg-amber-400/10 text-amber-200"
                          : "border-white/10 bg-white/5 text-[var(--muted)]"
                    }`}
                  >
                    IA:{" "}
                    {aiKpisStatus === "ready"
                      ? "pret"
                      : aiKpisStatus === "pending"
                        ? "en cours"
                        : "off"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/app/eleve/rapports"
                  className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
                >
                  Rapports
                </Link>
              </div>
            </div>

            {highlightsError ? (
              <p className="relative mt-4 text-sm text-red-400">{highlightsError}</p>
            ) : null}
            {reportsError ? (
              <p className="relative mt-4 text-sm text-red-400">{reportsError}</p>
            ) : null}
            {aiKpisError ? (
              <p className="relative mt-4 text-sm text-red-400">{aiKpisError}</p>
            ) : null}
            {highlightsLoading ? (
              <p className="relative mt-4 text-sm text-[var(--muted)]">
                Chargement des KPI...
              </p>
            ) : null}
            {aiKpisLoading ? (
              <p className="relative mt-4 text-sm text-[var(--muted)]">
                Chargement des KPI IA...
              </p>
            ) : null}
            {aiKpisStatus === "pending" ? (
              <p className="relative mt-4 text-sm text-[var(--muted)]">
                KPI IA en cours de generation...
              </p>
            ) : null}
            {aiKpisStatus === "error" && aiKpisRow?.error ? (
              <p className="relative mt-4 text-sm text-red-400">{aiKpisRow.error}</p>
            ) : null}

            <div className="relative mt-6 grid gap-8 lg:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                  Court terme
                </p>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Base sur le dernier rapport publie.
                </p>

                <div className="mt-4">
                  {aiKpisStatus === "ready" && aiKpisRow ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {aiKpisRow.kpis_short.map((kpi) => (
                        <div
                          key={kpi.id}
                          className="min-h-36 rounded-2xl bg-[var(--panel-strong)] p-4"
                        >
                          <p className="text-[0.65rem] uppercase tracking-[0.25em] text-[var(--muted)]">
                            {kpi.title}
                          </p>
                          <p className="mt-2 text-sm font-semibold text-[var(--text)]">
                            {kpi.value ?? "-"}
                          </p>
                          <p className="mt-2 whitespace-pre-line text-xs text-[var(--muted)]">
                            {kpi.evidence}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key: "strength" as const, label: "Point fort" },
                        { key: "weakness" as const, label: "Point faible" },
                        { key: "physical" as const, label: "Physique" },
                        { key: "technical" as const, label: "Technique" },
                      ].map((item) => (
                        <div
                          key={item.key}
                          className="rounded-2xl bg-[var(--panel-strong)] p-4"
                        >
                          <p className="text-[0.65rem] uppercase tracking-[0.25em] text-[var(--muted)]">
                            {item.label}
                          </p>
                          <p className="mt-2 text-sm font-semibold text-[var(--text)]">
                            {reportHighlightsShort[item.key] ?? "-"}
                          </p>
                          {item.key === "physical" ? (
                            <div className="mt-3 flex flex-wrap gap-2 text-[0.7rem] text-[var(--muted)]">
                              <span className="inline-flex items-center gap-1 rounded-full border border-rose-300/25 bg-rose-400/10 px-2 py-0.5 text-rose-200">
                                {tpiCounts.red} rouge
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/25 bg-amber-400/10 px-2 py-0.5 text-amber-200">
                                {tpiCounts.orange} orange
                              </span>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <p className="mt-3 text-xs text-[var(--muted)]">
                  {latestPublishedReport
                    ? `Rapport du ${formatDate(
                        latestPublishedReport.report_date ??
                          latestPublishedReport.created_at,
                        locale,
                        timezone
                      )}`
                    : "Aucun rapport publie pour le moment."}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                  Long terme
                </p>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Tendances (5 derniers rapports).
                </p>
                <div className="mt-4">
                  {aiKpisStatus === "ready" && aiKpisRow ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {aiKpisRow.kpis_long.map((kpi) => (
                        <div
                          key={kpi.id}
                          className="min-h-36 rounded-2xl bg-[var(--panel-strong)] p-4"
                        >
                          <p className="text-[0.65rem] uppercase tracking-[0.25em] text-[var(--muted)]">
                            {kpi.title}
                          </p>
                          <p className="mt-2 text-sm font-semibold text-[var(--text)]">
                            {kpi.value ?? "-"}
                          </p>
                          <p className="mt-2 whitespace-pre-line text-xs text-[var(--muted)]">
                            {kpi.evidence}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key: "strength" as const, label: "Point fort" },
                        { key: "weakness" as const, label: "Point faible" },
                        { key: "physical" as const, label: "Physique" },
                        { key: "technical" as const, label: "Technique" },
                      ].map((item) => (
                        <div
                          key={`long-${item.key}`}
                          className="rounded-2xl bg-[var(--panel-strong)] p-4"
                        >
                          <p className="text-[0.65rem] uppercase tracking-[0.25em] text-[var(--muted)]">
                            {item.label}
                          </p>
                          <p className="mt-2 text-sm font-semibold text-[var(--text)]">
                            {reportHighlightsLong[item.key].snippet ?? "-"}
                          </p>
                          <p className="mt-2 text-xs text-[var(--muted)]">
                            Mentionne dans {reportHighlightsLong[item.key].mentions}/5
                            rapports
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {activeShares.length > 0 ? (
            <section className="panel-soft rounded-2xl p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--text)]">
                    Partages actifs
                  </h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Ces coachs ont un acces lecture seule. Tu peux revoquer a tout moment.
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {activeShares.map((share) => (
                  <div
                    key={share.id}
                    className="flex flex-col gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--text)] md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="font-medium">{share.viewer_email}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Partage actif depuis{" "}
                        {formatDate(share.created_at, locale, timezone)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevokeShare(share.id)}
                      disabled={shareRevokingId === share.id}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-red-300 transition hover:text-red-200 disabled:opacity-60"
                    >
                      {shareRevokingId === share.id ? "Revocation..." : "Revoquer"}
                    </button>
                  </div>
                ))}
              </div>
              {shareError ? (
                <p className="mt-3 text-sm text-red-400">{shareError}</p>
              ) : null}
            </section>
          ) : null}

          <section className="panel rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--text)]">
                Derniers rapports
              </h3>
              <Link
                href="/app/eleve/rapports"
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--text)]"
              >
                Voir tout
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {reports.length === 0 ? (
                <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                  Aucun rapport disponible pour le moment.
                </div>
              ) : (
                reports.slice(0, 3).map((report) => {
                  const titleLabel = report.title.trim().length > 0 ? report.title : "Rapport";
                  const orgName = Array.isArray(report.organizations)
                    ? report.organizations[0]?.name ?? null
                    : report.organizations?.name ?? null;
                  const orgLabel = orgName ?? "Organisation";
                  return (
                    <Link
                      key={report.id}
                      href={`/app/eleve/rapports/${report.id}`}
                      className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--text)] transition hover:border-white/20"
                    >
                      <div>
                        <p className="font-medium">{titleLabel}</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {formatDate(
                            report.report_date ?? report.created_at,
                            locale,
                            timezone
                          )}
                          {" - "}
                          {orgLabel}
                        </p>
                      </div>
                      <span className="text-xs text-[var(--muted)]">Lire -&gt;</span>
                    </Link>
                  );
                })
              )}
            </div>
          </section>

          <section className="panel relative rounded-2xl border-l-2 border-rose-400/40 p-6">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-0 h-0.5 w-full rounded-t-2xl bg-rose-400/80"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text)]">
                  Profil TPI
                  {tpiReport?.created_at ? (
                    <span className="text-sm font-medium text-[var(--muted)]">
                      {" "}
                      - {formatDate(tpiReport.created_at, locale, timezone)}
                    </span>
                  ) : null}
                </h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Resume visuel de ton screening physique pour suivre tes progres.
                </p>
                {tpiSourceLabel ? (
                  <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                    Source: {tpiSourceLabel}
                  </div>
                ) : null}
              </div>
              {tpiReport ? (
                <span className="rounded-full border border-rose-300/30 bg-rose-400/10 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-rose-200">
                  {tpiReport.status === "processing"
                    ? "Analyse en cours"
                    : tpiReport.status === "ready"
                      ? "Pret"
                      : "Erreur"}
                </span>
              ) : null}
            </div>

            {tpiReport?.status === "ready" ? (
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-1">
                {tpiTests.length === 0 ? (
                  <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                    Aucun test TPI disponible.
                  </div>
                ) : (
                  tpiTests.map((test) => {
                    const colorClass =
                      test.result_color === "green"
                        ? "bg-emerald-400"
                        : test.result_color === "orange"
                          ? "bg-amber-400"
                          : "bg-rose-400";
                    return (
                      <div
                        key={test.id}
                        className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${colorClass}`} />
                          <p className="text-sm font-semibold text-[var(--text)]">
                            {test.test_name}
                          </p>
                        </div>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {test.mini_summary || "-"}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            ) : tpiReport?.status === "processing" ? (
              <p className="mt-3 text-sm text-[var(--muted)]">
                Analyse en cours. Le resume sera disponible bientot.
              </p>
            ) : (
              <p className="mt-3 text-sm text-[var(--muted)]">
                Aucun rapport TPI disponible pour le moment.
              </p>
            )}
          </section>
        </div>
      )}
    </RoleGuard>
  );
}
