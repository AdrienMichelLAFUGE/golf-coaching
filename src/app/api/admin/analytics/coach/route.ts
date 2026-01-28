import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/admin";

export const runtime = "nodejs";

type UsageRow = {
  action: string | null;
  model: string | null;
  total_tokens: number | string | null;
  input_tokens: number | string | null;
  output_tokens: number | string | null;
  created_at: string;
};

const PRICING_PER_M_TOKENS_USD = {
  "gpt-5.2": { input: 1.75, output: 14 },
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
    return "Datas";
  }
  if (reportActions.has(normalized)) return "Rapport";
  return "Autres";
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
  const userId = url.searchParams.get("userId") ?? "";
  if (!userId) {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  }

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
      "action, model, total_tokens, input_tokens, output_tokens, created_at"
    )
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(2000);

  if (usageError) {
    return NextResponse.json(
      { error: usageError.message },
      { status: 500 }
    );
  }

  const { data: profile } = await auth.admin
    .from("profiles")
    .select("id, full_name, org_id")
    .eq("id", userId)
    .maybeSingle();
  const { data: org } = profile?.org_id
    ? await auth.admin
        .from("organizations")
        .select("id, name")
        .eq("id", profile.org_id)
        .maybeSingle()
    : { data: null };

  const rows = (usage ?? []) as UsageRow[];
  let totalTokens = 0;
  let totalRequests = 0;
  let totalCostUsd = 0;
  const actionMap = new Map<
    string,
    { action: string; requests: number; tokens: number; costUsd: number }
  >();
  const modelMap = new Map<
    string,
    { model: string; requests: number; tokens: number; costUsd: number }
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
    const inputTokens = hasSplit
      ? inputTokensRaw
      : Math.floor(tokens / 2);
    const outputTokens = hasSplit
      ? outputTokensRaw
      : Math.max(0, tokens - inputTokens);
    totalTokens += tokens;
    totalRequests += 1;

    const actionKey = row.action ?? "unknown";
    const modelKey = row.model ?? "gpt-5.2";
    const rowCostUsd = computeCostUsd(inputTokens, outputTokens, modelKey);
    totalCostUsd += rowCostUsd;
    const actionEntry =
      actionMap.get(actionKey) ?? {
        action: actionKey,
        requests: 0,
        tokens: 0,
        costUsd: 0,
      };
    actionEntry.requests += 1;
    actionEntry.tokens += tokens;
    actionEntry.costUsd += rowCostUsd;
    actionMap.set(actionKey, actionEntry);

    const modelEntry =
      modelMap.get(modelKey) ?? {
        model: modelKey,
        requests: 0,
        tokens: 0,
        costUsd: 0,
      };
    modelEntry.requests += 1;
    modelEntry.tokens += tokens;
    modelEntry.costUsd += rowCostUsd;
    modelMap.set(modelKey, modelEntry);

    const featureKey = toFeatureCategory(actionKey);
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

  const actions = Array.from(actionMap.values()).sort(
    (a, b) => b.tokens - a.tokens
  );
  const models = Array.from(modelMap.values()).sort(
    (a, b) => b.tokens - a.tokens
  );
  const features = Array.from(featureMap.values()).sort(
    (a, b) => b.tokens - a.tokens
  );
  const daily = Array.from(dailyMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  return NextResponse.json({
    windowDays,
    user: {
      id: userId,
      full_name: profile?.full_name ?? "Coach",
      org_name: org?.name ?? "",
    },
    totals: {
      requests: totalRequests,
      tokens: totalTokens,
      avgTokens: totalRequests ? Math.round(totalTokens / totalRequests) : 0,
      costUsd: Number(totalCostUsd.toFixed(6)),
    },
    actions,
    models,
    features,
    daily,
  });
}
