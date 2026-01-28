"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import RoleGuard from "../../../_components/role-guard";
import { useProfile } from "../../../_components/profile-context";
import RadarCharts, {
  type RadarConfig,
  type RadarColumn,
  type RadarShot,
  type RadarStats,
} from "../../../_components/radar-charts";
import type { RadarAnalytics } from "@/lib/radar/types";

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
  type: string | null;
  media_urls: string[] | null;
  media_captions: string[] | null;
  radar_file_id?: string | null;
  radar_config?: RadarConfig | null;
};

type RadarFile = {
  id: string;
  original_name: string | null;
  columns: RadarColumn[];
  shots: RadarShot[];
  stats: RadarStats | null;
  summary: string | null;
  config: RadarConfig | null;
  analytics?: RadarAnalytics | null;
};

type FeatureKey = "image" | "radar" | "tpi";

const featureTones = {
  image: {
    label: "Image",
    badge: "border-sky-300/30 bg-sky-400/10 text-sky-100",
    dot: "bg-sky-300",
    panel: "border-sky-400/50 bg-sky-400/10",
    border: "border-sky-400/50",
  },
  radar: {
    label: "Radar",
    badge: "border-violet-300/30 bg-violet-400/10 text-violet-100",
    dot: "bg-violet-300",
    panel: "border-violet-400/50 bg-violet-400/10",
    border: "border-violet-400/50",
  },
  tpi: {
    label: "TPI",
    badge: "border-rose-300/30 bg-rose-400/10 text-rose-100",
    dot: "bg-rose-300",
    panel: "border-rose-400/50 bg-rose-400/10",
    border: "border-rose-400/50",
  },
} as const;

const getSectionFeatureKey = (section: {
  type?: string | null;
  title?: string | null;
}): FeatureKey | null => {
  if (section.type === "image") return "image";
  if (section.type === "radar") return "radar";
  if ((section.title ?? "").toLowerCase().includes("tpi")) return "tpi";
  return null;
};

const renderFeatureBadge = (featureKey: FeatureKey | null) => {
  if (!featureKey) return null;
  const tone = featureTones[featureKey];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-[0.55rem] uppercase tracking-wide ${tone.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {tone.label}
    </span>
  );
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
  const [radarFiles, setRadarFiles] = useState<Record<string, RadarFile>>({});
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
        .not("sent_at", "is", null)
        .single();

      if (reportError) {
        setError(reportError.message);
        setLoading(false);
        return;
      }

      setReport(reportData);

      const { data: sectionsData, error: sectionsError } = await supabase
        .from("report_sections")
        .select(
          "id, title, content, position, type, media_urls, media_captions, radar_file_id, radar_config"
        )
        .eq("report_id", reportId)
        .order("position", { ascending: true });

      if (sectionsError) {
        setError(sectionsError.message);
        setLoading(false);
        return;
      }

      const normalizedSections = sectionsData ?? [];
      setSections(normalizedSections);

      const radarIds = Array.from(
        new Set(
          normalizedSections
            .map((section) => section.radar_file_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      if (radarIds.length > 0) {
        const { data: radarData } = await supabase
          .from("radar_files")
          .select("id, original_name, columns, shots, stats, summary, config, analytics")
          .in("id", radarIds);

        const radarMap: Record<string, RadarFile> = {};
          (radarData ?? []).forEach((file) => {
            radarMap[file.id] = {
              ...file,
              columns: Array.isArray(file.columns) ? file.columns : [],
              shots: Array.isArray(file.shots) ? file.shots : [],
              stats:
                file.stats && typeof file.stats === "object" ? file.stats : null,
              analytics:
                file.analytics && typeof file.analytics === "object"
                  ? file.analytics
                  : null,
              config:
                file.config && typeof file.config === "object" ? file.config : null,
            } as RadarFile;
          });
        setRadarFiles(radarMap);
      } else {
        setRadarFiles({});
      }
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
                {sections.map((section) => {
                  const featureKey = getSectionFeatureKey(section);
                  const tone = featureKey ? featureTones[featureKey] : null;
                  const isTextSection =
                    !section.type || section.type === "text";

                  if (isTextSection) {
                    return (
                      <div key={section.id} className="mb-10 last:mb-0">
                        <h3 className="text-xl font-semibold text-[var(--text)]">
                          {section.title}
                        </h3>
                        {section.content ? (
                          <p
                            className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[var(--text)]"
                            style={{ textAlign: "justify" }}
                          >
                            {section.content}
                          </p>
                        ) : (
                          <p className="mt-3 text-sm text-[var(--muted)]">
                            Aucun contenu pour cette section.
                          </p>
                        )}
                      </div>
                    );
                  }

                  return (
                  <div
                    key={section.id}
                    className={`relative mb-6 rounded-2xl border p-4 last:mb-0 ${
                      tone ? tone.panel : "border-white/10 bg-white/5"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-[var(--text)]">
                        {section.title}
                      </h3>
                      {renderFeatureBadge(featureKey)}
                    </div>
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
                    ) : section.type === "radar" ? (
                      (() => {
                        const radarFile = section.radar_file_id
                          ? radarFiles[section.radar_file_id]
                          : null;
                        return radarFile ? (
                          <div className="mt-3">
                              <RadarCharts
                                columns={radarFile.columns ?? []}
                                shots={radarFile.shots ?? []}
                                stats={radarFile.stats}
                                summary={radarFile.summary}
                                config={section.radar_config ?? radarFile.config}
                                analytics={radarFile.analytics}
                              />
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-[var(--muted)]">
                            Donnees radar indisponibles.
                          </p>
                        );
                      })()
                    ) : (
                      <p className="mt-3 text-sm text-justify text-[var(--muted)] whitespace-pre-wrap">
                        {section.content || "Aucun contenu pour cette section."}
                      </p>
                    )}
                  </div>
                );
                })}
              </div>

              <div className="panel-soft rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-[var(--text)]">
                  Resume express
                </h3>
                <div className="mt-4 space-y-3">
                  {sections
                    .filter((section) => section.type !== "image")
                    .slice(0, 3)
                    .map((section) => (
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
