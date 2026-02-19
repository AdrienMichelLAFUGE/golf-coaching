import { z } from "zod";
import OpenAI from "openai";
import { computeAnalytics } from "@/lib/radar/computeAnalytics";
import { DEFAULT_RADAR_CONFIG } from "@/lib/radar/config";
import { PGA_BENCHMARKS, findPgaBenchmark } from "@/lib/radar/pga-benchmarks";
import { env } from "@/env";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { applyTemplate, loadPromptSection } from "@/lib/promptLoader";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { PLAN_ENTITLEMENTS } from "@/lib/plans";
import { loadPersonalPlanTier } from "@/lib/plan-access";
import { recordActivity } from "@/lib/activity-log";
import { isAiBudgetBlocked, loadAiBudgetSummary } from "@/lib/ai/budget";
import { computeAiCostEurCents, formatEurCents } from "@/lib/ai/pricing";
import {
  buildSmart2MoveAiContext,
  normalizeSmart2MoveImpactMarkerX,
  normalizeSmart2MoveTransitionStartX,
  resolveSmart2MovePeakWindow,
  resolveSmart2MoveTransitionStartX,
  SMART2MOVE_BUBBLE_ORDER,
  sanitizeSmart2MoveAnnotations,
} from "@/lib/radar/smart2move-annotations";
import {
  SMART2MOVE_GRAPH_TYPE_VALUES,
  SMART2MOVE_VERIFY_PROMPT_SECTION,
  getSmart2MoveGraphMeta,
  isSmart2MoveGraphType,
  type Smart2MoveGraphType,
} from "@/lib/radar/smart2move-graph-types";

export const runtime = "nodejs";

type RadarColumn = {
  group: string | null;
  label: string;
  unit: string | null;
};

type RadarRow = {
  shot: string | number | null;
  values: Array<string | number | null>;
};

type RadarExtraction = {
  source?: string | null;
  metadata?: { club?: string | null; ball?: string | null } | null;
  columns: RadarColumn[];
  rows: RadarRow[];
  avg?: Array<string | number | null> | null;
  dev?: Array<string | number | null> | null;
  summary?: string | null;
};

type RadarVerification = {
  is_valid: boolean;
  confidence: number;
  issues: string[];
};

type Smart2MoveGraphExtraction = {
  graph_type: Smart2MoveGraphType;
  annotations: Array<{
    bubble_key: (typeof SMART2MOVE_BUBBLE_ORDER)[number];
    id: string;
    title: string;
    detail: string;
    reasoning: string | null;
    solution: string | null;
    anchor: {
      x: number;
      y: number;
    };
    evidence: string | null;
  }>;
  analysis: string;
  summary?: string | null;
};

type Smart2MoveGraphVerification = {
  is_valid: boolean;
  confidence: number;
  issues: string[];
  matches_selected_graph_type: boolean;
};

type RadarPromptMode = "tabular" | "smart2move_graph";

type RadarPromptConfig = {
  mode: RadarPromptMode;
  extractSystemSection: string;
  verifySystemSection: string;
  extractFallbackSection?: string;
  verifyFallbackSection?: string;
  sourceLabel: string;
  extractSchemaDescription: string;
  verifySchemaDescription: string;
  smart2MoveGraphType?: Smart2MoveGraphType;
  smart2MoveGraphLabel?: string;
};

const radarExtractSchema = z.object({
  radarFileId: z.string().min(1),
  smart2MoveGraphType: z.enum(SMART2MOVE_GRAPH_TYPE_VALUES).optional(),
  impactMarkerX: z.number().min(0).max(1).optional(),
  transitionStartX: z.number().min(0).max(1).optional(),
  origin: z
    .enum(["report_builder", "student_profile", "unknown"])
    .optional()
    .default("unknown"),
});

const buildRadarSchema = () => ({
  type: "object",
  additionalProperties: false,
  properties: {
    source: { type: ["string", "null"] },
    metadata: {
      type: "object",
      additionalProperties: false,
      properties: {
        club: { type: ["string", "null"] },
        ball: { type: ["string", "null"] },
      },
      required: ["club", "ball"],
    },
    columns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          group: { type: ["string", "null"] },
          label: { type: ["string", "null"] },
          unit: { type: ["string", "null"] },
        },
        required: ["group", "label", "unit"],
      },
    },
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          shot: { type: ["string", "number", "null"] },
          values: {
            type: "array",
            items: { type: ["string", "number", "null"] },
          },
        },
        required: ["shot", "values"],
      },
    },
    avg: {
      type: ["array", "null"],
      items: { type: ["string", "number", "null"] },
    },
    dev: {
      type: ["array", "null"],
      items: { type: ["string", "number", "null"] },
    },
    summary: { type: ["string", "null"] },
  },
  required: ["source", "metadata", "columns", "rows", "avg", "dev", "summary"],
});

const buildRadarVerifySchema = () => ({
  type: "object",
  additionalProperties: false,
  properties: {
    is_valid: { type: "boolean" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    issues: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["is_valid", "confidence", "issues"],
});

const buildSmart2MoveGraphSchema = () => ({
  type: "object",
  additionalProperties: false,
  properties: {
    graph_type: {
      type: "string",
      enum: [...SMART2MOVE_GRAPH_TYPE_VALUES],
    },
    annotations: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          bubble_key: { type: "string", enum: [...SMART2MOVE_BUBBLE_ORDER] },
          id: { type: "string" },
          title: { type: "string" },
          detail: { type: "string" },
          reasoning: { type: ["string", "null"] },
          solution: { type: ["string", "null"] },
          anchor: {
            type: "object",
            additionalProperties: false,
            properties: {
              x: { type: "number", minimum: 0, maximum: 1 },
              y: { type: "number", minimum: 0, maximum: 1 },
            },
            required: ["x", "y"],
          },
          evidence: { type: ["string", "null"] },
        },
        required: [
          "bubble_key",
          "id",
          "title",
          "detail",
          "reasoning",
          "solution",
          "anchor",
          "evidence",
        ],
      },
    },
    analysis: { type: "string" },
    summary: { type: ["string", "null"] },
  },
  required: [
    "graph_type",
    "annotations",
    "analysis",
    "summary",
  ],
});

const buildSmart2MoveVerifySchema = () => ({
  type: "object",
  additionalProperties: false,
  properties: {
    is_valid: { type: "boolean" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    issues: {
      type: "array",
      items: { type: "string" },
    },
    matches_selected_graph_type: { type: "boolean" },
  },
  required: [
    "is_valid",
    "confidence",
    "issues",
    "matches_selected_graph_type",
  ],
});

const buildVerificationSnapshot = (extracted: RadarExtraction) => {
  const rows = extracted.rows ?? [];
  const sampleSize = 6;
  const head = rows.slice(0, sampleSize);
  const tail =
    rows.length > sampleSize ? rows.slice(Math.max(rows.length - sampleSize, 0)) : [];
  return {
    metadata: extracted.metadata ?? null,
    columns: (extracted.columns ?? []).map((column) => ({
      group: column.group ?? null,
      label: column.label ?? "",
      unit: column.unit ?? null,
    })),
    rowCount: rows.length,
    sampleRows: head,
    tailRows: tail.length ? tail : null,
    avg: extracted.avg ?? null,
    dev: extracted.dev ?? null,
    summary: extracted.summary ?? null,
  };
};

const normalizeToken = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const buildKey = (group: string | null, label: string) => {
  const groupToken = normalizeToken(group ?? "");
  const labelToken = normalizeToken(label);
  const key = `${groupToken}:${labelToken}`.replace(/:+/g, ":");
  const known: Record<string, string> = {
    "shot:": "shot_index",
    "shot:#": "shot_index",
    "shot:shot": "shot_index",
    "distance:carry": "distance_carry",
    "distance:roll": "distance_roll",
    "distance:total": "distance_total",
    "distance:lateral": "distance_lateral",
    "distance:curve dist": "distance_curve",
    "speed:club": "speed_club",
    "speed:ball": "speed_ball",
    "spin:rpm": "spin_rpm",
    "spin:axis": "spin_axis",
    "spin:spin loft": "spin_loft",
    "smash:factor": "smash_factor",
    "ball angles:vertical": "ball_angle_vertical",
    "ball angles:horizontal": "ball_angle_horizontal",
    "ball angles:descent v": "ball_angle_descent",
    "club angles:club path": "club_path",
    "club angles:ftp": "club_face_to_path",
    "club angles:ftt": "club_face_to_target",
    "club angles:d loft": "club_dynamic_loft",
    "club angles:aoa": "club_aoa",
    "club angles:low point": "club_low_point",
    "swing plane:vertical": "swing_plane_vertical",
    "swing plane:horizontal": "swing_plane_horizontal",
    "flight:height": "flight_height",
    "flight:time": "flight_time",
    "shot type:shot type": "shot_type",
    "face impact:lateral": "face_impact_lateral",
    "face impact:vertical": "face_impact_vertical",
    "impact face:lateral": "face_impact_lateral",
    "impact face:vertical": "face_impact_vertical",
  };
  const direct = known[key];
  if (direct) return direct;
  const fallback = `${groupToken || "col"}_${labelToken || "value"}`.replace(/\s+/g, "_");
  return fallback || "col_value";
};

const parseDirectionalNumber = (raw: string) => {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(-?\d+(?:[.,]\d+)?)([LR])$/i);
  if (!match) return null;
  const numeric = Number(match[1].replace(",", "."));
  if (!Number.isFinite(numeric)) return null;
  return match[2].toUpperCase() === "L" ? -numeric : numeric;
};

const parseCellValue = (value: string | number | null) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-" || trimmed === "—") return null;
  const directional = parseDirectionalNumber(trimmed);
  if (directional !== null) return directional;
  const numeric = Number(trimmed.replace(",", ".").replace(/[^\d.-]/g, ""));
  if (Number.isFinite(numeric)) return numeric;
  return trimmed;
};

const normalizeUnit = (value?: string | null) =>
  (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9/]/g, "")
    .trim();

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

const normalizeClubLabel = (value?: string | null) => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  const normalized = normalizeToken(trimmed);
  if (!normalized) return trimmed;
  if (
    normalized.includes("driver") ||
    normalized === "drive" ||
    normalized === "drv" ||
    normalized.includes("1w") ||
    normalized.includes("w1") ||
    normalized.includes("bois 1") ||
    normalized.includes("1 bois") ||
    normalized.includes("wood 1") ||
    normalized.includes("1 wood")
  ) {
    return "Driver";
  }
  if (normalized.includes("pw") || normalized.includes("pitch")) return "PW";
  const ironMatch = normalized.match(/(^| )([3-9])\s?i(ron)?($| )/);
  if (ironMatch) return `${ironMatch[2]} Iron`;
  return trimmed;
};

const scoreBenchmark = (
  benchmark: { club_speed_mph: number; carry_yds: number },
  evidence: { clubSpeedMph: number | null; carryYds: number | null }
) => {
  let score = 0;
  let count = 0;
  if (evidence.clubSpeedMph !== null) {
    score += Math.abs(evidence.clubSpeedMph - benchmark.club_speed_mph) / 12;
    count += 1;
  }
  if (evidence.carryYds !== null) {
    score += Math.abs(evidence.carryYds - benchmark.carry_yds) / 20;
    count += 1;
  }
  return count ? score / count : null;
};

const resolveClubFromAnalytics = (
  rawClub: string | null | undefined,
  analytics: {
    globalStats?: Record<string, { mean: number | null }>;
    meta?: { units?: Record<string, string | null> };
  } | null
) => {
  const normalizedClub = normalizeClubLabel(rawClub);
  const units = analytics?.meta?.units ?? {};
  const clubSpeedMph = toMph(
    analytics?.globalStats?.club_speed?.mean ?? null,
    units.club_speed
  );
  const carryYds = toYards(
    analytics?.globalStats?.carry?.mean ?? null,
    units.carry ?? units.total ?? null
  );

  if (clubSpeedMph === null && carryYds === null) {
    return normalizedClub;
  }

  const evidence = { clubSpeedMph, carryYds };
  let inferred: string | null = null;
  let bestScore: number | null = null;
  for (const bench of PGA_BENCHMARKS) {
    const score = scoreBenchmark(bench, evidence);
    if (score === null) continue;
    if (bestScore === null || score < bestScore) {
      bestScore = score;
      inferred = bench.club;
    }
  }

  if (!normalizedClub) return inferred;
  if (!inferred) return normalizedClub;

  const normalizedBenchmark = findPgaBenchmark(normalizedClub);
  const inferredBenchmark = findPgaBenchmark(inferred);
  if (!normalizedBenchmark || !inferredBenchmark) return normalizedClub;

  const normalizedScore = scoreBenchmark(normalizedBenchmark, evidence);
  const inferredScore = scoreBenchmark(inferredBenchmark, evidence);
  if (normalizedScore === null || inferredScore === null) return normalizedClub;

  return inferredScore + 0.2 < normalizedScore ? inferred : normalizedClub;
};

const computeStats = (shots: Array<Record<string, unknown>>) => {
  const sums = new Map<string, number>();
  const counts = new Map<string, number>();
  const valuesByKey = new Map<string, number[]>();

  shots.forEach((shot) => {
    Object.entries(shot).forEach(([key, value]) => {
      if (key === "shot_index") return;
      if (typeof value !== "number" || !Number.isFinite(value)) return;
      sums.set(key, (sums.get(key) ?? 0) + value);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      const list = valuesByKey.get(key) ?? [];
      list.push(value);
      valuesByKey.set(key, list);
    });
  });

  const avg: Record<string, number | null> = {};
  const dev: Record<string, number | null> = {};
  counts.forEach((count, key) => {
    const sum = sums.get(key) ?? 0;
    avg[key] = count > 0 ? Number((sum / count).toFixed(2)) : null;
    const values = valuesByKey.get(key) ?? [];
    if (values.length === 0) {
      dev[key] = null;
      return;
    }
    const mean = sum / count;
    const variance =
      values.reduce((acc, val) => acc + (val - mean) ** 2, 0) / values.length;
    dev[key] = Number(Math.sqrt(variance).toFixed(2));
  });

  return { avg, dev };
};

const extractOutputText = (response: {
  output_text?: string | null;
  output?: Array<unknown>;
}) => {
  const direct = response.output_text?.trim();
  if (direct) return direct;

  const parts: string[] = [];
  for (const item of response.output ?? []) {
    if (!item || typeof item !== "object") continue;
    if ("content" in item) {
      const content = (item as { content?: unknown }).content;
      if (typeof content === "string") {
        parts.push(content);
      } else if (Array.isArray(content)) {
        for (const chunk of content) {
          if (typeof chunk === "string") {
            parts.push(chunk);
          } else if (chunk && typeof chunk === "object" && "type" in chunk) {
            const typed = chunk as {
              type: string;
              text?: string;
              refusal?: string;
            };
            if (typed.type === "output_text" && typed.text) {
              parts.push(typed.text);
            } else if (typed.type === "text" && typed.text) {
              parts.push(typed.text);
            } else if (typed.type === "refusal" && typed.refusal) {
              parts.push(`Refus: ${typed.refusal}`);
            }
          }
        }
      }
    }
  }

  return parts.join("\n").trim();
};

type UsageMetrics =
  | {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
    }
  | null
  | undefined;

const toUsageNumber = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const mergeUsageMetrics = (
  left: UsageMetrics,
  right: UsageMetrics
): UsageMetrics => {
  if (!left && !right) return null;
  const leftInput = toUsageNumber(left?.input_tokens);
  const leftOutput = toUsageNumber(left?.output_tokens);
  const rightInput = toUsageNumber(right?.input_tokens);
  const rightOutput = toUsageNumber(right?.output_tokens);
  return {
    input_tokens: leftInput + rightInput,
    output_tokens: leftOutput + rightOutput,
    total_tokens:
      Math.max(toUsageNumber(left?.total_tokens), leftInput + leftOutput) +
      Math.max(toUsageNumber(right?.total_tokens), rightInput + rightOutput),
  };
};

const ensureSmart2MoveTitle = (
  analysis?: string | null,
  graphLabel = "Smart2Move"
) => {
  const trimmed = analysis?.trim() ?? "";
  if (!trimmed) return "";
  const lines = trimmed.split("\n");
  const startsWithTitle = /^analyse /i.test(lines[0]?.trim() ?? "");
  const body = startsWithTitle
    ? lines.slice(1).join("\n").trim()
    : trimmed;
  return body
    ? `Analyse ${graphLabel} - Smart2Move\n\n${body}`
    : `Analyse ${graphLabel} - Smart2Move`;
};

const truncateSmart2MoveText = (
  value: string | null | undefined,
  maxSentences: number,
  maxChars: number
) => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  const normalized = trimmed.replace(/\s+/g, " ").trim();
  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  const limitedSentences =
    sentences.length > maxSentences ? sentences.slice(0, maxSentences) : sentences;
  const joined = limitedSentences.join(" ").trim();
  if (joined.length <= maxChars) return joined;
  const sliced = joined.slice(0, Math.max(0, maxChars - 3)).trimEnd();
  const safeSlice = sliced.includes(" ") ? sliced.slice(0, sliced.lastIndexOf(" ")) : sliced;
  return `${safeSlice || sliced}...`;
};

const compactSmart2MoveAnalysis = (analysis?: string | null) => {
  const trimmed = analysis?.trim() ?? "";
  if (!trimmed) return "";

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return "";

  const sectionMatcher = /^([1-4])\.\s+/;
  const titleLine = /^analyse /i.test(lines[0]) ? lines[0] : null;
  const startIndex = titleLine ? 1 : 0;

  const sections: Array<{ heading: string; body: string[] }> = [];
  let currentSection: { heading: string; body: string[] } | null = null;

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    if (sectionMatcher.test(line)) {
      currentSection = { heading: line, body: [] };
      sections.push(currentSection);
      continue;
    }
    if (!currentSection) continue;
    currentSection.body.push(line);
  }

  if (!sections.length) {
    const compactPlain = truncateSmart2MoveText(trimmed, 8, 900);
    if (!compactPlain) return "";
    return titleLine ? `${titleLine}\n\n${compactPlain}` : compactPlain;
  }

  const compactSections = sections.map((section) => {
    const compactBody = truncateSmart2MoveText(section.body.join(" "), 2, 280);
    return compactBody ? `${section.heading}\n${compactBody}` : section.heading;
  });

  if (titleLine) {
    return `${titleLine}\n\n${compactSections.join("\n\n")}`;
  }
  return compactSections.join("\n\n");
};

const compactSmart2MoveExtraction = (
  extraction: Smart2MoveGraphExtraction
): Smart2MoveGraphExtraction => ({
  ...extraction,
  annotations: extraction.annotations.map((annotation) => ({
    ...annotation,
    title: truncateSmart2MoveText(annotation.title, 1, 90),
    detail: truncateSmart2MoveText(annotation.detail, 2, 240),
    reasoning: annotation.reasoning
      ? truncateSmart2MoveText(annotation.reasoning, 2, 220)
      : null,
    solution: annotation.solution
      ? truncateSmart2MoveText(annotation.solution, 2, 220)
      : null,
    evidence: annotation.evidence
      ? truncateSmart2MoveText(annotation.evidence, 2, 220)
      : null,
  })),
  analysis: compactSmart2MoveAnalysis(extraction.analysis),
  summary: extraction.summary ? truncateSmart2MoveText(extraction.summary, 2, 220) : null,
});

const tpiColorOrder: Record<string, number> = {
  red: 0,
  orange: 1,
  green: 2,
};

const tpiKeywordScore = (value: string) => {
  const normalized = normalizeToken(value);
  if (!normalized) return 0;
  const keywords = [
    "mobilite",
    "stabilite",
    "asymetrie",
    "compensation",
    "cheville",
    "hanche",
    "thorax",
    "rotation",
    "epaule",
    "genou",
    "bassin",
    "antecedent",
    "limitation",
  ];
  return keywords.reduce((score, keyword) => {
    if (normalized.includes(keyword)) return score + 1;
    return score;
  }, 0);
};

const buildSmart2MoveTpiContextBlock = (
  tests: Array<{
    test_name: string | null;
    result_color: string | null;
    mini_summary: string | null;
    details: string | null;
    details_translated: string | null;
    position: number | null;
  }>
) => {
  if (!tests.length) return "Aucun profil TPI associe.";

  const ranked = [...tests]
    .map((test) => {
      const details =
        test.details_translated?.trim() || test.details?.trim() || test.mini_summary?.trim() || "";
      const testName = test.test_name?.trim() || "Test TPI";
      const color = (test.result_color ?? "").trim().toLowerCase();
      return {
        ...test,
        text: details,
        testName,
        color,
        colorRank: tpiColorOrder[color] ?? 3,
        keywordScore: tpiKeywordScore(`${testName} ${details}`),
      };
    })
    .sort((a, b) => {
      if (a.colorRank !== b.colorRank) return a.colorRank - b.colorRank;
      if (a.keywordScore !== b.keywordScore) return b.keywordScore - a.keywordScore;
      return (a.position ?? 999) - (b.position ?? 999);
    });

  const focused = ranked
    .filter((item) => item.text.length > 0)
    .slice(0, 8)
    .map((item, index) => {
      const clipped = item.text.length > 220 ? `${item.text.slice(0, 220)}...` : item.text;
      const colorLabel =
        item.color === "red" ? "rouge" : item.color === "orange" ? "orange" : "vert";
      return `${index + 1}. ${item.testName} (${colorLabel}) - ${clipped}`;
    });

  if (!focused.length) return "Profil TPI associe, mais details insuffisants.";
  return `Profil TPI associe (points cles):\n${focused.join("\n")}`;
};

const buildSmart2MoveConfig = (
  annotations: ReturnType<typeof sanitizeSmart2MoveAnnotations>,
  miniSummary?: string | null,
  selectedGraphType?: Smart2MoveGraphType | null,
  impactMarkerX?: number | null,
  transitionStartX?: number | null
) => {
  const disabledCharts = Object.keys(DEFAULT_RADAR_CONFIG.charts).reduce<
    Record<string, boolean>
  >((acc, key) => {
    acc[key] = false;
    return acc;
  }, {});
  const normalizedImpactMarkerX = normalizeSmart2MoveImpactMarkerX(impactMarkerX);
  const normalizedTransitionStartX = resolveSmart2MoveTransitionStartX(
    normalizedImpactMarkerX,
    normalizeSmart2MoveTransitionStartX(transitionStartX)
  );
  const peakWindow = resolveSmart2MovePeakWindow(normalizedImpactMarkerX);
  const aiContext = buildSmart2MoveAiContext(
    annotations,
    miniSummary,
    normalizedImpactMarkerX,
    normalizedTransitionStartX
  );
  const selectedGraphMeta =
    selectedGraphType && isSmart2MoveGraphType(selectedGraphType)
      ? getSmart2MoveGraphMeta(selectedGraphType)
      : null;
  return {
    ...DEFAULT_RADAR_CONFIG,
    showTable: false,
    charts: disabledCharts,
    options: {
      ...(DEFAULT_RADAR_CONFIG.options ?? {}),
      aiContext,
      smart2MoveGraphType: selectedGraphMeta?.id,
      smart2MoveGraphLabel: selectedGraphMeta?.label,
      smart2MoveImpactMarkerX: normalizedImpactMarkerX ?? undefined,
      smart2MoveTransitionStartX: normalizedTransitionStartX ?? undefined,
      smart2MovePeakWindowStartX: peakWindow?.start ?? undefined,
      smart2MovePeakWindowEndX: peakWindow?.end ?? undefined,
    },
  };
};

const normalizeRadarSource = (value?: string | null) => {
  const source = (value ?? "").trim().toLowerCase();
  if (source === "trackman") return "trackman";
  if (source === "smart2move") return "smart2move";
  return "flightscope";
};

export const resolveRadarPromptConfig = (
  source?: string | null,
  smart2MoveGraphType?: Smart2MoveGraphType | null
): RadarPromptConfig => {
  const normalized = normalizeRadarSource(source);
  if (normalized === "smart2move") {
    const resolvedGraphType =
      smart2MoveGraphType && isSmart2MoveGraphType(smart2MoveGraphType)
        ? smart2MoveGraphType
        : "fx";
    const graphMeta = getSmart2MoveGraphMeta(resolvedGraphType);
    return {
      mode: "smart2move_graph",
      extractSystemSection: graphMeta.extractPromptSection,
      verifySystemSection: SMART2MOVE_VERIFY_PROMPT_SECTION,
      sourceLabel: "Smart2Move",
      extractSchemaDescription: `Extraction Smart2Move ${graphMeta.shortLabel}.`,
      verifySchemaDescription: "Verification extraction Smart2Move (graphe impose).",
      smart2MoveGraphType: graphMeta.id,
      smart2MoveGraphLabel: graphMeta.label,
    };
  }

  if (normalized === "trackman") {
    return {
      mode: "tabular",
      extractSystemSection: "radar_extract_trackman_system",
      verifySystemSection: "radar_extract_trackman_verify_system",
      extractFallbackSection: "radar_extract_system",
      verifyFallbackSection: "radar_extract_verify_system",
      sourceLabel: "Trackman",
      extractSchemaDescription: "Extraction d un tableau Trackman.",
      verifySchemaDescription: "Verification extraction Trackman.",
    };
  }

  return {
    mode: "tabular",
    extractSystemSection: "radar_extract_system",
    verifySystemSection: "radar_extract_verify_system",
    sourceLabel: "Flightscope",
    extractSchemaDescription: "Extraction d un tableau Flightscope.",
    verifySchemaDescription: "Verification extraction Flightscope.",
  };
};

export async function POST(req: Request) {
  const parsed = await parseRequestJson(req, radarExtractSchema);
  if (!parsed.success) {
    return Response.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }

  const { radarFileId, origin, smart2MoveGraphType, impactMarkerX, transitionStartX } =
    parsed.data;
  const supabase = createSupabaseServerClientFromRequest(req);
  const admin = createSupabaseAdminClient();
  const openaiKey = env.OPENAI_API_KEY;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (userError || !userId) {
    return Response.json({ error: "Session invalide." }, { status: 401 });
  }
  const userEmail = userData.user?.email?.toLowerCase() ?? null;
  const isAdmin = userEmail === "adrien.lafuge@outlook.fr";

  const { data: radarFile, error: radarError } = await supabase
    .from("radar_files")
    .select("id, org_id, student_id, file_url, file_mime, original_name, source")
    .eq("id", radarFileId)
    .single();

  if (radarError || !radarFile) {
    await recordActivity({
      admin,
      level: "warn",
      action: "radar.import.denied",
      actorUserId: userId,
      entityType: "radar_file",
      entityId: radarFileId,
      message: "Import datas refuse: fichier introuvable.",
    });
    return Response.json({ error: "Fichier datas introuvable." }, { status: 404 });
  }

  const normalizedSource = normalizeRadarSource(radarFile.source);
  if (normalizedSource === "smart2move" && !smart2MoveGraphType) {
    return Response.json(
      {
        error:
          "Type de graphe Smart2Move requis. Choisis un graphe avant de lancer l extraction.",
      },
      { status: 422 }
    );
  }

  const normalizedImpactMarkerX =
    normalizedSource === "smart2move"
      ? normalizeSmart2MoveImpactMarkerX(impactMarkerX)
      : null;
  if (normalizedSource === "smart2move" && normalizedImpactMarkerX === null) {
    return Response.json(
      {
        error:
          "Position d impact requise pour Smart2Move. Place la barre d impact avant de lancer l extraction.",
      },
      { status: 422 }
    );
  }
  const normalizedTransitionStartX =
    normalizedSource === "smart2move"
      ? resolveSmart2MoveTransitionStartX(
          normalizedImpactMarkerX,
          normalizeSmart2MoveTransitionStartX(transitionStartX)
        )
      : null;
  if (
    normalizedSource === "smart2move" &&
    normalizedTransitionStartX !== null &&
    normalizedImpactMarkerX !== null &&
    normalizedTransitionStartX >= normalizedImpactMarkerX
  ) {
    return Response.json(
      { error: "Debut de transition invalide: il doit etre strictement avant l impact." },
      { status: 422 }
    );
  }
  const smart2MovePeakWindow =
    normalizedSource === "smart2move"
      ? resolveSmart2MovePeakWindow(normalizedImpactMarkerX)
      : null;

  const promptConfig = resolveRadarPromptConfig(radarFile.source, smart2MoveGraphType ?? null);

  const { data: profileData } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", userId)
    .single();

  if (!profileData || String(profileData.org_id) !== String(radarFile.org_id)) {
    await recordActivity({
      admin,
      level: "warn",
      action: "radar.import.denied",
      actorUserId: userId,
      orgId: profileData?.org_id ?? null,
      entityType: "radar_file",
      entityId: radarFile.id,
      message: "Import datas refuse: acces interdit.",
    });
    return Response.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { data: orgData } = await admin
    .from("organizations")
    .select("locale")
    .eq("id", radarFile.org_id)
    .single();

  const planTier = await loadPersonalPlanTier(admin, userId);
  const entitlements = PLAN_ENTITLEMENTS[planTier];
  if (!isAdmin && !entitlements.dataExtractEnabled) {
    await recordActivity({
      admin,
      level: "warn",
      action: "radar.import.denied",
      actorUserId: userId,
      orgId: radarFile.org_id,
      entityType: "radar_file",
      entityId: radarFile.id,
      message: "Import datas refuse: plan insuffisant.",
    });
    return Response.json(
      { error: "Plan requis pour l extraction de datas." },
      { status: 403 }
    );
  }

  if (!isAdmin && entitlements.quotas.dataExtractsPer30d !== null) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: usageCount, error: usageError } = await admin
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action", "radar_extract")
      .gte("created_at", since);
    if (usageError) {
      await recordActivity({
        admin,
        level: "error",
        action: "radar.import.failed",
        actorUserId: userId,
        orgId: radarFile.org_id,
        entityType: "radar_file",
        entityId: radarFile.id,
        message: usageError.message ?? "Controle quota import datas impossible.",
      });
      return Response.json({ error: usageError.message }, { status: 500 });
    }
    if ((usageCount ?? 0) >= entitlements.quotas.dataExtractsPer30d) {
      await recordActivity({
        admin,
        level: "warn",
        action: "radar.import.denied",
        actorUserId: userId,
        orgId: radarFile.org_id,
        entityType: "radar_file",
        entityId: radarFile.id,
        message: "Import datas refuse: quota atteint.",
      });
      return Response.json(
        { error: "Quota d extractions atteint (30 jours glissants)." },
        { status: 403 }
      );
    }
  }

  const aiBudget = await loadAiBudgetSummary({ admin, userId });
  if (!isAdmin && isAiBudgetBlocked(aiBudget)) {
    await recordActivity({
      admin,
      level: "warn",
      action: "radar.import.denied",
      actorUserId: userId,
      orgId: radarFile.org_id,
      entityType: "radar_file",
      entityId: radarFile.id,
      message: "Import datas refuse: budget mensuel atteint.",
    });
    return Response.json(
      {
        error: `Budget IA mensuel atteint (${formatEurCents(
          aiBudget.monthSpentCents
        )} / ${formatEurCents(aiBudget.monthAvailableCents ?? 0)}). Recharge des credits pour continuer.`,
      },
      { status: 403 }
    );
  }

  const { data: fileData, error: fileError } = await admin.storage
    .from("radar-files")
    .download(radarFile.file_url);

  if (fileError || !fileData) {
    await recordActivity({
      admin,
      level: "error",
      action: "radar.import.failed",
      actorUserId: userId,
      orgId: radarFile.org_id,
      entityType: "radar_file",
      entityId: radarFile.id,
      message: "Import datas impossible: fichier storage introuvable.",
    });
    await admin
      .from("radar_files")
      .update({ status: "error", error: "Fichier introuvable." })
      .eq("id", radarFileId);
    return Response.json({ error: "Fichier datas introuvable." }, { status: 500 });
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());
  const openai = new OpenAI({ apiKey: openaiKey });
  const locale = orgData?.locale ?? "fr-FR";
  const language = locale.toLowerCase().startsWith("fr") ? "francais" : "anglais";
  const isSmart2MoveGraph = promptConfig.mode === "smart2move_graph";

  let smart2MoveTpiContextBlock = "Aucun profil TPI associe.";
  if (isSmart2MoveGraph) {
    const { data: studentData } = await admin
      .from("students")
      .select("tpi_report_id")
      .eq("id", radarFile.student_id)
      .single();

    const tpiReportId = studentData?.tpi_report_id ?? null;
    if (tpiReportId) {
      const { data: tpiTests } = await admin
        .from("tpi_tests")
        .select(
          "test_name, result_color, mini_summary, details, details_translated, position"
        )
        .eq("report_id", tpiReportId)
        .order("position", { ascending: true });

      smart2MoveTpiContextBlock = buildSmart2MoveTpiContextBlock(
        (tpiTests ?? []) as Array<{
          test_name: string | null;
          result_color: string | null;
          mini_summary: string | null;
          details: string | null;
          details_translated: string | null;
          position: number | null;
        }>
      );
    }
  }

  const startedAt = Date.now();
  const endpoint = `radar_extract:${normalizeRadarSource(radarFile.source)}:${origin}`;
  let usageTotal: UsageMetrics = null;
  let verifyUsageTotal: UsageMetrics = null;

  const recordUsage = async (
    action: string,
    usagePayload: UsageMetrics,
    durationMs: number,
    statusCode = 200,
    errorType?: "timeout" | "exception"
  ) => {
    const shouldRecord = Boolean(usagePayload) || statusCode >= 400;
    if (!shouldRecord) return;
    const inputTokens = usagePayload?.input_tokens ?? 0;
    const outputTokens = usagePayload?.output_tokens ?? 0;
    const totalTokens = usagePayload?.total_tokens ?? inputTokens + outputTokens;
    const costEurCents = computeAiCostEurCents(inputTokens, outputTokens, "gpt-5.2");
    await admin.from("ai_usage").insert([
      {
        user_id: userId,
        org_id: radarFile.org_id,
        action,
        model: "gpt-5.2",
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        cost_eur_cents: costEurCents,
        duration_ms: durationMs,
        endpoint,
        status_code: statusCode,
        error_type: errorType ?? null,
      },
    ]);
  };

  let extracted: RadarExtraction | null = null;
  let smart2MoveExtracted: Smart2MoveGraphExtraction | null = null;
  let verificationWarning: string | null = null;
  const verifyStartedAt = Date.now();
  try {
    const promptTemplate = await loadPromptSection(promptConfig.extractSystemSection);
    const fallbackPromptTemplate =
      promptConfig.extractFallbackSection
        ? await loadPromptSection(promptConfig.extractFallbackSection)
        : "";
    const resolvedPromptTemplate = promptTemplate || fallbackPromptTemplate;
    const userInstruction = isSmart2MoveGraph
      ? `Voici un graphe Smart2Move a analyser pour coaching golf.
Type selectionne par le coach: ${promptConfig.smart2MoveGraphLabel ?? "Smart2Move"} (${promptConfig.smart2MoveGraphType ?? "unknown"}).
Repere impact impose par le coach (ratio X): ${normalizedImpactMarkerX?.toFixed(4) ?? "unknown"}.
Repere debut transition impose par le coach (ratio X): ${normalizedTransitionStartX?.toFixed(4) ?? "auto"}.
Fenetre section 3 (pics/chronologie) imposee autour de l impact: ${smart2MovePeakWindow ? `[${smart2MovePeakWindow.start.toFixed(4)}, ${smart2MovePeakWindow.end.toFixed(4)}]` : "unknown"}.
Appliquer exclusivement ce template. Ne pas deviner ou requalifier un autre type de graphe.
Retourner strictement le JSON attendu avec:
- graph_type
- annotations (EXACTEMENT 4 avec bubble_key parmi address_backswing, transition_impact, peak_intensity_timing, summary)
- analysis
- summary
Contraintes overlay/analysis:
- Section 2 (Transition -> Impact): analyser STRICTEMENT la portion [transitionStartX, impactX]
- Section 3 (Intensite des pics et chronologie): analyser en priorite la fenetre autour d impact [peakWindowStart, peakWindowEnd]
- Ne pas modifier les reperes fournis par le coach
Regles de contenu:
- Le champ evidence de chaque annotation doit etre une explication biomecanique (causalite corporelle/mecanique), pas une simple description du graphe.
- Sortie concise obligatoire:
  - analysis: 4 sections, chaque section = 1 paragraphe court (2 phrases max, <= 280 caracteres)
  - annotations.detail/reasoning/solution/evidence: formulation courte et actionnable (1 a 2 phrases max)
  - summary: 2 phrases max
Le champ analysis doit suivre EXACTEMENT 4 sections numerotees:
1. Adresse -> Backswing
2. Transition -> Impact
3. Intensite des pics et chronologie
4. Resume global mecanique`
      : `Voici un export ${promptConfig.sourceLabel} en image. ` +
        "Retourne: columns (group,label,unit), rows (shot, values[]), avg, dev, summary. " +
        "Utilise null pour les cellules vides ou '-'.";

    const response = await openai.responses.create({
      model: "gpt-5.2",
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: applyTemplate(resolvedPromptTemplate, {
                language,
                tpiContextBlock: smart2MoveTpiContextBlock,
              }),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: userInstruction,
            },
            {
              type: "input_image",
              image_url: `data:${radarFile.file_mime || "image/png"};base64,${buffer.toString(
                "base64"
              )}`,
              detail: "high",
            },
          ],
        },
      ],
      max_output_tokens: isSmart2MoveGraph ? 2200 : 6500,
      text: {
        format: {
          type: "json_schema",
          name: isSmart2MoveGraph ? "radar_extract_smart2move_graph" : "radar_extract",
          description: promptConfig.extractSchemaDescription,
          schema: isSmart2MoveGraph ? buildSmart2MoveGraphSchema() : buildRadarSchema(),
          strict: true,
        },
      },
    });

    usageTotal = mergeUsageMetrics(usageTotal, response.usage ?? null);
    const outputText = extractOutputText(response);
    if (!outputText) {
      throw new Error("Reponse OCR vide.");
    }
    if (isSmart2MoveGraph) {
      smart2MoveExtracted = JSON.parse(outputText) as Smart2MoveGraphExtraction;
      smart2MoveExtracted = compactSmart2MoveExtraction({
        ...smart2MoveExtracted,
        analysis: ensureSmart2MoveTitle(
          smart2MoveExtracted.analysis,
          promptConfig.smart2MoveGraphLabel ?? "Smart2Move"
        ),
      });
      if (!smart2MoveExtracted.analysis.trim()) {
        throw new Error("Analyse Smart2Move vide.");
      }
    } else {
      extracted = JSON.parse(outputText) as RadarExtraction;
    }
  } catch (error) {
    await recordActivity({
      admin,
      level: "error",
      action: "radar.import.failed",
      actorUserId: userId,
      orgId: radarFile.org_id,
      entityType: "radar_file",
      entityId: radarFile.id,
      message: (error as Error).message ?? "Extraction datas impossible.",
    });
    await admin
      .from("radar_files")
      .update({ status: "error", error: (error as Error).message ?? "OCR error." })
      .eq("id", radarFileId);
    await recordUsage(
      "radar_extract",
      usageTotal,
      Date.now() - startedAt,
      500,
      "exception"
    );
    return Response.json(
      { error: (error as Error).message ?? "Extraction datas impossible." },
      { status: 500 }
    );
  }

  await recordUsage("radar_extract", usageTotal, Date.now() - startedAt, 200);

  try {
    const verifyPromptTemplate = await loadPromptSection(promptConfig.verifySystemSection);
    const fallbackVerifyPromptTemplate =
      promptConfig.verifyFallbackSection
        ? await loadPromptSection(promptConfig.verifyFallbackSection)
        : "";
    const verifyPrompt = verifyPromptTemplate || fallbackVerifyPromptTemplate;
    if (isSmart2MoveGraph) {
      const smart2MoveSnapshot = {
        graph_type: smart2MoveExtracted?.graph_type ?? null,
        impact_marker_x: normalizedImpactMarkerX ?? null,
        transition_start_x: normalizedTransitionStartX ?? null,
        peak_window_x: smart2MovePeakWindow
          ? { start: smart2MovePeakWindow.start, end: smart2MovePeakWindow.end }
          : null,
        annotations: smart2MoveExtracted?.annotations ?? [],
        analysis: smart2MoveExtracted?.analysis ?? null,
        summary: smart2MoveExtracted?.summary ?? null,
      };
      const baseVerifyText =
        "Voici l extraction Smart2Move a verifier. Compare a l image source.\n" +
        `Type selectionne par le coach: ${promptConfig.smart2MoveGraphLabel ?? "Smart2Move"} (${promptConfig.smart2MoveGraphType ?? "unknown"}).\n` +
        JSON.stringify(smart2MoveSnapshot, null, 2);
      const verifyResponse = await openai.responses.create({
        model: "gpt-5.2",
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: verifyPrompt }],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: baseVerifyText,
              },
              {
                type: "input_image",
                image_url: `data:${radarFile.file_mime || "image/png"};base64,${buffer.toString(
                  "base64"
                )}`,
                detail: "high",
              },
            ],
          },
        ],
        max_output_tokens: 900,
        text: {
          format: {
            type: "json_schema",
            name: "radar_extract_smart2move_verify",
            description: promptConfig.verifySchemaDescription,
            schema: buildSmart2MoveVerifySchema(),
            strict: true,
          },
        },
      });

      verifyUsageTotal = mergeUsageMetrics(
        verifyUsageTotal,
        verifyResponse.usage ?? null
      );
      const verifyText = extractOutputText(verifyResponse);
      if (!verifyText) {
        throw new Error("Verification vide.");
      }
      const verification = JSON.parse(verifyText) as Smart2MoveGraphVerification;
      if (!verification.is_valid) {
        const issueText = verification.issues?.slice(0, 3).join(" | ");
        verificationWarning = issueText
          ? `Verification extraction Smart2Move echouee: ${issueText}`
          : "Verification extraction Smart2Move echouee.";
      }
      if (!verification.matches_selected_graph_type) {
        verificationWarning = verificationWarning
          ? `${verificationWarning} | Le graphe extrait ne correspond pas au type selectionne par le coach.`
          : "Le graphe extrait ne correspond pas au type selectionne par le coach.";
      }
    } else {
      const verificationSnapshot = buildVerificationSnapshot(extracted ?? { columns: [], rows: [] });
      const baseVerifyText =
        `Voici l extraction ${promptConfig.sourceLabel} a verifier. ` +
        "Compare a l image source et signale toute incoherence.\n" +
        JSON.stringify(verificationSnapshot, null, 2);

      const callVerify = async (extraHint?: string) =>
        openai.responses.create({
          model: "gpt-5.2",
          input: [
            {
              role: "system",
              content: [{ type: "input_text", text: verifyPrompt }],
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: extraHint ? `${baseVerifyText}\n\n${extraHint}` : baseVerifyText,
                },
                {
                  type: "input_image",
                  image_url: `data:${radarFile.file_mime || "image/png"};base64,${buffer.toString(
                    "base64"
                  )}`,
                  detail: "high",
                },
              ],
            },
          ],
          max_output_tokens: 900,
          text: {
            format: {
              type: "json_schema",
              name: "radar_extract_verify",
              description: promptConfig.verifySchemaDescription,
              schema: buildRadarVerifySchema(),
              strict: true,
            },
          },
        });

      let verifyResponse = await callVerify();
      verifyUsageTotal = mergeUsageMetrics(
        verifyUsageTotal,
        verifyResponse.usage ?? null
      );
      let verifyText = extractOutputText(verifyResponse);
      if (!verifyText) {
        throw new Error("Verification vide.");
      }

      let verification = JSON.parse(verifyText) as RadarVerification;
      if (!verification.is_valid && (verification.confidence ?? 0) < 0.6) {
        verifyResponse = await callVerify(
          "Si tu as un doute, retourne is_valid=true avec une confidence basse et liste les points a verifier."
        );
        verifyUsageTotal = mergeUsageMetrics(
          verifyUsageTotal,
          verifyResponse.usage ?? null
        );
        verifyText = extractOutputText(verifyResponse);
        if (verifyText) {
          verification = JSON.parse(verifyText) as RadarVerification;
        }
      }

      if (!verification.is_valid) {
        const issueText = verification.issues?.slice(0, 3).join(" | ");
        const message = issueText
          ? `Verification extraction echouee: ${issueText}`
          : "Verification extraction echouee.";
        verificationWarning = message;
      }
    }

    await recordUsage(
      "radar_extract_verify",
      verifyUsageTotal,
      Date.now() - verifyStartedAt,
      200
    );
  } catch (error) {
    verificationWarning =
      (error as Error).message ?? "Verification extraction impossible.";
    await recordUsage(
      "radar_extract_verify",
      verifyUsageTotal,
      Date.now() - verifyStartedAt,
      200
    );
  }

  if (isSmart2MoveGraph) {
    const smart2MoveAnnotations = sanitizeSmart2MoveAnnotations(
      smart2MoveExtracted?.annotations ?? []
    );
    const smart2MoveMiniSummary = smart2MoveExtracted?.summary?.trim() ?? null;
    const selectedSmart2MoveGraphType = promptConfig.smart2MoveGraphType ?? null;
    const smart2MoveConfig = buildSmart2MoveConfig(
      smart2MoveAnnotations,
      smart2MoveMiniSummary,
      selectedSmart2MoveGraphType,
      normalizedImpactMarkerX,
      normalizedTransitionStartX
    );
    const smart2MoveSummary = smart2MoveExtracted?.analysis?.trim() ?? "";
    if (!smart2MoveSummary) {
      await admin
        .from("radar_files")
        .update({ status: "error", error: "Analyse Smart2Move vide." })
        .eq("id", radarFileId);
      return Response.json(
        { error: "Analyse Smart2Move vide." },
        { status: 500 }
      );
    }

    const { error: updateError } = await admin
      .from("radar_files")
      .update({
        status: "ready",
        columns: [],
        shots: [],
        stats: { avg: {}, dev: {} },
        summary: smart2MoveSummary,
        config: smart2MoveConfig,
        analytics: null,
        extracted_at: new Date().toISOString(),
        error: verificationWarning,
      })
      .eq("id", radarFileId);

    if (updateError) {
      await recordActivity({
        admin,
        level: "error",
        action: "radar.import.failed",
        actorUserId: userId,
        orgId: radarFile.org_id,
        entityType: "radar_file",
        entityId: radarFile.id,
        message: updateError.message ?? "Sauvegarde extraction Smart2Move impossible.",
      });
      return Response.json({ error: updateError.message }, { status: 500 });
    }

    await recordActivity({
      admin,
      action: "radar.import.success",
      actorUserId: userId,
      orgId: radarFile.org_id,
      entityType: "radar_file",
      entityId: radarFile.id,
      message: verificationWarning
        ? "Import Smart2Move termine avec avertissement."
        : "Import Smart2Move termine.",
      metadata: {
        hasWarning: Boolean(verificationWarning),
        source: "smart2move",
        graphType: selectedSmart2MoveGraphType,
      },
    });

    return Response.json({ status: "ok" });
  }

  if (!extracted) {
    return Response.json({ error: "Extraction datas vide." }, { status: 500 });
  }

  const rawColumns = (extracted.columns ?? []).map((column) => ({
    group: column.group ?? null,
    label: column.label?.trim() ?? "",
    unit: column.unit ?? null,
  }));
  const rawRows = extracted.rows ?? [];

  const isShotColumn = (column: { label: string }) => {
    const label = column.label.trim();
    if (label === "#") return true;
    const token = normalizeToken(label);
    return (
      token === "shot" ||
      token === "shot no" ||
      token === "shot number" ||
      token === "shot num" ||
      token === "shot n"
    );
  };

  const isHashColumn = (column: { label: string }) => column.label.trim() === "#";

  const shouldDropShotTitle =
    rawColumns.length >= 2 && isHashColumn(rawColumns[0]) && isShotColumn(rawColumns[1]);

  const columns = shouldDropShotTitle
    ? rawColumns.filter((_column, index) => index !== 1)
    : rawColumns;
  const keyCount = new Map<string, number>();
  const normalizedColumns = columns.map((column) => {
    const baseKey = buildKey(column.group, column.label);
    const nextCount = (keyCount.get(baseKey) ?? 0) + 1;
    keyCount.set(baseKey, nextCount);
    const key = nextCount > 1 ? `${baseKey}_${nextCount}` : baseKey;
    return { ...column, key };
  });

  const dataColumnCount = normalizedColumns.filter(
    (column) => !column.key.startsWith("shot_index")
  ).length;

  const shots = rawRows.map((row, rowIndex) => {
    const values = Array.isArray(row.values) ? row.values : [];
    let valueIndex = 0;
    let shotValue = row.shot ?? null;
    const valuesIncludeShot = values.length === dataColumnCount + 1;
    if (valuesIncludeShot) {
      if (shotValue === null || shotValue === undefined || shotValue === "") {
        shotValue = values[0] ?? null;
      }
      valueIndex = 1;
    }

    const shotIndexRaw = shotValue ?? rowIndex + 1;
    const shotIndex =
      typeof shotIndexRaw === "number"
        ? shotIndexRaw
        : Number(String(shotIndexRaw).replace(/[^\d-]/g, "")) || rowIndex + 1;
    const shot: Record<string, unknown> = { shot_index: shotIndex };
    normalizedColumns.forEach((column) => {
      if (column.key.startsWith("shot_index")) {
        return;
      }
      const value = values[valueIndex];
      shot[column.key] = parseCellValue(value);
      valueIndex += 1;
    });
    return shot;
  });

  const rawAvg = Array.isArray(extracted.avg) ? extracted.avg : null;
  const rawDev = Array.isArray(extracted.dev) ? extracted.dev : null;
  const alignedAvg =
    shouldDropShotTitle && rawAvg && rawAvg.length === rawColumns.length
      ? rawAvg.filter((_value, index) => index !== 1)
      : rawAvg;
  const alignedDev =
    shouldDropShotTitle && rawDev && rawDev.length === rawColumns.length
      ? rawDev.filter((_value, index) => index !== 1)
      : rawDev;

  const statsFromModel = {
    avg: alignedAvg ?? null,
    dev: alignedDev ?? null,
  };

  const statsFromRows = computeStats(shots);

  const avg: Record<string, number | null> = {};
  const dev: Record<string, number | null> = {};

  normalizedColumns.forEach((column, index) => {
    const avgValue = statsFromModel.avg?.[index] ?? null;
    const devValue = statsFromModel.dev?.[index] ?? null;
    const parsedAvg = parseCellValue(avgValue) as number | string | null;
    const parsedDev = parseCellValue(devValue) as number | string | null;
    avg[column.key] =
      typeof parsedAvg === "number" ? parsedAvg : (statsFromRows.avg[column.key] ?? null);
    dev[column.key] =
      typeof parsedDev === "number" ? parsedDev : (statsFromRows.dev[column.key] ?? null);
  });

  const config = DEFAULT_RADAR_CONFIG;

  const metadataForAnalytics = {
    club: normalizeClubLabel(extracted.metadata?.club ?? null),
    ball: extracted.metadata?.ball ?? null,
  };

  const analytics = computeAnalytics({
    columns: normalizedColumns,
    shots,
    config,
    metadata: metadataForAnalytics,
  });
  analytics.meta.club = resolveClubFromAnalytics(metadataForAnalytics.club, analytics);

  const { error: updateError } = await admin
    .from("radar_files")
    .update({
      status: "review",
      columns: normalizedColumns,
      shots,
      stats: { avg, dev },
      summary: extracted.summary ?? analytics.summary ?? null,
      config,
      analytics,
      extracted_at: new Date().toISOString(),
      error: verificationWarning,
    })
    .eq("id", radarFileId);

  if (updateError) {
    await recordActivity({
      admin,
      level: "error",
      action: "radar.import.failed",
      actorUserId: userId,
      orgId: radarFile.org_id,
      entityType: "radar_file",
      entityId: radarFile.id,
      message: updateError.message ?? "Sauvegarde import datas impossible.",
    });
    return Response.json({ error: updateError.message }, { status: 500 });
  }

  await recordActivity({
    admin,
    action: "radar.import.success",
    actorUserId: userId,
    orgId: radarFile.org_id,
    entityType: "radar_file",
    entityId: radarFile.id,
    message: verificationWarning
      ? "Import datas termine avec avertissement."
      : "Import datas termine.",
    metadata: {
      hasWarning: Boolean(verificationWarning),
    },
  });

  return Response.json({ status: "ok" });
}
