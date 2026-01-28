import { buildColumnMap, type RadarColumn } from "./columnMapping";
import { buildSegments } from "./segments";
import { computeOutliers } from "./outliers";
import { buildChartsData } from "./charts/registry";
import type { RadarAnalytics, RadarConfig } from "./types";

type RadarShot = Record<string, unknown>;

const parseDirectionalNumber = (raw: string) => {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(-?\d+(?:[.,]\d+)?)([LR])$/i);
  if (!match) return null;
  const numeric = Number(match[1].replace(",", "."));
  if (!Number.isFinite(numeric)) return null;
  return match[2].toUpperCase() === "L" ? -numeric : numeric;
};

const parseValue = (value: unknown) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-" || trimmed === "â€”") return null;
  const directional = parseDirectionalNumber(trimmed);
  if (directional !== null) return directional;
  const numeric = Number(trimmed.replace(",", ".").replace(/[^\d.-]/g, ""));
  if (Number.isFinite(numeric)) return numeric;
  return trimmed;
};

const toNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

const percentile = (values: number[], p: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

const summaryStats = (values: number[]) => {
  const count = values.length;
  if (!count) {
    return {
      count: 0,
      mean: null,
      std: null,
      cv: null,
      median: null,
      p10: null,
      p90: null,
    };
  }
  const mean = values.reduce((acc, val) => acc + val, 0) / count;
  const variance =
    values.reduce((acc, val) => acc + (val - mean) ** 2, 0) / count;
  const std = Math.sqrt(variance);
  return {
    count,
    mean,
    std,
    cv: mean ? Math.abs((std / mean) * 100) : null,
    median: median(values),
    p10: percentile(values, 0.1),
    p90: percentile(values, 0.9),
  };
};

const quantileBins = (values: number[], q1: number, q2: number) => {
  if (!values.length) return [0, 0];
  const sorted = [...values].sort((a, b) => a - b);
  const i1 = Math.floor((sorted.length - 1) * q1);
  const i2 = Math.floor((sorted.length - 1) * q2);
  return [sorted[i1], sorted[i2]];
};

const assignBin = (value: number | null, thresholds: [number, number]) => {
  if (value === null || !Number.isFinite(value)) return null;
  if (value <= thresholds[0]) return "low";
  if (value <= thresholds[1]) return "mid";
  return "high";
};

const solveLinear = (matrix: number[][], vector: number[]) => {
  const n = matrix.length;
  const augmented = matrix.map((row, i) => [...row, vector[i]]);
  for (let i = 0; i < n; i += 1) {
    let pivot = augmented[i][i];
    if (Math.abs(pivot) < 1e-8) {
      for (let j = i + 1; j < n; j += 1) {
        if (Math.abs(augmented[j][i]) > Math.abs(pivot)) {
          [augmented[i], augmented[j]] = [augmented[j], augmented[i]];
          pivot = augmented[i][i];
          break;
        }
      }
    }
    if (Math.abs(pivot) < 1e-8) return null;
    for (let j = i; j <= n; j += 1) {
      augmented[i][j] /= pivot;
    }
    for (let k = 0; k < n; k += 1) {
      if (k === i) continue;
      const factor = augmented[k][i];
      for (let j = i; j <= n; j += 1) {
        augmented[k][j] -= factor * augmented[i][j];
      }
    }
  }
  return augmented.map((row) => row[n]);
};

const regression = (
  shots: Record<string, unknown>[],
  yKey: string,
  featureKeys: string[]
) => {
  const rows = shots
    .map((shot) => {
      const y = toNumber(shot[yKey]);
      const features = featureKeys.map((key) => toNumber(shot[key]));
      if (y === null || features.some((value) => value === null)) return null;
      return { y, features: features as number[] };
    })
    .filter(
      (row): row is { y: number; features: number[] } => row !== null
    );
  if (rows.length < Math.max(8, featureKeys.length + 2)) return null;
  const n = rows.length;
  const k = featureKeys.length + 1;
  const XTX = Array.from({ length: k }, () => Array.from({ length: k }, () => 0));
  const XTy = Array.from({ length: k }, () => 0);
  rows.forEach((row) => {
    const x = [1, ...row.features];
    for (let i = 0; i < k; i += 1) {
      XTy[i] += x[i] * row.y;
      for (let j = 0; j < k; j += 1) {
        XTX[i][j] += x[i] * x[j];
      }
    }
  });
  const coeffs = solveLinear(XTX, XTy);
  if (!coeffs) return null;
  const intercept = coeffs[0];
  const betas = coeffs.slice(1);
  const yMean = rows.reduce((acc, row) => acc + row.y, 0) / n;
  let ssTot = 0;
  let ssRes = 0;
  rows.forEach((row) => {
    const prediction =
      intercept + row.features.reduce((acc, val, idx) => acc + val * betas[idx], 0);
    ssTot += (row.y - yMean) ** 2;
    ssRes += (row.y - prediction) ** 2;
  });
  const r2 = ssTot ? 1 - ssRes / ssTot : 0;
  const coefficients: Record<string, number> = {};
  featureKeys.forEach((key, idx) => {
    coefficients[key] = betas[idx];
  });
  return {
    name: yKey,
    coefficients,
    intercept,
    r2,
    n,
    features: featureKeys,
  };
};

const buildSummary = (analytics: {
  globalStats: RadarAnalytics["globalStats"];
  derived: RadarAnalytics["derived"];
  segments: Record<string, unknown>;
}) => {
  const carryStats = analytics.globalStats.carry;
  if (!carryStats || carryStats.count === 0) return null;
  const consistency =
    carryStats.mean && carryStats.std
      ? Number(((carryStats.std / Math.abs(carryStats.mean)) * 100).toFixed(1))
      : null;
  const target = analytics.derived.carryTarget;
  const pieces = [
    target
      ? `Carry moyen cible ${target.toFixed(1)}.`
      : null,
    consistency ? `Regularite carry (CV) ${consistency}% .` : null,
  ].filter(Boolean);
  return pieces.join(" ");
};

const formatInsightValue = (
  value: number | null,
  unit?: string | null,
  digits = 1
) => {
  if (value === null || !Number.isFinite(value)) return null;
  const rounded = Number(value.toFixed(digits));
  return unit ? `${rounded} ${unit}` : `${rounded}`;
};

export const computeAnalytics = ({
  columns,
  shots,
  config,
  metadata,
}: {
  columns: RadarColumn[];
  shots: RadarShot[];
  config?: RadarConfig | null;
  metadata?: { club?: string | null; ball?: string | null } | null;
}): RadarAnalytics => {
  const columnMap = buildColumnMap(columns);
  const units: Record<string, string | null> = {};
  Object.entries(columnMap).forEach(([key, column]) => {
    units[key] = column?.unit ?? null;
  });

  const normalizedShots: Array<Record<string, unknown>> = [];
  shots.forEach((shot) => {
    const shotIndexRaw = shot.shot_index;
    if (typeof shotIndexRaw === "string") {
      const trimmed = shotIndexRaw.trim().toLowerCase();
      if (trimmed.includes("avg") || trimmed.includes("dev")) return;
    }
    const shotIndex =
      typeof shotIndexRaw === "number"
        ? shotIndexRaw
        : Number(String(shotIndexRaw ?? "").replace(/[^\d-]/g, "")) || null;
    if (!shotIndex || shotIndex <= 0) return;
    const normalized: Record<string, unknown> = { shot_index: shotIndex };
    if (typeof shot.shot_type === "string") {
      normalized.shot_type = shot.shot_type;
    } else if (columnMap.shot_type) {
      const rawType = shot[columnMap.shot_type.key];
      if (typeof rawType === "string" && rawType.trim()) {
        normalized.shot_type = rawType.trim();
      }
    }

    const mapValue = (canonical: string) => {
      const column = columnMap[canonical as keyof typeof columnMap];
      if (!column) return;
      const raw = shot[column.key];
      const parsed = parseValue(raw);
      if (typeof parsed === "number") {
        normalized[canonical] = parsed;
      }
    };

    [
      "carry",
      "total",
      "roll",
      "lateral",
      "curve",
      "club_speed",
      "ball_speed",
      "spin_rpm",
      "spin_axis",
      "spin_loft",
      "smash",
      "launch_v",
      "launch_h",
      "descent_v",
      "height",
      "time",
      "path",
      "ftp",
      "ftt",
      "dloft",
      "aoa",
      "low_point",
      "swing_plane_v",
      "swing_plane_h",
      "impact_lat",
      "impact_vert",
    ].forEach(mapValue);

    normalizedShots.push(normalized);
  });

  const carryValues = normalizedShots
    .map((shot) => toNumber(shot.carry))
    .filter((value): value is number => value !== null);

  const carryMedian = median(carryValues) ?? null;
  const carryMean =
    carryValues.length > 0
      ? carryValues.reduce((acc, val) => acc + val, 0) / carryValues.length
      : null;
  const carryOutlierRatio = (() => {
    if (carryValues.length < 6) return 0;
    const q1 = percentile(carryValues, 0.25);
    const q3 = percentile(carryValues, 0.75);
    if (q1 === null || q3 === null) return 0;
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;
    const outliers = carryValues.filter((val) => val < lower || val > upper).length;
    return outliers / carryValues.length;
  })();
  const carryTarget = carryValues.length
    ? carryOutlierRatio > 0.1
      ? carryMedian
      : carryMean ?? carryMedian
    : null;

  const thresholds = config?.thresholds ?? {};
  const impactBox = thresholds.impactCenterBox ?? { lat: 0.4, vert: 0.4 };
  const [smashQ1, smashQ2] = quantileBins(
    normalizedShots
      .map((shot) => toNumber(shot.smash))
      .filter((value): value is number => value !== null),
    thresholds.bins?.quantiles?.[0] ?? 0.33,
    thresholds.bins?.quantiles?.[1] ?? 0.66
  );
  const [ballQ1, ballQ2] = quantileBins(
    normalizedShots
      .map((shot) => toNumber(shot.ball_speed))
      .filter((value): value is number => value !== null),
    thresholds.bins?.quantiles?.[0] ?? 0.33,
    thresholds.bins?.quantiles?.[1] ?? 0.66
  );
  const [launchQ1, launchQ2] = quantileBins(
    normalizedShots
      .map((shot) => toNumber(shot.launch_v))
      .filter((value): value is number => value !== null),
    thresholds.bins?.quantiles?.[0] ?? 0.33,
    thresholds.bins?.quantiles?.[1] ?? 0.66
  );
  const [ftpQ1, ftpQ2] = quantileBins(
    normalizedShots
      .map((shot) => toNumber(shot.ftp))
      .filter((value): value is number => value !== null)
      .map((value) => Math.abs(value)),
    thresholds.bins?.quantiles?.[0] ?? 0.33,
    thresholds.bins?.quantiles?.[1] ?? 0.66
  );

  const shotsWithDerived = normalizedShots.map((shot) => {
    const carry = toNumber(shot.carry);
    const lateral = toNumber(shot.lateral);
    const ftp = toNumber(shot.ftp);
    const launchH = toNumber(shot.launch_h);
    const spinAxis = toNumber(shot.spin_axis);
    const impactLat = toNumber(shot.impact_lat);
    const impactVert = toNumber(shot.impact_vert);
    const shotIndex = toNumber(shot.shot_index) ?? 0;
    const distanceFromTarget =
      carry !== null && carryTarget !== null ? carry - carryTarget : null;
    const radialMiss =
      lateral !== null && distanceFromTarget !== null
        ? Math.sqrt(lateral ** 2 + distanceFromTarget ** 2)
        : null;
    const leftRight = lateral === null ? null : lateral < 0 ? "L" : "R";
    const absFtp = ftp !== null ? Math.abs(ftp) : null;
    const absLaunchH = launchH !== null ? Math.abs(launchH) : null;
    const absSpinAxis = spinAxis !== null ? Math.abs(spinAxis) : null;

    let impactZone: string | null = null;
    if (impactLat !== null && impactVert !== null) {
      const latZone =
        Math.abs(impactLat) <= impactBox.lat ? "center" : impactLat > 0 ? "toe" : "heel";
      const vertZone =
        Math.abs(impactVert) <= impactBox.vert
          ? "center"
          : impactVert > 0
          ? "high"
          : "low";
      impactZone = `${latZone}-${vertZone}`;
    }

    return {
      ...shot,
      carry_target: carryTarget,
      distance_from_target: distanceFromTarget,
      radial_miss: radialMiss,
      abs_lateral: lateral !== null ? Math.abs(lateral) : null,
      abs_ftp: absFtp,
      abs_launch_h: absLaunchH,
      abs_spin_axis: absSpinAxis,
      left_right: leftRight,
      smash_bin: assignBin(toNumber(shot.smash), [smashQ1, smashQ2]),
      ball_speed_bin: assignBin(toNumber(shot.ball_speed), [ballQ1, ballQ2]),
      launch_v_bin: assignBin(toNumber(shot.launch_v), [launchQ1, launchQ2]),
      abs_ftp_bin: assignBin(absFtp, [ftpQ1, ftpQ2]),
      period_tertile: shotIndex <= normalizedShots.length / 3
        ? "start"
        : shotIndex <= (normalizedShots.length * 2) / 3
        ? "mid"
        : "end",
      impact_zone: impactZone,
      strike_score:
        toNumber(shot.smash) ?? toNumber(shot.ball_speed) ?? null,
    };
  });

  units.radial_miss = units.carry ?? null;
  units.distance_from_target = units.carry ?? null;
  units.abs_lateral = units.lateral ?? null;

  const latValues = shotsWithDerived
    .map((shot) => toNumber(shot.lateral))
    .filter((value): value is number => value !== null);
  const distValues = shotsWithDerived
    .map((shot) => toNumber(shot.distance_from_target))
    .filter((value): value is number => value !== null);
  const latThresholds = thresholds.latCorridorMeters ?? [5, 10];
  const distThresholds = thresholds.distCorridorMeters ?? [5, 10];
  const corridorPercent = (values: number[], threshold: number) =>
    values.length
      ? Number(
          ((values.filter((val) => Math.abs(val) <= threshold).length /
            values.length) *
            100).toFixed(1)
        )
      : null;

  const outliers = computeOutliers(shotsWithDerived, [
    "carry",
    "lateral",
    "smash",
    "ball_speed",
  ]);

  const globalStats: RadarAnalytics["globalStats"] = {};
  const statKeys = [
    "carry",
    "total",
    "roll",
    "lateral",
    "curve",
    "club_speed",
    "ball_speed",
    "spin_rpm",
    "smash",
    "launch_v",
    "launch_h",
    "descent_v",
    "height",
    "time",
    "path",
    "ftp",
    "aoa",
    "low_point",
    "spin_axis",
    "spin_loft",
    "impact_lat",
    "impact_vert",
  ];
  statKeys.forEach((key) => {
    const values = shotsWithDerived
      .map((shot) => toNumber(shot[key]))
      .filter((value): value is number => value !== null);
    globalStats[key] = summaryStats(values);
  });

  const segments = buildSegments(shotsWithDerived, {
    latThreshold: thresholds.latCorridorMeters?.[1] ?? 10,
    distThreshold: thresholds.distCorridorMeters?.[1] ?? 10,
  });

  const correlationKeys = [
    "carry",
    "total",
    "roll",
    "lateral",
    "club_speed",
    "ball_speed",
    "spin_rpm",
    "smash",
    "launch_v",
    "launch_h",
    "path",
    "ftp",
    "aoa",
    "spin_axis",
    "impact_lat",
    "impact_vert",
  ];

  const correlations = (() => {
    const variables = correlationKeys.filter((key) =>
      shotsWithDerived.some((shot) => toNumber(shot[key]) !== null)
    );
    if (variables.length < 2) return null;
    const matrix: number[][] = [];
    for (let i = 0; i < variables.length; i += 1) {
      matrix[i] = [];
      for (let j = 0; j < variables.length; j += 1) {
        if (i === j) {
          matrix[i][j] = 1;
          continue;
        }
        const pairs = shotsWithDerived
          .map((shot) => {
            const a = toNumber(shot[variables[i]]);
            const b = toNumber(shot[variables[j]]);
            if (a === null || b === null) return null;
            return [a, b];
          })
          .filter((pair): pair is [number, number] => !!pair);
        if (!pairs.length) {
          matrix[i][j] = 0;
          continue;
        }
        const meanA = pairs.reduce((acc, pair) => acc + pair[0], 0) / pairs.length;
        const meanB = pairs.reduce((acc, pair) => acc + pair[1], 0) / pairs.length;
        let numerator = 0;
        let denomA = 0;
        let denomB = 0;
        pairs.forEach(([a, b]) => {
          numerator += (a - meanA) * (b - meanB);
          denomA += (a - meanA) ** 2;
          denomB += (b - meanB) ** 2;
        });
        matrix[i][j] =
          denomA && denomB ? Number((numerator / Math.sqrt(denomA * denomB)).toFixed(3)) : 0;
      }
    }
    return { variables, matrix };
  })();

  const models = {
    regressionDistance: regression(shotsWithDerived, "carry", [
      "ball_speed",
      "launch_v",
      "spin_rpm",
    ]) ?? undefined,
    regressionLateral: regression(shotsWithDerived, "lateral", [
      "launch_h",
      "ftp",
      "spin_axis",
      "impact_lat",
    ]) ?? undefined,
  };

  const chartsData = buildChartsData({
    shots: shotsWithDerived,
    units,
    analytics: { correlations: correlations ?? undefined, models },
  });

  const canonicalKeys = [
    "carry",
    "total",
    "roll",
    "lateral",
    "curve",
    "club_speed",
    "ball_speed",
    "spin_rpm",
    "smash",
    "launch_v",
    "launch_h",
    "descent_v",
    "height",
    "time",
    "path",
    "ftp",
    "aoa",
    "low_point",
    "spin_axis",
    "spin_loft",
    "impact_lat",
    "impact_vert",
  ];
  const missingColumns = canonicalKeys.filter((key) => !(key in units));

  const analytics: RadarAnalytics = {
    version: "radar-analytics-v1",
    meta: {
      units,
      club: metadata?.club ?? null,
      ball: metadata?.ball ?? null,
      shotCount: shotsWithDerived.length,
      missingColumns,
    },
    derived: {
      carryTarget,
      corridors: {
        withinLat5: corridorPercent(latValues, latThresholds[0]),
        withinLat10: corridorPercent(latValues, latThresholds[1]),
        withinDist5: corridorPercent(distValues, distThresholds[0]),
        withinDist10: corridorPercent(distValues, distThresholds[1]),
      },
    },
    globalStats,
    segments,
    outliers,
    correlations: correlations ?? undefined,
    models,
    chartsData,
    summary: buildSummary({ globalStats, derived: { carryTarget }, segments }),
    insights: (() => {
      const insights: Record<string, string> = {};
      const latMean = globalStats.lateral?.mean ?? null;
      const latStd = globalStats.lateral?.std ?? null;
      const withinLat10 = corridorPercent(latValues, latThresholds[1]);
      const dispersionParts = [
        latMean !== null
          ? `Moyenne laterale ${formatInsightValue(latMean, units.lateral)}`
          : null,
        latStd !== null
          ? `ET ${formatInsightValue(latStd, units.lateral)}`
          : null,
        withinLat10 !== null
          ? `${withinLat10}% des coups dans ±${latThresholds[1]}${units.lateral ? ` ${units.lateral}` : "m"}`
          : null,
      ].filter(Boolean);
      if (dispersionParts.length) {
        insights.dispersion = dispersionParts.join(" · ");
      }

      const carryMean = globalStats.carry?.mean ?? null;
      const totalMean = globalStats.total?.mean ?? null;
      const rollMean =
        carryMean !== null && totalMean !== null ? totalMean - carryMean : null;
      const carryParts = [
        carryMean !== null
          ? `Carry moyen ${formatInsightValue(carryMean, units.carry)}`
          : null,
        totalMean !== null
          ? `Total moyen ${formatInsightValue(totalMean, units.total ?? units.carry)}`
          : null,
        rollMean !== null
          ? `Roll moyen ${formatInsightValue(rollMean, units.total ?? units.carry)}`
          : null,
      ].filter(Boolean);
      if (carryParts.length) {
        insights.carryTotal = carryParts.join(" · ");
      }

      const clubMean = globalStats.club_speed?.mean ?? null;
      const ballMean = globalStats.ball_speed?.mean ?? null;
      const smashMean = globalStats.smash?.mean ?? null;
      const speedRatio =
        clubMean && ballMean ? Number((ballMean / clubMean).toFixed(2)) : null;
      const speedParts = [
        clubMean !== null
          ? `Club moy. ${formatInsightValue(clubMean, units.club_speed)}`
          : null,
        ballMean !== null
          ? `Balle moy. ${formatInsightValue(ballMean, units.ball_speed)}`
          : null,
        smashMean !== null
          ? `Smash moy. ${formatInsightValue(smashMean, units.smash, 2)}`
          : null,
        speedRatio !== null ? `Ratio ${speedRatio}` : null,
      ].filter(Boolean);
      if (speedParts.length) {
        insights.speeds = speedParts.join(" · ");
      }

      const spinMean = globalStats.spin_rpm?.mean ?? null;
      const spinParts = [
        spinMean !== null
          ? `Spin moyen ${formatInsightValue(spinMean, units.spin_rpm, 0)}`
          : null,
        carryMean !== null
          ? `Carry moyen ${formatInsightValue(carryMean, units.carry)}`
          : null,
      ].filter(Boolean);
      if (spinParts.length) {
        insights.spinCarry = spinParts.join(" · ");
      }

      const smashStd = globalStats.smash?.std ?? null;
      const smashCv = globalStats.smash?.cv ?? null;
      const smashParts = [
        smashMean !== null
          ? `Smash moyen ${formatInsightValue(smashMean, units.smash, 2)}`
          : null,
        smashStd !== null
          ? `ET ${formatInsightValue(smashStd, units.smash, 2)}`
          : null,
        smashCv !== null ? `CV ${formatInsightValue(smashCv, "%", 1)}` : null,
      ].filter(Boolean);
      if (smashParts.length) {
        insights.smash = smashParts.join(" · ");
      }

      const impactLatMean = globalStats.impact_lat?.mean ?? null;
      const impactVertMean = globalStats.impact_vert?.mean ?? null;
      const impactParts = [
        impactLatMean !== null
          ? `Lat. moy. ${formatInsightValue(impactLatMean, units.impact_lat)}`
          : null,
        impactVertMean !== null
          ? `Vert. moy. ${formatInsightValue(impactVertMean, units.impact_vert)}`
          : null,
      ].filter(Boolean);
      if (impactParts.length) {
        insights.faceImpact = impactParts.join(" · ");
      }

      return insights;
    })(),
  };

  return analytics;
};
