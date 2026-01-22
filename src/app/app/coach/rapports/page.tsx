"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import RoleGuard from "../../_components/role-guard";
import { useProfile } from "../../_components/profile-context";

type ReportRow = {
  id: string;
  title: string;
  report_date: string | null;
  created_at: string;
  sent_at: string | null;
  students:
    | { id: string; first_name: string; last_name: string | null }
    | { id: string; first_name: string; last_name: string | null }[]
    | null;
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

export default function CoachReportsPage() {
  const { organization } = useProfile();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const locale = organization?.locale ?? "fr-FR";
  const timezone = organization?.timezone ?? "Europe/Paris";

  const loadReports = async () => {
    setLoading(true);
    setError("");

    const { data, error: fetchError } = await supabase
      .from("reports")
      .select("id, title, report_date, created_at, sent_at, students(id, first_name, last_name)")
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setReports(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadReports();
  }, []);

  const handleDeleteReport = async (report: ReportRow) => {
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
        <section className="panel rounded-2xl p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                Rapports
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
                Historique coach
              </h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Consulte et supprime les rapports par eleve.
              </p>
            </div>
            <Link
              href="/app/coach/rapports/nouveau"
              className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
            >
              Nouveau rapport
            </Link>
          </div>
        </section>

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
            <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
              Aucun rapport pour le moment.
            </div>
          ) : (
            <div className="grid gap-3 text-sm text-[var(--muted)]">
              <div className="hidden gap-3 uppercase tracking-wide text-[0.7rem] text-[var(--muted)] md:grid md:grid-cols-[1.4fr_1fr_0.8fr]">
                <span>Rapport</span>
                <span>Eleve</span>
                <span>Actions</span>
              </div>
              {reports.map((report) => (
                <div
                  key={report.id}
                  className="grid gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-[var(--text)] md:grid-cols-[1.4fr_1fr_0.8fr]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{report.title}</p>
                      {!report.sent_at ? (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                          Brouillon
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {formatDate(
                        report.report_date ?? report.created_at,
                        locale,
                        timezone
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-[var(--muted)]">
                      {(() => {
                        const student = Array.isArray(report.students)
                          ? report.students[0]
                          : report.students;
                        if (!student) return "-";
                        return `${student.first_name} ${
                          student.last_name ?? ""
                        }`.trim();
                      })()}
                    </p>
                    {(() => {
                      const student = Array.isArray(report.students)
                        ? report.students[0]
                        : report.students;
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
                    <Link
                      href={`/app/coach/rapports/nouveau?reportId=${report.id}`}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                    >
                      Modifier
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDeleteReport(report)}
                      disabled={deletingId === report.id}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-red-300 transition hover:text-red-200 disabled:opacity-60"
                    >
                      {deletingId === report.id
                        ? "Suppression..."
                        : "Supprimer"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </RoleGuard>
  );
}
