"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchParentApi } from "@/app/parent/fetch-with-auth";
import ParentChildNav from "../../ParentChildNav";

type ChildPayload = {
  child: {
    id: string;
    fullName: string;
  };
};

type ReportPayload = {
  report: {
    id: string;
    title: string;
    reportDate: string | null;
    createdAt: string;
    sentAt: string | null;
  };
  sections: Array<{
    id: string;
    title: string;
    type: string | null;
    content: string | null;
    contentFormatted: string | null;
    mediaUrls: string[];
    mediaCaptions: string[];
    position: number;
  }>;
};

const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("fr-FR") : "-";

export default function ParentChildReportDetailPage({
  params,
}: {
  params:
    | { studentId: string; reportId: string }
    | Promise<{ studentId: string; reportId: string }>;
}) {
  const [studentId, setStudentId] = useState("");
  const [reportId, setReportId] = useState("");
  const [child, setChild] = useState<ChildPayload["child"] | null>(null);
  const [payload, setPayload] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.resolve(params).then((resolved) => {
      setStudentId(resolved.studentId);
      setReportId(resolved.reportId);
    });
  }, [params]);

  const loadData = useCallback(async () => {
    if (!studentId || !reportId) return;
    setLoading(true);
    setError("");

    try {
      const [childResponse, reportResponse] = await Promise.all([
        fetchParentApi(`/api/parent/children/${studentId}`),
        fetchParentApi(`/api/parent/children/${studentId}/reports/${reportId}`),
      ]);

      const childPayload = (await childResponse.json().catch(() => ({}))) as ChildPayload & {
        error?: string;
      };
      const reportPayload = (await reportResponse.json().catch(() => ({}))) as ReportPayload & {
        error?: string;
      };

      if (!childResponse.ok || !reportResponse.ok) {
        setError(childPayload.error ?? reportPayload.error ?? "Chargement impossible.");
        setChild(null);
        setPayload(null);
        setLoading(false);
        return;
      }

      setChild(childPayload.child);
      setPayload(reportPayload);
      setLoading(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Chargement impossible.");
      setChild(null);
      setPayload(null);
      setLoading(false);
    }
  }, [studentId, reportId]);

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
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
          Rapport (lecture seule)
        </p>
        <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">
          {payload?.report.title ?? "Rapport"}
        </h2>
        {payload?.report ? (
          <p className="mt-1 text-sm text-[var(--muted)]">
            {formatDate(payload.report.reportDate ?? payload.report.createdAt)}
          </p>
        ) : null}
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
      ) : !payload ? (
        <section className="panel-soft rounded-2xl p-5 text-sm text-[var(--muted)]">
          Rapport indisponible.
        </section>
      ) : (
        <section className="panel rounded-2xl p-5">
          <p className="text-sm text-[var(--muted)]">Enfant: {child?.fullName ?? "-"}</p>
          <div className="mt-4 space-y-4">
            {payload.sections.map((section) => (
              <article
                key={section.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <h3 className="text-sm font-semibold text-[var(--text)]">{section.title}</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]">
                  {(section.contentFormatted ?? section.content ?? "").trim() || "Aucun contenu."}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
