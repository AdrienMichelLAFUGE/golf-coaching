"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import RoleGuard from "../../../_components/role-guard";
import { useProfile } from "../../../_components/profile-context";
import PageBack from "../../../_components/page-back";
import PageHeader from "../../../_components/page-header";
import Badge from "../../../_components/badge";
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
  student_id: string;
  sent_at: string | null;
  org_id: string;
  organizations?: OrganizationRef;
};

type OrganizationRef =
  | {
      name: string | null;
    }
  | { name: string | null }[]
  | null;

type ReportSection = {
  id: string;
  title: string;
  content: string | null;
  content_formatted?: string | null;
  content_format_hash?: string | null;
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

type FeatureKey = "image" | "video" | "radar" | "tpi";

const featureTones = {
  image: {
    label: "Image",
    badge: "border-sky-300/30 bg-sky-400/10 text-sky-100",
    dot: "bg-sky-300",
    panel: "border-sky-400/50 bg-sky-400/10",
    border: "border-sky-400/50",
  },
  video: {
    label: "Video",
    badge: "border-pink-300/30 bg-pink-400/10 text-pink-100",
    dot: "bg-pink-300",
    panel: "border-pink-400/50 bg-pink-400/10",
    border: "border-pink-400/50",
  },
  radar: {
    label: "Datas",
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
  if (section.type === "video") return "video";
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

const getOrgName = (value?: OrganizationRef) => {
  if (!value) return null;
  if (Array.isArray(value)) return value[0]?.name ?? null;
  return value.name ?? null;
};

const formatSourceLabel = (
  orgId?: string | null,
  orgName?: string | null,
  currentOrgId?: string | null
) => {
  if (orgName) return orgName;
  if (!orgId) return null;
  if (orgId === currentOrgId) return "Workspace actuel";
  return "Autre workspace";
};

type InlineMatch = {
  index: number;
  length: number;
  type: "strong" | "em" | "underline";
  content: string;
};

const findInlineMatch = (value: string): InlineMatch | null => {
  const patterns: Array<{
    type: InlineMatch["type"];
    regex: RegExp;
  }> = [
    { type: "strong", regex: /\*\*([\s\S]+?)\*\*/ },
    { type: "underline", regex: /__([\s\S]+?)__/ },
    { type: "em", regex: /_([\s\S]+?)_/ },
    { type: "em", regex: /\*([\s\S]+?)\*/ },
  ];

  let best: InlineMatch | null = null;
  patterns.forEach((pattern) => {
    const match = pattern.regex.exec(value);
    if (!match) return;
    const candidate = {
      index: match.index,
      length: match[0].length,
      type: pattern.type,
      content: match[1],
    };
    if (!best || candidate.index < best.index) {
      best = candidate;
    }
  });
  return best;
};

const renderInlineText = (value: string, keyPrefix: string): ReactNode[] => {
  const nodes: ReactNode[] = [];
  let remaining = value;
  let guard = 0;
  while (remaining && guard < 200) {
    guard += 1;
    const match = findInlineMatch(remaining);
    if (!match) {
      nodes.push(remaining);
      break;
    }
    if (match.index > 0) {
      nodes.push(remaining.slice(0, match.index));
    }
    const inner = renderInlineText(
      match.content,
      `${keyPrefix}-${nodes.length}-${guard}`
    );
    const key = `${keyPrefix}-${nodes.length}-${guard}`;
    if (match.type === "strong") {
      nodes.push(
        <strong key={key} className="font-semibold text-[var(--text)]">
          {inner}
        </strong>
      );
    } else if (match.type === "underline") {
      nodes.push(
        <span key={key} className="underline underline-offset-2">
          {inner}
        </span>
      );
    } else {
      nodes.push(
        <em key={key} className="italic text-[var(--text)]">
          {inner}
        </em>
      );
    }
    remaining = remaining.slice(match.index + match.length);
  }
  return nodes;
};

const renderFormattedText = (value: string) => {
  const paragraphs = value.split(/\n\s*\n/);
  return paragraphs
    .map((paragraph, index) => {
      const trimmed = paragraph.trim();
      if (!trimmed) return null;
      const lines = trimmed.split(/\n/).filter((line) => line.trim());
      const isList =
        lines.length > 1 && lines.every((line) => /^[-*•]\s+/.test(line.trim()));

      if (isList) {
        return (
          <ul
            key={`list-${index}`}
            className="list-disc space-y-2 pl-5 text-sm text-justify"
          >
            {lines.map((line, itemIndex) => {
              const clean = line.replace(/^[-*•]\s+/, "");
              return (
                <li key={`li-${index}-${itemIndex}`} className="text-[var(--text)]">
                  {renderInlineText(clean, `list-${index}-${itemIndex}`)}
                </li>
              );
            })}
          </ul>
        );
      }

      const content = lines.flatMap((line, lineIndex) => {
        const lineNodes = renderInlineText(line, `line-${index}-${lineIndex}`);
        if (lineIndex === lines.length - 1) {
          return lineNodes;
        }
        return [...lineNodes, <br key={`br-${index}-${lineIndex}`} />];
      });
      return (
        <p
          key={`para-${index}`}
          className="text-sm leading-relaxed text-justify text-[var(--text)]"
        >
          {content}
        </p>
      );
    })
    .filter(Boolean);
};

export default function CoachReportDetailPage() {
  const { organization } = useProfile();
  const params = useParams();
  const router = useRouter();
  const reportId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [report, setReport] = useState<Report | null>(null);
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [radarFiles, setRadarFiles] = useState<Record<string, RadarFile>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const locale = organization?.locale ?? "fr-FR";
  const timezone = organization?.timezone ?? "Europe/Paris";

  const renderSectionHeader = (section: ReportSection) => {
    const featureKey = getSectionFeatureKey(section);
    return (
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-semibold text-[var(--text)]">{section.title}</h3>
        {renderFeatureBadge(featureKey)}
      </div>
    );
  };

  const renderSectionContent = (section: ReportSection) => {
    if (section.type === "image") {
      if (section.media_urls && section.media_urls.length > 0) {
        return (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {section.media_urls.map((url, index) => (
              <div
                key={url}
                className="overflow-hidden rounded-xl border border-white/10 bg-black/30"
              >
                <div className="relative w-full" style={{ aspectRatio: "3 / 4" }}>
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
        );
      }
      return (
        <p className="mt-3 text-sm text-[var(--muted)]">
          Aucune image pour cette section.
        </p>
      );
    }

    if (section.type === "video") {
      if (section.media_urls && section.media_urls.length > 0) {
        return (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {section.media_urls.map((url, index) => (
              <div
                key={url}
                className="overflow-hidden rounded-xl border border-white/10 bg-black/30"
              >
                <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
                  <video
                    src={url}
                    controls
                    playsInline
                    preload="metadata"
                    className="absolute inset-0 h-full w-full object-cover"
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
        );
      }
      return (
        <p className="mt-3 text-sm text-[var(--muted)]">
          Aucune video pour cette section.
        </p>
      );
    }

    if (section.type === "radar") {
      const radarFile = section.radar_file_id ? radarFiles[section.radar_file_id] : null;
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
        <p className="mt-3 text-sm text-[var(--muted)]">Donnees datas indisponibles.</p>
      );
    }

    const content = (section.content_formatted ?? section.content)?.trim();
    if (!content) {
      return (
        <p className="mt-3 text-sm text-[var(--muted)]">
          Aucun contenu pour cette section.
        </p>
      );
    }

    return <div className="mt-3 space-y-3">{renderFormattedText(content)}</div>;
  };

  useEffect(() => {
    if (!reportId) return;

    const loadReport = async () => {
      setLoading(true);
      setError("");

      const { data: reportData, error: reportError } = await supabase
        .from("reports")
        .select("id, title, report_date, created_at, student_id, sent_at, org_id, organizations(name)")
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
        .select(
          "id, title, content, content_formatted, content_format_hash, position, type, media_urls, media_captions, radar_file_id, radar_config"
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
            stats: file.stats && typeof file.stats === "object" ? file.stats : null,
            analytics:
              file.analytics && typeof file.analytics === "object"
                ? file.analytics
                : null,
            config: file.config && typeof file.config === "object" ? file.config : null,
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

  const handleDelete = async () => {
    if (!report) return;
    const confirmed = window.confirm(`Supprimer le rapport "${report.title}" ?`);
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
    const confirmed = window.confirm(`Publier le rapport "${report.title}" ?`);
    if (!confirmed) return;

    setPublishing(true);
    setError("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Session invalide.");
      setPublishing(false);
      return;
    }

    const response = await fetch("/api/reports/publish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reportId: report.id }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(payload.error ?? "Erreur de publication.");
      setPublishing(false);
      return;
    }

    const sentAt = payload.sentAt ?? new Date().toISOString();
    setReport((prev) => (prev ? { ...prev, sent_at: sentAt } : prev));
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
          <p className="text-sm text-red-400">{error || "Rapport introuvable."}</p>
        </section>
      ) : (
        <div className="space-y-6">
          <PageHeader
            overline={
              <div className="flex items-center gap-2">
                <PageBack />
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                  Rapport
                </p>
              </div>
            }
            title={report.title}
            titleBadges={
              <>
                {!report.sent_at ? (
                  <Badge tone="muted" size="sm">
                    Brouillon
                  </Badge>
                ) : null}
                {(() => {
                  const label = formatSourceLabel(
                    report.org_id,
                    getOrgName(report.organizations),
                    organization?.id ?? null
                  );
                  if (!label) return null;
                  return (
                    <Badge tone="muted" size="sm">
                      {label}
                    </Badge>
                  );
                })()}
              </>
            }
            subtitle={
              <>
                Date : {formatDate(report.report_date ?? report.created_at, locale, timezone)}
              </>
            }
            actions={
              <>
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
              </>
            }
            meta={
              publishing ? (
                <p className="text-xs text-[var(--muted)]">Reformatage IA en cours...</p>
              ) : null
            }
          />

          <section className="panel rounded-2xl p-6">
            {sections.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                Aucune section pour ce rapport.
              </p>
            ) : (
              <>
                {publishing ? (
                  <p className="mb-4 text-xs text-[var(--muted)]">
                    Reformatage IA en cours...
                  </p>
                ) : null}
                <div className="space-y-4 lg:hidden">
                  {sections.map((section, index) => (
                    <details
                      key={section.id}
                      open={index === 0}
                      className="border-b border-white/10 pb-4"
                    >
                      <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-[var(--text)]">
                        <span className="flex flex-wrap items-center gap-2">
                          {section.title}
                          {renderFeatureBadge(getSectionFeatureKey(section))}
                        </span>
                        <span className="text-xs text-[var(--muted)]">+</span>
                      </summary>
                      <div className="mt-3">{renderSectionContent(section)}</div>
                    </details>
                  ))}
                </div>
                <div className="hidden gap-10 lg:grid lg:grid-cols-2">
                  {sections.map((section) => {
                    const isWide = section.type === "image" || section.type === "radar";
                    return (
                      <article
                        key={section.id}
                        className={`space-y-3 ${isWide ? "lg:col-span-2" : ""}`}
                      >
                        {renderSectionHeader(section)}
                        {renderSectionContent(section)}
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </RoleGuard>
  );
}
