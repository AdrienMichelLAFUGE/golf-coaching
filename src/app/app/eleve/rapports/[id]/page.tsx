"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import RoleGuard from "../../../_components/role-guard";
import { useProfile } from "../../../_components/profile-context";

type Report = {
  id: string;
  title: string;
  report_date: string | null;
  created_at: string;
};

type ReportSection = {
  id: string;
  title: string;
  content: string | null;
  position: number;
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

export default function ReportDetailPage() {
  const { organization } = useProfile();
  const params = useParams();
  const reportId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [report, setReport] = useState<Report | null>(null);
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const locale = organization?.locale ?? "fr-FR";
  const timezone = organization?.timezone ?? "Europe/Paris";

  useEffect(() => {
    if (!reportId) return;

    const loadReport = async () => {
      setLoading(true);
      setError("");

      const { data: reportData, error: reportError } = await supabase
        .from("reports")
        .select("id, title, report_date, created_at")
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

  return (
    <RoleGuard
      allowedRoles={["student"]}
      fallback={
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-[var(--muted)]">
            Acces reserve aux eleves.
          </p>
        </section>
      }
    >
      {loading ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-[var(--muted)]">
            Chargement du rapport...
          </p>
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
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Rapport detaille
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
              {report.title}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Date :{" "}
              {formatDate(
                report.report_date ?? report.created_at,
                locale,
                timezone
              )}
            </p>
          </section>

          {sections.length === 0 ? (
            <section className="panel rounded-2xl p-6">
              <p className="text-sm text-[var(--muted)]">
                Aucune section disponible pour ce rapport.
              </p>
            </section>
          ) : (
            <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="panel rounded-2xl p-6">
                {sections.map((section) => (
                  <div key={section.id} className="mb-6 last:mb-0">
                    <h3 className="text-lg font-semibold text-[var(--text)]">
                      {section.title}
                    </h3>
                    <p className="mt-3 text-sm text-[var(--muted)] whitespace-pre-wrap">
                      {section.content || "Aucun contenu pour cette section."}
                    </p>
                  </div>
                ))}
              </div>

              <div className="panel-soft rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-[var(--text)]">
                  Resume express
                </h3>
                <div className="mt-4 space-y-3">
                  {sections.slice(0, 3).map((section) => (
                    <div
                      key={section.id}
                      className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--text)]"
                    >
                      {section.title}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      )}
    </RoleGuard>
  );
}
