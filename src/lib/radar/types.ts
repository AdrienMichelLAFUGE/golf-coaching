export type RadarConfig = {
  mode: "default" | "custom" | "ai";
  showSummary: boolean;
  showTable: boolean;
  showSegments?: boolean;
  charts: Record<string, boolean>;
  thresholds?: {
    latCorridorMeters?: [number, number];
    distCorridorMeters?: [number, number];
    impactCenterBox?: { lat: number; vert: number };
    outlierMethod?: "iqr" | "zrobust";
    bins?: { quantiles?: [number, number] };
  };
  options?: {
    excludeOutliersDefault?: boolean;
    aiNarrative?: "off" | "per-chart" | "global";
    aiSelectionKeys?: string[];
    aiNarratives?: Record<string, { reason?: string | null; solution?: string | null }>;
    aiSelectionSummary?: string | null;
    aiSessionSummary?: string | null;
    aiPreset?: "ultra" | "synthetic" | "standard" | "pousse" | "complet";
    aiSyntax?:
      | "exp-tech"
      | "exp-comp"
      | "exp-tech-solution"
      | "exp-solution"
      | "global";
    aiAnswers?: Record<string, string | string[]>;
    aiContext?: string;
  };
};

export type RadarChartPayload =
  | {
      type: "scatter";
      title: string;
      xLabel: string;
      yLabel: string;
      xUnit?: string | null;
      yUnit?: string | null;
      points: Array<{ x: number; y: number; shotIndex?: number }>;
      notes?: string | null;
      insight?: string | null;
    }
  | {
      type: "line";
      title: string;
      xLabel: string;
      yLabel: string;
      yUnit?: string | null;
      series: Array<{ label: string; values: number[] }>;
      notes?: string | null;
      insight?: string | null;
    }
  | {
      type: "hist";
      title: string;
      xLabel: string;
      yLabel: string;
      xUnit?: string | null;
      bins: Array<{ label: string; count: number }>;
      notes?: string | null;
      insight?: string | null;
    }
  | {
      type: "table";
      title: string;
      columns: string[];
      rows: Array<Record<string, string | number | null>>;
      notes?: string | null;
      insight?: string | null;
    }
  | {
      type: "matrix";
      title: string;
      variables: string[];
      matrix: number[][];
      notes?: string | null;
      insight?: string | null;
    }
  | {
      type: "model";
      title: string;
      model: {
        name: string;
        coefficients: Record<string, number>;
        intercept: number;
        r2: number;
        n: number;
        features: string[];
      };
      notes?: string | null;
      insight?: string | null;
    };

export type RadarAnalytics = {
  version: "radar-analytics-v1";
  meta: {
    units: Record<string, string | null>;
    club?: string | null;
    ball?: string | null;
    shotCount: number;
    missingColumns: string[];
  };
  derived: {
    carryTarget?: number | null;
    corridors?: {
      withinLat5?: number | null;
      withinLat10?: number | null;
      withinDist5?: number | null;
      withinDist10?: number | null;
    };
  };
  globalStats: Record<
    string,
    {
      count: number;
      mean: number | null;
      std: number | null;
      cv?: number | null;
      median: number | null;
      p10: number | null;
      p90: number | null;
    }
  >;
  segments: Record<string, unknown>;
  outliers: {
    method: "iqr" | "zrobust";
    byMetric: Record<string, number[]>;
    flags: Record<string, string[]>;
    worst10_distance: number[];
    worst10_dispersion: number[];
    top20_strikes: number[];
  };
  correlations?: {
    variables: string[];
    matrix: number[][];
  };
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
  chartsData: Record<string, { available: boolean; payload?: RadarChartPayload }>;
  summary?: string | null;
  insights?: Record<string, string>;
};
