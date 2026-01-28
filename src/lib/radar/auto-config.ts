import type { RadarAnalytics, RadarChartPayload, RadarConfig } from "./types";
import { DEFAULT_RADAR_CONFIG } from "./config";

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

const mean = (values: number[]) =>
  values.length ? values.reduce((acc, value) => acc + value, 0) / values.length : null;

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

const scoreScatter = (payload: Extract<RadarChartPayload, { type: "scatter" }>) => {
  const r = correlation(payload.points);
  const correlationScore = r === null ? 0.25 : clamp(Math.abs(r));
  const densityScore = clamp((payload.points.length - 6) / 24, 0, 0.35);
  return clamp(correlationScore + densityScore);
};

const scoreLine = (payload: Extract<RadarChartPayload, { type: "line" }>) => {
  const series = payload.series[0];
  if (!series || series.values.length < 3) return 0.2;
  const values = series.values;
  const avg = mean(values);
  if (avg === null) return 0.2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const variability = Math.abs(range) / (Math.abs(avg) + 1);
  return clamp(variability);
};

const scoreHist = (payload: Extract<RadarChartPayload, { type: "hist" }>) => {
  const total = payload.bins.reduce((acc, bin) => acc + bin.count, 0);
  if (!total) return 0.2;
  const top = payload.bins.reduce((best, bin) =>
    bin.count > best.count ? bin : best
  );
  const topShare = top.count / total;
  return clamp(1 - topShare);
};

const scoreTable = (payload: Extract<RadarChartPayload, { type: "table" }>) => {
  if (!payload.rows.length) return 0.2;
  return 0.35;
};

const scoreMatrix = (payload: Extract<RadarChartPayload, { type: "matrix" }>) => {
  if (!payload.variables.length) return 0.2;
  let best = 0;
  payload.matrix.forEach((row, i) => {
    row.forEach((value, j) => {
      if (i === j) return;
      best = Math.max(best, Math.abs(value));
    });
  });
  return clamp(best);
};

const scoreModel = (payload: Extract<RadarChartPayload, { type: "model" }>) =>
  clamp(payload.model.r2 ?? 0);

const scorePayload = (payload: RadarChartPayload) => {
  switch (payload.type) {
    case "scatter":
      return scoreScatter(payload);
    case "line":
      return scoreLine(payload);
    case "hist":
      return scoreHist(payload);
    case "table":
      return scoreTable(payload);
    case "matrix":
      return scoreMatrix(payload);
    case "model":
      return scoreModel(payload);
    default:
      return 0.2;
  }
};

const getAdvancedTargetCount = (shotCount: number, available: number) => {
  const target =
    shotCount >= 40 ? 6 : shotCount >= 30 ? 5 : shotCount >= 20 ? 4 : shotCount >= 12 ? 3 : 2;
  return Math.min(target, Math.max(0, available));
};

type AutoConfigOptions = {
  preset?: RadarConfig["options"] extends { aiPreset?: infer T } ? T : never;
  syntax?: RadarConfig["options"] extends { aiSyntax?: infer T } ? T : never;
  focus?: string;
  answers?: Record<string, string | string[]>;
  context?: string;
};

const presetMap = {
  ultra: { minTotal: 1, maxTotal: 2, minBase: 1 },
  synthetic: { minTotal: 1, maxTotal: 4, minBase: 1 },
  standard: { minTotal: 3, maxTotal: 6, minBase: 2 },
  pousse: { minTotal: 4, maxTotal: 10, minBase: 4 },
  complet: { minTotal: 5, maxTotal: 10, minBase: 6 },
} as const;

const resolvePreset = (value?: string | null) => {
  if (!value) return presetMap.standard;
  return presetMap[value as keyof typeof presetMap] ?? presetMap.standard;
};

const focusBoosts: Record<string, Array<string>> = {
  precision: ["dispersion", "lateral", "path", "curve", "face_path"],
  distance: ["carry", "total", "speed", "smash", "launch", "height"],
  contact: ["smash", "impact", "face", "spin_loft"],
  trajectoire: ["launch", "spin", "height", "descent"],
  regularite: ["time", "stability", "consistency"],
};

const applyFocusBoost = (key: string, focus?: string) => {
  if (!focus) return 0;
  const normalized = focus.toLowerCase();
  const entry =
    focusBoosts[normalized] ??
    Object.entries(focusBoosts).find(([label]) =>
      normalized.includes(label)
    )?.[1];
  if (!entry) return 0;
  return entry.some((token) => key.includes(token)) ? 0.2 : 0;
};

export const buildAutoRadarConfig = (
  analytics: RadarAnalytics,
  baseConfig: RadarConfig = DEFAULT_RADAR_CONFIG,
  options: AutoConfigOptions = {}
): RadarConfig => {
  const nextCharts: Record<string, boolean> = {};
  Object.keys(baseConfig.charts).forEach((key) => {
    nextCharts[key] = false;
  });

  const hasStat = (key: string) => {
    const stats = analytics.globalStats?.[key];
    return stats && typeof stats.mean === "number";
  };

  const hasCarry = hasStat("carry");
  const hasTotal = hasStat("total");
  const hasLateral = hasStat("lateral");
  const hasSpin = hasStat("spin_rpm");
  const hasSmash = hasStat("smash");
  const hasClubSpeed = hasStat("club_speed");
  const hasBallSpeed = hasStat("ball_speed");
  const hasImpactLat = hasStat("impact_lat");
  const hasImpactVert = hasStat("impact_vert");

  const scoreDispersion = () => {
    const withinLat10 = analytics.derived?.corridors?.withinLat10;
    if (typeof withinLat10 === "number") {
      return clamp(1 - withinLat10 / 100);
    }
    const latStd = analytics.globalStats?.lateral?.std;
    if (typeof latStd === "number") {
      return clamp(latStd / 12);
    }
    return 0.35;
  };

  const scoreCarryTotal = () => {
    const carry = analytics.globalStats?.carry?.mean;
    const total = analytics.globalStats?.total?.mean;
    if (typeof carry === "number" && typeof total === "number") {
      const roll = Math.abs(total - carry);
      return clamp((roll / Math.max(1, Math.abs(carry))) * 3);
    }
    return 0.3;
  };

  const scoreSpeeds = () => {
    const smash = analytics.globalStats?.smash?.mean;
    if (typeof smash === "number") {
      return clamp(Math.abs(1.48 - smash) / 0.2);
    }
    return 0.3;
  };

  const scoreSpinCarry = () => {
    const spinMean = analytics.globalStats?.spin_rpm?.mean;
    const spinStd = analytics.globalStats?.spin_rpm?.std;
    if (typeof spinMean === "number" && typeof spinStd === "number") {
      return clamp((spinStd / Math.max(1, spinMean)) * 2);
    }
    return 0.25;
  };

  const scoreSmash = () => {
    const smashCv = analytics.globalStats?.smash?.cv;
    if (typeof smashCv === "number") {
      return clamp(smashCv / 0.05);
    }
    return 0.25;
  };

  const scoreFaceImpact = () => {
    const lat = analytics.globalStats?.impact_lat?.mean;
    const vert = analytics.globalStats?.impact_vert?.mean;
    if (typeof lat === "number" || typeof vert === "number") {
      const dist = Math.sqrt((lat ?? 0) ** 2 + (vert ?? 0) ** 2);
      return clamp(dist / 0.4);
    }
    return 0.2;
  };

  const baseCandidates: Array<{ key: string; score: number }> = [];
  if (hasLateral && (hasCarry || hasTotal)) {
    baseCandidates.push({
      key: "dispersion",
      score: scoreDispersion() + applyFocusBoost("dispersion", options.focus),
    });
  }
  if (hasCarry && hasTotal) {
    baseCandidates.push({
      key: "carryTotal",
      score: scoreCarryTotal() + applyFocusBoost("carry", options.focus),
    });
  }
  if (hasClubSpeed || hasBallSpeed) {
    baseCandidates.push({
      key: "speeds",
      score: scoreSpeeds() + applyFocusBoost("speed", options.focus),
    });
  }
  if (hasSpin && (hasCarry || hasTotal)) {
    baseCandidates.push({
      key: "spinCarry",
      score: scoreSpinCarry() + applyFocusBoost("spin", options.focus),
    });
  }
  if (hasSmash) {
    baseCandidates.push({
      key: "smash",
      score: scoreSmash() + applyFocusBoost("smash", options.focus),
    });
  }
  if (hasImpactLat && hasImpactVert) {
    baseCandidates.push({
      key: "faceImpact",
      score: scoreFaceImpact() + applyFocusBoost("impact", options.focus),
    });
  }

  const scoredAdvanced = Object.entries(analytics.chartsData ?? {})
    .filter(([, data]) => data.available && data.payload)
    .map(([key, data]) => ({
      key,
      score:
        (data.payload ? scorePayload(data.payload) : 0) +
        applyFocusBoost(key, options.focus),
    }))
    .sort((a, b) => b.score - a.score);

  const candidates = [...baseCandidates, ...scoredAdvanced];
  candidates.sort((a, b) => b.score - a.score);

  const preset = resolvePreset(options.preset ?? baseConfig.options?.aiPreset);
  const availableBase = [...baseCandidates].sort((a, b) => b.score - a.score);
  const maxTotal = Math.min(preset.maxTotal, candidates.length);
  const minTotal = Math.min(preset.minTotal, candidates.length);
  const minBase = Math.min(preset.minBase, availableBase.length);

  if (options.preset === "complet" || preset === presetMap.complet) {
    availableBase.forEach((entry) => {
      nextCharts[entry.key] = true;
    });
  } else {
    availableBase.slice(0, minBase).forEach((entry) => {
      nextCharts[entry.key] = true;
    });
  }

  const threshold = 0.45;
  const preferred = candidates.filter((entry) => entry.score >= threshold);
  const baseCount = Object.values(nextCharts).filter(Boolean).length;
  const desiredCount = Math.min(
    maxTotal,
    Math.max(minTotal, Math.max(baseCount, preferred.length))
  );
  const pool = preferred.length ? preferred : candidates;
  pool.forEach((entry) => {
    if (Object.values(nextCharts).filter(Boolean).length >= desiredCount) return;
    nextCharts[entry.key] = true;
  });

  const selectionKeys = Object.entries(nextCharts)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);

  const syntax = options.syntax ?? baseConfig.options?.aiSyntax ?? "exp-tech-solution";
  const aiNarrative = syntax === "global" ? "global" : "per-chart";

  return {
    ...baseConfig,
    mode: "ai",
    showSummary: true,
    showTable: false,
    showSegments: false,
    charts: nextCharts,
    options: {
      ...baseConfig.options,
      aiNarrative,
      aiSelectionKeys: selectionKeys,
      aiPreset: options.preset ?? baseConfig.options?.aiPreset ?? "standard",
      aiSyntax: syntax,
      aiAnswers: options.answers ?? baseConfig.options?.aiAnswers,
      aiContext: options.context ?? baseConfig.options?.aiContext,
    },
  };
};
