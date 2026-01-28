import type { RadarChartPayload } from "../types";

export type ChartDefinition = {
  key: string;
  title: string;
  group: string;
  required: string[];
  description?: string;
  build: (context: ChartContext) => RadarChartPayload;
};

export type ChartGroup = {
  key: string;
  label: string;
  description?: string;
};

export type ChartContext = {
  shots: Array<Record<string, unknown>>;
  units: Record<string, string | null>;
  analytics: {
    correlations?: { variables: string[]; matrix: number[][] };
    models?: {
      regressionDistance?: {
        name: string;
        coefficients: Record<string, number>;
        intercept: number;
        r2: number;
        n: number;
        features: string[];
      };
      regressionLateral?: {
        name: string;
        coefficients: Record<string, number>;
        intercept: number;
        r2: number;
        n: number;
        features: string[];
      };
    };
  };
};

const numeric = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const mean = (values: number[]) =>
  values.length ? values.reduce((acc, value) => acc + value, 0) / values.length : null;

const std = (values: number[], avg: number | null) => {
  if (!values.length || avg === null) return null;
  const variance =
    values.reduce((acc, value) => acc + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

const correlation = (points: Array<{ x: number; y: number }>) => {
  if (points.length < 6) return null;
  const meanX = points.reduce((acc, point) => acc + point.x, 0) / points.length;
  const meanY = points.reduce((acc, point) => acc + point.y, 0) / points.length;
  let numerator = 0;
  let denomX = 0;
  let denomY = 0;
  points.forEach(({ x, y }) => {
    numerator += (x - meanX) * (y - meanY);
    denomX += (x - meanX) ** 2;
    denomY += (y - meanY) ** 2;
  });
  if (!denomX || !denomY) return null;
  return numerator / Math.sqrt(denomX * denomY);
};

const formatNumber = (value: number | null, digits = 1) => {
  if (value === null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
};

const formatValue = (
  value: number | null,
  unit?: string | null,
  digits = 1
) => {
  const rounded = formatNumber(value, digits);
  if (rounded === null) return null;
  return unit ? `${rounded} ${unit}` : `${rounded}`;
};

const autoDescription = (title: string) => {
  const lower = title.toLowerCase();
  if (lower.includes("histogramme")) {
    return `Distribution des coups pour ${title.replace(/histogramme/i, "").trim()}.`;
  }
  if (lower.includes("dans le temps")) {
    return `Evolution de ${title.replace(/dans le temps/i, "").trim()} sur la serie.`;
  }
  if (lower.includes("matrice")) {
    return "Relation entre variables (correlations).";
  }
  if (lower.includes("modele")) {
    return "Impact des variables sur la metrique cible.";
  }
  if (lower.includes(" vs ")) {
    const parts = title.split(/vs/i).map((part) => part.trim());
    if (parts.length === 2) {
      return `Relation entre ${parts[0]} et ${parts[1]}.`;
    }
  }
  return `Analyse de ${title.toLowerCase()}.`;
};

const buildInsight = (payload: RadarChartPayload) => {
  if (payload.type === "scatter") {
    const points = payload.points;
    if (points.length < 6) return null;
    const r = correlation(points);
    const meanX = mean(points.map((point) => point.x));
    const meanY = mean(points.map((point) => point.y));
    const stdX = std(points.map((point) => point.x), meanX);
    const stdY = std(points.map((point) => point.y), meanY);
    const strength =
      r === null
        ? null
        : Math.abs(r) < 0.2
        ? "faible"
        : Math.abs(r) < 0.5
        ? "moderee"
        : Math.abs(r) < 0.7
        ? "marquee"
        : "forte";
    const direction = r === null ? null : r >= 0 ? "positive" : "negative";
    const relation =
      r === null
        ? null
        : `Relation ${strength} ${direction} (r=${r.toFixed(2)}).`;
    const stats = [
      meanX !== null
        ? `${payload.xLabel} moy. ${formatValue(meanX, payload.xUnit)}`
        : null,
      stdX !== null ? `ET ${formatValue(stdX, payload.xUnit)}` : null,
      meanY !== null
        ? `${payload.yLabel} moy. ${formatValue(meanY, payload.yUnit)}`
        : null,
      stdY !== null ? `ET ${formatValue(stdY, payload.yUnit)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return [relation, stats].filter(Boolean).join(" ");
  }
  if (payload.type === "line") {
    const series = payload.series[0];
    if (!series || !series.values.length) return null;
    const values = series.values;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const delta = values[values.length - 1] - values[0];
    const range = max - min;
    const trend =
      Math.abs(delta) < Math.max(range * 0.15, 0.01)
        ? "stable"
        : delta > 0
        ? "en hausse"
        : "en baisse";
    return `Amplitude ${formatValue(range, payload.yUnit)} · Tendance ${trend} (Δ ${formatValue(
      delta,
      payload.yUnit
    )}).`;
  }
  if (payload.type === "hist") {
    const total = payload.bins.reduce((acc, bin) => acc + bin.count, 0);
    if (!total) return null;
    const top = payload.bins.reduce((best, bin) =>
      bin.count > best.count ? bin : best
    );
    const share = Math.round((top.count / total) * 100);
    return `Zone dominante ${top.label}${payload.xUnit ? ` ${payload.xUnit}` : ""} (${share}% des coups).`;
  }
  if (payload.type === "table") {
    const rows = payload.rows;
    if (!rows.length) return null;
    const metric =
      payload.columns.find((column) => column.toLowerCase().includes("median")) ??
      payload.columns.find((column) => column.toLowerCase().includes("mean")) ??
      payload.columns.find((column) => column.toLowerCase().includes("max"));
    if (!metric) return null;
    const best = rows.reduce((current, row) => {
      const value = Number(row[metric]);
      if (!Number.isFinite(value)) return current;
      if (!current) return row;
      const currentValue = Number(current[metric]);
      return value > currentValue ? row : current;
    }, null as Record<string, string | number | null> | null);
    if (!best) return null;
    const label =
      (best.Groupe ?? best.GROUP ?? best.Group ?? best.key ?? "Groupe") as string;
    return `${label}: ${metric} ${best[metric]}.`;
  }
  if (payload.type === "matrix") {
    const vars = payload.variables;
    if (vars.length < 2) return null;
    let best: { i: number; j: number; value: number } | null = null;
    payload.matrix.forEach((row, i) => {
      row.forEach((value, j) => {
        if (i === j) return;
        const abs = Math.abs(value);
        if (!best || abs > Math.abs(best.value)) {
          best = { i, j, value };
        }
      });
    });
    if (!best) return null;
    return `Correlation la plus forte: ${vars[best.i]} vs ${vars[best.j]} (r=${best.value.toFixed(
      2
    )}).`;
  }
  if (payload.type === "model") {
    if (!payload.model.n) return null;
    const coeffs = Object.entries(payload.model.coefficients);
    if (!coeffs.length) return `R2 ${payload.model.r2.toFixed(2)}.`;
    const top = coeffs.reduce((current, entry) =>
      Math.abs(entry[1]) > Math.abs(current[1]) ? entry : current
    );
    return `R2 ${payload.model.r2.toFixed(2)} - facteur dominant: ${top[0]} (${top[1].toFixed(
      2
    )}).`;
  }
  return null;
};

const buildScatter = (
  shots: Array<Record<string, unknown>>,
  xKey: string,
  yKey: string
) =>
  shots
    .map((shot) => {
      const x = numeric(shot[xKey]);
      const y = numeric(shot[yKey]);
      if (x === null || y === null) return null;
      return { x, y, shotIndex: numeric(shot.shot_index) ?? undefined };
    })
    .filter((entry): entry is { x: number; y: number; shotIndex?: number } => !!entry);

const buildLine = (shots: Array<Record<string, unknown>>, key: string) =>
  shots
    .map((shot) => numeric(shot[key]))
    .filter((value): value is number => value !== null);

const buildHistogram = (
  shots: Array<Record<string, unknown>>,
  key: string,
  bins = 10
) => {
  const values = shots
    .map((shot) => numeric(shot[key]))
    .filter((value): value is number => value !== null);
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = range / bins;
  const buckets = Array.from({ length: bins }, () => 0);
  values.forEach((value) => {
    const idx = Math.min(
      bins - 1,
      Math.max(0, Math.floor((value - min) / step))
    );
    buckets[idx] += 1;
  });
  return buckets.map((count, index) => {
    const start = min + step * index;
    const end = start + step;
    return {
      label: `${start.toFixed(1)}-${end.toFixed(1)}`,
      count,
    };
  });
};

const buildMinMedianMaxTable = (
  shots: Array<Record<string, unknown>>,
  groupKey: string,
  valueKey: string
) => {
  const groups = new Map<string, number[]>();
  shots.forEach((shot) => {
    const bucket = shot[groupKey];
    const value = numeric(shot[valueKey]);
    if (bucket === null || bucket === undefined || value === null) return;
    const key = String(bucket);
    const list = groups.get(key) ?? [];
    list.push(value);
    groups.set(key, list);
  });
  const rows: Array<Record<string, string | number | null>> = [];
  groups.forEach((values, key) => {
    const sorted = [...values].sort((a, b) => a - b);
    const median =
      sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];
    rows.push({
      Groupe: key,
      Count: sorted.length,
      Min: Number(sorted[0].toFixed(2)),
      Median: Number(median.toFixed(2)),
      Max: Number(sorted[sorted.length - 1].toFixed(2)),
    });
  });
  return rows;
};

export const RADAR_CHART_GROUPS: ChartGroup[] = [
  { key: "dispersion", label: "Dispersion & precision" },
  { key: "distance", label: "Distance & regularite" },
  { key: "speed", label: "Vitesse & efficacite" },
  { key: "launch", label: "Launch & Spin" },
  { key: "direction", label: "Face/Path & direction" },
  { key: "aoa", label: "AOA & dynamique" },
  { key: "impact", label: "Impact face" },
  { key: "plane", label: "Swing plane" },
  { key: "analysis", label: "Correlations & modeles" },
];

const RAW_CHART_DEFINITIONS: ChartDefinition[] = [
  {
    key: "dispersion_scatter",
    title: "Dispersion (carry vs lateral)",
    group: "dispersion",
    required: ["carry", "lateral"],
    build: ({ shots, units }) => ({
      type: "scatter",
      title: "Dispersion (carry vs lateral)",
      xLabel: "Lateral",
      yLabel: "Carry",
      xUnit: units.lateral ?? undefined,
      yUnit: units.carry ?? undefined,
      points: buildScatter(shots, "lateral", "carry"),
    }),
  },
  {
    key: "dispersion_radial_over_time",
    title: "Dispersion radiale dans le temps",
    group: "dispersion",
    required: ["radial_miss"],
    build: ({ shots, units }) => ({
      type: "line",
      title: "Dispersion radiale dans le temps",
      xLabel: "Coups",
      yLabel: "Radial miss",
      yUnit: units.radial_miss ?? units.carry ?? undefined,
      series: [
        {
          label: "Radial",
          values: buildLine(shots, "radial_miss"),
        },
      ],
    }),
  },
  {
    key: "dispersion_by_shot_type_lateral",
    title: "Dispersion lateral par type",
    group: "dispersion",
    required: ["shot_type", "lateral"],
    build: ({ shots }) => ({
      type: "table",
      title: "Dispersion lateral par type",
      columns: ["Groupe", "Count", "Min", "Median", "Max"],
      rows: buildMinMedianMaxTable(shots, "shot_type", "lateral"),
      notes: "Boxplot approxime (min/median/max).",
    }),
  },
  {
    key: "dispersion_by_shot_type_carry",
    title: "Dispersion carry par type",
    group: "dispersion",
    required: ["shot_type", "carry"],
    build: ({ shots }) => ({
      type: "table",
      title: "Dispersion carry par type",
      columns: ["Groupe", "Count", "Min", "Median", "Max"],
      rows: buildMinMedianMaxTable(shots, "shot_type", "carry"),
      notes: "Boxplot approxime (min/median/max).",
    }),
  },
  {
    key: "curve_vs_lateral",
    title: "Curve vs lateral",
    group: "dispersion",
    required: ["curve", "lateral"],
    build: ({ shots, units }) => ({
      type: "scatter",
      title: "Curve vs lateral",
      xLabel: "Curve",
      yLabel: "Lateral",
      xUnit: units.curve ?? undefined,
      yUnit: units.lateral ?? undefined,
      points: buildScatter(shots, "curve", "lateral"),
    }),
  },
  {
    key: "hist_carry",
    title: "Histogramme carry",
    group: "distance",
    required: ["carry"],
    build: ({ shots, units }) => ({
      type: "hist",
      title: "Histogramme carry",
      xLabel: "Carry",
      yLabel: "Coups",
      xUnit: units.carry ?? undefined,
      bins: buildHistogram(shots, "carry"),
    }),
  },
  {
    key: "hist_total",
    title: "Histogramme total",
    group: "distance",
    required: ["total"],
    build: ({ shots, units }) => ({
      type: "hist",
      title: "Histogramme total",
      xLabel: "Total",
      yLabel: "Coups",
      xUnit: units.total ?? undefined,
      bins: buildHistogram(shots, "total"),
    }),
  },
  {
    key: "hist_roll",
    title: "Histogramme roll",
    group: "distance",
    required: ["roll"],
    build: ({ shots, units }) => ({
      type: "hist",
      title: "Histogramme roll",
      xLabel: "Roll",
      yLabel: "Coups",
      xUnit: units.roll ?? undefined,
      bins: buildHistogram(shots, "roll"),
    }),
  },
  {
    key: "carry_over_time",
    title: "Carry dans le temps",
    group: "distance",
    required: ["carry"],
    build: ({ shots, units }) => ({
      type: "line",
      title: "Carry dans le temps",
      xLabel: "Coups",
      yLabel: "Carry",
      yUnit: units.carry ?? undefined,
      series: [
        {
          label: "Carry",
          values: buildLine(shots, "carry"),
        },
      ],
    }),
  },
  {
    key: "carry_vs_total",
    title: "Carry vs total",
    group: "distance",
    required: ["carry", "total"],
    build: ({ shots, units }) => ({
      type: "scatter",
      title: "Carry vs total",
      xLabel: "Carry",
      yLabel: "Total",
      xUnit: units.carry ?? undefined,
      yUnit: units.total ?? undefined,
      points: buildScatter(shots, "carry", "total"),
    }),
  },
  {
    key: "roll_vs_descent",
    title: "Roll vs descent",
    group: "distance",
    required: ["roll", "descent_v"],
    build: ({ shots, units }) => ({
      type: "scatter",
      title: "Roll vs descent",
      xLabel: "Descent V",
      yLabel: "Roll",
      xUnit: units.descent_v ?? undefined,
      yUnit: units.roll ?? undefined,
      points: buildScatter(shots, "descent_v", "roll"),
    }),
  },
  {
    key: "club_vs_ball_speed",
    title: "Club vs ball speed",
    group: "speed",
    required: ["club_speed", "ball_speed"],
    build: ({ shots, units }) => ({
      type: "scatter",
      title: "Club vs ball speed",
      xLabel: "Club",
      yLabel: "Balle",
      xUnit: units.club_speed ?? undefined,
      yUnit: units.ball_speed ?? undefined,
      points: buildScatter(shots, "club_speed", "ball_speed"),
    }),
  },
  {
    key: "smash_hist",
    title: "Histogramme smash",
    group: "speed",
    required: ["smash"],
    build: ({ shots }) => ({
      type: "hist",
      title: "Histogramme smash",
      xLabel: "Smash",
      yLabel: "Coups",
      bins: buildHistogram(shots, "smash"),
    }),
  },
  {
    key: "smash_over_time",
    title: "Smash dans le temps",
    group: "speed",
    required: ["smash"],
    build: ({ shots }) => ({
      type: "line",
      title: "Smash dans le temps",
      xLabel: "Coups",
      yLabel: "Smash",
      series: [
        {
          label: "Smash",
          values: buildLine(shots, "smash"),
        },
      ],
    }),
  },
  {
    key: "ball_speed_vs_carry",
    title: "Vitesse balle vs carry",
    group: "speed",
    required: ["ball_speed", "carry"],
    build: ({ shots, units }) => ({
      type: "scatter",
      title: "Vitesse balle vs carry",
      xLabel: "Ball speed",
      yLabel: "Carry",
      xUnit: units.ball_speed ?? undefined,
      yUnit: units.carry ?? undefined,
      points: buildScatter(shots, "ball_speed", "carry"),
    }),
  },
  {
    key: "spinloft_vs_smash",
    title: "Spin loft vs smash",
    group: "speed",
    required: ["spin_loft", "smash"],
    build: ({ shots, units }) => ({
      type: "scatter",
      title: "Spin loft vs smash",
      xLabel: "Spin loft",
      yLabel: "Smash",
      xUnit: units.spin_loft ?? undefined,
      yUnit: units.smash ?? undefined,
      points: buildScatter(shots, "spin_loft", "smash"),
    }),
  },
  {
    key: "club_speed_vs_smash",
    title: "Club speed vs smash",
    group: "speed",
    required: ["club_speed", "smash"],
    build: ({ shots, units }) => ({
      type: "scatter",
      title: "Club speed vs smash",
      xLabel: "Club speed",
      yLabel: "Smash",
      xUnit: units.club_speed ?? undefined,
      yUnit: units.smash ?? undefined,
      points: buildScatter(shots, "club_speed", "smash"),
    }),
  },
  {
    key: "launchV_vs_rpm",
    title: "Launch V vs RPM",
    group: "launch",
    required: ["launch_v", "spin_rpm"],
    build: ({ shots, units }) => ({
      type: "scatter",
      title: "Launch V vs RPM",
      xLabel: "Launch V",
      yLabel: "RPM",
      xUnit: units.launch_v ?? undefined,
      yUnit: units.spin_rpm ?? undefined,
      points: buildScatter(shots, "launch_v", "spin_rpm"),
    }),
  },
  {
    key: "height_vs_carry",
    title: "Height vs carry",
    group: "launch",
    required: ["height", "carry"],
    build: ({ shots, units }) => ({
      type: "scatter",
      title: "Height vs carry",
      xLabel: "Height",
      yLabel: "Carry",
      xUnit: units.height ?? undefined,
      yUnit: units.carry ?? undefined,
      points: buildScatter(shots, "height", "carry"),
    }),
  },
  {
    key: "height_vs_rpm",
    title: "Height vs RPM",
    group: "launch",
    required: ["height", "spin_rpm"],
    build: ({ shots, units }) => ({
      type: "scatter",
      title: "Height vs RPM",
      xLabel: "Height",
      yLabel: "RPM",
      xUnit: units.height ?? undefined,
      yUnit: units.spin_rpm ?? undefined,
      points: buildScatter(shots, "height", "spin_rpm"),
    }),
  },
  {
    key: "descent_vs_rpm",
    title: "Descent V vs RPM",
    group: "launch",
    required: ["descent_v", "spin_rpm"],
    build: ({ shots, units }) => ({
      type: "scatter",
      title: "Descent V vs RPM",
      xLabel: "Descent V",
      yLabel: "RPM",
      xUnit: units.descent_v ?? undefined,
      yUnit: units.spin_rpm ?? undefined,
      points: buildScatter(shots, "descent_v", "spin_rpm"),
    }),
  },
  {
    key: "spin_axis_vs_lateral",
    title: "Spin axis vs lateral",
    group: "launch",
    required: ["spin_axis", "lateral"],
    build: ({ shots, units }) => ({
      type: "scatter",
      title: "Spin axis vs lateral",
      xLabel: "Spin axis",
      yLabel: "Lateral",
      xUnit: units.spin_axis ?? undefined,
      yUnit: units.lateral ?? undefined,
      points: buildScatter(shots, "spin_axis", "lateral"),
    }),
  },
  {
    key: "path_vs_ftp",
    title: "Path vs FTP",
    group: "direction",
    required: ["path", "ftp"],
    build: ({ shots, units }) => ({
      type: "scatter",
      title: "Path vs FTP",
      xLabel: "Path",
      yLabel: "FTP",
      xUnit: units.path ?? undefined,
      yUnit: units.ftp ?? undefined,
      points: buildScatter(shots, "path", "ftp"),
    }),
  },
  {
    key: "launchH_vs_ftp",
    title: "Launch H vs FTP",
    group: "direction",
    required: ["launch_h", "ftp"],
    build: ({ shots, units }) => ({
      type: "scatter",
      title: "Launch H vs FTP",
      xLabel: "Launch H",
      yLabel: "FTP",
      xUnit: units.launch_h ?? undefined,
      yUnit: units.ftp ?? undefined,
      points: buildScatter(shots, "launch_h", "ftp"),
    }),
  },
  {
    key: "spin_axis_vs_ftp",
    title: "Spin axis vs FTP",
    group: "direction",
    required: ["spin_axis", "ftp"],
    build: ({ shots, units }) => ({
      type: "scatter",
      title: "Spin axis vs FTP",
      xLabel: "Spin axis",
      yLabel: "FTP",
      xUnit: units.spin_axis ?? undefined,
      yUnit: units.ftp ?? undefined,
      points: buildScatter(shots, "spin_axis", "ftp"),
    }),
  },
  {
    key: "aoa_vs_low_point",
    title: "AOA vs Low Point",
    group: "aoa",
    required: ["aoa", "low_point"],
    build: ({ shots, units }) => ({
      type: "scatter",
      title: "AOA vs Low Point",
      xLabel: "AOA",
      yLabel: "Low Point",
      xUnit: units.aoa ?? undefined,
      yUnit: units.low_point ?? undefined,
      points: buildScatter(shots, "aoa", "low_point"),
    }),
  },
  {
    key: "aoa_vs_rpm",
    title: "AOA vs RPM",
    group: "aoa",
    required: ["aoa", "spin_rpm"],
    build: ({ shots, units }) => ({
      type: "scatter",
      title: "AOA vs RPM",
      xLabel: "AOA",
      yLabel: "RPM",
      xUnit: units.aoa ?? undefined,
      yUnit: units.spin_rpm ?? undefined,
      points: buildScatter(shots, "aoa", "spin_rpm"),
    }),
  },
  {
    key: "aoa_vs_carry",
    title: "AOA vs Carry",
    group: "aoa",
    required: ["aoa", "carry"],
    build: ({ shots, units }) => ({
      type: "scatter",
      title: "AOA vs Carry",
      xLabel: "AOA",
      yLabel: "Carry",
      xUnit: units.aoa ?? undefined,
      yUnit: units.carry ?? undefined,
      points: buildScatter(shots, "aoa", "carry"),
    }),
  },
  {
    key: "low_point_vs_smash",
    title: "Low point vs Smash",
    group: "aoa",
    required: ["low_point", "smash"],
    build: ({ shots, units }) => ({
      type: "scatter",
      title: "Low point vs Smash",
      xLabel: "Low Point",
      yLabel: "Smash",
      xUnit: units.low_point ?? undefined,
      yUnit: units.smash ?? undefined,
      points: buildScatter(shots, "low_point", "smash"),
    }),
  },
  {
    key: "dloft_vs_launchV",
    title: "Dynamic loft vs Launch V",
    group: "aoa",
    required: ["dloft", "launch_v"],
    build: ({ shots, units }) => ({
      type: "scatter",
      title: "Dynamic loft vs Launch V",
      xLabel: "Dynamic loft",
      yLabel: "Launch V",
      xUnit: units.dloft ?? undefined,
      yUnit: units.launch_v ?? undefined,
      points: buildScatter(shots, "dloft", "launch_v"),
    }),
  },
  {
    key: "impact_map",
    title: "Impact map",
    group: "impact",
    required: ["impact_lat", "impact_vert"],
    build: ({ shots, units }) => ({
      type: "scatter",
      title: "Impact map",
      xLabel: "Impact lateral",
      yLabel: "Impact vertical",
      xUnit: units.impact_lat ?? undefined,
      yUnit: units.impact_vert ?? undefined,
      points: buildScatter(shots, "impact_lat", "impact_vert"),
    }),
  },
  {
    key: "impact_lat_vs_smash",
    title: "Impact lat vs Smash",
    group: "impact",
    required: ["impact_lat", "smash"],
    build: ({ shots, units }) => ({
      type: "scatter",
      title: "Impact lat vs Smash",
      xLabel: "Impact lateral",
      yLabel: "Smash",
      xUnit: units.impact_lat ?? undefined,
      yUnit: units.smash ?? undefined,
      points: buildScatter(shots, "impact_lat", "smash"),
    }),
  },
  {
    key: "impact_lat_vs_spin_axis",
    title: "Impact lat vs Spin axis",
    group: "impact",
    required: ["impact_lat", "spin_axis"],
    build: ({ shots, units }) => ({
      type: "scatter",
      title: "Impact lat vs Spin axis",
      xLabel: "Impact lateral",
      yLabel: "Spin axis",
      xUnit: units.impact_lat ?? undefined,
      yUnit: units.spin_axis ?? undefined,
      points: buildScatter(shots, "impact_lat", "spin_axis"),
    }),
  },
  {
    key: "impact_vert_vs_launchV",
    title: "Impact vert vs Launch V",
    group: "impact",
    required: ["impact_vert", "launch_v"],
    build: ({ shots, units }) => ({
      type: "scatter",
      title: "Impact vert vs Launch V",
      xLabel: "Impact vertical",
      yLabel: "Launch V",
      xUnit: units.impact_vert ?? undefined,
      yUnit: units.launch_v ?? undefined,
      points: buildScatter(shots, "impact_vert", "launch_v"),
    }),
  },
  {
    key: "impact_vert_vs_rpm",
    title: "Impact vert vs RPM",
    group: "impact",
    required: ["impact_vert", "spin_rpm"],
    build: ({ shots, units }) => ({
      type: "scatter",
      title: "Impact vert vs RPM",
      xLabel: "Impact vertical",
      yLabel: "RPM",
      xUnit: units.impact_vert ?? undefined,
      yUnit: units.spin_rpm ?? undefined,
      points: buildScatter(shots, "impact_vert", "spin_rpm"),
    }),
  },
  {
    key: "swing_planeH_vs_path",
    title: "Swing plane H vs Path",
    group: "plane",
    required: ["swing_plane_h", "path"],
    build: ({ shots, units }) => ({
      type: "scatter",
      title: "Swing plane H vs Path",
      xLabel: "Swing plane H",
      yLabel: "Path",
      xUnit: units.swing_plane_h ?? undefined,
      yUnit: units.path ?? undefined,
      points: buildScatter(shots, "swing_plane_h", "path"),
    }),
  },
  {
    key: "swing_planeH_over_time",
    title: "Swing plane H dans le temps",
    group: "plane",
    required: ["swing_plane_h"],
    build: ({ shots, units }) => ({
      type: "line",
      title: "Swing plane H dans le temps",
      xLabel: "Coups",
      yLabel: "Swing plane H",
      yUnit: units.swing_plane_h ?? undefined,
      series: [
        {
          label: "Swing plane H",
          values: buildLine(shots, "swing_plane_h"),
        },
      ],
    }),
  },
  {
    key: "swing_planeV_over_time",
    title: "Swing plane V dans le temps",
    group: "plane",
    required: ["swing_plane_v"],
    build: ({ shots, units }) => ({
      type: "line",
      title: "Swing plane V dans le temps",
      xLabel: "Coups",
      yLabel: "Swing plane V",
      yUnit: units.swing_plane_v ?? undefined,
      series: [
        {
          label: "Swing plane V",
          values: buildLine(shots, "swing_plane_v"),
        },
      ],
    }),
  },
  {
    key: "swing_planeV_vs_height",
    title: "Swing plane V vs Height",
    group: "plane",
    required: ["swing_plane_v", "height"],
    build: ({ shots, units }) => ({
      type: "scatter",
      title: "Swing plane V vs Height",
      xLabel: "Swing plane V",
      yLabel: "Height",
      xUnit: units.swing_plane_v ?? undefined,
      yUnit: units.height ?? undefined,
      points: buildScatter(shots, "swing_plane_v", "height"),
    }),
  },
  {
    key: "corr_heatmap",
    title: "Matrice de correlation",
    group: "analysis",
    required: [],
    build: ({ analytics }) => ({
      type: "matrix",
      title: "Matrice de correlation",
      variables: analytics.correlations?.variables ?? [],
      matrix: analytics.correlations?.matrix ?? [],
      notes: analytics.correlations?.variables?.length
        ? null
        : "Données insuffisantes.",
    }),
  },
  {
    key: "model_distance_coeffs",
    title: "Modele distance",
    group: "analysis",
    required: [],
    build: ({ analytics }) => ({
      type: "model",
      title: "Modele distance",
      model:
        analytics.models?.regressionDistance ?? {
          name: "Distance",
          coefficients: {},
          intercept: 0,
          r2: 0,
          n: 0,
          features: [],
        },
      notes: analytics.models?.regressionDistance ? null : "Modele indisponible.",
    }),
  },
  {
    key: "model_lateral_coeffs",
    title: "Modele lateral",
    group: "analysis",
    required: [],
    build: ({ analytics }) => ({
      type: "model",
      title: "Modele lateral",
      model:
        analytics.models?.regressionLateral ?? {
          name: "Lateral",
          coefficients: {},
          intercept: 0,
          r2: 0,
          n: 0,
          features: [],
        },
      notes: analytics.models?.regressionLateral ? null : "Modele indisponible.",
    }),
  },
];

export const RADAR_CHART_DEFINITIONS: ChartDefinition[] =
  RAW_CHART_DEFINITIONS.map((definition) => ({
    ...definition,
    description: definition.description ?? autoDescription(definition.title),
  }));

export const buildChartsData = (context: ChartContext) => {
  const map: Record<string, { available: boolean; payload?: RadarChartPayload }> =
    {};
  RADAR_CHART_DEFINITIONS.forEach((definition) => {
    const requiredMissing = definition.required.filter(
      (key) => !(key in context.units)
    );
    if (requiredMissing.length > 0) {
      map[definition.key] = { available: false };
      return;
    }
    const payload = definition.build(context);
    if (payload && !payload.insight) {
      const insight = buildInsight(payload);
      if (insight) {
        payload.insight = insight;
      }
    }
    const available =
      payload.type === "matrix"
        ? payload.variables.length > 0
        : payload.type === "model"
        ? payload.model.n > 0
        : "points" in payload
        ? payload.points.length > 0
        : "bins" in payload
        ? payload.bins.length > 0
        : "series" in payload
        ? payload.series.some((series) => series.values.length > 0)
        : "rows" in payload
        ? payload.rows.length > 0
        : true;
    map[definition.key] = { available, payload };
  });
  return map;
};
