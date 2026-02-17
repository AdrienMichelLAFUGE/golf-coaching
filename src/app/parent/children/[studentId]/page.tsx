"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchParentApi } from "@/app/parent/fetch-with-auth";
import ParentChildNav from "./ParentChildNav";

type DashboardPayload = {
  child: {
    id: string;
    firstName: string;
    lastName: string | null;
    fullName: string;
    email: string | null;
  };
  metrics: {
    reportsCount: number;
    testsCount: number;
    testsPendingCount: number;
    upcomingEventsCount: number;
  };
  latestReports: Array<{
    id: string;
    title: string;
    reportDate: string | null;
    createdAt: string;
  }>;
  upcomingEvents: Array<{
    id: string;
    title: string;
    type: "tournament" | "competition" | "training" | "other";
    startAt: string;
  }>;
  tpi: {
    id: string;
    status: "processing" | "ready" | "error";
    createdAt: string;
  } | null;
};

const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("fr-FR") : "-";

export default function ParentChildDashboardPage({
  params,
}: {
  params: { studentId: string } | Promise<{ studentId: string }>;
}) {
  const [studentId, setStudentId] = useState<string>("");
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.resolve(params).then((resolved) => setStudentId(resolved.studentId));
  }, [params]);

  const loadDashboard = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    setError("");

    try {
      const response = await fetchParentApi(`/api/parent/children/${studentId}/dashboard`);
      const nextPayload = (await response.json().catch(() => ({}))) as DashboardPayload & {
        error?: string;
      };

      if (!response.ok) {
        setError(nextPayload.error ?? "Chargement impossible.");
        setPayload(null);
        setLoading(false);
        return;
      }

      setPayload(nextPayload);
      setLoading(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Chargement impossible.");
      setPayload(null);
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      void loadDashboard();
    });
    return () => {
      cancelled = true;
    };
  }, [loadDashboard]);

  if (!studentId) {
    return (
      <section className="panel rounded-2xl p-5 text-sm text-[var(--muted)]">
        Chargement...
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <header className="panel rounded-2xl p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
          Suivi enfant
        </p>
        <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">
          {payload?.child.fullName ?? "Dashboard"}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{payload?.child.email ?? "-"}</p>
        <div className="mt-4">
          <ParentChildNav studentId={studentId} />
        </div>
      </header>

      {loading ? (
        <section className="panel-soft rounded-2xl p-5 text-sm text-[var(--muted)]">
          Chargement...
        </section>
      ) : error ? (
        <section className="panel-soft rounded-2xl p-5 text-sm text-red-400">{error}</section>
      ) : !payload ? (
        <section className="panel-soft rounded-2xl p-5 text-sm text-[var(--muted)]">
          Donnees indisponibles.
        </section>
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <article className="panel-soft rounded-2xl p-4">
              <p className="text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                Rapports
              </p>
              <p className="mt-2 text-2xl font-semibold text-[var(--text)]">
                {payload.metrics.reportsCount}
              </p>
            </article>
            <article className="panel-soft rounded-2xl p-4">
              <p className="text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                Tests actifs
              </p>
              <p className="mt-2 text-2xl font-semibold text-[var(--text)]">
                {payload.metrics.testsCount}
              </p>
            </article>
            <article className="panel-soft rounded-2xl p-4">
              <p className="text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                Tests en attente
              </p>
              <p className="mt-2 text-2xl font-semibold text-[var(--text)]">
                {payload.metrics.testsPendingCount}
              </p>
            </article>
            <article className="panel-soft rounded-2xl p-4">
              <p className="text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                Prochaines echeances
              </p>
              <p className="mt-2 text-2xl font-semibold text-[var(--text)]">
                {payload.metrics.upcomingEventsCount}
              </p>
            </article>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <article className="panel rounded-2xl p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[var(--text)]">Derniers rapports</h3>
                <Link
                  href={`/parent/children/${studentId}/rapports`}
                  className="text-[0.65rem] uppercase tracking-[0.16em] text-[var(--muted)] hover:text-[var(--text)]"
                >
                  Voir tout
                </Link>
              </div>
              <div className="mt-3 space-y-2">
                {payload.latestReports.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">Aucun rapport.</p>
                ) : (
                  payload.latestReports.map((report) => (
                    <Link
                      key={report.id}
                      href={`/parent/children/${studentId}/rapports/${report.id}`}
                      className="block rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)] transition hover:border-white/20"
                    >
                      <p className="font-medium">{report.title}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {formatDate(report.reportDate ?? report.createdAt)}
                      </p>
                    </Link>
                  ))
                )}
              </div>
            </article>

            <article className="panel rounded-2xl p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[var(--text)]">Prochaines echeances</h3>
                <Link
                  href={`/parent/children/${studentId}/calendrier`}
                  className="text-[0.65rem] uppercase tracking-[0.16em] text-[var(--muted)] hover:text-[var(--text)]"
                >
                  Ouvrir calendrier
                </Link>
              </div>
              <div className="mt-3 space-y-2">
                {payload.upcomingEvents.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">Aucun evenement a venir.</p>
                ) : (
                  payload.upcomingEvents.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                    >
                      <p className="text-sm font-medium text-[var(--text)]">{event.title}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {formatDate(event.startAt)}
                      </p>
                    </div>
                  ))
                )}
              </div>
              {payload.tpi ? (
                <p className="mt-4 text-xs text-[var(--muted)]">
                  Profil TPI: {payload.tpi.status} ({formatDate(payload.tpi.createdAt)})
                </p>
              ) : null}
            </article>
          </section>
        </>
      )}
    </section>
  );
}
