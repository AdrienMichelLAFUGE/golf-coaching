import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  attachSharedRadarSnapshot,
  type SharedRadarSnapshot,
} from "@/lib/radar/shared-radar-snapshot";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type SharedReportSource = {
  title: string;
  report_date: string | null;
  created_at: string;
  coach_observations: string | null;
  coach_work: string | null;
  coach_club: string | null;
};

export type SharedReportSection = {
  title: string | null;
  content: string | null;
  content_formatted: string | null;
  content_format_hash: string | null;
  position: number | null;
  type: string | null;
  media_urls: string[] | null;
  media_captions: string[] | null;
  radar_file_id: string | null;
  radar_config: Record<string, unknown> | null;
};

type SourceRadarFileRow = {
  id: string;
  source: "flightscope" | "trackman" | "smart2move" | "unknown";
  original_name: string | null;
  file_url: string;
  columns: unknown;
  shots: unknown;
  stats: unknown;
  summary: string | null;
  config: unknown;
  analytics: unknown;
};

const buildSharedRadarSnapshot = (row: SourceRadarFileRow): SharedRadarSnapshot => ({
  sourceRadarFileId: row.id,
  source: row.source,
  originalName: row.original_name ?? null,
  fileUrl: row.file_url ?? null,
  columns: Array.isArray(row.columns)
    ? row.columns.filter(
        (column): column is SharedRadarSnapshot["columns"][number] =>
          Boolean(column) &&
          typeof column === "object" &&
          typeof (column as Record<string, unknown>).key === "string" &&
          typeof (column as Record<string, unknown>).label === "string"
      )
    : [],
  shots: Array.isArray(row.shots)
    ? row.shots.filter(
        (shot): shot is Record<string, unknown> => Boolean(shot) && typeof shot === "object"
      )
    : [],
  stats: row.stats && typeof row.stats === "object"
    ? (row.stats as SharedRadarSnapshot["stats"])
    : null,
  summary: row.summary ?? null,
  config: row.config && typeof row.config === "object" ? (row.config as SharedRadarSnapshot["config"]) : null,
  analytics:
    row.analytics && typeof row.analytics === "object"
      ? (row.analytics as SharedRadarSnapshot["analytics"])
      : null,
});

export const copySharedReportToWorkspace = async (
  admin: AdminClient,
  input: {
    shareId: string;
    targetOrgId: string;
    authorUserId: string;
    sourceReport: SharedReportSource;
    sourceSections: SharedReportSection[];
  }
): Promise<{ reportId: string } | { error: string }> => {
  const sourceRadarFileIds = Array.from(
    new Set(
      input.sourceSections
        .map((section) => section.radar_file_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  const sourceRadarById = new Map<string, SharedRadarSnapshot>();
  if (sourceRadarFileIds.length > 0) {
    const { data: sourceRadarRows, error: sourceRadarError } = await admin
      .from("radar_files")
      .select(
        "id, source, original_name, file_url, columns, shots, stats, summary, config, analytics"
      )
      .in("id", sourceRadarFileIds);

    if (sourceRadarError) {
      return {
        error: sourceRadarError.message ?? "Chargement des donnees radar impossible.",
      };
    }

    ((sourceRadarRows ?? []) as SourceRadarFileRow[]).forEach((row) => {
      sourceRadarById.set(row.id, buildSharedRadarSnapshot(row));
    });
  }

  const { data: copiedReport, error: copiedReportError } = await admin
    .from("reports")
    .insert([
      {
        org_id: input.targetOrgId,
        student_id: null,
        author_id: input.authorUserId,
        title: input.sourceReport.title,
        content: null,
        sent_at: new Date().toISOString(),
        report_date:
          input.sourceReport.report_date ?? input.sourceReport.created_at.slice(0, 10),
        coach_observations: input.sourceReport.coach_observations,
        coach_work: input.sourceReport.coach_work,
        coach_club: input.sourceReport.coach_club,
        origin_share_id: input.shareId,
      },
    ])
    .select("id")
    .single();

  if (copiedReportError || !copiedReport?.id) {
    return {
      error: copiedReportError?.message ?? "Copie du rapport impossible.",
    };
  }

  const copiedSectionsPayload = input.sourceSections.map((section) => {
    const sourceRadarSnapshot = section.radar_file_id
      ? sourceRadarById.get(section.radar_file_id) ?? null
      : null;
    const radarConfigWithSnapshot = sourceRadarSnapshot
      ? attachSharedRadarSnapshot(section.radar_config, sourceRadarSnapshot)
      : section.radar_config;
    return {
      org_id: input.targetOrgId,
      report_id: copiedReport.id,
      title: section.title,
      content: section.content,
      content_formatted: section.content_formatted,
      content_format_hash: section.content_format_hash,
      position: section.position,
      type: section.type,
      media_urls: section.media_urls,
      media_captions: section.media_captions,
      radar_file_id: sourceRadarSnapshot ? null : section.radar_file_id,
      radar_config: radarConfigWithSnapshot,
    };
  });

  if (copiedSectionsPayload.length > 0) {
    const { error: copiedSectionsError } = await admin
      .from("report_sections")
      .insert(copiedSectionsPayload);
    if (copiedSectionsError) {
      return {
        error: copiedSectionsError.message ?? "Copie des sections impossible.",
      };
    }
  }

  return { reportId: copiedReport.id };
};
