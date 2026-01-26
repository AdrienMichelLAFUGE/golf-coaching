"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import RoleGuard from "../../../_components/role-guard";
import { useProfile } from "../../../_components/profile-context";
import PageBack from "../../../_components/page-back";

type Report = {
  id: string;
  title: string;
  report_date: string | null;
  created_at: string;
  student_id: string;
  sent_at: string | null;
};

type ReportSection = {
  id: string;
  title: string;
  content: string | null;
  position: number;
  type: string | null;
  media_urls: string[] | null;
  media_captions: string[] | null;
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

export default function CoachReportDetailPage() {
  const { organization } = useProfile();
  const params = useParams();
  const router = useRouter();
  const reportId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [report, setReport] = useState<Report | null>(null);
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const locale = organization?.locale ?? "fr-FR";
  const timezone = organization?.timezone ?? "Europe/Paris";

  useEffect(() => {
    if (!reportId) return;

    const loadReport = async () => {
      setLoading(true);
      setError("");

      const { data: reportData, error: reportError } = await supabase
        .from("reports")
        .select("id, title, report_date, created_at, student_id, sent_at")
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
        .select("id, title, content, position, type, media_urls, media_captions")
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

  const handlePublish = async () => {
    if (!report || report.sent_at) return;
    const confirmed = window.confirm(
      `Publier le rapport "${report.title}" ?`
    );
    if (!confirmed) return;

    setPublishing(true);
    setError("");
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("reports")
      .update({ sent_at: now })
      .eq("id", report.id);

    if (updateError) {
      setError(updateError.message);
      setPublishing(false);
      return;
    }

    setReport((prev) => (prev ? { ...prev, sent_at: now } : prev));
    setPublishing(false);
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
                <div className="flex items-center gap-2">
                  <PageBack />
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                    Rapport
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-semibold text-[var(--text)]">
                    {report.title}
                  </h2>
                  {!report.sent_at ? (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                      Brouillon
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Date :{" "}
                  {formatDate(
                    report.report_date ?? report.created_at,
                    locale,
                    timezone
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/app/coach/eleves/${report.student_id}`}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--text)]"
                >
                  Voir eleve
                </Link>
                <Link
                  href={`/app/coach/rapports/nouveau?reportId=${report.id}`}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                >
                  Modifier
                </Link>
                {!report.sent_at ? (
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={publishing}
                    className="rounded-full border border-emerald-200/40 bg-emerald-400/20 px-4 py-2 text-xs uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-400/30 disabled:opacity-60"
                  >
                    {publishing ? "Publication..." : "Publier"}
                  </button>
                ) : null}
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
                    {section.type === "image" ? (
                      section.media_urls && section.media_urls.length > 0 ? (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {section.media_urls.map((url, index) => (
                            <div
                              key={url}
                              className="overflow-hidden rounded-xl border border-white/10 bg-black/30"
                            >
                              <div
                                className="relative w-full"
                                style={{ aspectRatio: "3 / 4" }}
                              >
                                <img
                                  src={url}
                                  alt={section.title}
                                  className="absolute inset-0 h-full w-full object-cover"
                                  loading="lazy"
                                />
                              </div>
                              {section.media_captions?.[index] ? (
                                <div className="border-t border-white/10 bg-black/60 px-3 py-2 text-xs text-white/80">
                                  {section.media_captions[index]}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-[var(--muted)]">
                          Aucune image pour cette section.
                        </p>
                      )
                    ) : (
                      <p className="mt-3 text-sm text-justify text-[var(--muted)] whitespace-pre-wrap">
                        {section.content || "Aucun contenu pour cette section."}
                      </p>
                    )}
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
