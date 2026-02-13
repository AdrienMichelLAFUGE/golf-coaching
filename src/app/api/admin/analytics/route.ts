import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminEmail } from "@/lib/admin";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

type UsageRow = {
  user_id: string;
  org_id: string;
  action: string | null;
  endpoint: string | null;
  model: string | null;
  input_tokens: number | string | null;
  output_tokens: number | string | null;
  total_tokens: number | string | null;
  duration_ms: number | null;
  status_code: number | null;
  error_type: string | null;
  created_at: string;
};

type ParsedEndpoint = {
  raw: string;
  base: string;
  technology: string | null;
};

type FeatureKey = "report" | "radar" | "tpi" | "other";
const USAGE_FETCH_LIMIT = 20000;
const REPORT_BUILDER_AI_ACTIONS = new Set([
  "improve",
  "write",
  "summary",
  "propagate",
  "plan",
  "clarify",
  "axes",
  "radar_questions",
  "radar_auto",
  "radar_auto_retry",
]);

const PRICING_PER_M_TOKENS_USD = {
  "gpt-5.2": { input: 1.75, output: 14 },
};

const periodSchema = z.enum(["day", "week", "month"]);

type Period = z.infer<typeof periodSchema>;

const PERIOD_WINDOWS: Record<Period, number> = {
  day: 1,
  week: 7,
  month: 30,
};

const getPricing = (model: string) =>
  PRICING_PER_M_TOKENS_USD[model as keyof typeof PRICING_PER_M_TOKENS_USD] ??
  PRICING_PER_M_TOKENS_USD["gpt-5.2"];

const toNumber = (value: number | string | null) => {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const resolveTokens = (row: UsageRow) => {
  const totalTokens = toNumber(row.total_tokens);
  const inputTokensRaw = toNumber(row.input_tokens);
  const outputTokensRaw = toNumber(row.output_tokens);
  const hasSplit = inputTokensRaw > 0 || outputTokensRaw > 0;
  const inputTokens = hasSplit ? inputTokensRaw : Math.floor(totalTokens / 2);
  const outputTokens = hasSplit
    ? outputTokensRaw
    : Math.max(0, totalTokens - inputTokens);
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
};

const computeCostUsd = (inputTokens: number, outputTokens: number, model: string) => {
  const pricing = getPricing(model);
  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output
  );
};

const percentile = (values: number[], p: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(p * sorted.length) - 1;
  const safeIndex = Math.min(sorted.length - 1, Math.max(0, index));
  return sorted[safeIndex];
};

const isErrorRow = (row: UsageRow) => {
  if (typeof row.status_code === "number" && row.status_code >= 500) return true;
  const errorType = row.error_type ?? "";
  return errorType === "timeout" || errorType === "exception";
};

const roundUsd = (value: number) => Number(value.toFixed(6));

const parseEndpoint = (value: string | null, action: string | null): ParsedEndpoint => {
  const raw = value ?? action ?? "unknown";
  const [basePart, techPart] = raw.split(":");
  const base = (basePart ?? "unknown").trim() || "unknown";
  const technology = techPart?.trim() ? techPart.trim() : null;
  return { raw, base, technology };
};

const resolveFeatureKey = (endpointBase: string): FeatureKey => {
  if (
    [
      "ai",
      "radar_ai",
      "radar_questions",
      "radar_auto",
      "radar_auto_retry",
      "report_kpis_ai",
      "radar_extract",
      "radar_extract_verify",
      "tpi_extract",
      "tpi_verify",
    ].includes(endpointBase)
  ) {
    return "report";
  }
  if (endpointBase.startsWith("radar")) return "radar";
  if (endpointBase.startsWith("tpi")) return "tpi";
  return "other";
};

const FEATURE_LABELS: Record<FeatureKey, string> = {
  report: "Rapport",
  radar: "Radar",
  tpi: "TPI",
  other: "Autres",
};

const formatBucketLabel = (date: Date, period: Period) => {
  if (period === "day") {
    const day = date.toISOString().slice(0, 10);
    const hour = String(date.getUTCHours()).padStart(2, "0");
    return `${day} ${hour}h`;
  }
  return date.toISOString().slice(0, 10);
};

const requireAdmin = async (request: Request) => {
  const supabase = createSupabaseServerClientFromRequest(request);

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const email = userData.user?.email ?? "";
  if (userError || !isAdminEmail(email)) {
    return {
      error: NextResponse.json({ error: "Unauthorized." }, { status: 403 }),
    };
  }

  return {
    admin: createSupabaseAdminClient(),
  };
};

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const periodParam = url.searchParams.get("period") ?? "month";
  const periodParsed = periodSchema.safeParse(periodParam);
  const period = periodParsed.success ? periodParsed.data : "month";
  const windowDays = PERIOD_WINDOWS[period];
  const now = Date.now();
  const currentStartMs = now - windowDays * 24 * 60 * 60 * 1000;
  const currentSince = new Date(currentStartMs).toISOString();
  const previousStartMs = now - windowDays * 2 * 24 * 60 * 60 * 1000;
  const previousSince = new Date(previousStartMs).toISOString();

  const { data: usage, error: usageError } = await auth.admin
    .from("ai_usage")
    .select(
      "user_id, org_id, action, endpoint, model, input_tokens, output_tokens, total_tokens, duration_ms, status_code, error_type, created_at"
    )
    .gte("created_at", previousSince)
    .order("created_at", { ascending: false })
    .limit(USAGE_FETCH_LIMIT);

  if (usageError) {
    return NextResponse.json({ error: usageError.message }, { status: 500 });
  }

  const rows = (usage ?? []) as UsageRow[];

  const endpointMap = new Map<
    string,
    {
      endpoint: string;
      endpointBase: string;
      technology: string | null;
      requests: number;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
      durations: number[];
      errorCount: number;
    }
  >();
  const coachMap = new Map<
    string,
    {
      user_id: string;
      org_id: string;
      requests: number;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
    }
  >();
  const orgMap = new Map<
    string,
    {
      org_id: string;
      requests: number;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
    }
  >();
  const costSeriesMap = new Map<
    string,
    { label: string; costUsd: number; requests: number }
  >();
  const featureMap = new Map<
    FeatureKey,
    {
      key: FeatureKey;
      label: string;
      requests: number;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
    }
  >();
  const actionMap = new Map<
    string,
    {
      action: string;
      requests: number;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
    }
  >();
  const apiCallRawRows: Array<{
    createdAt: string;
    userId: string;
    orgId: string;
    featureKey: FeatureKey;
    endpointRaw: string;
    endpointBase: string;
    technology: string | null;
    action: string | null;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
    durationMs: number | null;
    statusCode: number | null;
    errorType: string | null;
    isError: boolean;
  }> = [];
  const durations: number[] = [];
  let totalRequests = 0;
  let totalCostCurrent = 0;
  let totalCostPrevious = 0;
  let totalReportBuilderCostCurrent = 0;
  let errorCount = 0;

  rows.forEach((row) => {
    const createdAtMs = Date.parse(row.created_at);
    if (!Number.isFinite(createdAtMs)) return;

    const isCurrent = createdAtMs >= currentStartMs;
    const isPrevious = createdAtMs >= previousStartMs && createdAtMs < currentStartMs;
    const { inputTokens, outputTokens } = resolveTokens(row);
    const modelKey = row.model ?? "gpt-5.2";
    const rowCostUsd = computeCostUsd(inputTokens, outputTokens, modelKey);

    if (isPrevious) {
      totalCostPrevious += rowCostUsd;
    }

    if (!isCurrent) return;

    totalRequests += 1;
    totalCostCurrent += rowCostUsd;

    const endpointRaw = (row.endpoint ?? "").toLowerCase();
    const actionRaw = (row.action ?? "").toLowerCase();
    const isReportBuilderRadarExtract =
      (actionRaw === "radar_extract" || actionRaw === "radar_extract_verify") &&
      endpointRaw.includes(":report_builder");
    if (REPORT_BUILDER_AI_ACTIONS.has(actionRaw) || isReportBuilderRadarExtract) {
      totalReportBuilderCostCurrent += rowCostUsd;
    }

    if (isErrorRow(row)) errorCount += 1;
    if (typeof row.duration_ms === "number" && row.duration_ms > 0) {
      durations.push(row.duration_ms);
    }

    const endpointParsed = parseEndpoint(row.endpoint, row.action);
    const endpointKey = endpointParsed.raw;
    const featureKey = resolveFeatureKey(endpointParsed.base);
    const rowIsError = isErrorRow(row);
    const endpointEntry = endpointMap.get(endpointKey) ?? {
      endpoint: endpointKey,
      endpointBase: endpointParsed.base,
      technology: endpointParsed.technology,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      durations: [],
      errorCount: 0,
    };
    endpointEntry.requests += 1;
    endpointEntry.inputTokens += inputTokens;
    endpointEntry.outputTokens += outputTokens;
    endpointEntry.costUsd += rowCostUsd;
    if (typeof row.duration_ms === "number" && row.duration_ms > 0) {
      endpointEntry.durations.push(row.duration_ms);
    }
    if (rowIsError) endpointEntry.errorCount += 1;
    endpointMap.set(endpointKey, endpointEntry);

    const featureEntry = featureMap.get(featureKey) ?? {
      key: featureKey,
      label: FEATURE_LABELS[featureKey],
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    featureEntry.requests += 1;
    featureEntry.inputTokens += inputTokens;
    featureEntry.outputTokens += outputTokens;
    featureEntry.costUsd += rowCostUsd;
    featureMap.set(featureKey, featureEntry);

    const actionKey = (row.action ?? endpointParsed.base ?? "unknown").trim() || "unknown";
    const actionEntry = actionMap.get(actionKey) ?? {
      action: actionKey,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    actionEntry.requests += 1;
    actionEntry.inputTokens += inputTokens;
    actionEntry.outputTokens += outputTokens;
    actionEntry.costUsd += rowCostUsd;
    actionMap.set(actionKey, actionEntry);

    apiCallRawRows.push({
      createdAt: row.created_at,
      userId: row.user_id,
      orgId: row.org_id,
      featureKey,
      endpointRaw: endpointParsed.raw,
      endpointBase: endpointParsed.base,
      technology: endpointParsed.technology,
      action: row.action,
      model: modelKey,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      costUsd: roundUsd(rowCostUsd),
      durationMs: row.duration_ms ?? null,
      statusCode: row.status_code ?? null,
      errorType: row.error_type ?? null,
      isError: rowIsError,
    });

    const coachEntry = coachMap.get(row.user_id) ?? {
      user_id: row.user_id,
      org_id: row.org_id,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    coachEntry.requests += 1;
    coachEntry.inputTokens += inputTokens;
    coachEntry.outputTokens += outputTokens;
    coachEntry.costUsd += rowCostUsd;
    coachMap.set(row.user_id, coachEntry);

    const orgEntry = orgMap.get(row.org_id) ?? {
      org_id: row.org_id,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    orgEntry.requests += 1;
    orgEntry.inputTokens += inputTokens;
    orgEntry.outputTokens += outputTokens;
    orgEntry.costUsd += rowCostUsd;
    orgMap.set(row.org_id, orgEntry);

    const bucketLabel = formatBucketLabel(new Date(createdAtMs), period);
    const seriesEntry = costSeriesMap.get(bucketLabel) ?? {
      label: bucketLabel,
      costUsd: 0,
      requests: 0,
    };
    seriesEntry.costUsd += rowCostUsd;
    seriesEntry.requests += 1;
    costSeriesMap.set(bucketLabel, seriesEntry);
  });

  const coachIds = Array.from(coachMap.keys());
  const orgIds = Array.from(orgMap.keys());

  const [profilesResult, orgsResult] = await Promise.all([
    coachIds.length
      ? auth.admin.from("profiles").select("id, full_name, org_id").in("id", coachIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; full_name: string | null; org_id: string }>,
          error: null,
        }),
    orgIds.length
      ? auth.admin.from("organizations").select("id, name").in("id", orgIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; name: string | null }>,
          error: null,
        }),
  ]);

  const safeProfiles =
    profilesResult.error || !profilesResult.data ? [] : profilesResult.data;
  const safeOrgs = orgsResult.error || !orgsResult.data ? [] : orgsResult.data;

  let reportsEditedCount = 0;
  const updatedCountResult = await auth.admin
    .from("reports")
    .select("id", { count: "exact", head: true })
    .gte("updated_at", currentSince);
  if (updatedCountResult.error) {
    const createdCountResult = await auth.admin
      .from("reports")
      .select("id", { count: "exact", head: true })
      .gte("created_at", currentSince);
    if (!createdCountResult.error) {
      reportsEditedCount = createdCountResult.count ?? 0;
    }
  } else {
    reportsEditedCount = updatedCountResult.count ?? 0;
  }

  const profileById = new Map(
    safeProfiles.map((profile) => [
      profile.id,
      { full_name: profile.full_name ?? null, org_id: profile.org_id },
    ])
  );
  const orgById = new Map(safeOrgs.map((org) => [org.id, org.name ?? ""]));

  const costSeries = Array.from(costSeriesMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label)
  );

  const costBreakdownEndpoints = Array.from(endpointMap.values())
    .map((entry) => ({
      key: entry.endpoint,
      label: entry.endpoint,
      endpointBase: entry.endpointBase,
      technology: entry.technology,
      featureKey: resolveFeatureKey(entry.endpointBase),
      featureLabel: FEATURE_LABELS[resolveFeatureKey(entry.endpointBase)],
      requests: entry.requests,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      costUsd: roundUsd(entry.costUsd),
      costPerRequestUsd: roundUsd(entry.requests ? entry.costUsd / entry.requests : 0),
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  const reportsEdited = reportsEditedCount;
  const estimatedReportCostUsd =
    reportsEdited > 0
      ? roundUsd(totalReportBuilderCostCurrent / reportsEdited)
      : null;

  const featureBreakdown = Array.from(featureMap.values())
    .map((entry) => ({
      key: entry.key,
      label: entry.label,
      requests: entry.requests,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      costUsd: roundUsd(entry.costUsd),
      costPerRequestUsd: roundUsd(entry.requests ? entry.costUsd / entry.requests : 0),
      estimatedReports: entry.key === "report" ? reportsEdited : null,
      costPerReportUsd:
        entry.key === "report" && reportsEdited > 0
          ? roundUsd(totalReportBuilderCostCurrent / reportsEdited)
          : null,
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  const actionBreakdown = Array.from(actionMap.values())
    .map((entry) => ({
      key: entry.action,
      label: entry.action,
      requests: entry.requests,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      costUsd: roundUsd(entry.costUsd),
      costPerRequestUsd: roundUsd(entry.requests ? entry.costUsd / entry.requests : 0),
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  const apiCalls = apiCallRawRows
    .map((row) => {
      const profile = profileById.get(row.userId);
      const orgName = orgById.get(row.orgId) ?? "";
      return {
        createdAt: row.createdAt,
        featureKey: row.featureKey,
        featureLabel: FEATURE_LABELS[row.featureKey],
        endpoint: row.endpointRaw,
        endpointBase: row.endpointBase,
        technology: row.technology,
        action: row.action,
        model: row.model,
        coachId: row.userId,
        coachName: profile?.full_name ?? "Coach",
        orgId: row.orgId,
        orgName: orgName || "Organisation",
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        totalTokens: row.totalTokens,
        costUsd: row.costUsd,
        durationMs: row.durationMs,
        statusCode: row.statusCode,
        errorType: row.errorType,
        isError: row.isError,
      };
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const costBreakdownCoaches = Array.from(coachMap.values())
    .map((entry) => {
      const profile = profileById.get(entry.user_id);
      const orgName = orgById.get(entry.org_id) ?? "";
      return {
        key: entry.user_id,
        label: profile?.full_name ?? "Coach",
        orgName,
        requests: entry.requests,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        costUsd: roundUsd(entry.costUsd),
        costPerRequestUsd: roundUsd(entry.requests ? entry.costUsd / entry.requests : 0),
      };
    })
    .sort((a, b) => b.costUsd - a.costUsd);

  const costBreakdownOrgs = Array.from(orgMap.values())
    .map((entry) => ({
      key: entry.org_id,
      label: orgById.get(entry.org_id) ?? "Organisation",
      requests: entry.requests,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      costUsd: roundUsd(entry.costUsd),
      costPerRequestUsd: roundUsd(entry.requests ? entry.costUsd / entry.requests : 0),
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  const performanceEndpoints = Array.from(endpointMap.values())
    .map((entry) => {
      const p50 = percentile(entry.durations, 0.5);
      const p95 = percentile(entry.durations, 0.95);
      const errorRatePct = entry.requests ? (entry.errorCount / entry.requests) * 100 : 0;
      return {
        endpoint: entry.endpoint,
        requests: entry.requests,
        p50DurationMs: Math.round(p50),
        p95DurationMs: Math.round(p95),
        errorCount: entry.errorCount,
        errorRatePct: Number(errorRatePct.toFixed(2)),
      };
    })
    .sort((a, b) => b.p95DurationMs - a.p95DurationMs);

  const totalErrorRate = totalRequests ? (errorCount / totalRequests) * 100 : 0;
  const costDeltaPct = totalCostPrevious
    ? ((totalCostCurrent - totalCostPrevious) / totalCostPrevious) * 100
    : null;

  return NextResponse.json({
    period,
    windowDays,
    totals: {
      costUsd: roundUsd(totalCostCurrent),
      costDeltaPct: costDeltaPct === null ? null : Number(costDeltaPct.toFixed(2)),
      requests: totalRequests,
      p95DurationMs: Math.round(percentile(durations, 0.95)),
      errorRatePct: Number(totalErrorRate.toFixed(2)),
      reportsEdited,
      reportBuilderCostUsd: roundUsd(totalReportBuilderCostCurrent),
      estimatedReportCostUsd,
    },
    costSeries,
    costBreakdown: {
      endpoints: costBreakdownEndpoints,
      actions: actionBreakdown,
      features: featureBreakdown,
      coaches: costBreakdownCoaches,
      orgs: costBreakdownOrgs,
    },
    apiCalls: {
      rows: apiCalls,
      fetchedRows: apiCalls.length,
      fetchLimit: USAGE_FETCH_LIMIT,
      maybeTruncated: rows.length >= USAGE_FETCH_LIMIT,
    },
    performance: {
      endpoints: performanceEndpoints,
    },
  });
}
