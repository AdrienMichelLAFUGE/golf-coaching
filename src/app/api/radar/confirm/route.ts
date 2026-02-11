import { z } from "zod";
import { computeAnalytics } from "@/lib/radar/computeAnalytics";
import { DEFAULT_RADAR_CONFIG } from "@/lib/radar/config";
import { PGA_BENCHMARKS, findPgaBenchmark } from "@/lib/radar/pga-benchmarks";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { PLAN_ENTITLEMENTS } from "@/lib/plans";
import { loadPersonalPlanTier } from "@/lib/plan-access";

export const runtime = "nodejs";

const radarConfirmSchema = z.object({
  radarFileId: z.string().min(1),
  columns: z
    .array(
      z.object({
        key: z.string().min(1),
        group: z.string().nullable(),
        label: z.string().min(1),
        unit: z.string().nullable(),
      })
    )
    .min(1),
  shots: z.array(z.record(z.unknown())),
  club: z.enum(["auto", "driver", "iron"]).optional(),
});

const normalizeToken = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

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

const parseDirectionalNumber = (raw: string) => {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(-?\d+(?:[.,]\d+)?)([LR])$/i);
  if (!match) return null;
  const numeric = Number(match[1].replace(",", "."));
  if (!Number.isFinite(numeric)) return null;
  return match[2].toUpperCase() === "L" ? -numeric : numeric;
};

const parseCellValue = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-" || trimmed === "â€”") return null;
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

export async function POST(req: Request) {
  const parsed = await parseRequestJson(req, radarConfirmSchema);
  if (!parsed.success) {
    return Response.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }

  const { radarFileId, columns, shots, club } = parsed.data;
  const supabase = createSupabaseServerClientFromRequest(req);
  const admin = createSupabaseAdminClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (userError || !userId) {
    return Response.json({ error: "Session invalide." }, { status: 401 });
  }
  const userEmail = userData.user?.email?.toLowerCase() ?? null;
  const isAdmin = userEmail === "adrien.lafuge@outlook.fr";

  const { data: radarFile, error: radarError } = await supabase
    .from("radar_files")
    .select("id, org_id, status, config, summary, analytics")
    .eq("id", radarFileId)
    .single();

  if (radarError || !radarFile) {
    return Response.json({ error: "Fichier datas introuvable." }, { status: 404 });
  }

  if (radarFile.status === "processing") {
    return Response.json(
      { error: "Extraction en cours, reessayez plus tard." },
      { status: 409 }
    );
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", userId)
    .single();

  if (!profileData || String(profileData.org_id) !== String(radarFile.org_id)) {
    return Response.json({ error: "Acces refuse." }, { status: 403 });
  }

  const planTier = await loadPersonalPlanTier(admin, userId);
  const entitlements = PLAN_ENTITLEMENTS[planTier];
  if (!isAdmin && !entitlements.dataExtractEnabled) {
    return Response.json(
      { error: "Plan requis pour l extraction de datas." },
      { status: 403 }
    );
  }

  const sanitizedColumns = columns.map((column) => ({
    key: column.key.trim(),
    group: column.group ?? null,
    label: column.label.trim(),
    unit: column.unit ?? null,
  }));
  const columnKeys = new Set(sanitizedColumns.map((column) => column.key));

  const sanitizedShots = shots.map((shot, index) => {
    const next: Record<string, unknown> = {};
    const rawShotIndex = (shot as Record<string, unknown>)["shot_index"];
    const parsedShot =
      typeof rawShotIndex === "number"
        ? rawShotIndex
        : Number(String(rawShotIndex ?? ""));
    next.shot_index = Number.isFinite(parsedShot) ? parsedShot : index + 1;
    columnKeys.forEach((key) => {
      if (key === "shot_index") return;
      const rawValue = (shot as Record<string, unknown>)[key];
      if (typeof rawValue === "number") {
        next[key] = Number.isFinite(rawValue) ? rawValue : null;
        return;
      }
      if (rawValue === null || rawValue === undefined) {
        next[key] = null;
        return;
      }
      next[key] = parseCellValue(String(rawValue));
    });
    return next;
  });

  const stats = computeStats(sanitizedShots);
  const config =
    radarFile.config && typeof radarFile.config === "object"
      ? radarFile.config
      : DEFAULT_RADAR_CONFIG;
  const clubOverride =
    club === "driver" ? "Driver" : club === "iron" ? "Iron" : null;
  const metadata = {
    club: clubOverride ?? radarFile.analytics?.meta?.club ?? null,
    ball: radarFile.analytics?.meta?.ball ?? null,
  };
  const analytics = computeAnalytics({
    columns: sanitizedColumns,
    shots: sanitizedShots,
    config,
    metadata,
  });
  // If the reviewer explicitly selected Driver/Fers in the UI, treat it as authoritative.
  // Otherwise, try to normalize/infer the club from extracted metadata + evidence.
  analytics.meta.club = clubOverride
    ? clubOverride
    : resolveClubFromAnalytics(metadata.club, analytics);

  const summary = radarFile.summary ?? analytics.summary ?? null;

  const { error: updateError } = await supabase
    .from("radar_files")
    .update({
      status: "ready",
      columns: sanitizedColumns,
      shots: sanitizedShots,
      stats,
      analytics,
      summary,
      error: null,
    })
    .eq("id", radarFileId);

  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
