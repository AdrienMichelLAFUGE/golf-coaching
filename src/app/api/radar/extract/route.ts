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

const radarExtractSchema = z.object({
  radarFileId: z.string().min(1),
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

export async function POST(req: Request) {
  const parsed = await parseRequestJson(req, radarExtractSchema);
  if (!parsed.success) {
    return Response.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }

  const { radarFileId } = parsed.data;
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
    return Response.json({ error: "Fichier datas introuvable." }, { status: 404 });
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", userId)
    .single();

  if (!profileData || String(profileData.org_id) !== String(radarFile.org_id)) {
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
      return Response.json({ error: usageError.message }, { status: 500 });
    }
    if ((usageCount ?? 0) >= entitlements.quotas.dataExtractsPer30d) {
      return Response.json(
        { error: "Quota d extractions atteint (30 jours glissants)." },
        { status: 403 }
      );
    }
  }

  const { data: fileData, error: fileError } = await admin.storage
    .from("radar-files")
    .download(radarFile.file_url);

  if (fileError || !fileData) {
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

  const startedAt = Date.now();
  const endpoint = "radar_extract";
  let usage: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  } | null = null;
  let verifyUsage: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  } | null = null;

  const recordUsage = async (
    action: string,
    usagePayload: typeof usage,
    durationMs: number,
    statusCode = 200,
    errorType?: "timeout" | "exception"
  ) => {
    const shouldRecord = Boolean(usagePayload) || statusCode >= 400;
    if (!shouldRecord) return;
    const inputTokens = usagePayload?.input_tokens ?? 0;
    const outputTokens = usagePayload?.output_tokens ?? 0;
    const totalTokens = usagePayload?.total_tokens ?? inputTokens + outputTokens;
    await admin.from("ai_usage").insert([
      {
        user_id: userId,
        org_id: radarFile.org_id,
        action,
        model: "gpt-5.2",
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

  let extracted: RadarExtraction;
  let verificationWarning: string | null = null;
  const verifyStartedAt = Date.now();
  try {
    const promptTemplate = await loadPromptSection("radar_extract_system");
    const systemPrompt = applyTemplate(promptTemplate, { language });

    const response = await openai.responses.create({
      model: "gpt-5.2",
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Voici un export Flightscope en image. " +
                "Retourne: columns (group,label,unit), rows (shot, values[]), avg, dev, summary. " +
                "Utilise null pour les cellules vides ou '-'.",
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
      max_output_tokens: 6500,
      text: {
        format: {
          type: "json_schema",
          name: "radar_extract",
          description: "Extraction d un tableau Flightscope.",
          schema: buildRadarSchema(),
          strict: true,
        },
      },
    });

    usage = response.usage ?? usage;
    const outputText = extractOutputText(response);
    if (!outputText) {
      throw new Error("Reponse OCR vide.");
    }
    extracted = JSON.parse(outputText) as RadarExtraction;
  } catch (error) {
    await admin
      .from("radar_files")
      .update({ status: "error", error: (error as Error).message ?? "OCR error." })
      .eq("id", radarFileId);
    await recordUsage("radar_extract", usage, Date.now() - startedAt, 500, "exception");
    return Response.json(
      { error: (error as Error).message ?? "Extraction datas impossible." },
      { status: 500 }
    );
  }

  await recordUsage("radar_extract", usage, Date.now() - startedAt, 200);

  try {
    const verifyPrompt = await loadPromptSection("radar_extract_verify_system");
    const verificationSnapshot = buildVerificationSnapshot(extracted);
    const baseVerifyText =
      "Voici l extraction a verifier. Compare a l image source et signale toute incoherence.\n" +
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
            description: "Verification extraction Flightscope.",
            schema: buildRadarVerifySchema(),
            strict: true,
          },
        },
      });

    let verifyResponse = await callVerify();
    verifyUsage = verifyResponse.usage ?? verifyUsage;
    let verifyText = extractOutputText(verifyResponse);
    if (!verifyText) {
      throw new Error("Verification vide.");
    }

    let verification = JSON.parse(verifyText) as RadarVerification;
    if (!verification.is_valid && (verification.confidence ?? 0) < 0.6) {
      verifyResponse = await callVerify(
        "Si tu as un doute, retourne is_valid=true avec une confidence basse et liste les points a verifier."
      );
      verifyUsage = verifyResponse.usage ?? verifyUsage;
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

    await recordUsage(
      "radar_extract_verify",
      verifyUsage,
      Date.now() - verifyStartedAt,
      200
    );
  } catch (error) {
    verificationWarning =
      (error as Error).message ?? "Verification extraction impossible.";
    await recordUsage(
      "radar_extract_verify",
      verifyUsage,
      Date.now() - verifyStartedAt,
      200
    );
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

  await admin
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

  return Response.json({ status: "ok" });
}
