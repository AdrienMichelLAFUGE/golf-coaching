export type OutlierResult = {
  method: "iqr" | "zrobust";
  byMetric: Record<string, number[]>;
  flags: Record<string, string[]>;
  worst10_distance: number[];
  worst10_dispersion: number[];
  top20_strikes: number[];
};

type ShotRecord = Record<string, unknown>;

const percentile = (values: number[], p: number) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

const byMetric = (
  shots: ShotRecord[],
  key: string
): Array<{ shot: ShotRecord; value: number }> =>
  shots
    .map((shot) => {
      const value = shot[key];
      return typeof value === "number" && Number.isFinite(value) ? { shot, value } : null;
    })
    .filter((entry): entry is { shot: ShotRecord; value: number } => !!entry);

export const computeOutliers = (
  shots: ShotRecord[],
  metricKeys: string[]
): OutlierResult => {
  const flags: Record<string, string[]> = {};
  const outliersByMetric: Record<string, number[]> = {};

  metricKeys.forEach((key) => {
    const entries = byMetric(shots, key);
    const values = entries.map((entry) => entry.value);
    const q1 = percentile(values, 0.25);
    const q3 = percentile(values, 0.75);
    if (q1 === null || q3 === null) return;
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;
    const outlierShots = entries
      .filter((entry) => entry.value < lower || entry.value > upper)
      .map((entry) => Number(entry.shot.shot_index ?? 0))
      .filter((idx) => Number.isFinite(idx) && idx > 0);
    outliersByMetric[key] = outlierShots;

    entries.forEach((entry) => {
      if (entry.value < lower || entry.value > upper) {
        const shotIndex = String(entry.shot.shot_index ?? "");
        if (!shotIndex) return;
        const list = flags[shotIndex] ?? [];
        list.push(key);
        flags[shotIndex] = list;
      }
    });
  });

  const worst10 = (values: Array<{ index: number; metric: number }>) => {
    if (values.length === 0) return [];
    const sorted = [...values].sort((a, b) => b.metric - a.metric);
    const count = Math.max(1, Math.round(values.length * 0.1));
    return sorted.slice(0, count).map((entry) => entry.index);
  };

  const top20 = (values: Array<{ index: number; metric: number }>) => {
    if (values.length === 0) return [];
    const sorted = [...values].sort((a, b) => b.metric - a.metric);
    const count = Math.max(1, Math.round(values.length * 0.2));
    return sorted.slice(0, count).map((entry) => entry.index);
  };

  const distanceEntries = byMetric(shots, "distance_from_target").map((entry) => ({
    index: Number(entry.shot.shot_index ?? 0),
    metric: Math.abs(entry.value),
  }));
  const dispersionEntries = byMetric(shots, "radial_miss").map((entry) => ({
    index: Number(entry.shot.shot_index ?? 0),
    metric: Math.abs(entry.value),
  }));
  const strikeEntries = byMetric(shots, "strike_score").map((entry) => ({
    index: Number(entry.shot.shot_index ?? 0),
    metric: entry.value,
  }));

  return {
    method: "iqr",
    byMetric: outliersByMetric,
    flags,
    worst10_distance: worst10(distanceEntries),
    worst10_dispersion: worst10(dispersionEntries),
    top20_strikes: top20(strikeEntries),
  };
};
