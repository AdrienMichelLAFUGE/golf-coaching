import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { computeAnalytics } from "@/lib/radar/computeAnalytics";
import { DEFAULT_RADAR_CONFIG } from "@/lib/radar/config";
import { applyTemplate, loadPromptSection } from "@/lib/promptLoader";

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
  const fallback = `${groupToken || "col"}_${labelToken || "value"}`.replace(
    /\s+/g,
    "_"
  );
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
  const { radarFileId } = (await req.json()) as { radarFileId?: string };
  if (!radarFileId) {
    return Response.json({ error: "radarFileId requis." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !openaiKey) {
    return Response.json(
      { error: "Configuration serveur incomplete." },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: req.headers.get("authorization") ?? "" },
    },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (userError || !userId) {
    return Response.json({ error: "Session invalide." }, { status: 401 });
  }
  const userEmail = userData.user?.email?.toLowerCase() ?? null;
  const isAdmin = userEmail === "adrien.lafuge@outlook.fr";

  const { data: radarFile, error: radarError } = await supabase
    .from("radar_files")
    .select(
      "id, org_id, student_id, file_url, file_mime, original_name, source"
    )
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
    .select("locale, radar_enabled")
    .eq("id", radarFile.org_id)
    .single();

  if (!isAdmin && !orgData?.radar_enabled) {
    return Response.json(
      { error: "Add-on Datas requis." },
      { status: 403 }
    );
  }

  const { data: fileData, error: fileError } = await admin.storage
    .from("radar-files")
    .download(radarFile.file_url);

  if (fileError || !fileData) {
    await admin
      .from("radar_files")
      .update({ status: "error", error: "Fichier introuvable." })
      .eq("id", radarFileId);
    return Response.json(
      { error: "Fichier datas introuvable." },
      { status: 500 }
    );
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());
  const openai = new OpenAI({ apiKey: openaiKey });
  const locale = orgData?.locale ?? "fr-FR";
  const language = locale.toLowerCase().startsWith("fr") ? "francais" : "anglais";

  const startedAt = Date.now();
  let usage: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  } | null = null;

  const recordUsage = async (
    action: string,
    usagePayload: typeof usage,
    durationMs: number
  ) => {
    if (!usagePayload) return;
    const inputTokens = usagePayload.input_tokens ?? 0;
    const outputTokens = usagePayload.output_tokens ?? 0;
    const totalTokens =
      usagePayload.total_tokens ?? inputTokens + outputTokens;
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
      },
    ]);
  };

  let extracted: RadarExtraction;
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
    return Response.json(
      { error: (error as Error).message ?? "Extraction datas impossible." },
      { status: 500 }
    );
  }

  const columns = (extracted.columns ?? []).map((column) => ({
    group: column.group ?? null,
    label: column.label?.trim() ?? "",
    unit: column.unit ?? null,
  }));
  const keyCount = new Map<string, number>();
  const normalizedColumns = columns.map((column) => {
    const baseKey = buildKey(column.group, column.label);
    const nextCount = (keyCount.get(baseKey) ?? 0) + 1;
    keyCount.set(baseKey, nextCount);
    const key = nextCount > 1 ? `${baseKey}_${nextCount}` : baseKey;
    return { ...column, key };
  });

  const shots = (extracted.rows ?? []).map((row, rowIndex) => {
    const shotIndexRaw = row.shot ?? rowIndex + 1;
    const shotIndex =
      typeof shotIndexRaw === "number"
        ? shotIndexRaw
        : Number(String(shotIndexRaw).replace(/[^\d-]/g, "")) || rowIndex + 1;
    const shot: Record<string, unknown> = { shot_index: shotIndex };
    row.values.forEach((value, colIndex) => {
      const column = normalizedColumns[colIndex];
      if (!column) return;
      shot[column.key] = parseCellValue(value);
    });
    return shot;
  });

  const statsFromModel = {
    avg: extracted.avg ?? null,
    dev: extracted.dev ?? null,
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
      typeof parsedAvg === "number" ? parsedAvg : statsFromRows.avg[column.key] ?? null;
    dev[column.key] =
      typeof parsedDev === "number" ? parsedDev : statsFromRows.dev[column.key] ?? null;
  });

  const config = DEFAULT_RADAR_CONFIG;

  const analytics = computeAnalytics({
    columns: normalizedColumns,
    shots,
    config,
    metadata: extracted.metadata ?? null,
  });

  await admin
    .from("radar_files")
    .update({
      status: "ready",
      columns: normalizedColumns,
      shots,
      stats: { avg, dev },
      summary: extracted.summary ?? analytics.summary ?? null,
      config,
      analytics,
      extracted_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", radarFileId);

  await recordUsage("radar_extract", usage, Date.now() - startedAt);

  return Response.json({ status: "ok" });
}
