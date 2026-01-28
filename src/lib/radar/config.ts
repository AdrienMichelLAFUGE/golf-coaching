import type { RadarConfig } from "./types";
import { RADAR_CHART_DEFINITIONS } from "./charts/registry";

const advancedChartDefaults = RADAR_CHART_DEFINITIONS.reduce<Record<string, boolean>>(
  (acc, def) => {
    acc[def.key] = false;
    return acc;
  },
  {}
);

export const DEFAULT_RADAR_CONFIG: RadarConfig = {
  mode: "default",
  showSummary: true,
  showTable: false,
  showSegments: false,
  charts: {
    dispersion: true,
    carryTotal: true,
    speeds: true,
    spinCarry: true,
    smash: true,
    faceImpact: true,
    ...advancedChartDefaults,
  },
  thresholds: {
    latCorridorMeters: [5, 10],
    distCorridorMeters: [5, 10],
    impactCenterBox: { lat: 0.4, vert: 0.4 },
    outlierMethod: "iqr",
    bins: { quantiles: [0.33, 0.66] },
  },
  options: {
    excludeOutliersDefault: false,
    aiNarrative: "off",
    aiSelectionKeys: [],
    aiPreset: "standard",
    aiSyntax: "exp-tech-solution",
  },
};
