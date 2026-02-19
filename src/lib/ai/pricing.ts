const AI_MODEL_PRICING_EUR_PER_M_TOKEN = {
  "gpt-5.2": { input: 1.61, output: 12.88 },
} as const;

const DEFAULT_PRICING = AI_MODEL_PRICING_EUR_PER_M_TOKEN["gpt-5.2"];

const toNumber = (value: number | string | null | undefined) => {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const getAiModelPricingEurPerMTokens = (model?: string | null) => {
  if (!model) return DEFAULT_PRICING;
  return (
    AI_MODEL_PRICING_EUR_PER_M_TOKEN[
      model as keyof typeof AI_MODEL_PRICING_EUR_PER_M_TOKEN
    ] ?? DEFAULT_PRICING
  );
};

export const resolveAiUsageTokens = (params: {
  input_tokens?: number | string | null;
  output_tokens?: number | string | null;
  total_tokens?: number | string | null;
}) => {
  const totalTokens = toNumber(params.total_tokens);
  const inputTokensRaw = toNumber(params.input_tokens);
  const outputTokensRaw = toNumber(params.output_tokens);
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

export const computeAiCostEur = (
  inputTokens: number,
  outputTokens: number,
  model?: string | null
) => {
  const pricing = getAiModelPricingEurPerMTokens(model);
  return (
    (Math.max(0, inputTokens) / 1_000_000) * pricing.input +
    (Math.max(0, outputTokens) / 1_000_000) * pricing.output
  );
};

export const computeAiCostEurCents = (
  inputTokens: number,
  outputTokens: number,
  model?: string | null
) => Math.max(0, Math.round(computeAiCostEur(inputTokens, outputTokens, model) * 100));

export const computeAiCostEurCentsFromUsageRow = (row: {
  model?: string | null;
  input_tokens?: number | string | null;
  output_tokens?: number | string | null;
  total_tokens?: number | string | null;
  cost_eur_cents?: number | string | null;
}) => {
  const storedCost = toNumber(row.cost_eur_cents);
  if (storedCost > 0) return Math.round(storedCost);
  const { inputTokens, outputTokens } = resolveAiUsageTokens(row);
  return computeAiCostEurCents(inputTokens, outputTokens, row.model ?? null);
};

export const formatEurCents = (value: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.max(0, value) / 100);
