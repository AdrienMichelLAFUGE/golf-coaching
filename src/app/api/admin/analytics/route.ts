import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/admin";

export const runtime = "nodejs";

type UsageRow = {
  user_id: string;
  org_id: string;
  action: string | null;
  model: string | null;
  input_tokens: number | string | null;
  output_tokens: number | string | null;
  total_tokens: number | string | null;
  duration_ms: number | null;
  created_at: string;
};

const PRICING_PER_M_TOKENS_USD = {
  "gpt-5.2": { input: 1.75, output: 14 },
};

const reportActions = new Set([
  "improve",
  "write",
  "summary",
  "propagate",
  "plan",
  "clarify",
  "axes",
]);

const toFeatureCategory = (action: string) => {
  const normalized = action.toLowerCase();
  if (normalized.includes("tpi")) return "TPI";
  if (normalized.includes("radar") || normalized.includes("flightscope")) {
    return "Radars";
  }
  if (reportActions.has(normalized)) return "Rapport";
  return "Autres";
};

const getPricing = (model: string) =>
  PRICING_PER_M_TOKENS_USD[model as keyof typeof PRICING_PER_M_TOKENS_USD] ??
  PRICING_PER_M_TOKENS_USD["gpt-5.2"];

const toNumber = (value: number | string | null) => {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const computeCostUsd = (
  inputTokens: number,
  outputTokens: number,
  model: string
) => {
  const pricing = getPricing(model);
  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output
  );
};

const requireAdmin = async (request: Request) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return {
      error: NextResponse.json(
        { error: "Missing Supabase env vars." },
        { status: 500 }
      ),
    };
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const email = userData.user?.email ?? "";
  if (userError || !isAdminEmail(email)) {
    return {
      error: NextResponse.json({ error: "Unauthorized." }, { status: 403 }),
    };
  }

  return {
    admin: createClient(supabaseUrl, serviceRoleKey),
  };
};

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const windowDays = Math.min(
    90,
    Math.max(1, Number(url.searchParams.get("days") ?? 30))
  );
  const since = new Date(
    Date.now() - windowDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: usage, error: usageError } = await auth.admin
    .from("ai_usage")
    .select(
      "user_id, org_id, action, model, input_tokens, output_tokens, total_tokens, duration_ms, created_at"
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(2000);

  if (usageError) {
    return NextResponse.json(
      { error: usageError.message },
      { status: 500 }
    );
  }

  const [
    { data: profiles, error: profilesError },
    { data: organizations, error: organizationsError },
    { count: totalStudentsCount, error: totalStudentsError },
    { count: activeStudentsCount, error: activeStudentsError },
    { count: tpiStudentsCount, error: tpiStudentsError },
    { count: reportsCount, error: reportsError },
    { count: tpiReportsCount, error: tpiReportsError },
    { count: tpiReportsReadyCount, error: tpiReportsReadyError },
  ] = await Promise.all([
    auth.admin.from("profiles").select("id, full_name, org_id, role"),
    auth.admin.from("organizations").select("id, name"),
    auth.admin.from("students").select("id", { count: "exact", head: true }),
    auth.admin
      .from("students")
      .select("id", { count: "exact", head: true })
      .not("activated_at", "is", null),
    auth.admin
      .from("students")
      .select("id", { count: "exact", head: true })
      .not("tpi_report_id", "is", null),
    auth.admin
      .from("reports")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since),
    auth.admin
      .from("tpi_reports")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since),
    auth.admin
      .from("tpi_reports")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since)
      .eq("status", "ready"),
  ]);

  if (
    profilesError ||
    organizationsError ||
    totalStudentsError ||
    activeStudentsError ||
    tpiStudentsError ||
    reportsError ||
    tpiReportsError ||
    tpiReportsReadyError
  ) {
    return NextResponse.json(
      {
        error:
          profilesError?.message ||
          organizationsError?.message ||
          totalStudentsError?.message ||
          activeStudentsError?.message ||
          tpiStudentsError?.message ||
          reportsError?.message ||
          tpiReportsError?.message ||
          tpiReportsReadyError?.message ||
          "Erreur inconnue.",
      },
      { status: 500 }
    );
  }

  const profileById = new Map(
    (profiles ?? []).map((profile) => [
      profile.id,
      {
        full_name: profile.full_name ?? null,
        org_id: profile.org_id,
        role: profile.role ?? null,
      },
    ])
  );
  const orgById = new Map(
    (organizations ?? []).map((org) => [org.id, org.name ?? ""])
  );

  const rows = (usage ?? []) as UsageRow[];
  let totalTokens = 0;
  let totalRequests = 0;
  let totalCostUsd = 0;
  let reportCostUsd = 0;
  let tpiCostUsd = 0;
  let radarImportRequests = 0;
  let radarImportCostUsd = 0;
  let totalDurationMs = 0;
  let durationCount = 0;
  const coachMap = new Map<
    string,
    {
      user_id: string;
      org_id: string;
      requests: number;
      tokens: number;
      costUsd: number;
    }
  >();
  const featureMap = new Map<
    string,
    { feature: string; requests: number; tokens: number; costUsd: number }
  >();
  const dailyMap = new Map<string, { date: string; requests: number; tokens: number }>();

  rows.forEach((row) => {
    const tokens = toNumber(row.total_tokens);
    const inputTokensRaw = toNumber(row.input_tokens);
    const outputTokensRaw = toNumber(row.output_tokens);
    const hasSplit = inputTokensRaw > 0 || outputTokensRaw > 0;
    const inputTokens = hasSplit ? inputTokensRaw : Math.floor(tokens / 2);
    const outputTokens = hasSplit
      ? outputTokensRaw
      : Math.max(0, tokens - inputTokens);
    totalTokens += tokens;
    totalRequests += 1;
    const modelKey = row.model ?? "gpt-5.2";
    const rowCostUsd = computeCostUsd(inputTokens, outputTokens, modelKey);
    totalCostUsd += rowCostUsd;
    if (typeof row.duration_ms === "number" && row.duration_ms > 0) {
      totalDurationMs += row.duration_ms;
      durationCount += 1;
    }

    const coachEntry =
      coachMap.get(row.user_id) ?? {
        user_id: row.user_id,
        org_id: row.org_id,
        requests: 0,
        tokens: 0,
        costUsd: 0,
      };
    coachEntry.requests += 1;
    coachEntry.tokens += tokens;
    coachEntry.costUsd += rowCostUsd;
    coachMap.set(row.user_id, coachEntry);

    const actionKey = row.action ?? "unknown";
    const normalizedAction = actionKey.toLowerCase();
    const featureKey = toFeatureCategory(actionKey);
    if (reportActions.has(actionKey)) reportCostUsd += rowCostUsd;
    if (normalizedAction.includes("tpi")) tpiCostUsd += rowCostUsd;
    if (normalizedAction === "radar_extract") {
      radarImportRequests += 1;
      radarImportCostUsd += rowCostUsd;
    }
    const featureEntry =
      featureMap.get(featureKey) ?? {
        feature: featureKey,
        requests: 0,
        tokens: 0,
        costUsd: 0,
      };
    featureEntry.requests += 1;
    featureEntry.tokens += tokens;
    featureEntry.costUsd += rowCostUsd;
    featureMap.set(featureKey, featureEntry);

    const dateKey = row.created_at.slice(0, 10);
    const dailyEntry =
      dailyMap.get(dateKey) ?? { date: dateKey, requests: 0, tokens: 0 };
    dailyEntry.requests += 1;
    dailyEntry.tokens += tokens;
    dailyMap.set(dateKey, dailyEntry);
  });

  const topCoaches = Array.from(coachMap.values())
    .map((entry) => {
      const profile = profileById.get(entry.user_id);
      const orgId = profile?.org_id ?? entry.org_id;
      return {
        user_id: entry.user_id,
        full_name: profile?.full_name ?? "Coach",
        org_name: orgById.get(orgId) ?? "",
        requests: entry.requests,
        tokens: entry.tokens,
        costUsd: Number(entry.costUsd.toFixed(6)),
      };
    })
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 12);

  const features = Array.from(featureMap.values()).sort(
    (a, b) => b.tokens - a.tokens
  );

  const daily = Array.from(dailyMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14);

  const totalCoaches = (profiles ?? []).filter(
    (profile) => profile.role !== "student"
  ).length;
  const activeCoaches = coachMap.size;
  const totalStudents = totalStudentsCount ?? 0;
  const activeStudents = activeStudentsCount ?? 0;
  const studentsWithTpi = tpiStudentsCount ?? 0;
  const tpiReportsTotal = tpiReportsCount ?? 0;
  const tpiReportsReady = tpiReportsReadyCount ?? 0;
  const reportsTotal = reportsCount ?? 0;
  const avgTokensPerRequest = totalRequests
    ? totalTokens / totalRequests
    : 0;
  const avgTokensPerDay = windowDays ? totalTokens / windowDays : 0;
  const avgTokensPerCoach = activeCoaches ? totalTokens / activeCoaches : 0;
  const avgRequestsPerDay = windowDays ? totalRequests / windowDays : 0;
  const avgRequestsPerCoach = activeCoaches ? totalRequests / activeCoaches : 0;
  const avgDurationMs = durationCount ? totalDurationMs / durationCount : 0;
  const avgRadarImportsPerDay = windowDays
    ? radarImportRequests / windowDays
    : 0;
  const costPerRequestUsd = totalRequests
    ? totalCostUsd / totalRequests
    : 0;
  const costPerDayUsd = windowDays ? totalCostUsd / windowDays : 0;
  const costPerCoachUsd = activeCoaches
    ? totalCostUsd / activeCoaches
    : 0;
  const costPerStudentUsd = activeStudents
    ? totalCostUsd / activeStudents
    : 0;
  const costPerReportUsd = reportsTotal
    ? reportCostUsd / reportsTotal
    : 0;
  const costPerTpiUsd = tpiReportsReady
    ? tpiCostUsd / tpiReportsReady
    : 0;
  const costPerRadarUsd = radarImportRequests
    ? radarImportCostUsd / radarImportRequests
    : 0;
  const adoptionCoachRate = totalCoaches
    ? (activeCoaches / totalCoaches) * 100
    : 0;
  const tpiCoverageRate = totalStudents
    ? (studentsWithTpi / totalStudents) * 100
    : 0;
  const tpiSuccessRate = tpiReportsTotal
    ? (tpiReportsReady / tpiReportsTotal) * 100
    : 0;

  return NextResponse.json({
    windowDays,
    totals: {
      requests: totalRequests,
      tokens: totalTokens,
      avgTokens: avgTokensPerRequest,
      activeCoaches,
      totalCoaches,
      totalStudents,
      activeStudents,
      studentsWithTpi,
      reportsTotal,
      tpiReportsTotal,
      tpiReportsReady,
      radarImportsTotal: radarImportRequests,
      radarCostUsd: Number(radarImportCostUsd.toFixed(6)),
      costUsd: Number(totalCostUsd.toFixed(6)),
      reportCostUsd: Number(reportCostUsd.toFixed(6)),
      tpiCostUsd: Number(tpiCostUsd.toFixed(6)),
      avgTokensPerRequest,
      avgTokensPerDay,
      avgTokensPerCoach,
      avgRequestsPerDay,
      avgRequestsPerCoach,
      avgRadarImportsPerDay,
      avgDurationMs,
      adoptionCoachRate,
      tpiCoverageRate,
      tpiSuccessRate,
      costPerRequestUsd: Number(costPerRequestUsd.toFixed(6)),
      costPerDayUsd: Number(costPerDayUsd.toFixed(6)),
      costPerCoachUsd: Number(costPerCoachUsd.toFixed(6)),
      costPerStudentUsd: Number(costPerStudentUsd.toFixed(6)),
      costPerReportUsd: Number(costPerReportUsd.toFixed(6)),
      costPerTpiUsd: Number(costPerTpiUsd.toFixed(6)),
      costPerRadarUsd: Number(costPerRadarUsd.toFixed(6)),
    },
    daily,
    topCoaches,
    features,
  });
}
