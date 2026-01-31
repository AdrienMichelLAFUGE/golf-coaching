export const WEDGING_DRAPEAU_LONG_SLUG = "wedging_drapeau_long" as const;
export const WEDGING_DRAPEAU_LONG_SUBTEST_KEY = "wedging_drapeau_long" as const;

export type WedgingDrapeauLongSubtestKey = typeof WEDGING_DRAPEAU_LONG_SUBTEST_KEY;

export type WedgingDrapeauLongSituation =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I";

export type WedgingDrapeauLongResultValue =
  | "lt_1m"
  | "between_1m_3m"
  | "between_3m_5m"
  | "between_5m_7m"
  | "gt_7m"
  | "off_green";

type ResultOption = {
  value: WedgingDrapeauLongResultValue;
  label: string;
  points: number;
};

export type WedgingDrapeauLongSubtestDefinition = {
  key: WedgingDrapeauLongSubtestKey;
  label: string;
  distanceLabel: string;
  sequence: WedgingDrapeauLongSituation[];
  results: ResultOption[];
};

export type WedgingDrapeauLongTestDefinition = {
  slug: typeof WEDGING_DRAPEAU_LONG_SLUG;
  title: string;
  description: string;
  attemptsPerSubtest: number;
  subtests: WedgingDrapeauLongSubtestDefinition[];
};

export const WEDGING_DRAPEAU_LONG_SEQUENCE: WedgingDrapeauLongSituation[] = [
  "A",
  "D",
  "G",
  "B",
  "E",
  "H",
  "C",
  "F",
  "I",
  "A",
  "D",
  "G",
  "B",
  "E",
  "H",
  "C",
  "F",
  "I",
];

const WEDGING_RESULTS: ResultOption[] = [
  { value: "lt_1m", label: "A moins de 1m", points: -2 },
  { value: "between_1m_3m", label: "Entre 1m et 3m", points: -1 },
  { value: "between_3m_5m", label: "Entre 3m et 5m", points: 0 },
  { value: "between_5m_7m", label: "Entre 5m et 7m", points: 1 },
  { value: "gt_7m", label: "A plus de 7m", points: 2 },
  { value: "off_green", label: "Hors green", points: 3 },
];

const INDEX_EXPECTATIONS: Array<{ min: number; max: number; expected: number }> = [
  { min: -5, max: 0, expected: -6.8 },
  { min: 0, max: 5, expected: -2.6 },
  { min: 5, max: 10, expected: 1.9 },
  { min: 10, max: 15, expected: 5.5 },
  { min: 15, max: 20, expected: 10.1 },
  { min: 20, max: 25, expected: 14.8 },
  { min: 25, max: 30, expected: 20.2 },
  { min: 30, max: 35, expected: 24.6 },
  { min: 35, max: 40, expected: 27.3 },
  { min: 40, max: 45, expected: 30.5 },
  { min: 45, max: 50, expected: 34.1 },
  { min: 50, max: 54, expected: 37.4 },
];

const FLAG_EXPECTATIONS: Record<string, number> = {
  blanc: 39.6,
  jaune: 41.2,
  bleu: 43.8,
  rouge: 46.9,
};

const formatIndexRangeLabel = (min: number, max: number) => `Index ${min} a ${max}`;

const getClosestIndexRange = (score: number) => {
  let best = INDEX_EXPECTATIONS[0];
  let bestDelta = Math.abs(score - best.expected);
  for (const entry of INDEX_EXPECTATIONS.slice(1)) {
    const delta = Math.abs(score - entry.expected);
    if (delta < bestDelta || (delta === bestDelta && entry.min < best.min)) {
      best = entry;
      bestDelta = delta;
    }
  }
  return best;
};

const WEDGING_DRAPEAU_LONG_SUBTEST: WedgingDrapeauLongSubtestDefinition = {
  key: WEDGING_DRAPEAU_LONG_SUBTEST_KEY,
  label: "Wedging drapeau long",
  distanceLabel: "A=30m, B=35m, C=40m, D=45m, E=50m, F=55m, G=60m, H=65m, I=70m",
  sequence: WEDGING_DRAPEAU_LONG_SEQUENCE,
  results: WEDGING_RESULTS,
};

export const WEDGING_DRAPEAU_LONG_TEST: WedgingDrapeauLongTestDefinition = {
  slug: WEDGING_DRAPEAU_LONG_SLUG,
  title: "Wedging - Drapeau long",
  description:
    "18 balles pour mesurer la precision a longue distance et comparer avec une moyenne attendue.",
  attemptsPerSubtest: WEDGING_DRAPEAU_LONG_SEQUENCE.length,
  subtests: [WEDGING_DRAPEAU_LONG_SUBTEST],
};

export const getWedgingDrapeauLongResultOptions = () => WEDGING_RESULTS;

export const isWedgingDrapeauLongResultValue = (value: string) =>
  WEDGING_RESULTS.some((option) => option.value === value);

export const getWedgingDrapeauLongResultLabel = (
  value: WedgingDrapeauLongResultValue
) => WEDGING_RESULTS.find((option) => option.value === value)?.label ?? value;

export const getWedgingDrapeauLongResultPoints = (
  value: WedgingDrapeauLongResultValue
) => WEDGING_RESULTS.find((option) => option.value === value)?.points ?? 0;

const normalizeNumericLabel = (label: string) => label.trim().replace(",", ".");

const isNumericLabel = (label: string) =>
  /^-?\d+(?:[.,]\d+)?$/.test(label.trim());

export const parseWedgingIndexOrFlagLabel = (label?: string | null) => {
  if (!label) return null;
  const trimmed = label.trim();
  if (!trimmed) return null;

  if (isNumericLabel(trimmed)) {
    const value = Number.parseFloat(normalizeNumericLabel(trimmed));
    if (!Number.isFinite(value)) return null;
    const range = INDEX_EXPECTATIONS.find(
      (entry) => value >= entry.min && value <= entry.max
    );
    if (!range) return null;
    return {
      kind: "index" as const,
      value,
      expectedAvgScore: range.expected,
    };
  }

  const lower = trimmed.toLowerCase();
  const flagKey = (Object.keys(FLAG_EXPECTATIONS) as Array<keyof typeof FLAG_EXPECTATIONS>).find(
    (key) => lower.includes(key)
  );
  if (!flagKey) return null;
  return {
    kind: "flag" as const,
    flag: flagKey,
    expectedAvgScore: FLAG_EXPECTATIONS[flagKey],
  };
};

export const computeWedgingDrapeauLongTotalScore = (
  results: Array<WedgingDrapeauLongResultValue | null>
) =>
  results.reduce((acc, value) => {
    if (!value) return acc;
    return acc + getWedgingDrapeauLongResultPoints(value);
  }, 0);

export const computeWedgingDrapeauLongObjectivation = (
  label: string | null | undefined,
  totalScore: number
) => {
  const parsed = parseWedgingIndexOrFlagLabel(label);
  if (!parsed) return null;
  const delta = totalScore - parsed.expectedAvgScore;
  const verdict = delta < 0 ? "meilleur" : delta > 0 ? "moins bon" : "egal";
  return {
    expectedAvgScore: parsed.expectedAvgScore,
    delta,
    verdict,
  };
};

export const getWedgingDrapeauLongEquivalentIndexLabel = (totalScore: number) => {
  const range = getClosestIndexRange(totalScore);
  return formatIndexRangeLabel(range.min, range.max);
};
