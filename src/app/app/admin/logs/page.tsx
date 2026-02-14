"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import AdminGuard from "../../_components/admin-guard";
import PageBack from "../../_components/page-back";

type ActivityLog = {
  id: string;
  createdAt: string;
  level: "info" | "warn" | "error";
  action: string;
  source: string;
  actorUserId: string | null;
  actorName: string | null;
  orgId: string | null;
  orgName: string | null;
  entityType: string | null;
  entityId: string | null;
  message: string | null;
  metadata: Record<string, unknown>;
};

type LogsPayload = {
  logs: ActivityLog[];
  error?: string;
};

type LevelFilter = "all" | "info" | "warn" | "error";

const formatDate = (value: string) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(parsed));
};

const levelClassName: Record<"info" | "warn" | "error", string> = {
  info: "border-sky-300/40 bg-sky-300/10 text-sky-100",
  warn: "border-amber-300/40 bg-amber-300/10 text-amber-100",
  error: "border-rose-300/40 bg-rose-300/10 text-rose-100",
};

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("");
  const [level, setLevel] = useState<LevelFilter>("all");
  const [sinceDays, setSinceDays] = useState(7);
  const [limit, setLimit] = useState(100);

  const fetchLogs = async (filters: {
    query: string;
    action: string;
    level: LevelFilter;
    sinceDays: number;
    limit: number;
  }): Promise<LogsPayload> => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      return { logs: [], error: "Session invalide. Reconnecte toi." };
    }

    const params = new URLSearchParams();
    if (filters.query.trim()) params.set("q", filters.query.trim());
    if (filters.action.trim()) params.set("action", filters.action.trim());
    if (filters.level !== "all") params.set("level", filters.level);
    params.set(
      "sinceDays",
      String(Math.max(1, Math.min(120, Number(filters.sinceDays) || 7)))
    );
    params.set("limit", String(Math.max(1, Math.min(300, Number(filters.limit) || 100))));

    const response = await fetch(`/api/admin/logs?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json()) as LogsPayload;

    if (!response.ok) {
      if (response.status === 423) {
        return { logs: [] };
      }
      return { logs: [], error: payload.error ?? "Chargement impossible." };
    }

    return { logs: payload.logs ?? [] };
  };

  useEffect(() => {
    const loadInitialLogs = async () => {
      setLoading(true);
      setError("");
      const payload = await fetchLogs({
        query: "",
        action: "",
        level: "all",
        sinceDays: 7,
        limit: 100,
      });
      setError(payload.error ?? "");
      setLogs(payload.logs ?? []);
      setLoading(false);
    };

    void loadInitialLogs();

    const handleBackofficeUnlocked = () => {
      void loadInitialLogs();
    };
    window.addEventListener("backoffice:unlocked", handleBackofficeUnlocked);

    return () => {
      window.removeEventListener("backoffice:unlocked", handleBackofficeUnlocked);
    };
  }, []);

  const actionOptions = useMemo(
    () =>
      Array.from(new Set(logs.map((log) => log.action)))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [logs]
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    const payload = await fetchLogs({
      query,
      action,
      level,
      sinceDays,
      limit,
    });
    setError(payload.error ?? "");
    setLogs(payload.logs ?? []);
    setLoading(false);
  };

  return (
    <AdminGuard>
      <div className="space-y-6">
        <section className="panel rounded-2xl p-6">
          <div className="flex items-center gap-2">
            <PageBack fallbackHref="/app/admin" />
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Logs</p>
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
            Journal d activite applicative
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Suivi des actions coach et des operations critiques.
          </p>
        </section>

        <section className="panel rounded-2xl p-6">
          <form onSubmit={handleSubmit} className="grid gap-3 lg:grid-cols-6">
            <label className="space-y-1 lg:col-span-2">
              <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Recherche
              </span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="action, org, message, metadata..."
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)] outline-none transition focus:border-emerald-300/50"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Niveau
              </span>
              <select
                value={level}
                onChange={(event) => setLevel(event.target.value as LevelFilter)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)] outline-none transition focus:border-emerald-300/50"
              >
                <option value="all">Tous</option>
                <option value="info">Info</option>
                <option value="warn">Warn</option>
                <option value="error">Error</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Action
              </span>
              <input
                value={action}
                onChange={(event) => setAction(event.target.value)}
                list="admin-log-actions"
                placeholder="report.publish.success"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)] outline-none transition focus:border-emerald-300/50"
              />
              <datalist id="admin-log-actions">
                {actionOptions.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
            </label>

            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Fenetre (jours)
              </span>
              <input
                type="number"
                min={1}
                max={120}
                value={sinceDays}
                onChange={(event) => setSinceDays(Number(event.target.value || 7))}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)] outline-none transition focus:border-emerald-300/50"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Limite
              </span>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={limit}
                  onChange={(event) => setLimit(Number(event.target.value || 100))}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)] outline-none transition focus:border-emerald-300/50"
                />
                <button
                  type="submit"
                  className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
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
            <p className="text-sm text-red-400">{error}</p>
          </section>
        ) : (
          <section className="panel rounded-2xl p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--text)]">Evenements</h3>
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                {logs.length} lignes
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[var(--muted)]">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Niveau</th>
                    <th className="py-2 pr-3">Action</th>
                    <th className="py-2 pr-3">Contributeur</th>
                    <th className="py-2 pr-3">Organisation</th>
                    <th className="py-2">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-3 text-sm text-[var(--muted)]">
                        Aucun evenement sur la periode.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="border-b border-white/5 align-top">
                        <td className="py-3 pr-3 whitespace-nowrap">
                          {formatDate(log.createdAt)}
                        </td>
                        <td className="py-3 pr-3">
                          <span
                            className={`inline-flex rounded-full border px-2 py-1 text-[10px] uppercase tracking-wide ${
                              levelClassName[log.level]
                            }`}
                          >
                            {log.level}
                          </span>
                        </td>
                        <td className="py-3 pr-3 text-[var(--text)]">{log.action}</td>
                        <td className="py-3 pr-3">
                          {log.actorName || log.actorUserId || "-"}
                        </td>
                        <td className="py-3 pr-3">{log.orgName || log.orgId || "-"}</td>
                        <td className="py-3">
                          <p className="max-w-[36rem] truncate text-[var(--text)]">
                            {log.message || "-"}
                          </p>
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
