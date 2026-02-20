"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import AdminGuard from "../../_components/admin-guard";
import PageBack from "../../_components/page-back";

type BugReport = {
  id: string;
  createdAt: string;
  reporterUserId: string | null;
  reporterName: string | null;
  workspaceOrgId: string | null;
  workspaceOrgName: string | null;
  reporterRole: string | null;
  title: string;
  description: string;
  requestType: "bug" | "question" | "billing" | "feature_request";
  severity: "low" | "medium" | "high" | "critical";
  status: "new" | "in_progress" | "fixed" | "closed";
  pagePath: string;
  userAgent: string | null;
  context: Record<string, unknown>;
  resolvedAt: string | null;
};

type BugReportsPayload = {
  reports: BugReport[];
  error?: string;
};

type SupportTypeFilter = "all" | "bug" | "question" | "billing" | "feature_request";
type SeverityFilter = "all" | "low" | "medium" | "high" | "critical";
type StatusFilter = "all" | "new" | "in_progress" | "fixed" | "closed";

const severityBadgeClass: Record<BugReport["severity"], string> = {
  low: "bg-sky-100 text-sky-950",
  medium: "bg-amber-100 text-amber-950",
  high: "bg-orange-200 text-orange-950",
  critical: "bg-rose-200 text-rose-950",
};

const statusBadgeClass: Record<BugReport["status"], string> = {
  new: "bg-violet-100 text-violet-950",
  in_progress: "bg-sky-100 text-sky-950",
  fixed: "bg-emerald-100 text-emerald-950",
  closed: "bg-zinc-200 text-zinc-900",
};

const requestTypeBadgeClass: Record<BugReport["requestType"], string> = {
  bug: "bg-rose-100 text-rose-950",
  question: "bg-sky-100 text-sky-950",
  billing: "bg-amber-100 text-amber-950",
  feature_request: "bg-violet-100 text-violet-950",
};

const requestTypeLabel: Record<BugReport["requestType"], string> = {
  bug: "Bug",
  question: "Question",
  billing: "Facturation",
  feature_request: "Feature",
};

const formatDate = (value: string) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(parsed));
};

export default function AdminBugsPage() {
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [actionBusyType, setActionBusyType] = useState<"status" | "delete" | null>(null);
  const [query, setQuery] = useState("");
  const [requestType, setRequestType] = useState<SupportTypeFilter>("all");
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sinceDays, setSinceDays] = useState(30);
  const [limit, setLimit] = useState(120);

  const fetchReports = async (filters: {
    query: string;
    requestType: SupportTypeFilter;
    severity: SeverityFilter;
    status: StatusFilter;
    sinceDays: number;
    limit: number;
  }): Promise<BugReportsPayload> => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      return { reports: [], error: "Session invalide. Reconnecte-toi." };
    }

    const params = new URLSearchParams();
    if (filters.query.trim()) params.set("q", filters.query.trim());
    if (filters.requestType !== "all") params.set("requestType", filters.requestType);
    if (filters.severity !== "all") params.set("severity", filters.severity);
    if (filters.status !== "all") params.set("status", filters.status);
    params.set("sinceDays", String(Math.max(1, Math.min(180, filters.sinceDays || 30))));
    params.set("limit", String(Math.max(1, Math.min(300, filters.limit || 120))));

    const response = await fetch(`/api/admin/bug-reports?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json().catch(() => ({}))) as BugReportsPayload;

    if (!response.ok) {
      if (response.status === 423) {
        return { reports: [] };
      }
      return { reports: [], error: payload.error ?? "Chargement impossible." };
    }

    return { reports: payload.reports ?? [] };
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      const payload = await fetchReports({
        query: "",
        requestType: "all",
        severity: "all",
        status: "all",
        sinceDays: 30,
        limit: 120,
      });
      setReports(payload.reports ?? []);
      setError(payload.error ?? "");
      setLoading(false);
    };

    void load();

    const handleBackofficeUnlocked = () => {
      void load();
    };
    window.addEventListener("backoffice:unlocked", handleBackofficeUnlocked);

    return () => {
      window.removeEventListener("backoffice:unlocked", handleBackofficeUnlocked);
    };
  }, []);

  const stats = useMemo(() => {
    return {
      total: reports.length,
      critical: reports.filter((report) => report.severity === "critical").length,
      open: reports.filter((report) => report.status === "new").length,
      inProgress: reports.filter((report) => report.status === "in_progress").length,
    };
  }, [reports]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    const payload = await fetchReports({
      query,
      requestType,
      severity,
      status,
      sinceDays,
      limit,
    });
    setReports(payload.reports ?? []);
    setError(payload.error ?? "");
    setLoading(false);
  };

  const updateReportStatus = async (
    reportId: string,
    nextStatus: Extract<BugReport["status"], "new" | "in_progress" | "fixed" | "closed">
  ) => {
    setActionBusyId(reportId);
    setActionBusyType("status");
    setError("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Session invalide. Reconnecte-toi.");
      setActionBusyId(null);
      setActionBusyType(null);
      return;
    }

    const response = await fetch("/api/admin/bug-reports", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id: reportId, status: nextStatus }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Mise a jour du statut impossible.");
      setActionBusyId(null);
      setActionBusyType(null);
      return;
    }

    const nowIso = new Date().toISOString();
    setReports((previous) =>
      previous.map((report) =>
        report.id === reportId
          ? {
              ...report,
              status: nextStatus,
              resolvedAt: nextStatus === "fixed" || nextStatus === "closed" ? nowIso : null,
            }
          : report
      )
    );
    setActionBusyId(null);
    setActionBusyType(null);
  };

  const deleteReport = async (reportId: string) => {
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm("Supprimer cette demande support ?");
    if (!confirmed) return;

    setActionBusyId(reportId);
    setActionBusyType("delete");
    setError("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Session invalide. Reconnecte-toi.");
      setActionBusyId(null);
      setActionBusyType(null);
      return;
    }

    const response = await fetch("/api/admin/bug-reports", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id: reportId }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Suppression impossible.");
      setActionBusyId(null);
      setActionBusyType(null);
      return;
    }

    setReports((previous) => previous.filter((report) => report.id !== reportId));
    setActionBusyId(null);
    setActionBusyType(null);
  };

  return (
    <AdminGuard>
      <div className="space-y-6">
        <section className="panel rounded-2xl p-6">
          <div className="flex items-center gap-2">
            <PageBack fallbackHref="/app/admin" />
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Support</p>
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
            Demandes support utilisateurs
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Suivi des bugs, questions, demandes facturation et features.
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="panel-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Total</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{stats.total}</p>
          </div>
          <div className="panel-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Critiques</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{stats.critical}</p>
          </div>
          <div className="panel-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Nouveaux</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{stats.open}</p>
          </div>
          <div className="panel-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">En cours</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{stats.inProgress}</p>
          </div>
        </section>

        <section className="panel rounded-2xl p-6">
          <form onSubmit={handleSubmit} className="grid gap-3 xl:grid-cols-7">
            <label className="space-y-1 xl:col-span-2">
              <span className="text-xs uppercase tracking-wide text-[var(--muted)]">Recherche</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="objet, description, page, user..."
                className="w-full rounded-xl bg-white/8 px-3 py-2 text-sm text-[var(--text)] outline-none transition focus:bg-white/12"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--muted)]">Type</span>
              <select
                value={requestType}
                onChange={(event) => setRequestType(event.target.value as SupportTypeFilter)}
                className="w-full rounded-xl bg-white/8 px-3 py-2 text-sm text-[var(--text)] outline-none transition focus:bg-white/12"
              >
                <option value="all">Tous</option>
                <option value="bug">Bug</option>
                <option value="question">Question</option>
                <option value="billing">Facturation</option>
                <option value="feature_request">Feature</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--muted)]">Severite</span>
              <select
                value={severity}
                onChange={(event) => setSeverity(event.target.value as SeverityFilter)}
                className="w-full rounded-xl bg-white/8 px-3 py-2 text-sm text-[var(--text)] outline-none transition focus:bg-white/12"
              >
                <option value="all">Toutes</option>
                <option value="low">Faible</option>
                <option value="medium">Moyen</option>
                <option value="high">Eleve</option>
                <option value="critical">Critique</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--muted)]">Statut</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as StatusFilter)}
                className="w-full rounded-xl bg-white/8 px-3 py-2 text-sm text-[var(--text)] outline-none transition focus:bg-white/12"
              >
                <option value="all">Tous</option>
                <option value="new">Nouveau</option>
                <option value="in_progress">En cours</option>
                <option value="fixed">Corrige</option>
                <option value="closed">Ferme</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--muted)]">Jours</span>
              <input
                type="number"
                min={1}
                max={180}
                value={sinceDays}
                onChange={(event) => setSinceDays(Number(event.target.value || 30))}
                className="w-full rounded-xl bg-white/8 px-3 py-2 text-sm text-[var(--text)] outline-none transition focus:bg-white/12"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--muted)]">Limite</span>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={limit}
                  onChange={(event) => setLimit(Number(event.target.value || 120))}
                  className="w-full rounded-xl bg-white/8 px-3 py-2 text-sm text-[var(--text)] outline-none transition focus:bg-white/12"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-white/14 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
                >
                  Filtrer
                </button>
              </div>
            </label>
          </form>
        </section>

        {loading ? (
          <section className="panel rounded-2xl p-6">
            <p className="text-sm text-[var(--muted)]">Chargement...</p>
          </section>
        ) : error ? (
          <section className="panel rounded-2xl p-6">
            <p className="text-sm text-red-200">{error}</p>
          </section>
        ) : (
          <section className="panel rounded-2xl p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[var(--muted)]">
                <thead>
                  <tr className="border-b border-white/12">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Severite</th>
                    <th className="py-2 pr-3">Statut</th>
                    <th className="py-2 pr-3">Contributeur</th>
                    <th className="py-2 pr-3">Page</th>
                    <th className="py-2 pr-3">Detail</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-3 text-sm text-[var(--muted)]">
                        Aucune demande support sur la periode.
                      </td>
                    </tr>
                  ) : (
                    reports.map((report) => (
                      <tr key={report.id} className="border-b border-white/6 align-top">
                        <td className="py-3 pr-3 whitespace-nowrap">
                          {formatDate(report.createdAt)}
                        </td>
                        <td className="py-3 pr-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${requestTypeBadgeClass[report.requestType]}`}
                          >
                            {requestTypeLabel[report.requestType]}
                          </span>
                        </td>
                        <td className="py-3 pr-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${severityBadgeClass[report.severity]}`}
                          >
                            {report.severity}
                          </span>
                        </td>
                        <td className="py-3 pr-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass[report.status]}`}
                          >
                            {report.status}
                          </span>
                        </td>
                        <td className="py-3 pr-3">
                          <p className="text-[var(--text)]">
                            {report.reporterName || report.reporterUserId || "-"}
                          </p>
                          <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                            {report.reporterRole || "unknown"} -{" "}
                            {report.workspaceOrgName || report.workspaceOrgId || "n/a"}
                          </p>
                        </td>
                        <td className="py-3 pr-3">
                          <p className="max-w-[16rem] truncate text-[var(--text)]">{report.pagePath}</p>
                        </td>
                        <td className="py-3 pr-3">
                          <p className="text-sm text-[var(--text)]">{report.title}</p>
                          <p className="mt-1 max-w-[38rem] text-xs text-[var(--muted)]">
                            {report.description}
                          </p>
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => updateReportStatus(report.id, "in_progress")}
                              disabled={actionBusyId === report.id}
                              className="rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-sky-950 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {actionBusyId === report.id && actionBusyType === "status"
                                ? "..."
                                : "En cours"}
                            </button>
                            <button
                              type="button"
                              onClick={() => updateReportStatus(report.id, "fixed")}
                              disabled={actionBusyId === report.id}
                              className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {actionBusyId === report.id && actionBusyType === "status"
                                ? "..."
                                : "Resolu"}
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteReport(report.id)}
                              disabled={actionBusyId === report.id}
                              className="rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-rose-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {actionBusyId === report.id && actionBusyType === "delete"
                                ? "..."
                                : "Supprimer"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </AdminGuard>
  );
}
