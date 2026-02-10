"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/lib/supabase/client";
import RoleGuard from "../_components/role-guard";
import { useProfile } from "../_components/profile-context";
import PageHeader from "../_components/page-header";
import Badge from "../_components/badge";
import StudentCreateModal from "../_components/student-create-modal";

type ReportRow = {
  id: string;
  title: string;
  report_date: string | null;
  created_at: string;
  students:
    | { first_name: string; last_name: string | null }
    | { first_name: string; last_name: string | null }[]
    | null;
};

type AnalyticsBar = {
  key: string; // YYYY-MM-DD in org timezone
  label: string; // day label (e.g. L, M, ...)
  value: number;
};

type StudentPreviewRow = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  created_at: string;
  invited_at: string | null;
  activated_at: string | null;
};

type Reminder = {
  title: string;
  description: string;
  cta: string;
  href: string;
  tone: "primary" | "neutral";
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

const formatStudentName = (value: ReportRow["students"]) => {
  const student = Array.isArray(value) ? value[0] : value;
  if (!student) return "Eleve";
  return `${student.first_name} ${student.last_name ?? ""}`.trim();
};

const localDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getTimezoneDateKey = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) return localDateKey(date);
  return `${year}-${month}-${day}`;
};

const getWeekdayLabel = (date: Date, timeZone: string) => {
  const label = new Intl.DateTimeFormat("fr-FR", {
    timeZone,
    weekday: "narrow",
  }).format(date);
  return label.toUpperCase();
};

const AnalyticsRowSchema = z.object({
  created_at: z.string().min(1),
});

const StudentPreviewRowSchema = z.object({
  id: z.string().min(1),
  first_name: z.string().min(1),
  last_name: z.string().nullable(),
  email: z.string().nullable(),
  created_at: z.string().min(1),
  invited_at: z.string().nullable(),
  activated_at: z.string().nullable(),
});

type KpiCardProps = {
  label: string;
  value: string;
  hint: string;
  tone?: "accent" | "default";
  href?: string;
};

function KpiCard({ label, value, hint, tone = "default", href }: KpiCardProps) {
  const content = (
    <div className="panel-soft relative overflow-hidden rounded-2xl p-5">
      {tone === "accent" ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(110,231,183,0.22),transparent_60%),radial-gradient(circle_at_90%_20%,rgba(186,230,253,0.22),transparent_60%),linear-gradient(135deg,rgba(16,185,129,0.10),rgba(56,189,248,0.10))]"
        />
      ) : (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(15,23,42,0.05),transparent_60%)]"
        />
      )}

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.65rem] uppercase tracking-[0.25em] text-[var(--text)]">
            {label}
          </p>
          <p className="mt-4 text-4xl font-semibold tracking-tight text-[var(--text)]">
            {value}
          </p>
          <p className="mt-2 text-xs text-[var(--muted)]">{hint}</p>
        </div>
        {href ? (
          <span
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/40 text-[var(--muted)] transition group-hover:text-[var(--text)]"
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7 17L17 7" />
              <path d="M9 7h8v8" />
            </svg>
          </span>
        ) : null}
      </div>
    </div>
  );

  if (!href) return content;
  return (
    <Link href={href} className="group block">
      {content}
    </Link>
  );
}

export default function CoachDashboardPage() {
  const { organization } = useProfile();
  const [loading, setLoading] = useState(true);
  const [createStudentOpen, setCreateStudentOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [studentsPreview, setStudentsPreview] = useState<StudentPreviewRow[]>([]);
  const [studentsPreviewError, setStudentsPreviewError] = useState<string | null>(null);
  const [studentsCount, setStudentsCount] = useState<number | null>(null);
  const [reportsCount, setReportsCount] = useState<number | null>(null);
  const [draftReportsCount, setDraftReportsCount] = useState<number | null>(null);
  const [activeTestsCount, setActiveTestsCount] = useState<number | null>(null);
  const [pendingInvitesCount, setPendingInvitesCount] = useState<number | null>(null);

  const [analyticsBars, setAnalyticsBars] = useState<AnalyticsBar[] | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  const locale = organization?.locale ?? "fr-FR";
  const timezone = organization?.timezone ?? "Europe/Paris";
  const modeLabel =
    (organization?.workspace_type ?? "personal") === "org"
      ? `Organisation : ${organization?.name ?? "Organisation"}`
      : "Espace personnel";
  const modeBadgeTone =
    (organization?.workspace_type ?? "personal") === "org"
      ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
      : "border-sky-300/30 bg-sky-400/10 text-sky-100";

  useEffect(() => {
    let cancelled = false;
    const loadDashboard = async () => {
      setLoading(true);
      setAnalyticsError(null);

      const anchor = new Date();
      anchor.setHours(12, 0, 0, 0); // stable anchor for DST edges

      const days = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(anchor.getTime() - (6 - index) * 24 * 60 * 60 * 1000);
        return {
          key: getTimezoneDateKey(date, timezone),
          label: getWeekdayLabel(date, timezone),
          date,
        };
      });

      const start = new Date(days[0]?.date ?? anchor);
      start.setHours(0, 0, 0, 0);
      const startIso = start.toISOString();

      const [
        { count: studentTotal },
        { count: reportTotal },
        { count: draftTotal },
        { count: pendingInvitesTotal },
        { count: activeTestsTotal },
        recentReportsRes,
        studentsPreviewRes,
        analyticsRes,
      ] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }),
        supabase.from("reports").select("id", { count: "exact", head: true }),
        supabase
          .from("reports")
          .select("id", { count: "exact", head: true })
          .is("sent_at", null),
        supabase
          .from("students")
          .select("id", { count: "exact", head: true })
          .not("invited_at", "is", null)
          .is("activated_at", null),
        supabase
          .from("normalized_test_assignments")
          .select("id", { count: "exact", head: true })
          .is("archived_at", null)
          .in("status", ["assigned", "in_progress"]),
        supabase
          .from("reports")
          .select("id, title, report_date, created_at, students(first_name, last_name)")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("students")
          .select(
            "id, first_name, last_name, email, created_at, invited_at, activated_at"
          )
          .order("created_at", { ascending: false })
          .limit(5),
        supabase.from("reports").select("created_at").gte("created_at", startIso),
      ]);

      if (cancelled) return;

      setStudentsCount(studentTotal ?? null);
      setReportsCount(reportTotal ?? null);
      setDraftReportsCount(draftTotal ?? null);
      setPendingInvitesCount(pendingInvitesTotal ?? null);
      setActiveTestsCount(activeTestsTotal ?? null);
      setReports((recentReportsRes.data ?? []) as ReportRow[]);

      if (studentsPreviewRes.error) {
        setStudentsPreview([]);
        setStudentsPreviewError("Chargement des eleves impossible.");
      } else {
        const parsed = z
          .array(StudentPreviewRowSchema)
          .safeParse(studentsPreviewRes.data ?? []);
        if (!parsed.success) {
          setStudentsPreview([]);
          setStudentsPreviewError("Chargement des eleves impossible.");
        } else {
          setStudentsPreview(parsed.data);
          setStudentsPreviewError(null);
        }
      }

      if (analyticsRes.error) {
        setAnalyticsBars(null);
        setAnalyticsError("Analytics indisponible.");
      } else {
        const parsed = z.array(AnalyticsRowSchema).safeParse(analyticsRes.data ?? []);
        if (!parsed.success) {
          setAnalyticsBars(null);
          setAnalyticsError("Analytics indisponible.");
        } else {
          const counts = new Map<string, number>();
          parsed.data.forEach((row) => {
            const key = getTimezoneDateKey(new Date(row.created_at), timezone);
            counts.set(key, (counts.get(key) ?? 0) + 1);
          });

          setAnalyticsBars(
            days.map((day) => ({
              key: day.key,
              label: day.label,
              value: counts.get(day.key) ?? 0,
            }))
          );
          setAnalyticsError(null);
        }
      }

      setLoading(false);
    };

    void loadDashboard();
    return () => {
      cancelled = true;
    };
  }, [organization?.id, timezone, refreshTick]);

  const reminders = useMemo<Reminder[]>(() => {
    const list: Reminder[] = [];

    if ((draftReportsCount ?? 0) > 0) {
      list.push({
        title: "Publier vos brouillons",
        description: "Des rapports sont encore en brouillon. Publie pour notifier l eleve.",
        cta: "Voir les rapports",
        href: "/app/coach/rapports",
        tone: "primary",
      });
    }

    if (list.length < 3 && (pendingInvitesCount ?? 0) > 0) {
      list.push({
        title: "Finaliser les invitations eleves",
        description: "Des eleves sont invites mais pas encore actives.",
        cta: "Gerer les eleves",
        href: "/app/coach/eleves",
        tone: "neutral",
      });
    }

    if (list.length < 3 && (activeTestsCount ?? 0) > 0) {
      list.push({
        title: "Suivre les tests en cours",
        description: "Consulte les assignations et relance si besoin.",
        cta: "Ouvrir les tests",
        href: "/app/coach/tests",
        tone: "neutral",
      });
    }

    if (list.length === 0) {
      list.push({
        title: "Creer un nouveau rapport",
        description: "Demarre un rapport structure pour ton eleve.",
        cta: "Nouveau rapport",
        href: "/app/coach/rapports/nouveau",
        tone: "primary",
      });
    }

    return list.slice(0, 3);
  }, [activeTestsCount, draftReportsCount, pendingInvitesCount]);

  const analyticsMax = useMemo(() => {
    if (!analyticsBars || analyticsBars.length === 0) return 0;
    return analyticsBars.reduce((max, bar) => Math.max(max, bar.value), 0);
  }, [analyticsBars]);

  const formatStudentInitials = (student: StudentPreviewRow) => {
    const first = (student.first_name ?? "").trim().charAt(0).toUpperCase();
    const last = (student.last_name ?? "").trim().charAt(0).toUpperCase();
    return `${first}${last}`.trim() || "E";
  };

  const getStudentStatus = (student: StudentPreviewRow) => {
    if (student.activated_at) {
      return {
        label: "Actif",
        tone: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
      } as const;
    }
    if (student.invited_at) {
      return {
        label: "Invite",
        tone: "border-amber-300/30 bg-amber-400/10 text-amber-200",
      } as const;
    }
    return {
      label: "A inviter",
      tone: "border-white/10 bg-white/5 text-[var(--muted)]",
    } as const;
  };

  return (
    <RoleGuard allowedRoles={["owner", "coach", "staff"]}>
      <div className="space-y-4">
        <PageHeader
          title="Dashboard"
          subtitle="Vos rapports, eleves et activite recente en un coup d oeil."
          meta={
            <Badge className={modeBadgeTone}>
              <span className="min-w-0 break-words">Vous travaillez dans {modeLabel}</span>
            </Badge>
          }
        />

        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard
            label="Eleves"
            value={studentsCount !== null ? `${studentsCount}` : "-"}
            hint="Maj automatique"
            tone="accent"
            href="/app/coach/eleves"
          />
          <KpiCard
            label="Rapports"
            value={reportsCount !== null ? `${reportsCount}` : "-"}
            hint="Tous rapports"
            href="/app/coach/rapports"
          />
          <KpiCard
            label="Brouillons"
            value={draftReportsCount !== null ? `${draftReportsCount}` : "-"}
            hint="A publier"
            href="/app/coach/rapports"
          />
          <KpiCard 
            label="Tests actifs"
            value={activeTestsCount !== null ? `${activeTestsCount}` : "-"}
            hint="Assignes ou en cours"
            href="/app/coach/tests"
          />
        </section>

        <section className="grid items-stretch gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="flex h-full flex-col gap-4">
            <section className="panel rounded-2xl p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                    Activite
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-[var(--text)]">
                    7 derniers jours
                  </h2>
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    {analyticsBars
                      ? `Total semaine : ${analyticsBars.reduce(
                          (sum, bar) => sum + bar.value,
                          0
                        )}`
                      : analyticsError
                        ? analyticsError
                        : "Chargement..."}
                  </p>
                </div>
                <Badge tone="muted">Rapports crees</Badge>
              </div>

              <div className="mt-5">
                {analyticsBars && analyticsBars.length > 0 ? (
                  <div className="grid gap-4">
                    <div className="flex h-28 items-end gap-2">
                      {analyticsBars.map((bar, index) => {
                        const max = analyticsMax || 1;
                        const raw = Math.round((bar.value / max) * 100);
                        const height = Math.max(6, raw);
                        const isToday = index === analyticsBars.length - 1;
                        return (
                          <div key={bar.key} className="flex flex-1 flex-col items-center gap-2">
                             <div
                              className="flex h-24 w-full items-end"
                              aria-label={`${bar.label}: ${bar.value} rapport${
                                bar.value > 1 ? "s" : ""
                              }`}
                              title={`${bar.value} rapport${bar.value > 1 ? "s" : ""}`}
                            >
                              <div
                                className={`w-full rounded-full ${
                                  isToday
                                    ? "bg-gradient-to-t from-emerald-300 via-emerald-200 to-sky-200"
                                    : "bg-[var(--border)] opacity-40"
                                }`}
                                style={{ height: `${height}%` }}
                              />
                            </div>
                            <span className="text-[0.65rem] uppercase tracking-wide text-[var(--muted)]">
                              {bar.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-[var(--muted)]">
                      Astuce: vise 1 rapport par seance pour garder l historique a jour.
                    </p>
                  </div>
                ) : analyticsError ? (
                  <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                    {analyticsError}
                  </div>
                ) : loading ? (
                  <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                    Chargement de l activite...
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                    Aucune activite recente.
                  </div>
                )}
              </div>
            </section>

            <div className="h-full grid items-stretch gap-4 lg:grid-cols-2">
              <section className="panel h-full rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className=" text-2xl font-semibold text-[var(--text)]">
                    Liste élèves
                  </h3>
                </div>
                <button
                type="button"
                onClick={() => setCreateStudentOpen(true)}
                className="inline-flex items-center gap-2 rounded-full border-2 border-grey-500 px-4 py-2 text-xs tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
              ><svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
                AJOUTER
              </button>
              </div>

              <div className="mt-6">
                {studentsPreviewError ? (
                  <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-red-300">
                    {studentsPreviewError}
                  </div>
                ) : null}
                {loading ? (
                  <div className="rounded-xl px-4 py-3 text-sm text-[var(--muted)]">
                    Chargement des eleves...
                  </div>
                ) : studentsPreview.length === 0 ? (
                  <div className="rounded-2xl px-4 py-4 text-sm">
                    <p className="text-[var(--text)]">Aucun eleve pour le moment.</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Cree ton premier eleve pour demarrer le suivi.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setCreateStudentOpen(true)}
                        className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90"
                      >
                        Ajouter un eleve
                      </button>
                      <Link
                        href="/app/coach/eleves"
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                      >
                        Ouvrir l&apos;annuaire
                      </Link>
                    </div>
                  </div>
                ) : (
                  studentsPreview.slice(0, 5).map((student) => {
                    const status = getStudentStatus(student);
                    return (
                      <Link
                        key={student.id}
                        href={`/app/coach/eleves/${student.id}`}
                        className="flex items-center justify-between gap-4 rounded-2xl py-3 text-sm text-[var(--text)] transition hover:border-white/20"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-white/10 bg-white/10 text-xs font-semibold text-[var(--muted)]">
                            {formatStudentInitials(student)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {student.first_name} {student.last_name ?? ""}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                              {student.email
                                ? student.email
                                : `Cree le ${formatDate(
                                    student.created_at,
                                    locale,
                                    timezone
                                  )}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge className={status.tone}>{status.label}</Badge>
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
              </section>

              <section className="bg-[var(--panel)] h-full rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                <h3 className=" text-2xl font-semibold text-[var(--text)]">
                  Liste rapports
                </h3>
                </div>
                <Link
                href="/app/coach/rapports/nouveau"
                className="inline-flex items-center gap-2 rounded-full border-2 border-pink-200 dark:border-pink-400 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-pink-700 transition hover:opacity-90"
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
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
                rapport
              </Link>
              </div>
              <div className="mt-6 space-y-3">
                {loading ? (
                  <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                    Chargement des rapports...
                  </div>
                ) : reports.length === 0 ? (
                  <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                    Aucun rapport pour le moment.
                  </div>
                ) : (
                  reports.map((report) => (
                    <Link
                      key={report.id}
                      href={`/app/coach/rapports/${report.id}`}
                      className="group flex items-center justify-between gap-4 rounded-2xl border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--text)] transition hover:border-white/20"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{report.title}</p>
                        <p className="mt-1 truncate text-xs text-[var(--muted)]">
                          {formatStudentName(report.students)}
                          {" - "}
                          {formatDate(
                            report.report_date ?? report.created_at,
                            locale,
                            timezone
                          )}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-[var(--muted)] transition group-hover:text-[var(--text)]">
                        Ouvrir
                      </span>
                    </Link>
                  ))
                )}
              </div>
              </section>
            </div>
          </div>

          <div className="flex h-full flex-col gap-4">
            <section className="panel rounded-2xl p-6">
              <div>
                <h3 className="mt-2 text-2xl font-semibold text-[var(--text)]">
                  Prochaine action
                </h3>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  {pendingInvitesCount !== null
                    ? `${pendingInvitesCount} invitation${
                        pendingInvitesCount > 1 ? "s" : ""
                      } en attente`
                    : "Conseils bases sur ton activite"}
                </p>
              </div>

              <div className="mt-4 space-y-3">
                {reminders.map((reminder) => (
                  <div
                    key={reminder.title}
                    className="rounded-2xl border-white/10 bg-white/5 p-4"
                  >
                    <p className="text-sm font-semibold text-[var(--text)]">
                      {reminder.title}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {reminder.description}
                    </p>
                    <Link
                      href={reminder.href}
                      className={`mt-3 inline-flex rounded-full px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-wide transition ${
                        reminder.tone === "primary"
                          ? "bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 text-zinc-900 hover:opacity-90"
                          : "border border-white/10 bg-white/10 text-[var(--text)] hover:bg-white/20"
                      }`}
                    >
                      {reminder.cta}
                    </Link>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel mt-auto rounded-2xl p-6">
              <h3 className="text-2xl font-semibold text-[var(--text)]">Acces rapides</h3>
              <div className="mt-4 space-y-3 text-sm text-[var(--muted)]">
                <Link
                  href="/app/coach/eleves"
                  className="block rounded-2xl border-white/5 bg-white/5 px-4 py-3 transition hover:border-white/20"
                >
                  Gerer les eleves
                </Link>
                <Link
                  href="/app/coach/tests"
                  className="block rounded-2xl border-white/5 bg-white/5 px-4 py-3 transition hover:border-white/20"
                >
                  Tests normalises
                </Link>
                <Link
                  href="/app/coach/rapports/nouveau"
                  className="block rounded-2xl border-white/5 bg-white/5 px-4 py-3 transition hover:border-white/20"
                >
                  Creer un rapport
                </Link>
                <Link
                  href="/app/coach/rapports"
                  className="block rounded-2xl border-white/5 bg-white/5 px-4 py-3 transition hover:border-white/20"
                >
                  Voir tous les rapports
                </Link>
              </div>
            </section>
          </div>
        </section>

        {createStudentOpen ? (
          <StudentCreateModal
            onClose={() => setCreateStudentOpen(false)}
            afterCreate={() => setRefreshTick((prev) => prev + 1)}
          />
        ) : null}
      </div>
    </RoleGuard>
  );
}
