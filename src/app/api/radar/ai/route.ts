import { z } from "zod";
import OpenAI from "openai";
import { RADAR_CHART_DEFINITIONS, RADAR_CHART_GROUPS } from "@/lib/radar/charts/registry";
import { DEFAULT_RADAR_CONFIG } from "@/lib/radar/config";
import { PGA_BENCHMARKS } from "@/lib/radar/pga-benchmarks";
import type { RadarAnalytics } from "@/lib/radar/types";
import { env } from "@/env";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { applyTemplate, loadPromptSection } from "@/lib/promptLoader";
import { formatZodError, parseRequestJson } from "@/lib/validation";

export const runtime = "nodejs";

type RadarAiMode = "questions" | "auto";

type RadarAiRequest = {
  mode: RadarAiMode;
  context?: string;
  sections?: Array<{ title: string; content: string }>;
  answers?: Record<string, string>;
  radarSections?: Array<{
    id: string;
    radarFileId: string;
    preset?: string | null;
    syntax?: string | null;
  }>;
};

type RadarQuestion = {
  id: string;
  question: string;
  type: "text" | "choices";
  choices: string[];
  required: boolean;
  placeholder: string;
};

type RadarAutoChart = {
  key: string;
  title: string;
  reason: string;
  commentary: string;
  solution: string;
};

type RadarAutoSection = {
  sectionId: string;
  selectionSummary: string;
  sessionSummary: string;
  charts: RadarAutoChart[];
};

type RadarAutoResponse = {
  sections: RadarAutoSection[];
};

type ErrorType = "timeout" | "exception";

const radarAiRequestSchema = z.object({
  mode: z.enum(["questions", "auto"]),
  context: z.string().optional(),
  sections: z.array(z.object({ title: z.string(), content: z.string() })).optional(),
  answers: z.record(z.string()).optional(),
  radarSections: z
    .array(
      z.object({
        id: z.string(),
        radarFileId: z.string(),
        preset: z.string().nullable().optional(),
        syntax: z.string().nullable().optional(),
      })
    )
    .optional(),
});

const BASE_CHART_KEYS = [
  "dispersion",
  "carryTotal",
  "speeds",
  "spinCarry",
  "smash",
  "faceImpact",
];

const AI_PRESETS = new Set(["ultra", "synthetic", "standard", "pousse", "complet"]);

const AI_SYNTAXES = new Set([
  "exp-tech",
  "exp-comp",
  "exp-tech-solution",
  "exp-solution",
  "global",
]);

const resolvePreset = (value?: string | null) =>
  value && AI_PRESETS.has(value) ? value : "standard";

const resolveSyntax = (value?: string | null) =>
  value && AI_SYNTAXES.has(value) ? value : "exp-tech-solution";

const loadRadarPrompt = (section: "questions_system" | "auto_system") =>
  loadPromptSection(section);

const resolveSettings = (org: {
  ai_tone: string | null;
  ai_tech_level: string | null;
  ai_style: string | null;
  ai_length: string | null;
  ai_imagery: string | null;
  ai_focus: string | null;
}) => ({
  tone: org.ai_tone ?? "bienveillant",
  techLevel: org.ai_tech_level ?? "intermediaire",
  style: org.ai_style ?? "redactionnel",
  length: org.ai_length ?? "normal",
  imagery: org.ai_imagery ?? "equilibre",
  focus: org.ai_focus ?? "mix",
});

const resolveImageryHint = async (value: string) =>
  value === "faible"
    ? await loadPromptSection("ai_hint_imagery_faible")
    : value === "fort"
      ? await loadPromptSection("ai_hint_imagery_fort")
      : await loadPromptSection("ai_hint_imagery_equilibre");

const resolveFocusHint = async (value: string) =>
  value === "technique"
    ? await loadPromptSection("ai_hint_focus_technique")
    : value === "mental"
      ? await loadPromptSection("ai_hint_focus_mental")
      : value === "strategie"
        ? await loadPromptSection("ai_hint_focus_strategie")
        : await loadPromptSection("ai_hint_focus_mix");

const truncate = (value: string, max = 420) =>
  value.length > max ? `${value.slice(0, max)}...` : value;

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

const summarizePayload = (payload: {
  type: string;
  points?: Array<{ x: number; y: number }>;
  series?: Array<{ values: number[] }>;
  bins?: Array<{ label: string; count: number }>;
  variables?: string[];
  model?: { r2: number; n: number };
}) => {
  if (payload.type === "scatter" && payload.points) {
    const r = correlation(payload.points);
    return {
      sample: payload.points.length,
      correlation: r !== null ? Number(r.toFixed(2)) : null,
    };
  }
  if (payload.type === "line" && payload.series?.[0]) {
    const values = payload.series[0].values;
    if (!values.length) return { sample: 0 };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const trend = values[values.length - 1] - values[0];
    return {
      sample: values.length,
      min: Number(min.toFixed(2)),
      max: Number(max.toFixed(2)),
      trend: Number(trend.toFixed(2)),
    };
  }
  if (payload.type === "hist" && payload.bins?.length) {
    const total = payload.bins.reduce((acc, bin) => acc + bin.count, 0);
    const top = payload.bins.reduce((best, bin) => (bin.count > best.count ? bin : best));
    return {
      sample: total,
      top_bin: top?.label ?? null,
      top_share: total ? Number((top.count / total).toFixed(2)) : null,
    };
  }
  if (payload.type === "matrix" && payload.variables) {
    return { variables: payload.variables.length };
  }
  if (payload.type === "model" && payload.model) {
    return { r2: payload.model.r2, n: payload.model.n };
  }
  return {};
};

const statOrNull = (
  analytics: RadarAnalytics,
  key: string
): { mean: number | null; std: number | null } | null => {
  const stat = analytics.globalStats?.[key];
  if (!stat) return null;
  return {
    mean: typeof stat.mean === "number" ? Number(stat.mean.toFixed(2)) : null,
    std: typeof stat.std === "number" ? Number(stat.std.toFixed(2)) : null,
  };
};

const buildRadarSummary = (analytics: RadarAnalytics) => {
  const stats = {
    carry: statOrNull(analytics, "carry"),
    total: statOrNull(analytics, "total"),
    lateral: statOrNull(analytics, "lateral"),
    club_speed: statOrNull(analytics, "club_speed"),
    ball_speed: statOrNull(analytics, "ball_speed"),
    smash: statOrNull(analytics, "smash"),
    spin_rpm: statOrNull(analytics, "spin_rpm"),
    launch_v: statOrNull(analytics, "launch_v"),
    height: statOrNull(analytics, "height"),
    descent_v: statOrNull(analytics, "descent_v"),
    impact_lat: statOrNull(analytics, "impact_lat"),
    impact_vert: statOrNull(analytics, "impact_vert"),
  };

  const hasStat = (key: keyof typeof stats) =>
    stats[key]?.mean !== null && stats[key]?.mean !== undefined;

  const baseCharts = [
    {
      key: "dispersion",
      title: "Dispersion",
      description: "Dispersion laterale vs distance pour evaluer la precision.",
      available: hasStat("lateral") && (hasStat("carry") || hasStat("total")),
      facts: {
        withinLat10: analytics.derived?.corridors?.withinLat10 ?? null,
        lateralStd: stats.lateral?.std ?? null,
      },
    },
    {
      key: "carryTotal",
      title: "Carry vs total",
      description: "Compare carry et distance totale par coup.",
      available: hasStat("carry") && hasStat("total"),
      facts: {
        carryMean: stats.carry?.mean ?? null,
        totalMean: stats.total?.mean ?? null,
      },
    },
    {
      key: "speeds",
      title: "Vitesse club/balle",
      description: "Evolution des vitesses pour estimer l efficacite.",
      available: hasStat("club_speed") || hasStat("ball_speed"),
      facts: {
        clubSpeed: stats.club_speed?.mean ?? null,
        ballSpeed: stats.ball_speed?.mean ?? null,
        smash: stats.smash?.mean ?? null,
      },
    },
    {
      key: "spinCarry",
      title: "Spin vs carry",
      description: "Relation entre spin et distance (carry).",
      available: hasStat("spin_rpm") && (hasStat("carry") || hasStat("total")),
      facts: {
        spinMean: stats.spin_rpm?.mean ?? null,
      },
    },
    {
      key: "smash",
      title: "Smash factor",
      description: "Efficacite d impact au fil des coups.",
      available: hasStat("smash"),
      facts: {
        smashMean: stats.smash?.mean ?? null,
        smashStd: stats.smash?.std ?? null,
      },
    },
    {
      key: "faceImpact",
      title: "Impact face",
      description: "Carte des impacts sur la face du club.",
      available: hasStat("impact_lat") && hasStat("impact_vert"),
      facts: {
        impactLat: stats.impact_lat?.mean ?? null,
        impactVert: stats.impact_vert?.mean ?? null,
      },
    },
  ];

  const advancedCharts = RADAR_CHART_DEFINITIONS.map((definition) => {
    const chartData = analytics.chartsData?.[definition.key];
    const payload = chartData?.payload;
    return {
      key: definition.key,
      title: definition.title,
      description: definition.description,
      group:
        RADAR_CHART_GROUPS.find((group) => group.key === definition.group)?.label ?? null,
      available: !!chartData?.available && !!payload,
      type: payload?.type ?? null,
      insight: payload?.insight ?? null,
      summary: payload ? summarizePayload(payload) : null,
    };
  });

  return {
    meta: analytics.meta,
    stats,
    corridors: analytics.derived?.corridors ?? null,
    baseCharts,
    advancedCharts,
  };
};

const buildRadarSelectionPrompt = (
  sections: RadarAutoSection[],
  payloads: Array<{
    id: string;
    preset: string;
    syntax: string;
    summary: ReturnType<typeof buildRadarSummary>;
  }>,
  context: string,
  answers?: Record<string, string>
) => {
  const presetRules =
    "Regles preset:\n" +
    "- ultra: 1 a 2 graphes, dont au moins 1 de base.\n" +
    "- synthetic: 1 a 4 graphes, dont au moins 1 de base.\n" +
    "- standard: 3 a 6 graphes, dont au moins 2 de base.\n" +
    "- pousse: 4 a 10 graphes, dont au moins 4 de base.\n" +
    "- complet: 5 a 10 graphes, dont les 6 graphes de base.";
  const baseList = `Graphes de base: ${BASE_CHART_KEYS.join(", ")}.`;

  const sectionLines = sections.map((section, index) => {
    const payload = payloads.find((item) => item.id === section.sectionId);
    const baseAvailable =
      payload?.summary?.baseCharts
        ?.filter((chart) => chart.available)
        .map((chart) => chart.key) ?? [];
    const advancedAvailable =
      payload?.summary?.advancedCharts
        ?.filter((chart) => chart.available)
        .map((chart) => chart.key) ?? [];
    const availableKeys =
      [...baseAvailable, ...advancedAvailable].length > 0
        ? [...baseAvailable, ...advancedAvailable]
        : BASE_CHART_KEYS;
    const availableLine = availableKeys.join(", ");
    return [
      `Section ${index + 1}: ${section.sectionId}`,
      `Preset: ${payload?.preset ?? "standard"} | Synthaxe: ${
        payload?.syntax ?? "exp-tech-solution"
      }`,
      `Graphes disponibles (keys): ${availableLine}`,
      `Context: ${context || "-"}`,
      `Reponses coach: ${answers ? JSON.stringify(answers) : "-"}`,
      `Meta: ${payload?.summary?.meta?.club ?? "club inconnu"} | ${
        payload?.summary?.meta?.shotCount ?? 0
      } coups`,
      `Stats: ${JSON.stringify(payload?.summary?.stats ?? {})}`,
      `Corridors: ${JSON.stringify(payload?.summary?.corridors ?? {})}`,
      `Graphes base: ${JSON.stringify(payload?.summary?.baseCharts ?? [])}`,
      `Graphes avances: ${JSON.stringify(payload?.summary?.advancedCharts ?? [])}`,
    ].join("\n");
  });

  return [presetRules, baseList, sectionLines.join("\n\n")].join("\n\n");
};

export async function POST(req: Request) {
  const parsed = await parseRequestJson(req, radarAiRequestSchema);
  if (!parsed.success) {
    return Response.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }
  const payload = parsed.data as RadarAiRequest;

  const supabase = createSupabaseServerClientFromRequest(req);
  const admin = createSupabaseAdminClient();
  const openaiKey = env.OPENAI_API_KEY;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return Response.json({ error: "Non autorise." }, { status: 401 });
  }

  const userId = userData.user.id;
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("id", userId)
    .single();

  if (profileError || !profileData?.org_id) {
    return Response.json({ error: "Profil introuvable." }, { status: 403 });
  }

  const { data: orgData, error: orgError } = await supabase
    .from("organizations")
    .select(
      "id, ai_enabled, ai_model, ai_tone, ai_tech_level, ai_style, ai_length, ai_imagery, ai_focus"
    )
    .eq("id", profileData.org_id)
    .single();

  if (orgError || !orgData) {
    return Response.json({ error: "Organisation introuvable." }, { status: 403 });
  }

  if (!orgData.ai_enabled) {
    return Response.json({ error: "IA desactivee." }, { status: 403 });
  }

  const settings = resolveSettings(orgData);
  const imageryHint = await resolveImageryHint(settings.imagery);
  const focusHint = await resolveFocusHint(settings.focus);
  const baseTemplate = await loadPromptSection("ai_api_system_base");
  const baseSystemPrompt = applyTemplate(baseTemplate, {
    tone: settings.tone,
    techLevel: settings.techLevel,
    imageryHint,
    focusHint,
  });

  const endpoint = "radar_ai";
  let usage: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  } | null = null;

  const recordUsage = async (
    action: string,
    usagePayload: typeof usage,
    durationMs: number,
    statusCode = 200,
    errorType?: ErrorType
  ) => {
    const shouldRecord = Boolean(usagePayload) || statusCode >= 400;
    if (!shouldRecord) return;
    const inputTokens = usagePayload?.input_tokens ?? 0;
    const outputTokens = usagePayload?.output_tokens ?? 0;
    const totalTokens = usagePayload?.total_tokens ?? inputTokens + outputTokens;
    await admin.from("ai_usage").insert([
      {
        user_id: userId,
        org_id: orgData.id,
        action,
        model: orgData.ai_model ?? "gpt-5-mini",
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        duration_ms: durationMs,
        endpoint,
        status_code: statusCode,
        error_type: errorType ?? null,
      },
    ]);
  };

  const openai = new OpenAI({ apiKey: openaiKey });
  const model = orgData.ai_model ?? "gpt-5-mini";

  if (payload.mode === "questions") {
    const prompt = await loadRadarPrompt("questions_system");
    const contextBlock = (payload.sections ?? [])
      .map((section) => `${section.title}: ${truncate(section.content ?? "")}`)
      .filter(Boolean)
      .join("\n");
    const questionTemplate = await loadPromptSection("radar_ai_questions_user");
    const questionUserPrompt = applyTemplate(questionTemplate, {
      context: payload.context ?? "-",
      sections: contextBlock || "-",
    });

    const callStartedAt = Date.now();
    const response = await openai.responses.create({
      model,
      input: [
        { role: "system", content: `${baseSystemPrompt}\n${prompt}` },
        {
          role: "user",
          content: questionUserPrompt,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "radar_questions",
          description: "Retourne un objet JSON avec questions.",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              questions: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    id: { type: "string" },
                    question: { type: "string" },
                    type: { type: "string", enum: ["text", "choices"] },
                    choices: {
                      type: "array",
                      items: { type: "string" },
                    },
                    required: { type: "boolean" },
                    placeholder: { type: "string" },
                  },
                  required: [
                    "id",
                    "question",
                    "type",
                    "choices",
                    "required",
                    "placeholder",
                  ],
                },
              },
            },
            required: ["questions"],
          },
          strict: true,
        },
      },
    });

    usage = response.usage ?? null;
    const text = response.output_text?.trim() ?? "";
    try {
      const parsed = JSON.parse(text) as { questions: RadarQuestion[] };
      await recordUsage("radar_questions", usage, Date.now() - callStartedAt, 200);
      return Response.json(parsed);
    } catch {
      await recordUsage(
        "radar_questions",
        usage,
        Date.now() - callStartedAt,
        500,
        "exception"
      );
      return Response.json({ error: "Reponse IA invalide.", raw: text }, { status: 500 });
    }
  }

  if (payload.mode !== "auto") {
    return Response.json({ error: "mode invalide." }, { status: 400 });
  }

  const radarSections = payload.radarSections ?? [];
  if (!radarSections.length) {
    return Response.json({ error: "Aucune section datas." }, { status: 400 });
  }

  const radarFileIds = radarSections.map((section) => section.radarFileId);
  const { data: radarFiles, error: radarError } = await admin
    .from("radar_files")
    .select("id, org_id, analytics, created_at")
    .in("id", radarFileIds);

  if (radarError) {
    return Response.json({ error: radarError.message }, { status: 500 });
  }

  const summaries = radarSections
    .map((section) => {
      const radarFile = radarFiles?.find((file) => file.id === section.radarFileId);
      if (!radarFile || radarFile.org_id !== orgData.id) return null;
      if (!radarFile.analytics) return null;
      const summary = buildRadarSummary(radarFile.analytics as RadarAnalytics);
      return {
        id: section.id,
        preset: resolvePreset(section.preset),
        syntax: resolveSyntax(section.syntax),
        summary,
      };
    })
    .filter(Boolean) as Array<{
    id: string;
    preset: string;
    syntax: string;
    summary: ReturnType<typeof buildRadarSummary>;
  }>;

  if (!summaries.length) {
    return Response.json({ error: "Analyses datas indisponibles." }, { status: 400 });
  }

  const autoSystemPrompt = await loadRadarPrompt("auto_system");
  const autoUserPrompt = buildRadarSelectionPrompt(
    radarSections.map((section) => ({
      sectionId: section.id,
      selectionSummary: "",
      sessionSummary: "",
      charts: [],
    })),
    summaries,
    payload.context ?? "",
    payload.answers
  );
  const autoUserTemplate = await loadPromptSection("radar_ai_auto_user");
  const autoUserText = applyTemplate(autoUserTemplate, {
    context: payload.context ?? "-",
    answers: payload.answers ? JSON.stringify(payload.answers) : "-",
    benchmarks: JSON.stringify(PGA_BENCHMARKS),
    radarData: autoUserPrompt,
  });

  const sectionAllowedKeys = new Map<string, Set<string>>();
  const allowedKeysSet = new Set<string>();
  summaries.forEach((entry) => {
    const baseAvailable = entry.summary.baseCharts
      .filter((chart) => chart.available)
      .map((chart) => chart.key);
    const advancedAvailable = entry.summary.advancedCharts
      .filter((chart) => chart.available)
      .map((chart) => chart.key);
    const availableKeys =
      [...baseAvailable, ...advancedAvailable].length > 0
        ? [...baseAvailable, ...advancedAvailable]
        : BASE_CHART_KEYS;
    const keysSet = new Set(availableKeys);
    sectionAllowedKeys.set(entry.id, keysSet);
    availableKeys.forEach((key) => allowedKeysSet.add(key));
  });

  const allowedKeys = Array.from(allowedKeysSet);
  const expectedSectionIds = radarSections.map((section) => section.id);
  const knownChartKeys = new Set([
    ...Object.keys(DEFAULT_RADAR_CONFIG.charts),
    ...RADAR_CHART_DEFINITIONS.map((definition) => definition.key),
  ]);
  const retryHint = `IMPORTANT: renvoie exactement une section par sectionId. SectionIds: ${expectedSectionIds.join(
    ", "
  )}. Chaque section doit contenir au moins 1 graphe (respecte le preset). Utilise uniquement ces graphes autorises: ${allowedKeys.join(
    ", "
  )}. Aucun graphe inconnu.`;

  const callAuto = async (extraSystemHint?: string) => {
    const systemPrompt = extraSystemHint
      ? `${baseSystemPrompt}\n${autoSystemPrompt}\n${extraSystemHint}`
      : `${baseSystemPrompt}\n${autoSystemPrompt}`;
    return openai.responses.create({
      model,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: autoUserText },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "radar_auto",
          description: "Retourne un objet JSON avec sections et selections.",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              sections: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    sectionId: { type: "string" },
                    selectionSummary: { type: "string" },
                    sessionSummary: { type: "string" },
                    charts: {
                      type: "array",
                      minItems: 1,
                      items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          key: { type: "string", enum: allowedKeys },
                          title: { type: "string" },
                          reason: { type: "string" },
                          commentary: { type: "string" },
                          solution: { type: "string" },
                        },
                        required: ["key", "title", "reason", "commentary", "solution"],
                      },
                    },
                  },
                  required: ["sectionId", "selectionSummary", "sessionSummary", "charts"],
                },
              },
            },
            required: ["sections"],
          },
          strict: true,
        },
      },
    });
  };

  const isValidSelection = (parsed: RadarAutoResponse) => {
    if (!parsed.sections?.length) return false;
    const idSet = new Set(parsed.sections.map((section) => section.sectionId));
    const hasAllSections = expectedSectionIds.every((id) => idSet.has(id));
    const hasCharts = parsed.sections.every(
      (section) => Array.isArray(section.charts) && section.charts.length > 0
    );
    const keysValid = parsed.sections.every((section) => {
      const allowed = sectionAllowedKeys.get(section.sectionId);
      if (!allowed) return false;
      return section.charts.every(
        (chart) => knownChartKeys.has(chart.key) && allowed.has(chart.key)
      );
    });
    return hasAllSections && hasCharts && keysValid;
  };

  const parseAutoResponse = (rawText: string) => {
    const text = rawText.trim();
    return JSON.parse(text) as RadarAutoResponse;
  };

  let callStartedAt = Date.now();
  let response = await callAuto();
  usage = response.usage ?? null;
  let action = "radar_auto";

  let text = response.output_text?.trim() ?? "";
  try {
    let parsed = parseAutoResponse(text);
    if (!isValidSelection(parsed)) {
      await recordUsage(
        "radar_auto",
        usage,
        Date.now() - callStartedAt,
        500,
        "exception"
      );
      callStartedAt = Date.now();
      response = await callAuto(retryHint);
      usage = response.usage ?? null;
      text = response.output_text?.trim() ?? "";
      parsed = parseAutoResponse(text);
      action = "radar_auto_retry";
    }
    if (!isValidSelection(parsed)) {
      await recordUsage(
        "radar_auto_retry",
        usage,
        Date.now() - callStartedAt,
        500,
        "exception"
      );
      return Response.json(
        {
          error: "Reponse IA invalide (selection vide ou section manquante).",
          raw: text,
        },
        { status: 500 }
      );
    }
    await recordUsage(action, usage, Date.now() - callStartedAt, 200);
    return Response.json(parsed);
  } catch {
    await recordUsage(action, usage, Date.now() - callStartedAt, 500, "exception");
    return Response.json({ error: "Reponse IA invalide.", raw: text }, { status: 500 });
  }
}
