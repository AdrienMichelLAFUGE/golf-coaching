"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import RoleGuard from "../../../_components/role-guard";

type Report = {
  id: string;
  title: string;
  report_date: string | null;
  created_at: string;
  student_id: string;
};

type ReportSection = {
  id: string;
  title: string;
  content: string | null;
  position: number;
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("fr-FR");
};

export default function CoachReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [report, setReport] = useState<Report | null>(null);
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!reportId) return;

    const loadReport = async () => {
      setLoading(true);
      setError("");

      const { data: reportData, error: reportError } = await supabase
        .from("reports")
        .select("id, title, report_date, created_at, student_id")
        .eq("id", reportId)
        .single();

      if (reportError) {
        setError(reportError.message);
        setLoading(false);
        return;
      }

      setReport(reportData);

      const { data: sectionsData, error: sectionsError } = await supabase
        .from("report_sections")
        .select("id, title, content, position")
        .eq("report_id", reportId)
        .order("position", { ascending: true });

      if (sectionsError) {
        setError(sectionsError.message);
        setLoading(false);
        return;
      }

      setSections(sectionsData ?? []);
      setLoading(false);
    };

    loadReport();
  }, [reportId]);

  const handleDelete = async () => {
    if (!report) return;
    const confirmed = window.confirm(
      `Supprimer le rapport "${report.title}" ?`
    );
    if (!confirmed) return;

    setDeleting(true);
    const { error: deleteError } = await supabase
      .from("reports")
      .delete()
      .eq("id", report.id);

    if (deleteError) {
      setError(deleteError.message);
      setDeleting(false);
      return;
    }

    router.push("/app/coach/rapports");
  };

  return (
    <RoleGuard allowedRoles={["owner", "coach", "staff"]}>
      {loading ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-[var(--muted)]">Chargement du rapport...</p>
        </section>
      ) : error || !report ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-red-400">
            {error || "Rapport introuvable."}
          </p>
        </section>
      ) : (
        <div className="space-y-6">
          <section className="panel rounded-2xl p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                  Rapport
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
                  {report.title}
                </h2>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Date : {formatDate(report.report_date ?? report.created_at)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/app/coach/eleves/${report.student_id}`}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--text)]"
                >
                  Voir eleve
                </Link>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-red-300 transition hover:text-red-200 disabled:opacity-60"
                >
                  {deleting ? "Suppression..." : "Supprimer"}
                </button>
              </div>
            </div>
          </section>

          <section className="panel rounded-2xl p-6">
            {sections.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                Aucune section pour ce rapport.
              </p>
            ) : (
              <div className="space-y-6">
                {sections.map((section) => (
                  <div key={section.id}>
                    <h3 className="text-lg font-semibold text-[var(--text)]">
                      {section.title}
                    </h3>
                    <p className="mt-3 text-sm text-[var(--muted)] whitespace-pre-wrap">
                      {section.content || "Aucun contenu pour cette section."}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </RoleGuard>
  );
}
