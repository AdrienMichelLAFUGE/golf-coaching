"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canDeleteReport, canEditReport } from "@/lib/report-permissions";
import { supabase } from "@/lib/supabase/client";
import RoleGuard from "../../_components/role-guard";
import { useProfile } from "../../_components/profile-context";
import PageBack from "../../_components/page-back";
import PageHeader from "../../_components/page-header";
import Badge from "../../_components/badge";

type ReportRow = {
  id: string;
  title: string;
  report_date: string | null;
  created_at: string;
  sent_at: string | null;
  org_id: string;
  origin_share_id: string | null;
  shared_source_student_name: string | null;
  organizations?: OrganizationRef;
  author_profile?: AuthorProfileRef;
  students:
    | { id: string; first_name: string; last_name: string | null }
    | { id: string; first_name: string; last_name: string | null }[]
    | null;
};

type OrganizationRef =
  | {
      name: string | null;
      workspace_type?: "personal" | "org" | null;
    }
  | { name: string | null; workspace_type?: "personal" | "org" | null }[]
  | null;

type AuthorProfileRef =
  | {
      full_name: string | null;
    }
  | { full_name: string | null }[]
  | null;

type ReportSharePayloadRef =
  | {
      source_student_name?: string | null;
    }
  | null;

const formatDate = (
  value?: string | null,
  locale?: string | null,
  timezone?: string | null
) => {
  if (!value) return "-";
  const options = timezone ? { timeZone: timezone } : undefined;
  return new Date(value).toLocaleDateString(locale ?? "fr-FR", options);
};

const getOrgName = (value?: OrganizationRef) => {
  if (!value) return null;
  if (Array.isArray(value)) return value[0]?.name ?? null;
  return value.name ?? null;
};

const getOrgWorkspaceType = (value?: OrganizationRef) => {
  if (!value) return null;
  if (Array.isArray(value)) return value[0]?.workspace_type ?? null;
  return value.workspace_type ?? null;
};

const getAuthorName = (value?: AuthorProfileRef) => {
  if (!value) return null;
  if (Array.isArray(value)) return value[0]?.full_name?.trim() || null;
  return value.full_name?.trim() || null;
};

export default function CoachReportsPage() {
  const { organization } = useProfile();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [studentFilter, setStudentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [shareTypeFilter, setShareTypeFilter] = useState("all");
  const [datePreset, setDatePreset] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState<"title" | "student">("title");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc" | "none">("none");
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

  const openWorkspaceSwitcher = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("gc:open-workspace-switcher"));
  };

  const toInputDate = (value: Date) => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const loadReports = async () => {
    setLoading(true);
    setError("");

    const { data, error: fetchError } = await supabase
      .from("reports")
      .select(
        "id, title, report_date, created_at, sent_at, org_id, origin_share_id, organizations(name, workspace_type), author_profile:profiles!reports_author_id_fkey(full_name), students(id, first_name, last_name)"
      )
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      const baseReports: ReportRow[] = (
        (data ?? []) as Array<Omit<ReportRow, "shared_source_student_name">>
      ).map((report): ReportRow => ({
        ...report,
        shared_source_student_name: null,
      }));

      const originShareIds = Array.from(
        new Set(
          baseReports
            .map((report) => report.origin_share_id)
            .filter((value): value is string => Boolean(value))
        )
      );

      if (originShareIds.length > 0) {
        const { data: shareRows } = await supabase
          .from("report_shares")
          .select("id, payload")
          .in("id", originShareIds);

        const shareNameById = new Map<string, string>();
        (shareRows ?? []).forEach((row) => {
          const payload = row.payload as ReportSharePayloadRef;
          const sourceStudentName = payload?.source_student_name?.trim() ?? "";
          if (!sourceStudentName) return;
          shareNameById.set(row.id, sourceStudentName);
        });

        baseReports.forEach((report) => {
          if (!report.origin_share_id) return;
          report.shared_source_student_name =
            shareNameById.get(report.origin_share_id) ?? null;
        });
      }

      setReports(baseReports);
    }
    setLoading(false);
  };

  const getStudent = useCallback((report: ReportRow) => {
    return Array.isArray(report.students)
      ? report.students[0]
      : (report.students ?? null);
  }, []);

  const getReportStudentName = useCallback(
    (report: ReportRow) => {
      const student = getStudent(report);
      if (student) {
        return `${student.first_name} ${student.last_name ?? ""}`.trim();
      }
      const sourceName = report.shared_source_student_name?.trim();
      if (sourceName) return sourceName;
      return "-";
    },
    [getStudent]
  );

  const formatSourceLabel = (report: ReportRow) => {
    const orgName = getOrgName(report.organizations);
    const workspaceType = getOrgWorkspaceType(report.organizations);
    if (workspaceType === "personal") {
      return orgName ? `Perso - ${orgName}` : "Workspace perso";
    }
    if (orgName) return `Orga - ${orgName}`;
    if (report.org_id === organization?.id) return "Workspace actuel";
    return "Autre workspace";
  };

  const studentOptions = useMemo(() => {
    const seen = new Map<string, string>();
    reports.forEach((report) => {
      const student = getStudent(report);
      if (!student?.id || seen.has(student.id)) return;
      const label = `${student.first_name} ${student.last_name ?? ""}`.trim();
      seen.set(student.id, label);
    });
    return Array.from(seen.entries()).map(([id, label]) => ({
      id,
      label,
    }));
  }, [getStudent, reports]);

  const filteredReports = useMemo(() => {
    const query = search.trim().toLowerCase();
    const fromDate = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const toDate = dateTo ? new Date(`${dateTo}T23:59:59`) : null;

    const output = reports.filter((report) => {
      if (statusFilter === "draft" && report.sent_at) return false;
      if (statusFilter === "sent" && !report.sent_at) return false;
      if (shareTypeFilter === "shared" && !report.origin_share_id) return false;
      if (shareTypeFilter === "standard" && report.origin_share_id) return false;

      const student = getStudent(report);
      if (studentFilter !== "all" && student?.id !== studentFilter) {
        return false;
      }

      if (query) {
        const studentName = getReportStudentName(report);
        const haystack = `${report.title} ${studentName}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      const reportDateValue = report.report_date ?? report.created_at;
      if (fromDate || toDate) {
        if (!reportDateValue) return false;
        const reportDate = new Date(reportDateValue);
        if (fromDate && reportDate < fromDate) return false;
        if (toDate && reportDate > toDate) return false;
      }

      return true;
    });

    if (sortDirection === "none") return output;

    return output.sort((a, b) => {
      const aValue =
        sortKey === "student"
          ? getReportStudentName(a)
          : a.title;
      const bValue =
        sortKey === "student"
          ? getReportStudentName(b)
          : b.title;

      const result = aValue.localeCompare(bValue, locale, {
        sensitivity: "base",
      });
      return sortDirection === "asc" ? result : -result;
    });
  }, [
    reports,
    search,
    statusFilter,
    shareTypeFilter,
    studentFilter,
    dateFrom,
    dateTo,
    sortKey,
    sortDirection,
    locale,
    getStudent,
    getReportStudentName,
  ]);

  const filtersActive =
    search.trim() ||
    statusFilter !== "all" ||
    shareTypeFilter !== "all" ||
    studentFilter !== "all" ||
    dateFrom ||
    dateTo;

  const applyDatePreset = (preset: string) => {
    const today = new Date();
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    if (preset === "all") {
      setDateFrom("");
      setDateTo("");
      return;
    }

    if (preset === "7d") {
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      setDateFrom(toInputDate(start));
      setDateTo(toInputDate(end));
      return;
    }

    if (preset === "30d") {
      const start = new Date(end);
      start.setDate(start.getDate() - 29);
      setDateFrom(toInputDate(start));
      setDateTo(toInputDate(end));
      return;
    }

    if (preset === "90d") {
      const start = new Date(end);
      start.setDate(start.getDate() - 89);
      setDateFrom(toInputDate(start));
      setDateTo(toInputDate(end));
      return;
    }

    if (preset === "this_month") {
      const start = new Date(end.getFullYear(), end.getMonth(), 1);
      setDateFrom(toInputDate(start));
      setDateTo(toInputDate(end));
      return;
    }

    if (preset === "last_month") {
      const start = new Date(end.getFullYear(), end.getMonth() - 1, 1);
      const last = new Date(end.getFullYear(), end.getMonth(), 0);
      setDateFrom(toInputDate(start));
      setDateTo(toInputDate(last));
    }
  };

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      void loadReports();
    });
    return () => {
      cancelled = true;
    };
  }, [organization?.id]);

  const handleDeleteReport = async (report: ReportRow) => {
    if (!canDeleteReport({ activeOrgId: organization?.id, reportOrgId: report.org_id })) {
      setError(
        "Ce rapport a ete cree dans un autre workspace. Bascule sur ce workspace pour le modifier."
      );
      return;
    }
    const confirmed = window.confirm(`Supprimer le rapport "${report.title}" ?`);
    if (!confirmed) return;

    setDeletingId(report.id);
    const { error: deleteError } = await supabase
      .from("reports")
      .delete()
      .eq("id", report.id);

    if (deleteError) {
      setError(deleteError.message);
      setDeletingId(null);
      return;
    }

    await loadReports();
    setDeletingId(null);
  };

  return (
    <RoleGuard allowedRoles={["owner", "coach", "staff"]}>
      <div className="space-y-6">
        <PageHeader
          overline={
            <div className="flex items-center gap-2">
              <PageBack />
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                Rapports
              </p>
            </div>
          }
          title="Historique coach"
          subtitle="Consulte et supprime les rapports par eleve."
           meta={
             <Badge className={modeBadgeTone}>
               <span className="min-w-0 break-words">Vous travaillez dans {modeLabel}</span>
             </Badge>
           }
          actions={
            <Link
              href="/app/coach/rapports/nouveau"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90"
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
              Nouveau rapport
            </Link>
          }
        />

        <section className="panel rounded-2xl p-6">
          {loading ? (
            <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
              Chargement des rapports...
            </div>
          ) : error ? (
            <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          ) : reports.length === 0 ? (
            <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-4 text-sm">
              <p className="text-[var(--text)]">Aucun rapport personnel.</p>
              <p className="mt-1 text-xs text-[var(--muted)]">Vous etes en MODE PERSO.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/app/coach/rapports/nouveau"
                  className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
                >
                  Creer un rapport
                </Link>
                <button
                  type="button"
                  onClick={openWorkspaceSwitcher}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                >
                  Changer de mode
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 text-sm text-[var(--muted)]">
              <div className="grid gap-3 rounded-xl border border-white/5 bg-white/5 p-4">
                <div className="grid gap-3 md:grid-cols-[1.2fr_0.9fr_0.9fr_0.9fr]">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text)]">
                      Recherche
                    </label>
                    <input
                      type="text"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Titre ou eleve..."
                      className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      Eleve
                    </label>
                    <select
                      value={studentFilter}
                      onChange={(event) => setStudentFilter(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                    >
                      <option value="all">Tous</option>
                      {studentOptions.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      Etat
                    </label>
                    <select
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                    >
                      <option value="all">Tous</option>
                      <option value="draft">Brouillon</option>
                      <option value="sent">Envoye</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      Type
                    </label>
                    <select
                      value={shareTypeFilter}
                      onChange={(event) => setShareTypeFilter(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                    >
                      <option value="all">Tous</option>
                      <option value="standard">Mes rapports</option>
                      <option value="shared">Rapports partages</option>
                    </select>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text)]">
                    Dates
                  </p>
                  <div className="mt-2 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.7fr)]">
                    <div className="min-w-0">
                      <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                        Periode
                      </label>
                      <select
                        value={datePreset}
                        onChange={(event) => {
                          const nextPreset = event.target.value;
                          setDatePreset(nextPreset);
                          applyDatePreset(nextPreset);
                        }}
                        className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                      >
                        <option value="all">Toutes</option>
                        <option value="7d">7 derniers jours</option>
                        <option value="30d">30 derniers jours</option>
                        <option value="90d">90 derniers jours</option>
                        <option value="this_month">Ce mois</option>
                        <option value="last_month">Mois dernier</option>
                        <option value="custom">Personnalisee</option>
                      </select>
                    </div>
                    <div className="min-w-0">
                      <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                        Du
                      </label>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(event) => {
                          setDateFrom(event.target.value);
                          setDatePreset("custom");
                        }}
                        className="mt-2 w-full min-w-0 rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                        Au
                      </label>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(event) => {
                          setDateTo(event.target.value);
                          setDatePreset("custom");
                        }}
                        className="mt-2 w-full min-w-0 rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
                <span>
                  {filteredReports.length} rapport
                  {filteredReports.length > 1 ? "s" : ""} affiche
                  {filteredReports.length > 1 ? "s" : ""}
                </span>
                {filtersActive ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setStudentFilter("all");
                      setStatusFilter("all");
                      setShareTypeFilter("all");
                      setDatePreset("all");
                      setDateFrom("");
                      setDateTo("");
                      setSortKey("title");
                      setSortDirection("none");
                    }}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 uppercase tracking-wide text-[0.6rem] text-[var(--muted)] transition hover:text-[var(--text)]"
                  >
                    Reinitialiser
                  </button>
                ) : null}
              </div>
              {filteredReports.length === 0 ? (
                <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                  Aucun rapport ne correspond aux filtres.
                </div>
              ) : (
                <>
                  <div className="hidden gap-3 uppercase tracking-wide text-[0.7rem] text-[var(--muted)] md:grid md:grid-cols-[1.4fr_1fr_0.8fr]">
                    <div className="flex items-center gap-2">
                      <span>Rapport</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSortKey("title");
                          setSortDirection((prev) => {
                            if (sortKey !== "title") return "asc";
                            return prev === "asc" ? "desc" : "asc";
                          });
                        }}
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.6rem] text-[var(--muted)] transition hover:text-[var(--text)]"
                        aria-label="Trier les rapports"
                      >
                        Trier
                        <span className="text-[0.55rem]">
                          {sortKey === "title" && sortDirection === "asc"
                            ? "A-Z ▲"
                            : sortKey === "title" && sortDirection === "desc"
                              ? "Z-A ▼"
                              : "↕"}
                        </span>
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>Eleve</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSortKey("student");
                          setSortDirection((prev) => {
                            if (sortKey !== "student") return "asc";
                            return prev === "asc" ? "desc" : "asc";
                          });
                        }}
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.6rem] text-[var(--muted)] transition hover:text-[var(--text)]"
                        aria-label="Trier les eleves"
                      >
                        Trier
                        <span className="text-[0.55rem]">
                          {sortKey === "student" && sortDirection === "asc"
                            ? "A-Z ▲"
                            : sortKey === "student" && sortDirection === "desc"
                              ? "Z-A ▼"
                              : "↕"}
                        </span>
                      </button>
                    </div>
                    <span>Actions</span>
                  </div>
                  {filteredReports.map((report) => {
                    const canEdit = canEditReport({
                      activeOrgId: organization?.id,
                      reportOrgId: report.org_id,
                      originShareId: report.origin_share_id,
                    });
                    const canDelete = canDeleteReport({
                      activeOrgId: organization?.id,
                      reportOrgId: report.org_id,
                    });
                    const authorName = getAuthorName(report.author_profile);
                    const sourceLabel = formatSourceLabel(report);
                    return (
                    <div
                      key={report.id}
                      className="grid gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-[var(--text)] md:grid-cols-[1.4fr_1fr_0.8fr]"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                           <p className="font-medium">{report.title}</p>
                           {!report.sent_at ? (
                            <Badge tone="muted" size="sm">
                              Brouillon
                            </Badge>
                           ) : null}
                           {report.origin_share_id ? (
                            <Badge tone="sky" size="sm">
                              Lecture seule
                            </Badge>
                           ) : null}
                         </div>
                         <p className="mt-1 text-xs text-[var(--muted)]">
                           {formatDate(
                            report.report_date ?? report.created_at,
                            locale,
                            timezone
                          )}
                        </p>
                        {authorName || sourceLabel ? (
                          <div className="mt-1 space-y-0.5 text-xs text-[var(--muted)]">
                            {authorName ? <p>Par : {authorName}</p> : null}
                            {sourceLabel ? <p>dans : {sourceLabel}</p> : null}
                          </div>
                        ) : null}
                      </div>
                      <div>
                        <p className="text-sm text-[var(--muted)]">
                          {getReportStudentName(report)}
                        </p>
                        {report.origin_share_id && !getStudent(report) ? (
                          <p className="mt-1 text-[0.65rem] uppercase tracking-wide text-violet-200">
                            Rapport partage non rattache
                          </p>
                        ) : null}
                        {(() => {
                          const student = getStudent(report);
                          if (!student?.id) return null;
                          return (
                            <Link
                              href={`/app/coach/eleves/${student.id}`}
                              className="mt-1 inline-flex text-xs uppercase tracking-wide text-[var(--muted)] hover:text-[var(--text)]"
                            >
                              Voir eleve -&gt;
                            </Link>
                          );
                        })()}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/app/coach/rapports/${report.id}`}
                          className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
                        >
                          Ouvrir
                        </Link>
                        {canEdit ? (
                          <Link
                            href={`/app/coach/rapports/nouveau?reportId=${report.id}`}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                          >
                            Modifier
                          </Link>
                        ) : null}
                        {canDelete ? (
                          <button
                            type="button"
                            onClick={() => handleDeleteReport(report)}
                            disabled={deletingId === report.id}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-red-300 transition hover:text-red-200 disabled:opacity-60"
                          >
                            {deletingId === report.id ? "Suppression..." : "Supprimer"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )})}
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </RoleGuard>
  );
}
