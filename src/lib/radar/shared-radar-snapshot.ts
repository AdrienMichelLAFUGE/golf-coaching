import type { RadarAnalytics, RadarConfig } from "@/lib/radar/types";

export const SHARED_RADAR_SNAPSHOT_KEY = "shared_radar_snapshot_v1";

type SnapshotSource = "flightscope" | "trackman" | "smart2move" | "unknown";

export type SharedRadarSnapshotColumn = {
  key: string;
  group: string | null;
  label: string;
  unit: string | null;
};

export type SharedRadarSnapshotStats = {
  avg: Record<string, number | null>;
  dev: Record<string, number | null>;
};

export type SharedRadarSnapshot = {
  sourceRadarFileId: string;
  source: SnapshotSource;
  originalName: string | null;
  fileUrl: string | null;
  columns: SharedRadarSnapshotColumn[];
  shots: Array<Record<string, unknown>>;
  stats: SharedRadarSnapshotStats | null;
  summary: string | null;
  config: RadarConfig | null;
  analytics: RadarAnalytics | null;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeSource = (value: unknown): SnapshotSource => {
  if (value === "trackman") return "trackman";
  if (value === "smart2move") return "smart2move";
  if (value === "unknown") return "unknown";
  return "flightscope";
};

const normalizeColumns = (value: unknown): SharedRadarSnapshotColumn[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isObjectRecord(item)) return null;
      const key = typeof item.key === "string" ? item.key.trim() : "";
      const label = typeof item.label === "string" ? item.label.trim() : "";
      if (!key || !label) return null;
      return {
        key,
        group: typeof item.group === "string" ? item.group : null,
        label,
        unit: typeof item.unit === "string" ? item.unit : null,
      } satisfies SharedRadarSnapshotColumn;
    })
    .filter((item): item is SharedRadarSnapshotColumn => Boolean(item));
};

const normalizeShots = (value: unknown): Array<Record<string, unknown>> => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => isObjectRecord(item));
};

const normalizeStats = (value: unknown): SharedRadarSnapshotStats | null => {
  if (!isObjectRecord(value)) return null;
  const avgRaw = isObjectRecord(value.avg) ? value.avg : null;
  const devRaw = isObjectRecord(value.dev) ? value.dev : null;
  if (!avgRaw && !devRaw) return null;

  const normalizeMetric = (
    metric: Record<string, unknown> | null
  ): Record<string, number | null> => {
    if (!metric) return {};
    return Object.entries(metric).reduce<Record<string, number | null>>(
      (acc, [key, item]) => {
        if (typeof item === "number" && Number.isFinite(item)) {
          acc[key] = item;
        } else {
          acc[key] = null;
        }
        return acc;
      },
      {}
    );
  };

  return {
    avg: normalizeMetric(avgRaw),
    dev: normalizeMetric(devRaw),
  };
};

const normalizeRadarConfig = (value: unknown): RadarConfig | null =>
  isObjectRecord(value) ? (value as RadarConfig) : null;

const normalizeRadarAnalytics = (value: unknown): RadarAnalytics | null =>
  isObjectRecord(value) ? (value as RadarAnalytics) : null;

export const extractSharedRadarSnapshot = (radarConfig: unknown): SharedRadarSnapshot | null => {
  if (!isObjectRecord(radarConfig)) return null;
  const raw = radarConfig[SHARED_RADAR_SNAPSHOT_KEY];
  if (!isObjectRecord(raw)) return null;

  const sourceRadarFileId =
    typeof raw.sourceRadarFileId === "string" ? raw.sourceRadarFileId.trim() : "";
  if (!sourceRadarFileId) return null;

  return {
    sourceRadarFileId,
    source: normalizeSource(raw.source),
    originalName: typeof raw.originalName === "string" ? raw.originalName : null,
    fileUrl: typeof raw.fileUrl === "string" ? raw.fileUrl : null,
    columns: normalizeColumns(raw.columns),
    shots: normalizeShots(raw.shots),
    stats: normalizeStats(raw.stats),
    summary: typeof raw.summary === "string" ? raw.summary : null,
    config: normalizeRadarConfig(raw.config),
    analytics: normalizeRadarAnalytics(raw.analytics),
  };
};

export const attachSharedRadarSnapshot = (
  radarConfig: Record<string, unknown> | null | undefined,
  snapshot: SharedRadarSnapshot
) => ({
  ...(radarConfig ?? {}),
  [SHARED_RADAR_SNAPSHOT_KEY]: snapshot,
});
