"use client";

import { useMemo } from "react";
import type { ReactElement } from "react";
import { DEFAULT_RADAR_CONFIG } from "@/lib/radar/config";
import type { RadarAnalytics, RadarConfig, RadarChartPayload } from "@/lib/radar/types";
import { RADAR_CHART_DEFINITIONS, RADAR_CHART_GROUPS } from "@/lib/radar/charts/registry";
import { findPgaBenchmark } from "@/lib/radar/pga-benchmarks";
import {
  IMPACT_FACE_CENTER_OFFSET,
  IMPACT_FACE_DETAIL_PATHS,
  IMPACT_FACE_OUTLINE_PATH,
  IMPACT_FACE_SVG_TRANSFORM,
  IMPACT_FACE_VIEWBOX,
} from "@/lib/radar/impact-face-svg";
import {
  DRIVER_FACE_CENTER_OFFSET,
  DRIVER_FACE_DETAIL_PATHS,
  DRIVER_FACE_OUTLINE_PATH,
  DRIVER_FACE_SVG_TRANSFORM,
  DRIVER_FACE_VIEWBOX,
} from "@/lib/radar/impact-face-driver-svg";

export type { RadarConfig, RadarAnalytics } from "@/lib/radar/types";

export type RadarColumn = {
  key: string;
  group: string | null;
  label: string;
  unit: string | null;
};

export type RadarStats = {
  avg: Record<string, number | null>;
  dev: Record<string, number | null>;
};

export type RadarShot = Record<string, unknown>;

type RadarChartsProps = {
  columns: RadarColumn[];
  shots: RadarShot[];
  stats?: RadarStats | null;
  summary?: string | null;
  config?: RadarConfig | null;
  analytics?: RadarAnalytics | null;
  compact?: boolean;
};

export const defaultRadarConfig: RadarConfig = DEFAULT_RADAR_CONFIG;

const normalizeToken = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const isDriverClub = (club?: string | null) => {
  if (!club) return false;
  const normalized = normalizeToken(club);
  return (
    normalized.includes("driver") ||
    normalized.includes("1w") ||
    normalized.includes("w1") ||
    normalized.includes("bois 1") ||
    normalized.includes("1 bois") ||
    normalized.includes("wood 1") ||
    normalized.includes("1 wood")
  );
};

const findColumn = (columns: RadarColumn[], patterns: string[]) => {
  const normalizedPatterns = patterns.map((pattern) => normalizeToken(pattern));
  const direct = columns.find((column) =>
    normalizedPatterns.some((pattern) =>
      normalizeToken(column.key).startsWith(pattern)
    )
  );
  if (direct) return direct;
  const fallback = columns.find((column) => {
    const label = normalizeToken(column.label);
    const group = normalizeToken(column.group ?? "");
    return normalizedPatterns.some(
      (pattern) => label.includes(pattern) || group.includes(pattern)
    );
  });
  return fallback ?? null;
};

const formatAxisLabel = (label: string, unit?: string | null) =>
  unit ? `${label} (${unit})` : label;

const ChartLegend = ({
  items,
}: {
  items: Array<{ label: string; color: string }>;
}) => (
  <div className="mt-2 flex flex-wrap gap-3 text-[0.65rem] uppercase tracking-wide text-[var(--muted)]">
    {items.map((item) => (
      <span key={item.label} className="inline-flex items-center gap-2">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: item.color }}
        />
        {item.label}
      </span>
    ))}
  </div>
);

const buildGridLines = ({
  width,
  height,
  padding,
  count = 4,
}: {
  width: number;
  height: number;
  padding: number;
  count?: number;
}) => {
  const lines: Array<ReactElement> = [];
  for (let i = 1; i < count; i += 1) {
    const x =
      padding + (i / count) * (width - padding * 2);
    const y =
      padding + (i / count) * (height - padding * 2);
    lines.push(
      <line
        key={`grid-x-${i}`}
        x1={x}
        x2={x}
        y1={padding}
        y2={height - padding}
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="1"
      />
    );
    lines.push(
      <line
        key={`grid-y-${i}`}
        x1={padding}
        x2={width - padding}
        y1={y}
        y2={y}
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="1"
      />
    );
  }
  return lines;
};

const formatTickValue = (value: number, unit?: string | null) => {
  if (!Number.isFinite(value)) return "-";
  const rounded =
    Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1);
  const cleaned = rounded.replace(/\.0$/, "");
  return unit ? `${cleaned} ${unit}` : cleaned;
};

const normalizeUnit = (unit?: string | null) =>
  unit?.trim().toLowerCase() ?? null;

const unitForYAxisTicks = (unit?: string | null) => {
  const normalized = normalizeUnit(unit);
  if (normalized === "rpm" || normalized === "mph") return null;
  return unit ?? null;
};

const formatInsightValue = (
  value: number | null | undefined,
  unit?: string | null,
  digits = 1
) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const rounded = Number(value.toFixed(digits));
  return unit ? `${rounded} ${unit}` : `${rounded}`;
};

const StarIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    <path
      fill="currentColor"
      d="M12 2l2.9 6.1 6.7.9-4.9 4.8 1.2 6.6-5.9-3.2-5.9 3.2 1.2-6.6L2.4 9l6.7-.9L12 2z"
    />
  </svg>
);

const ThumbIcon = ({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    style={style}
    aria-hidden="true"
    focusable="false"
  >
    <path
      fill="currentColor"
      d="M14 9V5c0-1.7-1.3-3-3-3l-1 5-3 4v8h10c1.1 0 2-.7 2.3-1.7l1.4-5.5c.3-1.2-.6-2.3-1.8-2.3H14z"
    />
  </svg>
);

const ThumbBadge = ({ tone }: { tone: "good" | "warn" | "bad" }) => {
  const toneConfig = {
    good: { color: "#22c55e", label: "OK" },
    warn: { color: "#f59e0b", label: "A suivre" },
    bad: { color: "#ef4444", label: "A corriger" },
  } as const;
  const config = toneConfig[tone];
  return (
    <div className="mt-1 inline-flex items-center gap-1 text-[0.55rem] uppercase tracking-wide">
      <ThumbIcon className="h-4 w-4" style={{ color: config.color }} />
      <span className="text-[var(--muted)]">{config.label}</span>
    </div>
  );
};

const InsightText = ({ text }: { text?: string | null }) =>
  text ? (
    <p className="mt-2 text-[0.7rem] text-[var(--muted)]">{text}</p>
  ) : null;

const ChartDescription = ({ text }: { text?: string | null }) =>
  text ? (
    <p className="mt-2 text-[0.7rem] text-[var(--muted)]">{text}</p>
  ) : null;

const ChartCommentary = ({ text }: { text?: string | null }) =>
  text ? (
    <p className="mt-1 flex items-start gap-2 text-[0.7rem] text-[var(--muted)]">
      <StarIcon className="mt-[2px] h-3 w-3 text-[#facc15]" />
      <span>{text}</span>
    </p>
  ) : null;

const buildTechniqueOnly = (key: string) => {
  switch (key) {
    case "dispersion":
      return "La precision depend du controle face/chemin.";
    case "carryTotal":
      return "Le roll depend de l angle d atterrissage et du spin.";
    case "speeds":
      return "Le smash reflete la qualite de centrage.";
    case "spinCarry":
      return "Le spin influence la portee et la trajectoire.";
    case "smash":
      return "La regularite du contact stabilise le smash.";
    case "faceImpact":
      return "Le centrage influence vitesse et direction.";
    default:
      return null;
  }
};

const toMph = (value: number | null, unit?: string | null) => {
  if (value === null || !Number.isFinite(value)) return null;
  const normalized = normalizeUnit(unit);
  if (!normalized || normalized.includes("mph")) return value;
  if (normalized.includes("km")) return value / 1.60934;
  if (normalized.includes("m/s") || normalized.includes("mps")) {
    return value * 2.23694;
  }
  return value;
};

const toYards = (value: number | null, unit?: string | null) => {
  if (value === null || !Number.isFinite(value)) return null;
  const normalized = normalizeUnit(unit);
  if (!normalized || normalized.includes("yd")) return value;
  if (normalized.includes("m")) return value * 1.09361;
  if (normalized.includes("ft")) return value / 3;
  return value;
};

const formatDelta = (value: number, unit: string) => {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)} ${unit}`;
};

const AiNarrative = ({
  reason,
  solution,
}: {
  reason?: string | null;
  solution?: string | null;
}) =>
  reason || solution ? (
    <div className="mt-3 rounded-xl border border-violet-300/20 bg-violet-400/10 px-3 py-2 text-[0.72rem] text-[var(--text)]">
      <p className="text-[0.55rem] uppercase tracking-wide text-violet-200/80">
        IA - analyse & pistes
      </p>
      {reason ? (
        <p className="mt-1">
          <span className="font-semibold text-violet-100">
            Pourquoi ce graphe:
          </span>{" "}
          {reason}
        </p>
      ) : null}
      {solution ? (
        <p className="mt-1">
          <span className="font-semibold text-violet-100">Pistes:</span>{" "}
          {solution}
        </p>
      ) : null}
    </div>
  ) : null;

const AiSessionSummary = ({
  selectionSummary,
  sessionSummary,
}: {
  selectionSummary?: string | null;
  sessionSummary?: string | null;
}) =>
  selectionSummary || sessionSummary ? (
    <div className="mt-6 rounded-2xl border border-violet-300/30 bg-violet-400/10 px-4 py-4 text-[0.78rem] text-[var(--text)]">
      <p className="text-[0.6rem] uppercase tracking-wide text-violet-200/80">
        IA - synthese radar
      </p>
      {selectionSummary ? (
        <p className="mt-2">
          <span className="font-semibold text-violet-100">
            Choix des graphes:
          </span>{" "}
          {selectionSummary}
        </p>
      ) : null}
      {sessionSummary ? (
        <p className="mt-2">
          <span className="font-semibold text-violet-100">
            Synthese seance:
          </span>{" "}
          {sessionSummary}
        </p>
      ) : null}
    </div>
  ) : null;

const ChartHighlights = ({
  items,
}: {
  items: Array<{ value: string; label: string }>;
}) =>
  items.length ? (
    <div className="flex items-start gap-3 text-right">
      {items.map((item) => (
        <div key={item.label} className="text-right">
          <div className="text-sm font-semibold text-[var(--text)]">
            {item.value}
          </div>
          <div className="text-[0.55rem] uppercase tracking-wide text-[var(--muted)]">
            {item.label}
          </div>
        </div>
      ))}
    </div>
  ) : null;

const ChartHeaderRight = ({
  count,
  highlights,
}: {
  count?: number | null;
  highlights: Array<{ value: string; label: string }>;
}) => {
  const countLabel =
    count !== null && count !== undefined ? `${count} coups` : null;
  return (
    <div className="flex min-h-[2.25rem] flex-col items-end gap-1 text-xs text-[var(--muted)]">
      <div className="flex items-start gap-4">
        <span className={countLabel ? "" : "opacity-0"}>
          {countLabel ?? "0 coups"}
        </span>
        <ChartHighlights items={highlights} />
      </div>
    </div>
  );
};

const computeInsightFromPayload = (payload: RadarChartPayload) => {
  if (payload.type === "scatter") {
    const points = payload.points;
    if (points.length < 6) return null;
    const mean = (values: number[]) =>
      values.reduce((acc, value) => acc + value, 0) / values.length;
    const meanX = mean(points.map((p) => p.x));
    const meanY = mean(points.map((p) => p.y));
    const std = (values: number[], avg: number) =>
      Math.sqrt(
        values.reduce((acc, value) => acc + (value - avg) ** 2, 0) / values.length
      );
    const stdX = std(points.map((p) => p.x), meanX);
    const stdY = std(points.map((p) => p.y), meanY);
    const corr = (() => {
      const meanXLocal = meanX;
      const meanYLocal = meanY;
      let numerator = 0;
      let denomX = 0;
      let denomY = 0;
      points.forEach(({ x, y }) => {
        numerator += (x - meanXLocal) * (y - meanYLocal);
        denomX += (x - meanXLocal) ** 2;
        denomY += (y - meanYLocal) ** 2;
      });
      if (!denomX || !denomY) return null;
      return numerator / Math.sqrt(denomX * denomY);
    })();
    const corrText =
      corr === null
        ? null
        : `Relation ${Math.abs(corr) < 0.2 ? "faible" : Math.abs(corr) < 0.5 ? "moderee" : Math.abs(corr) < 0.7 ? "marquee" : "forte"} ${
            corr >= 0 ? "positive" : "negative"
          } (r=${corr.toFixed(2)}).`;
    const stats = [
      `X moy. ${formatTickValue(meanX, payload.xUnit)}`,
      `ET ${formatTickValue(stdX, payload.xUnit)}`,
      `Y moy. ${formatTickValue(meanY, payload.yUnit)}`,
      `ET ${formatTickValue(stdY, payload.yUnit)}`,
    ].join(" - ");
    return [corrText, stats].filter(Boolean).join(" ");
  }
  if (payload.type === "line") {
    const series = payload.series[0];
    if (!series || !series.values.length) return null;
    const values = series.values;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const delta = values[values.length - 1] - values[0];
    const trend =
      Math.abs(delta) < Math.max(range * 0.15, 0.01)
        ? "stable"
        : delta > 0
        ? "en hausse"
        : "en baisse";
    return `Amplitude ${formatTickValue(range, payload.yUnit)} - Tendance ${trend} (Delta ${formatTickValue(
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
    if (!payload.rows.length) return null;
    const metric =
      payload.columns.find((column) => column.toLowerCase().includes("median")) ??
      payload.columns.find((column) => column.toLowerCase().includes("mean")) ??
      payload.columns.find((column) => column.toLowerCase().includes("max"));
    if (!metric) return null;
    const best = payload.rows.reduce((current, row) => {
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
    let bestI = 0;
    let bestJ = 1;
    let bestValue = 0;
    let hasBest = false;
    payload.matrix.forEach((row, i) => {
      row.forEach((value, j) => {
        if (i === j) return;
        const abs = Math.abs(value);
        if (!hasBest || abs > Math.abs(bestValue)) {
          bestI = i;
          bestJ = j;
          bestValue = value;
          hasBest = true;
        }
      });
    });
    if (!hasBest) return null;
    return `Correlation la plus forte: ${vars[bestI]} vs ${vars[bestJ]} (r=${bestValue.toFixed(
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

const buildTechniqueHint = (labels: string[]) => {
  const normalized = normalizeToken(labels.join(" "));
  if (normalized.includes("aoa")) {
    return "L AOA influence la trajectoire et la qualite du contact.";
  }
  if (normalized.includes("low point")) {
    return "Le low point controle la profondeur d impact.";
  }
  if (normalized.includes("spin axis")) {
    return "Le spin axis pilote la courbure de balle.";
  }
  if (normalized.includes("spin")) {
    return "Le spin depend du loft dynamique et du contact.";
  }
  if (normalized.includes("path")) {
    return "Le chemin du club influence direction et courbure.";
  }
  if (normalized.includes("ftp") || normalized.includes("face to path")) {
    return "Face/Path conditionne la courbure de balle.";
  }
  if (normalized.includes("face")) {
    return "La face a l impact influence la direction de depart.";
  }
  if (normalized.includes("launch")) {
    return "Le launch depend du loft dynamique et de l angle d attaque.";
  }
  if (normalized.includes("smash")) {
    return "Le smash reflete la qualite de centrage.";
  }
  if (normalized.includes("height")) {
    return "La hauteur est liee au launch et au spin.";
  }
  if (normalized.includes("swing plane")) {
    return "Le plan de swing influence direction et contact.";
  }
  if (normalized.includes("impact")) {
    return "Le centrage influe sur vitesse et direction.";
  }
  if (normalized.includes("curve")) {
    return "La courbure vient du face/path et du spin axis.";
  }
  if (normalized.includes("roll")) {
    return "Le roll depend de l angle d atterrissage et du spin.";
  }
  return null;
};

const buildTechniqueSuggestion = (labels: string[]) => {
  const normalized = normalizeToken(labels.join(" "));
  if (normalized.includes("aoa") || normalized.includes("low point")) {
    return "Piste: travailler le point bas (ball position, poids en avant, compression).";
  }
  if (normalized.includes("spin axis") || normalized.includes("curve")) {
    return "Piste: stabiliser face/path (grip, alignement, plan de swing).";
  }
  if (normalized.includes("spin")) {
    return "Piste: ajuster loft dynamique et centrage pour regler le spin.";
  }
  if (normalized.includes("launch")) {
    return "Piste: ajuster loft dynamique et angle d attaque pour optimiser le launch.";
  }
  if (normalized.includes("smash")) {
    return "Piste: travailler le centrage et la vitesse a l impact.";
  }
  if (normalized.includes("height")) {
    return "Piste: verifier launch et spin pour controler la hauteur.";
  }
  if (normalized.includes("path") || normalized.includes("ftp")) {
    return "Piste: travailler le chemin avec des reperes d alignement.";
  }
  if (normalized.includes("impact")) {
    return "Piste: exercices de centrage (tape, spray, gate drill).";
  }
  if (normalized.includes("roll")) {
    return "Piste: ajuster angle d atterrissage via launch/spin.";
  }
  return "Piste: stabiliser rythme et impact pour regulariser les resultats.";
};

const buildPayloadCommentary = (payload: RadarChartPayload) => {
  if (payload.type === "scatter") {
    const points = payload.points;
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
    const r = numerator / Math.sqrt(denomX * denomY);
    const strength =
      Math.abs(r) < 0.2
        ? "faible"
        : Math.abs(r) < 0.5
        ? "moderee"
        : Math.abs(r) < 0.7
        ? "marquee"
        : "forte";
    const relation =
      Math.abs(r) < 0.2
        ? `Lien faible entre ${payload.xLabel} et ${payload.yLabel}.`
        : `Tendance ${strength}: quand ${payload.xLabel} augmente, ${payload.yLabel} ${
            r > 0 ? "augmente" : "diminue"
          }.`;
    const hint = buildTechniqueHint([payload.xLabel, payload.yLabel]);
    const suggestion = buildTechniqueSuggestion([payload.xLabel, payload.yLabel]);
    return `${relation}${hint ? ` ${hint}` : ""} ${suggestion}`;
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
    const base = `Tendance ${trend} sur la serie.`;
    const hint = buildTechniqueHint([payload.yLabel]);
    const suggestion = buildTechniqueSuggestion([payload.yLabel]);
    return `${base}${hint ? ` ${hint}` : ""} ${suggestion}`;
  }
  if (payload.type === "hist") {
    if (!payload.bins.length) return null;
    const total = payload.bins.reduce((acc, bin) => acc + bin.count, 0);
    if (!total) return null;
    const top = payload.bins.reduce((best, bin) =>
      bin.count > best.count ? bin : best
    );
    const share = Math.round((top.count / total) * 100);
    const base = `Zone la plus frequente: ${top.label} (${share}% des coups).`;
    const hint = buildTechniqueHint([payload.xLabel]);
    const suggestion = buildTechniqueSuggestion([payload.xLabel]);
    return `${base}${hint ? ` ${hint}` : ""} ${suggestion}`;
  }
  if (payload.type === "matrix") {
    return `Les correlations fortes indiquent les variables qui influencent le resultat. ${buildTechniqueSuggestion(
      payload.variables
    )}`;
  }
  if (payload.type === "model") {
    return `Le modele met en avant les facteurs techniques qui pesent sur la metrique cible. ${buildTechniqueSuggestion(
      [payload.model.name]
    )}`;
  }
  return null;
};

const buildPayloadHighlights = (payload: RadarChartPayload) => {
  if (payload.type === "scatter") {
    const points = payload.points;
    if (points.length < 3) return [];
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
    const r = denomX && denomY ? numerator / Math.sqrt(denomX * denomY) : null;
    const items: Array<{ value: string; label: string }> = [];
    if (r !== null && Number.isFinite(r)) {
      items.push({ value: r.toFixed(2), label: "r" });
    }
    if (Number.isFinite(meanY)) {
      items.push({
        value: formatHighlightValue(meanY, 1) ?? "",
        label: payload.yUnit ? `${payload.yLabel} ${payload.yUnit}` : payload.yLabel,
      });
    }
    return items;
  }
  if (payload.type === "line") {
    const series = payload.series[0];
    if (!series || !series.values.length) return [];
    const values = series.values;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const delta = values[values.length - 1] - values[0];
    const items: Array<{ value: string; label: string }> = [];
    items.push({
      value: formatHighlightValue(delta, 1) ?? "",
      label: "Delta",
    });
    items.push({
      value: formatHighlightValue(max - min, 1) ?? "",
      label: "Amplitude",
    });
    return items;
  }
  if (payload.type === "hist") {
    if (!payload.bins.length) return [];
    const total = payload.bins.reduce((acc, bin) => acc + bin.count, 0);
    if (!total) return [];
    const top = payload.bins.reduce((best, bin) =>
      bin.count > best.count ? bin : best
    );
    const share = Math.round((top.count / total) * 100);
    return [
      { value: `${share}%`, label: "Top zone" },
      { value: top.label, label: payload.xLabel },
    ];
  }
  if (payload.type === "matrix") {
    const vars = payload.variables;
    if (vars.length < 2) return [];
    let bestI = 0;
    let bestJ = 1;
    let bestValue = 0;
    let hasBest = false;
    payload.matrix.forEach((row, i) => {
      row.forEach((value, j) => {
        if (i === j) return;
        const abs = Math.abs(value);
        if (!hasBest || abs > Math.abs(bestValue)) {
          bestI = i;
          bestJ = j;
          bestValue = value;
          hasBest = true;
        }
      });
    });
    if (!hasBest) return [];
    return [
      { value: bestValue.toFixed(2), label: "r max" },
      { value: `${vars[bestI]} / ${vars[bestJ]}`, label: "Paire" },
    ];
  }
  if (payload.type === "model") {
    return [
      { value: payload.model.r2.toFixed(2), label: "R2" },
      { value: `${payload.model.n}`, label: "N" },
    ];
  }
  return [];
};

const buildPayloadTone = (payload: RadarChartPayload): "good" | "warn" | "bad" => {
  if (payload.type === "scatter") {
    const points = payload.points;
    if (points.length < 6) return "warn";
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
    if (!denomX || !denomY) return "warn";
    const r = numerator / Math.sqrt(denomX * denomY);
    const abs = Math.abs(r);
    if (abs >= 0.5) return "good";
    if (abs >= 0.3) return "warn";
    return "bad";
  }
  if (payload.type === "line") {
    const series = payload.series[0];
    if (!series || !series.values.length) return "warn";
    const values = series.values;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((acc, value) => acc + value, 0) / values.length;
    const range = max - min;
    const cv = mean ? range / Math.abs(mean) : range;
    if (cv < 0.15) return "good";
    if (cv < 0.3) return "warn";
    return "bad";
  }
  if (payload.type === "hist") {
    const total = payload.bins.reduce((acc, bin) => acc + bin.count, 0);
    if (!total) return "warn";
    const top = payload.bins.reduce((best, bin) =>
      bin.count > best.count ? bin : best
    );
    const share = top.count / total;
    if (share >= 0.4) return "good";
    if (share >= 0.25) return "warn";
    return "bad";
  }
  if (payload.type === "matrix") {
    const vars = payload.variables;
    if (vars.length < 2) return "warn";
    let best: number | null = null;
    payload.matrix.forEach((row, i) => {
      row.forEach((value, j) => {
        if (i === j) return;
        const abs = Math.abs(value);
        if (best === null || abs > best) best = abs;
      });
    });
    if (best === null) return "warn";
    if (best >= 0.6) return "good";
    if (best >= 0.4) return "warn";
    return "bad";
  }
  if (payload.type === "model") {
    if (payload.model.r2 >= 0.5) return "good";
    if (payload.model.r2 >= 0.3) return "warn";
    return "bad";
  }
  return "warn";
};

const buildAxisTicks = ({
  width,
  height,
  padding,
  xMin,
  xMax,
  yMin,
  yMax,
  xUnit,
  yUnit,
}: {
  width: number;
  height: number;
  padding: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xUnit?: string | null;
  yUnit?: string | null;
}) => {
  const xMid = (xMin + xMax) / 2;
  const yMid = (yMin + yMax) / 2;
  const xTicks = [xMin, xMid, xMax];
  const yTicks = [yMin, yMid, yMax];
  const xScale = (value: number) =>
    padding + ((value - xMin) / (xMax - xMin || 1)) * (width - padding * 2);
  const yScale = (value: number) =>
    height -
    padding -
    ((value - yMin) / (yMax - yMin || 1)) * (height - padding * 2);
  const xTickY = height - padding + 16;
  const yTickX = padding - 12;
  const yTickUnit = unitForYAxisTicks(yUnit);

  return (
    <>
      {xTicks.map((value, index) => (
        <text
          key={`tick-x-${index}`}
          x={xScale(value)}
          y={xTickY}
          textAnchor="middle"
          className="fill-[var(--muted)] text-[0.8rem]"
        >
          {formatTickValue(value, xUnit)}
        </text>
      ))}
      {yTicks.map((value, index) => (
        <text
          key={`tick-y-${index}`}
          x={yTickX}
          y={yScale(value) + 3}
          textAnchor="end"
          className="fill-[var(--muted)] text-[0.8rem]"
        >
          {formatTickValue(value, yTickUnit)}
        </text>
      ))}
    </>
  );
};

const getNumericSeries = (shots: RadarShot[], key: string | null) => {
  if (!key) return [];
  return shots
    .map((shot) => {
      const value = shot[key];
      const shotIndexRaw = shot.shot_index;
      const shotIndex =
        typeof shotIndexRaw === "number"
          ? shotIndexRaw
          : Number(shotIndexRaw ?? NaN);
      if (typeof value === "number" && Number.isFinite(value)) {
        return {
          value,
          shotIndex: Number.isFinite(shotIndex) ? shotIndex : undefined,
        };
      }
      return null;
    })
    .filter(
      (entry): entry is { value: number; shotIndex: number | undefined } =>
        entry !== null
    );
};

const formatValue = (value: unknown) => {
  if (value === null || value === undefined) return "-";
  if (typeof value === "number") {
    const rounded = Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(2);
    return rounded.replace(/\.0$/, "");
  }
  return String(value);
};

const formatHighlightValue = (value: number | null | undefined, digits = 1) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits)).toString();
};

const ScatterPlot = ({
  points,
  color,
  xLabel,
  yLabel,
  xUnit,
  yUnit,
  outlierShotSet,
  width = 560,
  height = 340,
}: {
  points: Array<{ x: number; y: number; shotIndex?: number }>;
  color: string;
  xLabel: string;
  yLabel: string;
  xUnit?: string | null;
  yUnit?: string | null;
  outlierShotSet?: Set<number>;
  width?: number;
  height?: number;
}) => {
  const padding = 52;
  const xOffset = 8;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const xMin = Math.min(...xs, 0);
  const xMax = Math.max(...xs, 1);
  const yMin = Math.min(...ys, 0);
  const yMax = Math.max(...ys, 1);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;
  const meanX = points.length
    ? xs.reduce((acc, value) => acc + value, 0) / points.length
    : null;
  const meanY = points.length
    ? ys.reduce((acc, value) => acc + value, 0) / points.length
    : null;
  const regression = (() => {
    if (points.length < 3) return null;
    const avgX = meanX ?? 0;
    const avgY = meanY ?? 0;
    let numerator = 0;
    let denom = 0;
    points.forEach((point) => {
      numerator += (point.x - avgX) * (point.y - avgY);
      denom += (point.x - avgX) ** 2;
    });
    if (!denom) return null;
    const slope = numerator / denom;
    const intercept = avgY - slope * avgX;
    return { slope, intercept };
  })();

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
      <g transform={`translate(${xOffset} 0)`}>
        {buildGridLines({ width, height, padding })}
      <rect
        x={padding}
        y={padding}
        width={width - padding * 2}
        height={height - padding * 2}
        fill="none"
        stroke="rgba(255,255,255,0.1)"
        strokeWidth="1"
      />
      {meanX !== null ? (
        <line
          x1={padding + ((meanX - xMin) / xRange) * (width - padding * 2)}
          x2={padding + ((meanX - xMin) / xRange) * (width - padding * 2)}
          y1={padding}
          y2={height - padding}
          stroke="rgba(255,255,255,0.2)"
          strokeDasharray="4 4"
        />
      ) : null}
      {meanY !== null ? (
        <line
          x1={padding}
          x2={width - padding}
          y1={height - padding - ((meanY - yMin) / yRange) * (height - padding * 2)}
          y2={height - padding - ((meanY - yMin) / yRange) * (height - padding * 2)}
          stroke="rgba(255,255,255,0.2)"
          strokeDasharray="4 4"
        />
      ) : null}
      {meanX !== null ? (
        <text
          x={padding + ((meanX - xMin) / xRange) * (width - padding * 2)}
          y={padding - 8}
          textAnchor="middle"
          className="fill-[var(--muted)] text-[0.7rem]"
        >
          {`Moy. X ${formatTickValue(meanX, xUnit)}`}
        </text>
      ) : null}
      {meanY !== null ? (
        <text
          x={padding + 6}
          y={height - padding - ((meanY - yMin) / yRange) * (height - padding * 2) - 6}
          textAnchor="start"
          className="fill-[var(--muted)] text-[0.7rem]"
        >
          {`Moy. Y ${formatTickValue(meanY, yUnit)}`}
        </text>
      ) : null}
      {regression ? (
        <line
          x1={padding}
          x2={width - padding}
          y1={
            height -
            padding -
            ((regression.intercept + regression.slope * xMin - yMin) / yRange) *
              (height - padding * 2)
          }
          y2={
            height -
            padding -
            ((regression.intercept + regression.slope * xMax - yMin) / yRange) *
              (height - padding * 2)
          }
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="1.2"
        />
      ) : null}
      {points.map((point, index) => {
        const cx =
          padding + ((point.x - xMin) / xRange) * (width - padding * 2);
        const cy =
          height -
          padding -
          ((point.y - yMin) / yRange) * (height - padding * 2);
        const isOutlier =
          !!outlierShotSet &&
          point.shotIndex !== undefined &&
          outlierShotSet.has(point.shotIndex);
        return (
          <circle
            key={`${point.x}-${point.y}-${index}`}
            cx={cx}
            cy={cy}
            r={isOutlier ? 3.6 : 2.6}
            fill={isOutlier ? "rgba(239,68,68,0.95)" : color}
            stroke={isOutlier ? "rgba(239,68,68,0.8)" : "none"}
            strokeWidth={isOutlier ? 1 : 0}
            opacity={isOutlier ? 0.95 : 0.85}
          />
        );
      })}
      <line
        x1={padding}
        x2={width - padding}
        y1={height - padding}
        y2={height - padding}
        stroke="rgba(255,255,255,0.2)"
        strokeWidth="1"
      />
      <line
        x1={padding}
        x2={padding}
        y1={padding}
        y2={height - padding}
        stroke="rgba(255,255,255,0.2)"
        strokeWidth="1"
      />
      {buildAxisTicks({
        width,
        height,
        padding,
        xMin,
        xMax,
        yMin,
        yMax,
        xUnit,
        yUnit,
      })}
      <text
        x={width / 2}
        y={height - 4}
        textAnchor="middle"
        className="fill-[var(--muted)] text-[0.8rem]"
      >
        {xLabel}
      </text>
        <text
          x={padding}
          y={padding - 8}
          textAnchor="start"
          className="fill-[var(--muted)] text-[0.8rem]"
        >
          {yLabel}
        </text>
      </g>
    </svg>
  );
};

const LinePlot = ({
  series,
  xLabel,
  yLabel,
  yUnit,
  outlierShotSet,
  width = 560,
  height = 340,
}: {
  series: Array<{
    label: string;
    color: string;
    values: number[];
    shotIndices?: Array<number | undefined>;
  }>;
  xLabel: string;
  yLabel: string;
  yUnit?: string | null;
  outlierShotSet?: Set<number>;
  width?: number;
  height?: number;
}) => {
  const padding = 52;
  const xOffset = 8;
  const allValues = series.flatMap((item) => item.values);
  const min = Math.min(...allValues, 0);
  const max = Math.max(...allValues, 1);
  const range = max - min || 1;
  const length = Math.max(...series.map((item) => item.values.length), 1);

  const buildPath = (values: number[]) =>
    values
      .map((value, index) => {
        const x =
          padding + (index / Math.max(length - 1, 1)) * (width - padding * 2);
        const y =
          height -
          padding -
          ((value - min) / range) * (height - padding * 2);
        return { x, y };
      })
      .map((point, index, pts) => {
        if (pts.length < 3) {
          return `${index === 0 ? "M" : "L"}${point.x},${point.y}`;
        }
        if (index === 0) {
          return `M${point.x},${point.y}`;
        }
        const p0 = pts[index - 2] ?? pts[index - 1];
        const p1 = pts[index - 1];
        const p2 = pts[index];
        const p3 = pts[index + 1] ?? p2;
        const tension = 0.8;
        const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension;
        const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension;
        const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension;
        const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension;
        return `C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
      })
      .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
      <g transform={`translate(${xOffset} 0)`}>
        {buildGridLines({ width, height, padding })}
      <rect
        x={padding}
        y={padding}
        width={width - padding * 2}
        height={height - padding * 2}
        fill="none"
        stroke="rgba(255,255,255,0.1)"
        strokeWidth="1"
      />
      {series.map((item) => (
        <path
          key={item.label}
          d={buildPath(item.values)}
          fill="none"
          stroke={item.color}
          strokeWidth="2"
        />
      ))}
      {series.map((item) =>
        item.shotIndices && outlierShotSet
          ? item.values.map((value, index) => {
              const shotIndex = item.shotIndices?.[index];
              if (!shotIndex || !outlierShotSet.has(shotIndex)) return null;
              const x =
                padding + (index / Math.max(length - 1, 1)) * (width - padding * 2);
              const y =
                height -
                padding -
                ((value - min) / range) * (height - padding * 2);
              return (
                <circle
                  key={`line-outlier-${item.label}-${index}`}
                  cx={x}
                  cy={y}
                  r="3.6"
                  fill="rgba(239,68,68,0.95)"
                  stroke="rgba(239,68,68,0.8)"
                  strokeWidth="1"
                />
              );
            })
          : null
      )}
      {buildAxisTicks({
        width,
        height,
        padding,
        xMin: 1,
        xMax: length,
        yMin: min,
        yMax: max,
        xUnit: null,
        yUnit,
      })}
      <text
        x={width / 2}
        y={height - 4}
        textAnchor="middle"
        className="fill-[var(--muted)] text-[0.8rem]"
      >
        {xLabel}
      </text>
        <text
          x={padding}
          y={padding - 8}
          textAnchor="start"
          className="fill-[var(--muted)] text-[0.8rem]"
        >
          {yLabel}
        </text>
      </g>
    </svg>
  );
};

const DispersionPlot = ({
  points,
  color,
  xLabel,
  yLabel,
  xUnit,
  yUnit,
  outlierShotSet,
  width = 560,
  height = 380,
}: {
  points: Array<{ x: number; y: number; shotIndex?: number }>;
  color: string;
  xLabel: string;
  yLabel: string;
  xUnit?: string | null;
  yUnit?: string | null;
  outlierShotSet?: Set<number>;
  width?: number;
  height?: number;
}) => {
  const padding = 52;
  const xOffset = 8;
  const plotSize = Math.min(width, height) - padding * 2 - 12;
  const plotLeft = (width - plotSize) / 2;
  const plotTop = (height - plotSize) / 2;
  const plotRight = plotLeft + plotSize;
  const plotBottom = plotTop + plotSize;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const maxAbsX = Math.max(1, ...xs.map((value) => Math.abs(value)));
  const maxY = Math.max(1, ...ys);
  const maxRange = Math.max(maxY, maxAbsX * 2);
  const scale = plotSize / maxRange;
  const centerX = plotLeft + plotSize / 2;
  const originY = plotBottom;
  const rings = [0.25, 0.5, 0.75, 1];
  const clipId = `dispersion-${Math.round(width)}-${Math.round(height)}`;

  const meanX = xs.reduce((acc, value) => acc + value, 0) / (xs.length || 1);
  const meanY = ys.reduce((acc, value) => acc + value, 0) / (ys.length || 1);
  const stdX =
    Math.sqrt(
      xs.reduce((acc, value) => acc + (value - meanX) ** 2, 0) /
        (xs.length || 1)
    ) || 0;
  const stdY =
    Math.sqrt(
      ys.reduce((acc, value) => acc + (value - meanY) ** 2, 0) /
        (ys.length || 1)
    ) || 0;
  const radius = Math.max(stdX, stdY);
  const circleR = radius * scale;

  const toCanvas = (x: number, y: number) => ({
    cx: centerX + x * scale,
    cy: originY - y * scale,
  });

  const xMin = -maxAbsX;
  const xMax = maxAbsX;
  const yMin = 0;
  const yMax = maxRange;
  const xScale = (value: number) =>
    plotLeft + ((value - xMin) / (xMax - xMin || 1)) * plotSize;
  const yScale = (value: number) =>
    plotBottom - ((value - yMin) / (yMax - yMin || 1)) * plotSize;
  const yTickUnit = unitForYAxisTicks(yUnit);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
      <g transform={`translate(${xOffset} 0)`}>
      <defs>
        <clipPath id={clipId}>
          <rect x={plotLeft} y={plotTop} width={plotSize} height={plotSize} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {buildGridLines({ width, height, padding })}
        {[0.25, 0.5, 0.75].map((ratio) => {
          const x = plotLeft + plotSize * ratio;
          const y = plotTop + plotSize * ratio;
          return (
            <g key={`grid-${ratio}`}>
              <line
                x1={x}
                x2={x}
                y1={plotTop}
                y2={plotBottom}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
              <line
                x1={plotLeft}
                x2={plotRight}
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
            </g>
          );
        })}
        {rings.map((ratio) => (
          <circle
            key={`ring-${ratio}`}
            cx={centerX}
            cy={originY}
            r={plotSize * ratio}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeDasharray="3 6"
          />
        ))}
        <line
          x1={centerX}
          x2={centerX}
          y1={plotTop}
          y2={originY}
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
        {points.length > 0 ? (
          <line
            x1={toCanvas(meanX, 0).cx}
            x2={toCanvas(meanX, maxRange).cx}
            y1={originY}
            y2={plotTop}
            stroke="rgba(147,197,253,0.5)"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        ) : null}
      </g>
      <rect
        x={plotLeft}
        y={plotTop}
        width={plotSize}
        height={plotSize}
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1"
      />
      <g>
        {points.map((point, index) => {
          const { cx, cy } = toCanvas(point.x, point.y);
          const isOutlier =
            !!outlierShotSet &&
            point.shotIndex !== undefined &&
            outlierShotSet.has(point.shotIndex);
          return (
            <circle
              key={`${point.x}-${point.y}-${index}`}
              cx={cx}
              cy={cy}
              r={isOutlier ? 4.2 : 3.5}
              fill={isOutlier ? "rgba(239,68,68,0.95)" : color}
              stroke={isOutlier ? "rgba(239,68,68,0.8)" : "none"}
              strokeWidth={isOutlier ? 1 : 0}
              opacity={isOutlier ? 0.95 : 0.85}
            />
          );
        })}
        {points.length > 0 ? (
          <>
            <circle
              cx={toCanvas(meanX, meanY).cx}
              cy={toCanvas(meanX, meanY).cy}
              r={Math.max(circleR, 6)}
              fill="rgba(110,231,183,0.08)"
              stroke="rgba(110,231,183,0.5)"
              strokeWidth="1.5"
            />
            <circle
              cx={toCanvas(meanX, meanY).cx}
              cy={toCanvas(meanX, meanY).cy}
              r="3.5"
              fill="rgba(110,231,183,0.9)"
            />
          </>
        ) : null}
      </g>
      {[xMin, 0, xMax].map((value, index) => (
        <text
          key={`disp-x-${index}`}
          x={xScale(value)}
          y={plotBottom + 16}
          textAnchor="middle"
          className="fill-[var(--muted)] text-[0.8rem]"
        >
          {formatTickValue(value, xUnit)}
        </text>
      ))}
      {[yMin, maxRange / 2, yMax].map((value, index) => (
        <text
          key={`disp-y-${index}`}
          x={plotLeft - 12}
          y={yScale(value) + 4}
          textAnchor="end"
          className="fill-[var(--muted)] text-[0.8rem]"
        >
          {formatTickValue(value, yTickUnit)}
        </text>
      ))}
      <text
        x={width / 2}
        y={height - 4}
        textAnchor="middle"
        className="fill-[var(--muted)] text-[0.8rem]"
      >
        {xLabel}
      </text>
        <text
          x={padding}
          y={padding - 8}
          textAnchor="start"
          className="fill-[var(--muted)] text-[0.8rem]"
        >
          {yLabel}
        </text>
      </g>
    </svg>
  );
};

const FaceImpactHeatmap = ({
  points,
  xLabel,
  yLabel,
  xUnit,
  yUnit,
  club,
  outlierShotSet,
  width = 560,
  height = 380,
  showScatter = true,
}: {
  points: Array<{ x: number; y: number; shotIndex?: number }>;
  xLabel: string;
  yLabel: string;
  xUnit?: string | null;
  yUnit?: string | null;
  club?: string | null;
  outlierShotSet?: Set<number>;
  width?: number;
  height?: number;
  showScatter?: boolean;
}) => {
  const padding = 56;
  const xOffset = 8;
  const isDriver = isDriverClub(club);
  const CLUB_WIDTH_IN = isDriver ? 5.0 : 3.35;
  const CLUB_HEIGHT_IN = isDriver ? 2.5 : 2.2;
  const availableW = width - padding * 2;
  const availableH = height - padding * 2;
  const ratio = CLUB_HEIGHT_IN / CLUB_WIDTH_IN;
  let plotW = availableW;
  let plotH = availableW * ratio;
  if (plotH > availableH) {
    plotH = availableH;
    plotW = plotH / ratio;
  }
  const plotLeft = padding + (availableW - plotW) / 2;
  const plotTop = padding + (availableH - plotH) / 2;
  const centerX = plotLeft + plotW / 2;
  const centerY = plotTop + plotH / 2;
  const scaleX = plotW / CLUB_WIDTH_IN;
  const scaleY = plotH / CLUB_HEIGHT_IN;
  const xMin = -CLUB_WIDTH_IN / 2;
  const xMax = CLUB_WIDTH_IN / 2;
  const yMin = -CLUB_HEIGHT_IN / 2;
  const yMax = CLUB_HEIGHT_IN / 2;

  const binsX = 40;
  const binsY = Math.max(20, Math.round(binsX * ratio));
  const grid = Array.from({ length: binsY }, () =>
    Array.from({ length: binsX }, () => 0)
  );

  points.forEach((point) => {
    const clampedX = Math.min(xMax, Math.max(xMin, point.x));
    const clampedY = Math.min(yMax, Math.max(yMin, point.y));
    const ix = Math.min(
      binsX - 1,
      Math.max(
        0,
        Math.floor(((clampedX - xMin) / (xMax - xMin)) * binsX)
      )
    );
    const iy = Math.min(
      binsY - 1,
      Math.max(
        0,
        Math.floor(((clampedY - yMin) / (yMax - yMin)) * binsY)
      )
    );
    grid[iy][ix] += 1;
  });

  const smooth = (input: number[][]) => {
    const kernel = [
      [1, 2, 1],
      [2, 4, 2],
      [1, 2, 1],
    ];
    const output = input.map((row) => row.slice());
    const h = input.length;
    const w = input[0]?.length ?? 0;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        let sum = 0;
        let weight = 0;
        for (let ky = -1; ky <= 1; ky += 1) {
          for (let kx = -1; kx <= 1; kx += 1) {
            const ny = y + ky;
            const nx = x + kx;
            if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
            const k = kernel[ky + 1][kx + 1];
            sum += input[ny][nx] * k;
            weight += k;
          }
        }
        output[y][x] = weight > 0 ? sum / weight : 0;
      }
    }
    return output;
  };

  const smoothed = smooth(grid);
  const maxVal = Math.max(1, ...smoothed.flat());
  const scaledMax = maxVal * 0.75;
  const cellSizeX = plotW / binsX;
  const cellSizeY = plotH / binsY;
  const clipId = `impact-clip-${Math.round(width)}-${Math.round(height)}`;
  const blurId = `impact-blur-${Math.round(width)}-${Math.round(height)}`;
  const heatBlurId = `impact-heat-blur-${Math.round(width)}-${Math.round(height)}`;
  const heatCoreId = `impact-heat-core-${Math.round(width)}-${Math.round(height)}`;
  const faceGradId = `impact-face-${Math.round(width)}-${Math.round(height)}`;
  const toCanvas = (x: number, y: number) => ({
    cx: centerX - x * scaleX,
    cy: centerY - y * scaleY,
  });
  const mapX = (x: number) => centerX - x * scaleX;
  const mapY = (y: number) => centerY - y * scaleY;
  const FACE_VIEWBOX_W = isDriver
    ? DRIVER_FACE_VIEWBOX.width
    : IMPACT_FACE_VIEWBOX.width;
  const FACE_VIEWBOX_H = isDriver
    ? DRIVER_FACE_VIEWBOX.height
    : IMPACT_FACE_VIEWBOX.height;
  const faceSvgTransform = isDriver
    ? DRIVER_FACE_SVG_TRANSFORM
    : IMPACT_FACE_SVG_TRANSFORM;
  const faceOutlinePath = isDriver
    ? DRIVER_FACE_OUTLINE_PATH
    : IMPACT_FACE_OUTLINE_PATH;
  const faceDetailPaths = isDriver
    ? DRIVER_FACE_DETAIL_PATHS
    : IMPACT_FACE_DETAIL_PATHS;
  const faceCenterOffset = isDriver
    ? DRIVER_FACE_CENTER_OFFSET
    : IMPACT_FACE_CENTER_OFFSET;

  const colorForIntensity = (value: number) => {
    const t = Math.min(1, Math.max(0, value / scaledMax));
    if (t <= 0.001) return "rgba(0,0,0,0)";
    const boosted = Math.min(1, t * 1.7);
    const eased = Math.pow(boosted, 1.1);
    const redStart = 0.65;
    const hue =
      eased < redStart
        ? 120 - 60 * (eased / redStart)
        : 60 - 60 * ((eased - redStart) / (1 - redStart));
    const alpha = Math.min(1, 0.25 + 0.85 * eased);
    const lightness = 58 - 12 * eased;
    return `hsla(${hue}, 95%, ${lightness}%, ${alpha})`;
  };
  const colorForCoreIntensity = (value: number) => {
    const t = Math.min(1, Math.max(0, value / scaledMax));
    if (t <= 0.35) return "rgba(0,0,0,0)";
    const boosted = Math.min(1, t * 1.6);
    const eased = Math.pow(boosted, 1.05);
    const redStart = 0.65;
    const hue =
      eased < redStart
        ? 120 - 60 * (eased / redStart)
        : 60 - 60 * ((eased - redStart) / (1 - redStart));
    const alpha = Math.min(1, 0.45 + 0.75 * eased);
    const lightness = 52 - 14 * eased;
    return `hsla(${hue}, 98%, ${lightness}%, ${alpha})`;
  };

  const xScale = (value: number) => mapX(value);
  const yScale = (value: number) =>
    plotTop + ((yMax - value) / (yMax - yMin)) * plotH;
  const xTicks = [xMin, 0, xMax];
  const yTicks = [yMin, 0, yMax];

  const faceScaleX = plotW / FACE_VIEWBOX_W;
  const faceScaleY = plotH / FACE_VIEWBOX_H;
  const faceTransform = `translate(${plotLeft} ${plotTop}) scale(${faceScaleX} ${faceScaleY})`;
  const faceCenterTransform = `translate(${faceCenterOffset.x} ${faceCenterOffset.y})`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
      <defs>
        <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
          <g transform={faceTransform}>
            <g transform={faceCenterTransform}>
              <g transform={faceSvgTransform}>
                <path d={faceOutlinePath} />
              </g>
            </g>
          </g>
        </clipPath>
        <filter id={blurId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id={heatBlurId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <filter id={heatCoreId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <linearGradient id={faceGradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
          <stop offset="50%" stopColor="rgba(255,255,255,0.02)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.05)" />
        </linearGradient>
      </defs>
      <g transform={`translate(${xOffset} 0)`}>
        <g transform={faceTransform}>
          <g transform={faceCenterTransform}>
            <g transform={faceSvgTransform}>
              <path
                d={faceOutlinePath}
                fill={`url(#${faceGradId})`}
                stroke="rgba(255,255,255,0.18)"
                strokeWidth="1.2"
                vectorEffect="non-scaling-stroke"
              />
              <g fill="rgba(255,255,255,0.08)" stroke="none">
                {faceDetailPaths.map((path, index) => (
                  <path key={`impact-face-${index}`} d={path} />
                ))}
              </g>
            </g>
          </g>
        </g>
        <line
          x1={centerX}
          x2={centerX}
          y1={plotTop}
          y2={plotTop + plotH}
          stroke="rgba(255,255,255,0.15)"
          strokeDasharray="4 4"
        />
        <line
          x1={plotLeft}
          x2={plotLeft + plotW}
          y1={centerY}
          y2={centerY}
          stroke="rgba(255,255,255,0.15)"
          strokeDasharray="4 4"
        />
        <g filter={`url(#${heatBlurId})`} opacity={0.9}>
          {smoothed.map((row, y) =>
            row.map((value, x) => {
              if (value <= 0) return null;
              return (
                <rect
                  key={`heat-${x}-${y}`}
                  x={plotLeft + (binsX - 1 - x) * cellSizeX}
                  y={plotTop + (binsY - 1 - y) * cellSizeY}
                  width={cellSizeX + 1}
                  height={cellSizeY + 1}
                  fill={colorForIntensity(value)}
                />
              );
            })
          )}
        </g>
        <g filter={`url(#${heatCoreId})`} opacity={0.95}>
          {smoothed.map((row, y) =>
            row.map((value, x) => {
              if (value <= 0) return null;
              return (
                <rect
                  key={`heat-core-${x}-${y}`}
                  x={plotLeft + (binsX - 1 - x) * cellSizeX}
                  y={plotTop + (binsY - 1 - y) * cellSizeY}
                  width={cellSizeX + 1}
                  height={cellSizeY + 1}
                  fill={colorForCoreIntensity(value)}
                />
              );
            })
          )}
        </g>
        {showScatter
          ? points.map((point, index) => {
              const { cx, cy } = toCanvas(point.x, point.y);
              const isOutlier =
                !!outlierShotSet &&
                point.shotIndex !== undefined &&
                outlierShotSet.has(point.shotIndex);
              return (
                <circle
                  key={`impact-${index}`}
                  cx={cx}
                  cy={cy}
                  r={isOutlier ? 3.2 : 1.8}
                  fill={isOutlier ? "rgba(239,68,68,0.95)" : "rgba(255,255,255,0.9)"}
                  stroke={isOutlier ? "rgba(239,68,68,0.8)" : "none"}
                  strokeWidth={isOutlier ? 1 : 0}
                />
              );
            })
          : null}
        {xTicks.map((value, index) => (
          <text
            key={`impact-x-${index}`}
            x={xScale(value)}
            y={plotTop + plotH + 18}
            textAnchor="middle"
            className="fill-[var(--muted)] text-[0.8rem]"
          >
            {`${value.toFixed(2).replace(/\.00$/, "")} ${xUnit ?? ""}`.trim()}
          </text>
        ))}
        {yTicks.map((value, index) => (
          <text
            key={`impact-y-${index}`}
            x={plotLeft - 12}
            y={yScale(value) + 4}
            textAnchor="end"
            className="fill-[var(--muted)] text-[0.8rem]"
          >
            {`${value.toFixed(2).replace(/\.00$/, "")} ${yUnit ?? ""}`.trim()}
          </text>
        ))}
        <text
          x={plotLeft + plotW / 2}
          y={height - 4}
          textAnchor="middle"
          className="fill-[var(--muted)] text-[0.7rem]"
        >
          {xLabel}
        </text>
        <text
          x={plotLeft}
          y={plotTop - 8}
          textAnchor="start"
          className="fill-[var(--muted)] text-[0.8rem]"
        >
          {yLabel}
        </text>
      </g>
    </svg>
  );
};

const HistogramPlot = ({
  bins,
  xLabel,
  yLabel,
  width = 560,
  height = 340,
}: {
  bins: Array<{ label: string; count: number }>;
  xLabel: string;
  yLabel: string;
  width?: number;
  height?: number;
}) => {
  const padding = 52;
  const xOffset = 8;
  const maxCount = Math.max(1, ...bins.map((bin) => bin.count));
  const barWidth = (width - padding * 2) / Math.max(bins.length, 1);
  const xTickIndices = bins.length
    ? [0, Math.floor((bins.length - 1) / 2), bins.length - 1]
    : [];
  const yTicks = [0, Math.round(maxCount / 2), maxCount];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
      <g transform={`translate(${xOffset} 0)`}>
        <rect
          x={padding}
          y={padding}
          width={width - padding * 2}
          height={height - padding * 2}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
        />
        {bins.map((bin, index) => {
          const barHeight =
            ((bin.count || 0) / maxCount) * (height - padding * 2);
          return (
            <rect
              key={`hist-${index}`}
              x={padding + index * barWidth + 2}
              y={height - padding - barHeight}
              width={Math.max(1, barWidth - 4)}
              height={barHeight}
              fill="rgba(167,139,250,0.7)"
            />
          );
        })}
        {xTickIndices.map((index) => (
          <text
            key={`hist-x-${index}`}
            x={padding + index * barWidth + barWidth / 2}
            y={height - padding + 16}
            textAnchor="middle"
            className="fill-[var(--muted)] text-[0.75rem]"
          >
            {bins[index]?.label ?? ""}
          </text>
        ))}
        {yTicks.map((value, index) => (
          <text
            key={`hist-y-${index}`}
            x={padding - 12}
            y={height - padding - (value / maxCount) * (height - padding * 2) + 4}
            textAnchor="end"
            className="fill-[var(--muted)] text-[0.75rem]"
          >
            {value}
          </text>
        ))}
        <text
          x={width / 2}
          y={height - 4}
          textAnchor="middle"
          className="fill-[var(--muted)] text-[0.8rem]"
        >
          {xLabel}
        </text>
        <text
          x={padding}
          y={padding - 8}
          textAnchor="start"
          className="fill-[var(--muted)] text-[0.8rem]"
        >
          {yLabel}
        </text>
      </g>
    </svg>
  );
};

const ChartCard = ({
  payload,
  outlierShotSet,
}: {
  payload: RadarChartPayload;
  outlierShotSet?: Set<number>;
}) => {
  if (payload.type === "scatter") {
    return (
      <ScatterPlot
        points={payload.points}
        color="#A78BFA"
        xLabel={payload.xLabel}
        yLabel={payload.yLabel}
        xUnit={payload.xUnit}
        yUnit={payload.yUnit}
        outlierShotSet={outlierShotSet}
      />
    );
  }
  if (payload.type === "line") {
    return (
      <LinePlot
        series={payload.series.map((series) => ({
          ...series,
          color: "#A78BFA",
        }))}
        xLabel={payload.xLabel}
        yLabel={payload.yLabel}
        yUnit={payload.yUnit}
        outlierShotSet={outlierShotSet}
      />
    );
  }
  if (payload.type === "hist") {
    return (
      <HistogramPlot
        bins={payload.bins}
        xLabel={payload.xLabel}
        yLabel={payload.yLabel}
      />
    );
  }
  if (payload.type === "table") {
    return (
      <div className="max-h-[240px] overflow-auto text-xs text-[var(--muted)]">
        <table className="min-w-full">
          <thead className="sticky top-0 bg-[var(--bg-elevated)]">
            <tr>
              {payload.columns.map((column) => (
                <th
                  key={column}
                  className="whitespace-nowrap border-b border-white/10 px-3 py-2 text-left text-[0.55rem] uppercase tracking-wide text-[var(--muted)]"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payload.rows.map((row, index) => (
              <tr
                key={`row-${index}`}
                className="border-b border-white/5 last:border-b-0"
              >
                {payload.columns.map((column) => (
                  <td key={`${index}-${column}`} className="px-3 py-2 text-[0.7rem]">
                    {row[column] ?? "-"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (payload.type === "matrix") {
    return (
      <div className="overflow-auto text-xs text-[var(--muted)]">
        <table className="min-w-full text-[0.7rem]">
          <thead className="sticky top-0 bg-[var(--bg-elevated)]">
            <tr>
              <th className="border-b border-white/10 px-2 py-2" />
              {payload.variables.map((variable) => (
                <th
                  key={`matrix-${variable}`}
                  className="border-b border-white/10 px-2 py-2 text-[0.55rem] uppercase tracking-wide text-[var(--muted)]"
                >
                  {variable}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payload.matrix.map((row, rowIndex) => (
              <tr key={`matrix-row-${rowIndex}`}>
                <td className="border-b border-white/10 px-2 py-2 text-[0.55rem] uppercase tracking-wide text-[var(--muted)]">
                  {payload.variables[rowIndex]}
                </td>
                {row.map((value, colIndex) => (
                  <td
                    key={`matrix-${rowIndex}-${colIndex}`}
                    className="border-b border-white/10 px-2 py-2 text-center"
                  >
                    {value.toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="space-y-2 text-xs text-[var(--muted)]">
      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
        <p className="text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
          {payload.model.name}
        </p>
        <p>R²: {payload.model.r2.toFixed(2)} — n={payload.model.n}</p>
        <div className="mt-2 text-[0.65rem] text-[var(--muted)]">
          {Object.entries(payload.model.coefficients).map(([key, value]) => (
            <div key={key} className="flex justify-between gap-2">
              <span>{key}</span>
              <span>{value.toFixed(3)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const downloadCsv = (filename: string, columns: string[], rows: Array<Record<string, unknown>>) => {
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };
  const header = columns.map(escape).join(",");
  const lines = rows.map((row) => columns.map((col) => escape(row[col])).join(","));
  const blob = new Blob([header, "\n", ...lines.map((line) => `${line}\n`)], {
    type: "text/csv;charset=utf-8;",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

export default function RadarCharts({
  columns,
  shots,
  stats,
  summary,
  config,
  analytics,
  compact = false,
}: RadarChartsProps) {
  const resolvedConfig = useMemo(
    () => ({
      ...defaultRadarConfig,
      ...(config ?? {}),
      charts: {
        ...defaultRadarConfig.charts,
        ...(config?.charts ?? {}),
      },
      thresholds: {
        ...defaultRadarConfig.thresholds,
        ...(config?.thresholds ?? {}),
      },
      options: {
        ...defaultRadarConfig.options,
        ...(config?.options ?? {}),
      },
    }),
    [config]
  );

  const metrics = useMemo(() => {
    const distanceLateral = findColumn(columns, ["distance_lateral", "lateral"]);
    const distanceTotal = findColumn(columns, ["distance_total", "total"]);
    const distanceCarry = findColumn(columns, ["distance_carry", "carry"]);
    const speedClub = findColumn(columns, ["speed_club", "club"]);
    const speedBall = findColumn(columns, ["speed_ball", "ball"]);
    const spinRate = findColumn(columns, ["spin_rpm", "rpm", "spin"]);
    const smash = findColumn(columns, ["smash_factor", "smash", "factor"]);
    const faceImpactLateral = findColumn(columns, [
      "face_impact_lateral",
      "face impact lateral",
      "impact lateral",
      "face lateral",
      "lateral impact",
      "impact x",
    ]);
    const faceImpactVertical = findColumn(columns, [
      "face_impact_vertical",
      "face impact vertical",
      "impact vertical",
      "face vertical",
      "vertical impact",
      "impact y",
    ]);

    return {
      distanceLateral,
      distanceTotal,
      distanceCarry,
      speedClub,
      speedBall,
      spinRate,
      smash,
      faceImpactLateral,
      faceImpactVertical,
    };
  }, [columns]);

  const dispersionPoints = useMemo(() => {
    const lateral = metrics.distanceLateral;
    const forward = metrics.distanceCarry ?? metrics.distanceTotal;
    if (!lateral || !forward) return [];
    return shots
      .map((shot) => {
        const x = shot[lateral.key];
        const y = shot[forward.key];
        if (typeof x !== "number" || typeof y !== "number") return null;
        const shotIndexRaw = shot.shot_index;
        const shotIndex =
          typeof shotIndexRaw === "number"
            ? shotIndexRaw
            : Number(shotIndexRaw ?? NaN);
        return {
          x,
          y,
          shotIndex: Number.isFinite(shotIndex) ? shotIndex : undefined,
        };
      })
      .filter(
        (point): point is { x: number; y: number; shotIndex: number | undefined } =>
          point !== null
      );
  }, [shots, metrics]);

  const meanLateral = useMemo(() => {
    if (!dispersionPoints.length) return null;
    const total = dispersionPoints.reduce((acc, point) => acc + point.x, 0);
    return total / dispersionPoints.length;
  }, [dispersionPoints]);

  const carrySeries = getNumericSeries(shots, metrics.distanceCarry?.key ?? null);
  const totalSeries = getNumericSeries(shots, metrics.distanceTotal?.key ?? null);
  const clubSeries = getNumericSeries(shots, metrics.speedClub?.key ?? null);
  const ballSeries = getNumericSeries(shots, metrics.speedBall?.key ?? null);
  const smashSeries = getNumericSeries(shots, metrics.smash?.key ?? null);

  const carryValues = carrySeries.map((entry) => entry.value);
  const totalValues = totalSeries.map((entry) => entry.value);
  const clubValues = clubSeries.map((entry) => entry.value);
  const ballValues = ballSeries.map((entry) => entry.value);
  const smashValues = smashSeries.map((entry) => entry.value);

  const spinCarryPoints = useMemo(() => {
    const distance = metrics.distanceCarry ?? metrics.distanceTotal;
    const spinRate = metrics.spinRate;
    if (!spinRate || !distance) return [];
    return shots
      .map((shot) => {
        const x = shot[spinRate.key];
        const y = shot[distance.key];
        if (typeof x !== "number" || typeof y !== "number") return null;
        const shotIndexRaw = shot.shot_index;
        const shotIndex =
          typeof shotIndexRaw === "number"
            ? shotIndexRaw
            : Number(shotIndexRaw ?? NaN);
        return {
          x,
          y,
          shotIndex: Number.isFinite(shotIndex) ? shotIndex : undefined,
        };
      })
      .filter(
        (point): point is { x: number; y: number; shotIndex: number | undefined } =>
          point !== null
      );
  }, [shots, metrics]);

  const faceImpactPoints = useMemo(() => {
    const faceLateral = metrics.faceImpactLateral;
    const faceVertical = metrics.faceImpactVertical;
    if (!faceLateral || !faceVertical) return [];
    return shots
      .map((shot) => {
        const x = shot[faceLateral.key];
        const y = shot[faceVertical.key];
        if (typeof x !== "number" || typeof y !== "number") return null;
        const shotIndexRaw = shot.shot_index;
        const shotIndex =
          typeof shotIndexRaw === "number"
            ? shotIndexRaw
            : Number(shotIndexRaw ?? NaN);
        return {
          x,
          y,
          shotIndex: Number.isFinite(shotIndex) ? shotIndex : undefined,
        };
      })
      .filter(
        (point): point is { x: number; y: number; shotIndex: number | undefined } =>
          point !== null
      );
  }, [shots, metrics]);

  const tableColumns = useMemo(() => {
    const shotColumn: RadarColumn = {
      key: "shot_index",
      group: "Shot",
      label: "#",
      unit: null,
    };
    const hasShot = columns.some((column) => column.key === "shot_index");
    return hasShot ? columns : [shotColumn, ...columns];
  }, [columns]);

  const advancedGroups = useMemo(() => {
    if (!analytics?.chartsData) return [];
    return RADAR_CHART_GROUPS.map((group) => {
      const charts = RADAR_CHART_DEFINITIONS.filter(
        (definition) => definition.group === group.key
      );
      return { ...group, charts };
    });
  }, [analytics]);

  const hasAdvancedSelection = useMemo(
    () =>
      advancedGroups.some((group) =>
        group.charts.some((chart) => resolvedConfig.charts[chart.key] !== false)
      ),
    [advancedGroups, resolvedConfig.charts]
  );

  const segmentTables = useMemo(() => {
    const segments = analytics?.segments as
      | {
          byShotType?: { summaries: Array<Record<string, unknown>> };
          byLeftRight?: { summaries: Array<Record<string, unknown>> };
          bySmashBin?: { summaries: Array<Record<string, unknown>> };
          byImpactZone?: { summaries: Array<Record<string, unknown>> };
          byAbsFtpQuantile?: { summaries: Array<Record<string, unknown>> };
          byLaunchVBin?: { summaries: Array<Record<string, unknown>> };
          byPeriodTertile?: { summaries: Array<Record<string, unknown>> };
        }
      | undefined;
    if (!segments) return [];
    const tables = [
      {
        key: "byShotType",
        label: "Par type de coup",
        description: "Compare les performances selon le type de coup.",
        data: segments.byShotType,
      },
      {
        key: "byLeftRight",
        label: "Gauche / droite",
        description: "Compare la dispersion selon la direction.",
        data: segments.byLeftRight,
      },
      {
        key: "bySmashBin",
        label: "Niveaux de smash",
        description: "Regroupe par tranches de smash factor.",
        data: segments.bySmashBin,
      },
      {
        key: "byImpactZone",
        label: "Zones d impact",
        description: "Analyse les resultats selon la zone de face.",
        data: segments.byImpactZone,
      },
      {
        key: "byAbsFtpQuantile",
        label: "Face/Path (quantiles)",
        description: "Compare l intensite du face/path.",
        data: segments.byAbsFtpQuantile,
      },
      {
        key: "byLaunchVBin",
        label: "Launch V (tranches)",
        description: "Regroupe par angle de lancement vertical.",
        data: segments.byLaunchVBin,
      },
      {
        key: "byPeriodTertile",
        label: "Debut / milieu / fin",
        description: "Observe la derive pendant la seance.",
        data: segments.byPeriodTertile,
      },
    ];
    return tables.filter((item) => item.data?.summaries?.length);
  }, [analytics]);

  const impactUnit = '"';

  const outlierShotSet = useMemo(() => {
    const flags = analytics?.outliers?.flags ?? {};
    const ranked = Object.entries(flags)
      .map(([key, list]) => ({
        shotIndex: Number(key),
        count: Array.isArray(list) ? list.length : 1,
      }))
      .filter((entry) => Number.isFinite(entry.shotIndex) && entry.shotIndex > 0)
      .sort((a, b) => b.count - a.count || a.shotIndex - b.shotIndex)
      .slice(0, 3)
      .map((entry) => entry.shotIndex);
    return new Set(ranked);
  }, [analytics]);

  const chartDescriptions: Record<string, string> = {
    dispersion:
      "Montre la dispersion laterale par rapport au carry pour evaluer la precision. Plus le nuage est compact, plus la dispersion est faible.",
    carryTotal:
      "Montre la difference entre le carry et la distance totale de la balle. L ecart reflete le roll apres l atterrissage.",
    speeds:
      "Compare la vitesse de tete de club et la vitesse de balle. Le ratio (smash) indique l efficacite de l impact.",
    spinCarry:
      "Met en relation le spin et le carry pour voir l impact du spin sur la distance. Un spin trop haut ou trop bas peut reduire la performance.",
    smash:
      "Montre l evolution du smash factor au fil des coups. Une courbe stable indique une frappe reguliere.",
    faceImpact:
      "Carte des impacts sur la face du club avec une heatmap de densite. Le centre ideal est proche de l intersection des axes.",
  };

  const chartComments = useMemo(() => {
    if (!analytics) return {};
    const comments: Record<string, string> = {};

    const withinLat10 = analytics.derived?.corridors?.withinLat10;
    const latStd = analytics.globalStats?.lateral?.std;
    if (withinLat10 !== null && withinLat10 !== undefined) {
      const label =
        withinLat10 >= 70
          ? "Dispersion serree: face et chemin sont bien controles, bon alignement et centrage."
          : withinLat10 >= 50
          ? "Dispersion moderee: la face ou le chemin varie, travailler l alignement et la stabilite d impact."
          : "Dispersion large: variations de face/chemin importantes, priorite au centrage et au plan de swing.";
      comments.dispersion = label;
    } else if (latStd !== null && latStd !== undefined) {
      const label =
        latStd <= 5
          ? "Dispersion serree: face et chemin sont bien controles, bon alignement et centrage."
          : latStd <= 10
          ? "Dispersion moderee: la face ou le chemin varie, travailler l alignement et la stabilite d impact."
          : "Dispersion large: variations de face/chemin importantes, priorite au centrage et au plan de swing.";
      comments.dispersion = label;
    }

    const carryMean = analytics.globalStats?.carry?.mean;
    const totalMean = analytics.globalStats?.total?.mean;
    const rollMean =
      carryMean !== null && carryMean !== undefined && totalMean !== null && totalMean !== undefined
        ? totalMean - carryMean
        : null;
    if (rollMean !== null && rollMean !== undefined) {
      const rollRatio =
        carryMean && Number.isFinite(carryMean) ? rollMean / carryMean : null;
      const rollLabel =
        rollRatio !== null && rollRatio < 0.05
          ? "Peu de roll: angle d atterrissage plus raide et/ou spin plus eleve."
          : rollRatio !== null && rollRatio > 0.12
          ? "Roll important: angle d atterrissage plus plat ou spin plus bas."
          : rollMean < 5
          ? "Peu de roll: angle d atterrissage plus raide et/ou spin plus eleve."
          : rollMean > 15
          ? "Roll important: angle d atterrissage plus plat ou spin plus bas."
          : "Roll modere: conditions de lancement equilibrees.";
      comments.carryTotal = rollLabel;
    }

    const smashMean = analytics.globalStats?.smash?.mean;
    if (smashMean !== null && smashMean !== undefined) {
      const smashLabel =
        smashMean >= 1.45
          ? "Contact tres efficace: centrage et vitesse de tete de club bien converts."
          : smashMean >= 1.35
          ? "Contact correct: marge de progression sur le centrage et la vitesse a l impact."
          : "Contact a travailler: centrage et qualite de compression insuffisants.";
      comments.speeds = smashLabel;
    }

    if (spinCarryPoints.length >= 6) {
      const meanX =
        spinCarryPoints.reduce((acc, point) => acc + point.x, 0) /
        spinCarryPoints.length;
      const meanY =
        spinCarryPoints.reduce((acc, point) => acc + point.y, 0) /
        spinCarryPoints.length;
      let numerator = 0;
      let denomX = 0;
      let denomY = 0;
      spinCarryPoints.forEach(({ x, y }) => {
        numerator += (x - meanX) * (y - meanY);
        denomX += (x - meanX) ** 2;
        denomY += (y - meanY) ** 2;
      });
      const r = denomX && denomY ? numerator / Math.sqrt(denomX * denomY) : null;
      if (r !== null) {
        comments.spinCarry =
          r <= -0.3
            ? "Plus de spin reduit le carry: verifier dynamique loft/angle d attaque."
            : r >= 0.3
            ? "Plus de spin augmente le carry: attention au rendement si le spin devient excessif."
            : "Lien faible spin/carry: la distance est surtout liee a la vitesse.";
      }
    }

    const smashStd = analytics.globalStats?.smash?.std;
    const smashCv =
      smashMean && smashStd ? smashStd / smashMean : analytics.globalStats?.smash?.cv;
    if (smashCv !== null && smashCv !== undefined) {
      const label =
        smashCv < 0.02
          ? "Smash tres regulier: contact constant et bon controle de la face."
          : smashCv < 0.05
          ? "Smash plutot regulier: stabiliser encore le centrage."
          : "Smash variable: contact incoherent, travailler centrage et tempo.";
      comments.smash = label;
    }

    if (faceImpactPoints.length) {
      const isDriver = isDriverClub(analytics.meta?.club);
      const halfW = (isDriver ? 5.0 : 3.35) / 2;
      const halfH = (isDriver ? 2.5 : 2.2) / 2;
      const meanNorm =
        faceImpactPoints.reduce((acc, point) => {
          const nx = point.x / halfW;
          const ny = point.y / halfH;
          return acc + Math.sqrt(nx * nx + ny * ny);
        }, 0) / faceImpactPoints.length;
      const label =
        meanNorm < 0.25
          ? "Impacts centres: bon controle de la face et de la profondeur de swing."
          : meanNorm < 0.4
          ? "Impacts plutot centres: leger decalage toe/heel a corriger."
          : "Impacts decentres: priorite au centrage pour stabiliser la vitesse et la direction.";
      comments.faceImpact = label;
    }

    return comments;
  }, [analytics, spinCarryPoints, faceImpactPoints]);


  const chartHighlights = useMemo(() => {
    if (!analytics) return {};
    const units = analytics.meta?.units ?? {};
    const highlights: Record<string, Array<{ value: string; label: string }>> = {};

    const latStd = analytics.globalStats?.lateral?.std;
    const withinLat10 = analytics.derived?.corridors?.withinLat10;
    const dispersionItems: Array<{ value: string; label: string } | null> = [
      withinLat10 !== null && withinLat10 !== undefined
        ? { value: `${Math.round(withinLat10)}%`, label: "Precision +-10" }
        : null,
      latStd !== null && latStd !== undefined
        ? {
            value: formatHighlightValue(latStd, 1) ?? "",
            label: `ET ${units.lateral ?? ""}`.trim(),
          }
        : null,
    ];
    highlights.dispersion = dispersionItems.filter(
      (item): item is { value: string; label: string } =>
        item !== null && item.value !== ""
    );

    const carryMean = analytics.globalStats?.carry?.mean;
    const totalMean = analytics.globalStats?.total?.mean;
    const rollMean =
      carryMean !== null && carryMean !== undefined && totalMean !== null && totalMean !== undefined
        ? totalMean - carryMean
        : null;
    const carryItems: Array<{ value: string; label: string } | null> = [
      carryMean !== null && carryMean !== undefined
        ? {
            value: formatHighlightValue(carryMean, 1) ?? "",
            label: `Carry ${units.carry ?? ""}`.trim(),
          }
        : null,
      totalMean !== null && totalMean !== undefined
        ? {
            value: formatHighlightValue(totalMean, 1) ?? "",
            label: `Total ${units.total ?? units.carry ?? ""}`.trim(),
          }
        : null,
      rollMean !== null && rollMean !== undefined
        ? {
            value: formatHighlightValue(rollMean, 1) ?? "",
            label: `Roll ${units.total ?? units.carry ?? ""}`.trim(),
          }
        : null,
    ];
    highlights.carryTotal = carryItems.filter(
      (item): item is { value: string; label: string } =>
        item !== null && item.value !== ""
    );

    const clubMean = analytics.globalStats?.club_speed?.mean;
    const ballMean = analytics.globalStats?.ball_speed?.mean;
    const smashMean = analytics.globalStats?.smash?.mean;
    const speedItems: Array<{ value: string; label: string } | null> = [
      clubMean !== null && clubMean !== undefined
        ? {
            value: formatHighlightValue(clubMean, 1) ?? "",
            label: `Club ${units.club_speed ?? ""}`.trim(),
          }
        : null,
      ballMean !== null && ballMean !== undefined
        ? {
            value: formatHighlightValue(ballMean, 1) ?? "",
            label: `Balle ${units.ball_speed ?? ""}`.trim(),
          }
        : null,
      smashMean !== null && smashMean !== undefined
        ? {
            value: formatHighlightValue(smashMean, 2) ?? "",
            label: "Smash",
          }
        : null,
    ];
    highlights.speeds = speedItems.filter(
      (item): item is { value: string; label: string } =>
        item !== null && item.value !== ""
    );

    const spinMean = analytics.globalStats?.spin_rpm?.mean;
    const spinItems: Array<{ value: string; label: string } | null> = [
      spinMean !== null && spinMean !== undefined
        ? {
            value: formatHighlightValue(spinMean, 0) ?? "",
            label: `Spin ${units.spin_rpm ?? ""}`.trim(),
          }
        : null,
      carryMean !== null && carryMean !== undefined
        ? {
            value: formatHighlightValue(carryMean, 1) ?? "",
            label: `Carry ${units.carry ?? ""}`.trim(),
          }
        : null,
    ];
    highlights.spinCarry = spinItems.filter(
      (item): item is { value: string; label: string } =>
        item !== null && item.value !== ""
    );

    const smashStd = analytics.globalStats?.smash?.std;
    const smashItems: Array<{ value: string; label: string } | null> = [
      smashMean !== null && smashMean !== undefined
        ? {
            value: formatHighlightValue(smashMean, 2) ?? "",
            label: "Smash",
          }
        : null,
      smashStd !== null && smashStd !== undefined
        ? {
            value: formatHighlightValue(smashStd, 2) ?? "",
            label: "ET",
          }
        : null,
    ];
    highlights.smash = smashItems.filter(
      (item): item is { value: string; label: string } =>
        item !== null && item.value !== ""
    );

    const impactLatMean = analytics.globalStats?.impact_lat?.mean;
    const impactVertMean = analytics.globalStats?.impact_vert?.mean;
    const impactItems: Array<{ value: string; label: string } | null> = [
      impactLatMean !== null && impactLatMean !== undefined
        ? {
            value: formatHighlightValue(impactLatMean, 2) ?? "",
            label: "Lat",
          }
        : null,
      impactVertMean !== null && impactVertMean !== undefined
        ? {
            value: formatHighlightValue(impactVertMean, 2) ?? "",
            label: "Vert",
          }
        : null,
    ];
    highlights.faceImpact = impactItems.filter(
      (item): item is { value: string; label: string } =>
        item !== null && item.value !== ""
    );

    return highlights;
  }, [analytics]);

  const chartTones = useMemo(() => {
    if (!analytics) {
      return {
        dispersion: "warn",
        carryTotal: "warn",
        speeds: "warn",
        spinCarry: "warn",
        smash: "warn",
        faceImpact: "warn",
      } as const;
    }
    const withinLat10 = analytics.derived?.corridors?.withinLat10;
    const latStd = analytics.globalStats?.lateral?.std;
    const dispersion =
      withinLat10 !== null && withinLat10 !== undefined
        ? withinLat10 >= 70
          ? "good"
          : withinLat10 >= 50
          ? "warn"
          : "bad"
        : latStd !== null && latStd !== undefined
        ? latStd <= 5
          ? "good"
          : latStd <= 10
          ? "warn"
          : "bad"
        : "warn";

    const carryMean = analytics.globalStats?.carry?.mean;
    const totalMean = analytics.globalStats?.total?.mean;
    const rollMean =
      carryMean !== null && carryMean !== undefined && totalMean !== null && totalMean !== undefined
        ? totalMean - carryMean
        : null;
    const rollRatio =
      rollMean !== null && carryMean && Number.isFinite(carryMean)
        ? rollMean / carryMean
        : null;
    const carryTotal =
      rollRatio !== null
        ? rollRatio >= 0.05 && rollRatio <= 0.12
          ? "good"
          : rollRatio < 0.04 || rollRatio > 0.15
          ? "bad"
          : "warn"
        : "warn";

    const smashMean = analytics.globalStats?.smash?.mean;
    const speeds =
      smashMean !== null && smashMean !== undefined
        ? smashMean >= 1.45
          ? "good"
          : smashMean >= 1.35
          ? "warn"
          : "bad"
        : "warn";

    let spinCarry: "good" | "warn" | "bad" = "warn";
    if (spinCarryPoints.length >= 6) {
      const meanX =
        spinCarryPoints.reduce((acc, point) => acc + point.x, 0) /
        spinCarryPoints.length;
      const meanY =
        spinCarryPoints.reduce((acc, point) => acc + point.y, 0) /
        spinCarryPoints.length;
      let numerator = 0;
      let denomX = 0;
      let denomY = 0;
      spinCarryPoints.forEach(({ x, y }) => {
        numerator += (x - meanX) * (y - meanY);
        denomX += (x - meanX) ** 2;
        denomY += (y - meanY) ** 2;
      });
      if (denomX && denomY) {
        const r = numerator / Math.sqrt(denomX * denomY);
        const abs = Math.abs(r);
        spinCarry = abs >= 0.5 ? "good" : abs >= 0.3 ? "warn" : "bad";
      }
    }

    const smashStd = analytics.globalStats?.smash?.std;
    const smashCv =
      smashMean && smashStd ? smashStd / smashMean : analytics.globalStats?.smash?.cv;
    const smash =
      smashCv !== null && smashCv !== undefined
        ? smashCv < 0.02
          ? "good"
          : smashCv < 0.05
          ? "warn"
          : "bad"
        : "warn";

    let faceImpact: "good" | "warn" | "bad" = "warn";
    if (faceImpactPoints.length) {
      const isDriver = isDriverClub(analytics.meta?.club);
      const halfW = (isDriver ? 5.0 : 3.35) / 2;
      const halfH = (isDriver ? 2.5 : 2.2) / 2;
      const meanNorm =
        faceImpactPoints.reduce((acc, point) => {
          const nx = point.x / halfW;
          const ny = point.y / halfH;
          return acc + Math.sqrt(nx * nx + ny * ny);
        }, 0) / faceImpactPoints.length;
      faceImpact = meanNorm < 0.25 ? "good" : meanNorm < 0.4 ? "warn" : "bad";
    }

    return { dispersion, carryTotal, speeds, spinCarry, smash, faceImpact } as const;
  }, [analytics, spinCarryPoints, faceImpactPoints]);

  const baseInsights = useMemo(() => {
    if (!analytics) return {};
    if (analytics.insights && Object.keys(analytics.insights).length) {
      return analytics.insights;
    }
    const units = analytics.meta?.units ?? {};
    const insights: Record<string, string> = {};
    const latMean = analytics.globalStats?.lateral?.mean;
    const latStd = analytics.globalStats?.lateral?.std;
    const withinLat10 = analytics.derived?.corridors?.withinLat10;
    const dispersionParts = [
      latMean !== null && latMean !== undefined
        ? `Moyenne laterale ${formatInsightValue(latMean, units.lateral)}`
        : null,
      latStd !== null && latStd !== undefined
        ? `ET ${formatInsightValue(latStd, units.lateral)}`
        : null,
      withinLat10 !== null && withinLat10 !== undefined
        ? `${withinLat10}% des coups dans ±10${units.lateral ? ` ${units.lateral}` : "m"}`
        : null,
    ].filter(Boolean);
    if (dispersionParts.length) insights.dispersion = dispersionParts.join(" - ");

    const carryMean = analytics.globalStats?.carry?.mean;
    const totalMean = analytics.globalStats?.total?.mean;
    const rollMean =
      carryMean !== null && carryMean !== undefined && totalMean !== null && totalMean !== undefined
        ? totalMean - carryMean
        : null;
    const carryParts = [
      carryMean !== null && carryMean !== undefined
        ? `Carry moyen ${formatInsightValue(carryMean, units.carry)}`
        : null,
      totalMean !== null && totalMean !== undefined
        ? `Total moyen ${formatInsightValue(totalMean, units.total ?? units.carry)}`
        : null,
      rollMean !== null && rollMean !== undefined
        ? `Roll moyen ${formatInsightValue(rollMean, units.total ?? units.carry)}`
        : null,
    ].filter(Boolean);
    if (carryParts.length) insights.carryTotal = carryParts.join(" - ");

    const clubMean = analytics.globalStats?.club_speed?.mean;
    const ballMean = analytics.globalStats?.ball_speed?.mean;
    const smashMean = analytics.globalStats?.smash?.mean;
    const speedRatio =
      clubMean && ballMean ? Number((ballMean / clubMean).toFixed(2)) : null;
    const speedParts = [
      clubMean !== null && clubMean !== undefined
        ? `Club moy. ${formatInsightValue(clubMean, units.club_speed)}`
        : null,
      ballMean !== null && ballMean !== undefined
        ? `Balle moy. ${formatInsightValue(ballMean, units.ball_speed)}`
        : null,
      smashMean !== null && smashMean !== undefined
        ? `Smash moy. ${formatInsightValue(smashMean, units.smash, 2)}`
        : null,
      speedRatio !== null ? `Ratio ${speedRatio}` : null,
    ].filter(Boolean);
    if (speedParts.length) insights.speeds = speedParts.join(" - ");

    const spinMean = analytics.globalStats?.spin_rpm?.mean;
    const spinParts = [
      spinMean !== null && spinMean !== undefined
        ? `Spin moyen ${formatInsightValue(spinMean, units.spin_rpm, 0)}`
        : null,
      carryMean !== null && carryMean !== undefined
        ? `Carry moyen ${formatInsightValue(carryMean, units.carry)}`
        : null,
    ].filter(Boolean);
    if (spinParts.length) insights.spinCarry = spinParts.join(" - ");

    const smashStd = analytics.globalStats?.smash?.std;
    const smashCv = analytics.globalStats?.smash?.cv;
    const smashParts = [
      smashMean !== null && smashMean !== undefined
        ? `Smash moyen ${formatInsightValue(smashMean, units.smash, 2)}`
        : null,
      smashStd !== null && smashStd !== undefined
        ? `ET ${formatInsightValue(smashStd, units.smash, 2)}`
        : null,
      smashCv !== null && smashCv !== undefined
        ? `CV ${formatInsightValue(smashCv, "%", 1)}`
        : null,
    ].filter(Boolean);
    if (smashParts.length) insights.smash = smashParts.join(" - ");

    const impactLatMean = analytics.globalStats?.impact_lat?.mean;
    const impactVertMean = analytics.globalStats?.impact_vert?.mean;
    const impactParts = [
      impactLatMean !== null && impactLatMean !== undefined
        ? `Lat. moy. ${formatInsightValue(impactLatMean, impactUnit)}`
        : null,
      impactVertMean !== null && impactVertMean !== undefined
        ? `Vert. moy. ${formatInsightValue(impactVertMean, impactUnit)}`
        : null,
    ].filter(Boolean);
    if (impactParts.length) insights.faceImpact = impactParts.join(" - ");

    return insights;
  }, [analytics]);

  const aiNarrativeMode = resolvedConfig.options?.aiNarrative ?? "off";
  const aiNarrativesFromConfig = resolvedConfig.options?.aiNarratives ?? null;
  const aiSelectionSummary = resolvedConfig.options?.aiSelectionSummary ?? null;
  const aiSessionSummary = resolvedConfig.options?.aiSessionSummary ?? null;
  const hasAiNarratives =
    !!aiNarrativesFromConfig &&
    Object.keys(aiNarrativesFromConfig).length > 0;
  const aiSyntax = resolvedConfig.options?.aiSyntax ?? "exp-tech-solution";
  const includeComparative =
    aiSyntax === "exp-comp" || aiSyntax === "global";
  const includeSolution =
    aiSyntax === "exp-solution" || aiSyntax === "exp-tech-solution" || aiSyntax === "global";
  const includeTechnique =
    aiSyntax === "exp-tech" || aiSyntax === "exp-tech-solution" || aiSyntax === "global";
  const aiSelectionKeys = resolvedConfig.options?.aiSelectionKeys ?? [];
  const aiSelectionSet = useMemo(() => new Set(aiSelectionKeys), [aiSelectionKeys]);
  const pgaBenchmark = useMemo(() => {
    const aiClub =
      typeof resolvedConfig.options?.aiAnswers?.club === "string"
        ? resolvedConfig.options?.aiAnswers?.club
        : null;
    const hint = aiClub && aiClub.toLowerCase() !== "mixte" ? aiClub : null;
    return findPgaBenchmark(hint ?? analytics?.meta?.club ?? null);
  }, [analytics?.meta?.club, resolvedConfig.options?.aiAnswers]);

  const pgaComparisons = useMemo(() => {
    if (!analytics || !pgaBenchmark) return {};
    const units = analytics.meta?.units ?? {};
    const comparisons: Record<string, string> = {};

    const clubSpeedMph = toMph(analytics.globalStats?.club_speed?.mean ?? null, units.club_speed);
    const ballSpeedMph = toMph(analytics.globalStats?.ball_speed?.mean ?? null, units.ball_speed);
    const smashMean = analytics.globalStats?.smash?.mean ?? null;
    const carryYds = toYards(analytics.globalStats?.carry?.mean ?? null, units.carry);
    const spinMean = analytics.globalStats?.spin_rpm?.mean ?? null;
    const launchMean = analytics.globalStats?.launch_v?.mean ?? null;
    const heightYds = toYards(analytics.globalStats?.height?.mean ?? null, units.height);
    const descentMean = analytics.globalStats?.descent_v?.mean ?? null;

    const speedDiffs: Array<{ label: string; delta: number; unit: string }> = [];
    if (clubSpeedMph !== null) {
      speedDiffs.push({
        label: "vitesse club",
        delta: clubSpeedMph - pgaBenchmark.club_speed_mph,
        unit: "mph",
      });
    }
    if (ballSpeedMph !== null) {
      speedDiffs.push({
        label: "vitesse balle",
        delta: ballSpeedMph - pgaBenchmark.ball_speed_mph,
        unit: "mph",
      });
    }
    if (smashMean !== null) {
      speedDiffs.push({
        label: "smash",
        delta: smashMean - pgaBenchmark.smash_factor,
        unit: "",
      });
    }
    if (speedDiffs.length) {
      const top = speedDiffs
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 2)
        .map((entry) =>
          entry.unit
            ? `${entry.label} ${formatDelta(entry.delta, entry.unit)}`
            : `${entry.label} ${entry.delta >= 0 ? "+" : ""}${entry.delta.toFixed(2)}`
        )
        .join(", ");
      comparisons.speeds = `PGA ${pgaBenchmark.club}: ${top}`;
    }

    if (carryYds !== null) {
      const delta = carryYds - pgaBenchmark.carry_yds;
      comparisons.carryTotal = `PGA ${pgaBenchmark.club}: carry ${formatDelta(delta, "yds")}`;
      comparisons.dispersion = comparisons.carryTotal;
    }

    if (spinMean !== null) {
      const delta = spinMean - pgaBenchmark.spin_rate_rpm;
      const base = `spin ${delta >= 0 ? "+" : ""}${Math.round(delta)} rpm`;
      comparisons.spinCarry = `PGA ${pgaBenchmark.club}: ${base}`;
    }

    if (launchMean !== null) {
      const delta = launchMean - pgaBenchmark.launch_angle_deg;
      comparisons.launch = `PGA ${pgaBenchmark.club}: launch ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} deg`;
    }
    if (heightYds !== null) {
      const delta = heightYds - pgaBenchmark.max_height_yds;
      comparisons.height = `PGA ${pgaBenchmark.club}: hauteur ${formatDelta(delta, "yds")}`;
    }
    if (descentMean !== null) {
      const delta = descentMean - pgaBenchmark.land_angle_deg;
      comparisons.descent = `PGA ${pgaBenchmark.club}: angle atterrissage ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} deg`;
    }
    if (smashMean !== null) {
      const delta = smashMean - pgaBenchmark.smash_factor;
      comparisons.smash = `PGA ${pgaBenchmark.club}: smash ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`;
    }

    return comparisons;
  }, [analytics, pgaBenchmark]);

  const aiNarratives = useMemo(() => {
    if (hasAiNarratives && aiNarrativesFromConfig) {
      return aiNarrativesFromConfig;
    }
    if (aiNarrativeMode === "off" || !analytics) return {};
    const units = analytics.meta?.units ?? {};
    const narratives: Record<string, { reason?: string | null; solution?: string | null }> = {};
    const latThreshold = resolvedConfig.thresholds?.latCorridorMeters?.[1] ?? 10;
    const lateralUnit =
      units.lateral ?? metrics.distanceLateral?.unit ?? "m";
    const distanceUnit =
      units.carry ??
      units.total ??
      metrics.distanceCarry?.unit ??
      metrics.distanceTotal?.unit ??
      "m";
    const withinLat10 = analytics.derived?.corridors?.withinLat10 ?? null;
    const latStd = analytics.globalStats?.lateral?.std ?? null;
    if (withinLat10 !== null && withinLat10 !== undefined) {
      const label =
        withinLat10 >= 70 ? "serree" : withinLat10 >= 50 ? "moderee" : "large";
      const baseReason = `dispersion ${label} (${Math.round(withinLat10)}% dans +/-${latThreshold} ${lateralUnit})`;
      const reason = includeComparative && pgaComparisons.dispersion
        ? `${baseReason} | ${pgaComparisons.dispersion}`
        : baseReason;
      const solution = includeSolution
        ? chartComments.dispersion
        : includeTechnique
        ? buildTechniqueOnly("dispersion")
        : null;
      narratives.dispersion = {
        reason,
        solution,
      };
    } else if (latStd !== null && latStd !== undefined) {
      const baseReason = `ET laterale ${formatTickValue(latStd, lateralUnit)}`;
      const reason = includeComparative && pgaComparisons.dispersion
        ? `${baseReason} | ${pgaComparisons.dispersion}`
        : baseReason;
      const solution = includeSolution
        ? chartComments.dispersion
        : includeTechnique
        ? buildTechniqueOnly("dispersion")
        : null;
      narratives.dispersion = { reason, solution };
    } else if (baseInsights.dispersion) {
      const baseReason = baseInsights.dispersion;
      const reason = includeComparative && pgaComparisons.dispersion
        ? `${baseReason} | ${pgaComparisons.dispersion}`
        : baseReason;
      const solution = includeSolution
        ? chartComments.dispersion
        : includeTechnique
        ? buildTechniqueOnly("dispersion")
        : null;
      narratives.dispersion = { reason, solution };
    }

    const carryMean = analytics.globalStats?.carry?.mean ?? null;
    const totalMean = analytics.globalStats?.total?.mean ?? null;
    const rollMean =
      carryMean !== null && totalMean !== null ? totalMean - carryMean : null;
    if (rollMean !== null) {
      const baseReason = `ecart carry/total ${formatTickValue(rollMean, distanceUnit)}`;
      const reason = includeComparative && pgaComparisons.carryTotal
        ? `${baseReason} | ${pgaComparisons.carryTotal}`
        : baseReason;
      const solution = includeSolution
        ? chartComments.carryTotal
        : includeTechnique
        ? buildTechniqueOnly("carryTotal")
        : null;
      narratives.carryTotal = { reason, solution };
    } else if (baseInsights.carryTotal) {
      const baseReason = baseInsights.carryTotal;
      const reason = includeComparative && pgaComparisons.carryTotal
        ? `${baseReason} | ${pgaComparisons.carryTotal}`
        : baseReason;
      const solution = includeSolution
        ? chartComments.carryTotal
        : includeTechnique
        ? buildTechniqueOnly("carryTotal")
        : null;
      narratives.carryTotal = { reason, solution };
    }

    const smashMean = analytics.globalStats?.smash?.mean ?? null;
    const clubMean = analytics.globalStats?.club_speed?.mean ?? null;
    const ballMean = analytics.globalStats?.ball_speed?.mean ?? null;
    if (smashMean !== null && smashMean !== undefined) {
      const baseReason = `smash moyen ${smashMean.toFixed(2)}`;
      const reason = includeComparative && pgaComparisons.speeds
        ? `${baseReason} | ${pgaComparisons.speeds}`
        : baseReason;
      const solution = includeSolution
        ? chartComments.speeds
        : includeTechnique
        ? buildTechniqueOnly("speeds")
        : null;
      narratives.speeds = { reason, solution };
    } else if (clubMean && ballMean) {
      const baseReason = `ratio balle/club ${(ballMean / clubMean).toFixed(2)}`;
      const reason = includeComparative && pgaComparisons.speeds
        ? `${baseReason} | ${pgaComparisons.speeds}`
        : baseReason;
      const solution = includeSolution
        ? chartComments.speeds
        : includeTechnique
        ? buildTechniqueOnly("speeds")
        : null;
      narratives.speeds = { reason, solution };
    } else if (baseInsights.speeds) {
      const baseReason = baseInsights.speeds;
      const reason = includeComparative && pgaComparisons.speeds
        ? `${baseReason} | ${pgaComparisons.speeds}`
        : baseReason;
      const solution = includeSolution
        ? chartComments.speeds
        : includeTechnique
        ? buildTechniqueOnly("speeds")
        : null;
      narratives.speeds = { reason, solution };
    }

    if (spinCarryPoints.length >= 6) {
      const meanX =
        spinCarryPoints.reduce((acc, point) => acc + point.x, 0) /
        spinCarryPoints.length;
      const meanY =
        spinCarryPoints.reduce((acc, point) => acc + point.y, 0) /
        spinCarryPoints.length;
      let numerator = 0;
      let denomX = 0;
      let denomY = 0;
      spinCarryPoints.forEach(({ x, y }) => {
        numerator += (x - meanX) * (y - meanY);
        denomX += (x - meanX) ** 2;
        denomY += (y - meanY) ** 2;
      });
      if (denomX && denomY) {
        const r = numerator / Math.sqrt(denomX * denomY);
        const abs = Math.abs(r);
        const strength =
          abs < 0.2
            ? "faible"
            : abs < 0.5
            ? "moderee"
            : abs < 0.7
            ? "marquee"
            : "forte";
        const baseReason = `relation ${strength} spin/carry (r=${r.toFixed(2)})`;
        const reason = includeComparative && pgaComparisons.spinCarry
          ? `${baseReason} | ${pgaComparisons.spinCarry}`
          : baseReason;
        const solution = includeSolution
          ? chartComments.spinCarry
          : includeTechnique
          ? buildTechniqueOnly("spinCarry")
          : null;
        narratives.spinCarry = { reason, solution };
      }
    } else if (baseInsights.spinCarry) {
      const baseReason = baseInsights.spinCarry;
      const reason = includeComparative && pgaComparisons.spinCarry
        ? `${baseReason} | ${pgaComparisons.spinCarry}`
        : baseReason;
      const solution = includeSolution
        ? chartComments.spinCarry
        : includeTechnique
        ? buildTechniqueOnly("spinCarry")
        : null;
      narratives.spinCarry = { reason, solution };
    }

    if (smashValues.length >= 2) {
      const min = Math.min(...smashValues);
      const max = Math.max(...smashValues);
      const range = max - min;
      const baseReason = `amplitude smash ${range.toFixed(2)}`;
      const reason = includeComparative && pgaComparisons.smash
        ? `${baseReason} | ${pgaComparisons.smash}`
        : baseReason;
      const solution = includeSolution
        ? chartComments.smash
        : includeTechnique
        ? buildTechniqueOnly("smash")
        : null;
      narratives.smash = { reason, solution };
    } else if (baseInsights.smash) {
      const baseReason = baseInsights.smash;
      const reason = includeComparative && pgaComparisons.smash
        ? `${baseReason} | ${pgaComparisons.smash}`
        : baseReason;
      const solution = includeSolution
        ? chartComments.smash
        : includeTechnique
        ? buildTechniqueOnly("smash")
        : null;
      narratives.smash = { reason, solution };
    }

    if (faceImpactPoints.length) {
      const meanX =
        faceImpactPoints.reduce((acc, point) => acc + point.x, 0) /
        faceImpactPoints.length;
      const meanY =
        faceImpactPoints.reduce((acc, point) => acc + point.y, 0) /
        faceImpactPoints.length;
      const dist = Math.sqrt(meanX * meanX + meanY * meanY);
      const baseReason = `centrage moyen ${formatTickValue(dist, impactUnit)}`;
      const reason = includeComparative && pgaComparisons.faceImpact
        ? `${baseReason} | ${pgaComparisons.faceImpact}`
        : baseReason;
      const solution = includeSolution
        ? chartComments.faceImpact
        : includeTechnique
        ? buildTechniqueOnly("faceImpact")
        : null;
      narratives.faceImpact = { reason, solution };
    } else if (baseInsights.faceImpact) {
      const baseReason = baseInsights.faceImpact;
      const reason = includeComparative && pgaComparisons.faceImpact
        ? `${baseReason} | ${pgaComparisons.faceImpact}`
        : baseReason;
      const solution = includeSolution
        ? chartComments.faceImpact
        : includeTechnique
        ? buildTechniqueOnly("faceImpact")
        : null;
      narratives.faceImpact = { reason, solution };
    }

    Object.entries(analytics.chartsData ?? {}).forEach(([key, data]) => {
      if (!data?.payload) return;
      const baseReason =
        data.payload.insight ??
        computeInsightFromPayload(data.payload) ??
        null;
      const reason =
        includeComparative && pgaComparisons[key]
          ? `${baseReason ?? ""}${baseReason ? " | " : ""}${pgaComparisons[key]}`
          : baseReason;
      const solution = includeSolution
        ? buildPayloadCommentary(data.payload)
        : includeTechnique
        ? buildTechniqueHint([data.payload.title ?? ""]) ?? null
        : null;
      if (reason || solution) {
        narratives[key] = { reason, solution };
      }
    });

    return narratives;
  }, [
    aiNarrativeMode,
    hasAiNarratives,
    aiNarrativesFromConfig,
    analytics,
    metrics.distanceCarry?.unit,
    metrics.distanceLateral?.unit,
    metrics.distanceTotal?.unit,
    resolvedConfig.thresholds?.latCorridorMeters,
    chartComments,
    baseInsights,
    includeComparative,
    includeSolution,
    includeTechnique,
    pgaComparisons,
    spinCarryPoints,
    smashValues,
    faceImpactPoints,
    impactUnit,
  ]);

  const resolveAiNarrative = (key: string) => {
    const fromConfig = aiNarrativesFromConfig?.[key];
    if (fromConfig) return fromConfig;
    if (aiNarrativeMode !== "per-chart" || !aiSelectionSet.has(key)) {
      return null;
    }
    return aiNarratives[key] ?? null;
  };

  const aiNarrativeDispersion = resolveAiNarrative("dispersion");
  const aiNarrativeCarryTotal = resolveAiNarrative("carryTotal");
  const aiNarrativeSpeeds = resolveAiNarrative("speeds");
  const aiNarrativeSpinCarry = resolveAiNarrative("spinCarry");
  const aiNarrativeSmash = resolveAiNarrative("smash");
  const aiNarrativeFaceImpact = resolveAiNarrative("faceImpact");

const buildSegmentInsight = (summaries: Array<Record<string, unknown>>) => {
    if (!summaries.length) return null;
    const pickNumeric = (
      key: string,
      predicate?: (value: number) => boolean
    ) => {
      let best: { row: Record<string, unknown>; value: number } | null = null;
      summaries.forEach((row) => {
        const value = Number(row[key]);
        if (!Number.isFinite(value)) return;
        if (predicate && !predicate(value)) return;
        if (!best || value > best.value) {
          best = { row, value };
        }
      });
      return best;
    };
    const precision = pickNumeric("withinLat10");
    if (precision) {
      return `Meilleure precision: ${precision.row.key ?? "groupe"} (${precision.value}% dans ±10 m).`;
    }
    const carry = pickNumeric("carry_mean");
    if (carry) {
      return `Carry moyen le plus eleve: ${carry.row.key ?? "groupe"} (${carry.value.toFixed(
        1
      )}).`;
    }
    const smash = pickNumeric("smash_mean");
    if (smash) {
      return `Smash moyen le plus eleve: ${smash.row.key ?? "groupe"} (${smash.value.toFixed(
        2
      )}).`;
    }
    return null;
  };

  const prettifyMetricLabel = (key: string) => {
    const cleaned = key.toLowerCase();
    const map: Record<string, string> = {
      carry_mean: "Carry moy",
      total_mean: "Total moy",
      roll_mean: "Roll moy",
      smash_mean: "Smash moy",
      club_speed_mean: "Club moy",
      ball_speed_mean: "Balle moy",
      spin_rpm_mean: "Spin moy",
      launch_v_mean: "Launch V moy",
      launch_h_mean: "Launch H moy",
      height_mean: "Height moy",
      lateral_mean: "Lateral moy",
      radial_miss_mean: "Dispersion moy",
      withinlat10: "Precision +/-10",
      withinlat5: "Precision +/-5",
      withindist10: "Precision dist +/-10",
      withindist5: "Precision dist +/-5",
      impact_lat_mean: "Impact lat moy",
      impact_vert_mean: "Impact vert moy",
    };
    if (map[cleaned]) return map[cleaned];
    return key.replace(/_/g, " ");
  };

  const formatSegmentValue = (key: string, value: unknown) => {
    if (value === null || value === undefined) return "-";
    if (typeof value === "number" && Number.isFinite(value)) {
      const isPercent =
        key.toLowerCase().startsWith("within") ||
        key.toLowerCase().includes("percent") ||
        key.toLowerCase().includes("pct");
      const rounded = Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1);
      return isPercent ? `${rounded}%` : rounded.replace(/\.0$/, "");
    }
    return String(value);
  };

  const pickRowLabel = (row: Record<string, unknown>, index: number) =>
    (row.Groupe ??
      row.GROUP ??
      row.Group ??
      row.group ??
      row.key ??
      row.label ??
      row.type ??
      row.shot_type ??
      row.Zone ??
      row.zone ??
      `Groupe ${index + 1}`) as string;

  const buildSegmentAnalysis = (
    summaries: Array<Record<string, unknown>>,
    segmentKey: string
  ) => {
    if (!summaries.length) return null;
    const numericKeys = Object.keys(summaries[0] ?? {}).filter((key) => {
      const lower = key.toLowerCase();
      if (lower === "count") return false;
      return summaries.some((row) => typeof row[key] === "number");
    });
    if (!numericKeys.length) return null;
    const preferred = [
      "carry_mean",
      "total_mean",
      "smash_mean",
      "club_speed_mean",
      "ball_speed_mean",
      "spin_rpm_mean",
      "launch_v_mean",
      "launch_h_mean",
      "height_mean",
      "lateral_mean",
      "radial_miss_mean",
      "withinLat10",
      "withinLat5",
      "withinDist10",
      "withinDist5",
    ];
    const metricKey =
      preferred.find((key) => numericKeys.includes(key)) ?? numericKeys[0];
    const lowerMetric = metricKey.toLowerCase();
    const lowerIsBetter =
      lowerMetric.includes("std") ||
      lowerMetric.includes("miss") ||
      lowerMetric.includes("dispersion");
    const best = summaries.reduce(
      (current, row, index) => {
        const value = row[metricKey];
        if (typeof value !== "number" || !Number.isFinite(value)) return current;
        if (!current) return { row, value, index };
        if (lowerIsBetter ? value < current.value : value > current.value) {
          return { row, value, index };
        }
        return current;
      },
      null as { row: Record<string, unknown>; value: number; index: number } | null
    );
    if (!best) return null;
    const label = pickRowLabel(best.row, best.index);
    const metricLabel = prettifyMetricLabel(metricKey);
    const valueLabel = formatSegmentValue(metricKey, best.value);
    const opener =
      segmentKey === "byPeriodTertile"
        ? "Evolution sur la seance."
        : "Comparatif par segments.";
    return `${opener} ${label} ressort sur ${metricLabel} (${valueLabel}).`;
  };

  const chartHeight = compact ? "h-72" : "h-[24rem]";
  const tallChartHeight = compact ? "h-[26rem]" : "h-[30rem]";
  const distanceForward = metrics.distanceCarry ?? metrics.distanceTotal;
  const distanceUnit = distanceForward?.unit;
  const distanceAxisLabel = formatAxisLabel("Distance", distanceUnit);
  const spinDistanceLabel = formatAxisLabel(
    metrics.distanceCarry ? "Carry" : metrics.distanceTotal ? "Total" : "Distance",
    distanceUnit
  );
  const distanceLateralLabel = formatAxisLabel(
    metrics.distanceLateral?.label ?? "Lateral",
    metrics.distanceLateral?.unit
  );
  const speedLabel = formatAxisLabel(
    "Vitesse",
    metrics.speedClub?.unit ?? metrics.speedBall?.unit
  );
  const spinLabel = formatAxisLabel(
    metrics.spinRate?.label ?? "Spin",
    metrics.spinRate?.unit
  );
  const smashLabel = formatAxisLabel(
    metrics.smash?.label ?? "Smash factor",
    metrics.smash?.unit
  );
  const impactXLabel = formatAxisLabel("Lateral", impactUnit);
  const impactYLabel = formatAxisLabel("Vertical", impactUnit);

  return (
    <div className="space-y-4">
      {resolvedConfig.showSummary ? (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
          {summary || analytics?.summary || "Synthese indisponible."}
        </div>
      ) : null}

      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
        <p className="text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
          Guide de lecture
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-[0.65rem] text-[var(--muted)]">
          <span className="inline-flex items-center gap-2">
            <StarIcon className="h-3 w-3 text-[#facc15]" />
            Commentaire coaching + piste
          </span>
          <span className="inline-flex items-center gap-2">
            <ThumbIcon className="h-4 w-4 text-[#22c55e]" />
            <ThumbIcon className="h-4 w-4 text-[#f59e0b]" />
            <ThumbIcon className="h-4 w-4 text-[#ef4444]" />
            Evaluation globale
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ef4444]" />
            {`Coups aberrants (${outlierShotSet.size})`}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-[1px] w-6 border-t border-dashed border-white/50" />
            Lignes moyennes X/Y
          </span>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {resolvedConfig.charts.dispersion ? (
          <div className="panel-soft rounded-2xl p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted)] underline decoration-white/30 underline-offset-2">
                  Dispersion
                </p>
                <ThumbBadge tone={chartTones.dispersion} />
              </div>
              <ChartHeaderRight
                count={dispersionPoints.length}
                highlights={chartHighlights.dispersion ?? []}
              />
            </div>
            {dispersionPoints.length > 0 ? (
              <div className="mt-3 flex flex-col gap-3">
                <div className={chartHeight}>
                  <DispersionPlot
                    points={dispersionPoints}
                    color="#6EE7B7"
                    xLabel={distanceLateralLabel}
                    yLabel={distanceAxisLabel}
                    xUnit={metrics.distanceLateral?.unit}
                    yUnit={distanceUnit}
                    outlierShotSet={outlierShotSet}
                  />
                </div>
                <ChartLegend
                  items={[
                    { label: "Coups", color: "#6EE7B7" },
                    { label: "Zone moyenne", color: "rgba(110,231,183,0.6)" },
                  ]}
                />
                <ChartDescription text={chartDescriptions.dispersion} />
                {aiNarrativeDispersion ? (
                  <AiNarrative
                    reason={aiNarrativeDispersion?.reason}
                    solution={aiNarrativeDispersion?.solution}
                  />
                ) : (
                  <ChartCommentary text={chartComments.dispersion} />
                )}
                <InsightText text={baseInsights.dispersion} />
              </div>
            ) : (
              <div className={`${tallChartHeight} mt-3 flex items-center justify-center text-xs text-[var(--muted)]`}>
                Donnees insuffisantes
              </div>
            )}
          </div>
        ) : null}

        {resolvedConfig.charts.carryTotal ? (
          <div className="panel-soft rounded-2xl p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted)] underline decoration-white/30 underline-offset-2">
                  Carry vs total
                </p>
                <ThumbBadge tone={chartTones.carryTotal} />
              </div>
              <ChartHeaderRight
                count={Math.max(carryValues.length, totalValues.length)}
                highlights={chartHighlights.carryTotal ?? []}
              />
            </div>
            {carryValues.length > 0 || totalValues.length > 0 ? (
              <div className="mt-3 flex flex-col gap-3">
                <div className={chartHeight}>
                  <LinePlot
                    series={[
                      {
                        label: "Carry",
                        color: "#93C5FD",
                        values: carryValues,
                        shotIndices: carrySeries.map((entry) => entry.shotIndex),
                      },
                      {
                        label: "Total",
                        color: "#6EE7B7",
                        values: totalValues,
                        shotIndices: totalSeries.map((entry) => entry.shotIndex),
                      },
                    ]}
                    xLabel="Coups"
                    yLabel={distanceAxisLabel}
                    yUnit={distanceUnit}
                    outlierShotSet={outlierShotSet}
                  />
                </div>
                <ChartLegend
                  items={[
                    { label: "Carry", color: "#93C5FD" },
                    { label: "Total", color: "#6EE7B7" },
                  ]}
                />
                <ChartDescription text={chartDescriptions.carryTotal} />
                {aiNarrativeCarryTotal ? (
                  <AiNarrative
                    reason={aiNarrativeCarryTotal?.reason}
                    solution={aiNarrativeCarryTotal?.solution}
                  />
                ) : (
                  <ChartCommentary text={chartComments.carryTotal} />
                )}
                <InsightText text={baseInsights.carryTotal} />
              </div>
            ) : (
              <div className={`${chartHeight} mt-3 flex items-center justify-center text-xs text-[var(--muted)]`}>
                Donnees insuffisantes
              </div>
            )}
          </div>
        ) : null}

        {resolvedConfig.charts.speeds ? (
          <div className="panel-soft rounded-2xl p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted)] underline decoration-white/30 underline-offset-2">
                  Vitesse club / balle
                </p>
                <ThumbBadge tone={chartTones.speeds} />
              </div>
              <ChartHeaderRight
                count={Math.max(clubValues.length, ballValues.length)}
                highlights={chartHighlights.speeds ?? []}
              />
            </div>
            {clubValues.length > 0 || ballValues.length > 0 ? (
              <div className="mt-3 flex flex-col gap-3">
                <div className={chartHeight}>
                  <LinePlot
                    series={[
                      {
                        label: "Club",
                        color: "#FDE68A",
                        values: clubValues,
                        shotIndices: clubSeries.map((entry) => entry.shotIndex),
                      },
                      {
                        label: "Balle",
                        color: "#93C5FD",
                        values: ballValues,
                        shotIndices: ballSeries.map((entry) => entry.shotIndex),
                      },
                    ]}
                    xLabel="Coups"
                    yLabel={speedLabel}
                    yUnit={metrics.speedClub?.unit ?? metrics.speedBall?.unit}
                    outlierShotSet={outlierShotSet}
                  />
                </div>
                <ChartLegend
                  items={[
                    { label: "Club", color: "#FDE68A" },
                    { label: "Balle", color: "#93C5FD" },
                  ]}
                />
                <ChartDescription text={chartDescriptions.speeds} />
                {aiNarrativeSpeeds ? (
                  <AiNarrative
                    reason={aiNarrativeSpeeds?.reason}
                    solution={aiNarrativeSpeeds?.solution}
                  />
                ) : (
                  <ChartCommentary text={chartComments.speeds} />
                )}
                <InsightText text={baseInsights.speeds} />
              </div>
            ) : (
              <div className={`${chartHeight} mt-3 flex items-center justify-center text-xs text-[var(--muted)]`}>
                Donnees insuffisantes
              </div>
            )}
          </div>
        ) : null}

        {resolvedConfig.charts.spinCarry ? (
          <div className="panel-soft rounded-2xl p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted)] underline decoration-white/30 underline-offset-2">
                  Spin vs carry
                </p>
                <ThumbBadge tone={chartTones.spinCarry} />
              </div>
              <ChartHeaderRight
                count={spinCarryPoints.length}
                highlights={chartHighlights.spinCarry ?? []}
              />
            </div>
            {spinCarryPoints.length > 0 ? (
              <div className="mt-3 flex flex-col gap-3">
                <div className={chartHeight}>
                  <ScatterPlot
                    points={spinCarryPoints}
                    color="#FCA5A5"
                    xLabel={spinLabel}
                    yLabel={spinDistanceLabel}
                    xUnit={metrics.spinRate?.unit}
                    yUnit={distanceUnit}
                    outlierShotSet={outlierShotSet}
                  />
                </div>
                <ChartLegend items={[{ label: "Coups", color: "#FCA5A5" }]} />
                <ChartDescription text={chartDescriptions.spinCarry} />
                {aiNarrativeSpinCarry ? (
                  <AiNarrative
                    reason={aiNarrativeSpinCarry?.reason}
                    solution={aiNarrativeSpinCarry?.solution}
                  />
                ) : (
                  <ChartCommentary text={chartComments.spinCarry} />
                )}
                <InsightText text={baseInsights.spinCarry} />
              </div>
            ) : (
              <div className={`${chartHeight} mt-3 flex items-center justify-center text-xs text-[var(--muted)]`}>
                Donnees insuffisantes
              </div>
            )}
          </div>
        ) : null}

        {resolvedConfig.charts.smash ? (
          <div className="panel-soft rounded-2xl p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted)] underline decoration-white/30 underline-offset-2">
                  Smash factor
                </p>
                <ThumbBadge tone={chartTones.smash} />
              </div>
              <ChartHeaderRight
                count={smashValues.length}
                highlights={chartHighlights.smash ?? []}
              />
            </div>
            {smashValues.length > 0 ? (
              <div className="mt-3 flex flex-col gap-3">
                <div className={chartHeight}>
                  <LinePlot
                    series={[
                      {
                        label: "Smash",
                        color: "#6EE7B7",
                        values: smashValues,
                        shotIndices: smashSeries.map((entry) => entry.shotIndex),
                      },
                    ]}
                    xLabel="Coups"
                    yLabel={smashLabel}
                    yUnit={metrics.smash?.unit}
                    outlierShotSet={outlierShotSet}
                  />
                </div>
                <ChartLegend items={[{ label: "Smash", color: "#6EE7B7" }]} />
                <ChartDescription text={chartDescriptions.smash} />
                {aiNarrativeSmash ? (
                  <AiNarrative
                    reason={aiNarrativeSmash?.reason}
                    solution={aiNarrativeSmash?.solution}
                  />
                ) : (
                  <ChartCommentary text={chartComments.smash} />
                )}
                <InsightText text={baseInsights.smash} />
              </div>
            ) : (
              <div className={`${chartHeight} mt-3 flex items-center justify-center text-xs text-[var(--muted)]`}>
                Donnees insuffisantes
              </div>
            )}
          </div>
        ) : null}

        {resolvedConfig.charts.faceImpact ? (
          <div className="panel-soft rounded-2xl p-4 md:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted)] underline decoration-white/30 underline-offset-2">
                  Impact face
                </p>
                <ThumbBadge tone={chartTones.faceImpact} />
              </div>
              <ChartHeaderRight
                count={faceImpactPoints.length}
                highlights={chartHighlights.faceImpact ?? []}
              />
            </div>
            {faceImpactPoints.length > 0 ? (
              <div className="mt-3 flex flex-col gap-3">
                <div className={tallChartHeight}>
                  <FaceImpactHeatmap
                    points={faceImpactPoints}
                    xLabel={impactXLabel}
                    yLabel={impactYLabel}
                    xUnit={impactUnit}
                    yUnit={impactUnit}
                    club={analytics?.meta?.club ?? null}
                    outlierShotSet={outlierShotSet}
                  />
                </div>
                <ChartLegend
                  items={[
                    { label: "Heatmap", color: "rgba(251,146,60,0.8)" },
                    { label: "Coups", color: "rgba(255,255,255,0.8)" },
                  ]}
                />
                <ChartDescription text={chartDescriptions.faceImpact} />
                {aiNarrativeFaceImpact ? (
                  <AiNarrative
                    reason={aiNarrativeFaceImpact?.reason}
                    solution={aiNarrativeFaceImpact?.solution}
                  />
                ) : (
                  <ChartCommentary text={chartComments.faceImpact} />
                )}
                <InsightText text={baseInsights.faceImpact} />
              </div>
            ) : (
              <div className={`${tallChartHeight} mt-3 flex items-center justify-center text-xs text-[var(--muted)]`}>
                Donnees insuffisantes
              </div>
            )}
          </div>
        ) : null}
      </div>

      {analytics?.chartsData && hasAdvancedSelection ? (
        <details className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <summary className="cursor-pointer text-xs uppercase tracking-wide text-[var(--muted)]">
            Analyses avancees
          </summary>
          <div className="mt-4 space-y-6">
            {advancedGroups.map((group) => {
              const availableCharts = group.charts.filter(
                (chart) => resolvedConfig.charts[chart.key] !== false
              );
              if (!availableCharts.length) return null;
              return (
                <div key={group.key} className="space-y-3">
                  <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    {group.label}
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {availableCharts.map((chart) => {
                      const chartData = analytics.chartsData[chart.key];
                      const advancedCommentary = chartData?.payload
                        ? buildPayloadCommentary(chartData.payload)
                        : null;
                      const advancedHighlights = chartData?.payload
                        ? buildPayloadHighlights(chartData.payload)
                        : [];
                      const advancedTone = chartData?.payload
                        ? buildPayloadTone(chartData.payload)
                        : "warn";
                      const advancedCount = chartData?.payload
                        ? chartData.payload.type === "scatter"
                          ? chartData.payload.points.length
                          : chartData.payload.type === "line"
                          ? chartData.payload.series[0]?.values.length ?? null
                          : chartData.payload.type === "hist"
                          ? chartData.payload.bins.reduce(
                              (acc, bin) => acc + bin.count,
                              0
                            )
                          : chartData.payload.type === "matrix"
                          ? chartData.payload.variables.length
                          : chartData.payload.type === "model"
                          ? chartData.payload.model.n
                          : null
                        : null;
                      const chartNarrative = resolveAiNarrative(chart.key);
                      return (
                          <div key={chart.key} className="panel-soft rounded-2xl p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="text-xs uppercase tracking-wide text-[var(--muted)] underline decoration-white/30 underline-offset-2">
                                  {chart.title}
                                </p>
                                <ThumbBadge tone={advancedTone} />
                              </div>
                              <ChartHeaderRight
                                count={advancedCount}
                                highlights={advancedHighlights}
                              />
                            </div>
                            <div className="mt-3">
                              {chartData?.available && chartData.payload ? (
                              <div
                                className={
                                  chartData.payload.type === "scatter" ||
                                  chartData.payload.type === "line" ||
                                  chartData.payload.type === "hist"
                                    ? "h-[18rem]"
                                    : ""
                                }
                              >
                                <ChartCard
                                  payload={chartData.payload}
                                  outlierShotSet={outlierShotSet}
                                />
                              </div>
                              ) : (
                                <div className="flex h-32 items-center justify-center text-xs text-[var(--muted)]">
                                  Donnees insuffisantes
                                </div>
                              )}
                            {chartData?.payload ? (
                              <>
                                <ChartDescription text={chart.description} />
                                {chartNarrative ? (
                                  <AiNarrative
                                    reason={chartNarrative?.reason}
                                    solution={chartNarrative?.solution}
                                  />
                                ) : (
                                  <ChartCommentary text={advancedCommentary} />
                                )}
                                <InsightText
                                  text={
                                    chartData.payload.insight ??
                                    computeInsightFromPayload(chartData.payload)
                                  }
                                />
                              </>
                            ) : null}
                            {chartData?.payload?.notes ? (
                              <p className="mt-1 text-[0.6rem] text-[var(--muted)]">
                                {chartData.payload.notes}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      ) : null}

      {aiSelectionSummary || aiSessionSummary ? (
        <AiSessionSummary
          selectionSummary={aiSelectionSummary}
          sessionSummary={aiSessionSummary}
        />
      ) : null}

      {resolvedConfig.showSegments && segmentTables.length ? (
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Comparatifs & segments
          </p>
          {segmentTables.map((table) => {
            const summaries = table.data?.summaries ?? [];
            const columnKeys = summaries.length ? Object.keys(summaries[0]) : [];
            const analysis = buildSegmentAnalysis(summaries, table.key);
            return (
              <div key={table.key} className="panel-soft rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    {table.label}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      downloadCsv(
                        `radar-${table.key}.csv`,
                        columnKeys,
                        summaries
                      )
                    }
                    className="rounded-full border border-white/10 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-[var(--muted)] hover:text-[var(--text)]"
                  >
                    Export CSV
                  </button>
                </div>
                {table.description ? (
                  <p className="mt-2 text-[0.7rem] text-[var(--muted)]">
                    {table.description}
                  </p>
                ) : null}
                {analysis ? (
                  <ChartCommentary text={analysis} />
                ) : (
                  <InsightText text={buildSegmentInsight(summaries)} />
                )}
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {summaries.map((row, index) => {
                    const rowLabel = pickRowLabel(row, index);
                    const countValue =
                      typeof row.Count === "number"
                        ? row.Count
                        : typeof row.count === "number"
                        ? row.count
                        : null;
                    const numericKeys = Object.keys(row).filter((key) => {
                      if (key.toLowerCase() === "count") return false;
                      return typeof row[key] === "number";
                    });
                    const preferred = [
                      "carry_mean",
                      "total_mean",
                      "roll_mean",
                      "smash_mean",
                      "club_speed_mean",
                      "ball_speed_mean",
                      "spin_rpm_mean",
                      "launch_v_mean",
                      "launch_h_mean",
                      "height_mean",
                      "lateral_mean",
                      "radial_miss_mean",
                      "withinLat10",
                      "withinLat5",
                      "withinDist10",
                      "withinDist5",
                      "impact_lat_mean",
                      "impact_vert_mean",
                    ];
                    const metricKeys = [
                      ...preferred.filter((key) => numericKeys.includes(key)),
                      ...numericKeys.filter((key) => !preferred.includes(key)),
                    ].slice(0, 3);
                    return (
                      <div
                        key={`${table.key}-card-${index}`}
                        className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[0.7rem] font-semibold text-[var(--text)]">
                            {rowLabel}
                          </p>
                          {countValue !== null ? (
                            <span className="text-[0.55rem] uppercase tracking-wide text-[var(--muted)]">
                              n {countValue}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-[0.65rem] text-[var(--muted)]">
                          {metricKeys.map((key) => (
                            <div key={key} className="flex items-center justify-between gap-2">
                              <span className="truncate">{prettifyMetricLabel(key)}</span>
                              <span className="text-[var(--text)]">
                                {formatSegmentValue(key, row[key])}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {resolvedConfig.showTable ? (
        <div className="rounded-2xl border border-white/10 bg-white/5">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-xs uppercase tracking-wide text-[var(--muted)]">
            <span>Tableau des coups</span>
            <span>{shots.length} coups</span>
          </div>
          <div className="max-h-[360px] overflow-auto">
            <table className="min-w-full text-xs text-[var(--text)]">
              <thead className="sticky top-0 bg-[var(--bg-elevated)]">
                <tr>
                  {tableColumns.map((column) => (
                    <th
                      key={`radar-col-${column.key}`}
                      className="whitespace-nowrap border-b border-white/10 px-3 py-2 text-left text-[0.6rem] uppercase tracking-wide text-[var(--muted)]"
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shots.map((shot, index) => (
                  <tr
                    key={`radar-row-${index}`}
                    className="border-b border-white/5 last:border-b-0"
                  >
                    {tableColumns.map((column) => (
                      <td
                        key={`radar-row-${index}-${column.key}`}
                        className="whitespace-nowrap px-3 py-2 text-[0.7rem] text-[var(--muted)]"
                      >
                        {formatValue(shot[column.key])}
                      </td>
                    ))}
                  </tr>
                ))}
                {stats?.avg ? (
                  <tr className="border-t border-white/10 bg-white/5">
                    {tableColumns.map((column, colIndex) => (
                      <td
                        key={`radar-avg-${column.key}`}
                        className="whitespace-nowrap px-3 py-2 text-[0.65rem] text-emerald-200"
                      >
                        {colIndex === 0 ? "AVG" : formatValue(stats.avg[column.key])}
                      </td>
                    ))}
                  </tr>
                ) : null}
                {stats?.dev ? (
                  <tr className="bg-white/5">
                    {tableColumns.map((column, colIndex) => (
                      <td
                        key={`radar-dev-${column.key}`}
                        className="whitespace-nowrap px-3 py-2 text-[0.65rem] text-sky-200"
                      >
                        {colIndex === 0 ? "DEV" : formatValue(stats.dev[column.key])}
                      </td>
                    ))}
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
