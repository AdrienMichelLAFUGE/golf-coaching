"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchParentApi } from "@/app/parent/fetch-with-auth";
import ParentChildNav from "../ParentChildNav";

type ChildPayload = {
  child: {
    id: string;
    fullName: string;
    email: string | null;
  };
};

type ReportsPayload = {
  reports: Array<{
    id: string;
    title: string;
    reportDate: string | null;
    createdAt: string;
    sentAt: string | null;
  }>;
};

const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("fr-FR") : "-";

export default function ParentChildReportsPage({
  params,
}: {
  params: { studentId: string } | Promise<{ studentId: string }>;
}) {
  const [studentId, setStudentId] = useState("");
  const [child, setChild] = useState<ChildPayload["child"] | null>(null);
  const [reports, setReports] = useState<ReportsPayload["reports"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.resolve(params).then((resolved) => setStudentId(resolved.studentId));
  }, [params]);

  const loadData = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    setError("");

    try {
      const [childResponse, reportsResponse] = await Promise.all([
        fetchParentApi(`/api/parent/children/${studentId}`),
        fetchParentApi(`/api/parent/children/${studentId}/reports`),
      ]);

      const childPayload = (await childResponse.json().catch(() => ({}))) as ChildPayload & {
        error?: string;
      };
      const reportsPayload = (await reportsResponse.json().catch(() => ({}))) as ReportsPayload & {
        error?: string;
      };

      if (!childResponse.ok || !reportsResponse.ok) {
        setError(
          reportsResponse.status === 403
            ? "Acces non autorise pour ce module."
            : childPayload.error ?? reportsPayload.error ?? "Chargement impossible."
        );
        setChild(null);
        setReports([]);
        setLoading(false);
        return;
      }

      setChild(childPayload.child);
      setReports(reportsPayload.reports ?? []);
      setLoading(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Chargement impossible.");
      setChild(null);
      setReports([]);
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      void loadData();
    });
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  return (
    <section className="space-y-4">
      <header className="panel rounded-2xl p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Rapports</p>
        <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">
          {child?.fullName ?? "Historique"}
        </h2>
        {studentId ? (
          <div className="mt-4">
            <ParentChildNav studentId={studentId} />
          </div>
        ) : null}
      </header>

      {loading ? (
        <section className="panel-soft rounded-2xl p-5 text-sm text-[var(--muted)]">
          Chargement...
        </section>
      ) : error ? (
        <section className="panel-soft rounded-2xl p-5 text-sm text-red-400">{error}</section>
      ) : (
        <section className="panel rounded-2xl p-5">
          {reports.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Aucun rapport publie.</p>
          ) : (
            <div className="space-y-2">
              {reports.map((report) => (
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
              ))}
            </div>
          )}
        </section>
      )}
    </section>
  );
}
