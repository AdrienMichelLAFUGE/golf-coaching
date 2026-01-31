export const WEDGING_DRAPEAU_COURT_SLUG = "wedging_drapeau_court" as const;
export const WEDGING_DRAPEAU_COURT_SUBTEST_KEY = "wedging_drapeau_court" as const;

export type WedgingDrapeauCourtSubtestKey = typeof WEDGING_DRAPEAU_COURT_SUBTEST_KEY;

export type WedgingDrapeauCourtSituation =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I";

export type WedgingDrapeauCourtResultValue =
  | "lt_1m"
  | "between_1m_3m"
  | "between_3m_5m"
  | "between_5m_7m"
  | "gt_7m"
  | "off_green";

type ResultOption = {
  value: WedgingDrapeauCourtResultValue;
  label: string;
  points: number;
};

export type WedgingDrapeauCourtSubtestDefinition = {
  key: WedgingDrapeauCourtSubtestKey;
  label: string;
  distanceLabel: string;
  sequence: WedgingDrapeauCourtSituation[];
  results: ResultOption[];
};

export type WedgingDrapeauCourtTestDefinition = {
  slug: typeof WEDGING_DRAPEAU_COURT_SLUG;
  title: string;
  description: string;
  attemptsPerSubtest: number;
  subtests: WedgingDrapeauCourtSubtestDefinition[];
};

export const WEDGING_DRAPEAU_COURT_SEQUENCE: WedgingDrapeauCourtSituation[] = [
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
  { min: -5, max: 0, expected: -4.6 },
  { min: 0, max: 5, expected: -0.7 },
  { min: 5, max: 10, expected: 6.1 },
  { min: 10, max: 15, expected: 11.3 },
  { min: 15, max: 20, expected: 14.4 },
  { min: 20, max: 25, expected: 19.5 },
  { min: 25, max: 30, expected: 24.3 },
  { min: 30, max: 35, expected: 28.8 },
  { min: 35, max: 40, expected: 31.4 },
  { min: 40, max: 45, expected: 35.5 },
  { min: 45, max: 50, expected: 38.1 },
  { min: 50, max: 54, expected: 40.4 },
];

const FLAG_EXPECTATIONS: Record<string, number> = {
  blanc: 42.1,
  jaune: 44.6,
  bleu: 46.9,
  rouge: 49.8,
};

const WEDGING_DRAPEAU_COURT_SUBTEST: WedgingDrapeauCourtSubtestDefinition = {
  key: WEDGING_DRAPEAU_COURT_SUBTEST_KEY,
  label: "Wedging drapeau court",
  distanceLabel: "A=30m, B=35m, C=40m, D=45m, E=50m, F=55m, G=60m, H=65m, I=70m",
  sequence: WEDGING_DRAPEAU_COURT_SEQUENCE,
  results: WEDGING_RESULTS,
};

export const WEDGING_DRAPEAU_COURT_TEST: WedgingDrapeauCourtTestDefinition = {
  slug: WEDGING_DRAPEAU_COURT_SLUG,
  title: "Wedging - Drapeau court",
  description:
    "18 balles pour mesurer la precision a courte distance et comparer avec une moyenne attendue.",
  attemptsPerSubtest: WEDGING_DRAPEAU_COURT_SEQUENCE.length,
  subtests: [WEDGING_DRAPEAU_COURT_SUBTEST],
};

export const getWedgingDrapeauCourtResultOptions = () => WEDGING_RESULTS;

export const isWedgingDrapeauCourtResultValue = (value: string) =>
  WEDGING_RESULTS.some((option) => option.value === value);

export const getWedgingDrapeauCourtResultLabel = (
  value: WedgingDrapeauCourtResultValue
) => WEDGING_RESULTS.find((option) => option.value === value)?.label ?? value;

export const getWedgingDrapeauCourtResultPoints = (
  value: WedgingDrapeauCourtResultValue
) => WEDGING_RESULTS.find((option) => option.value === value)?.points ?? 0;

const normalizeNumericLabel = (label: string) => label.trim().replace(",", ".");

const isNumericLabel = (label: string) =>
  /^-?\d+(?:[.,]\d+)?$/.test(label.trim());

export const parseWedgingCourtIndexOrFlagLabel = (label?: string | null) => {
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

export const computeWedgingDrapeauCourtTotalScore = (
  results: Array<WedgingDrapeauCourtResultValue | null>
) =>
  results.reduce((acc, value) => {
    if (!value) return acc;
    return acc + getWedgingDrapeauCourtResultPoints(value);
  }, 0);

export const computeWedgingDrapeauCourtObjectivation = (
  label: string | null | undefined,
  totalScore: number
) => {
  const parsed = parseWedgingCourtIndexOrFlagLabel(label);
  if (!parsed) return null;
  const delta = totalScore - parsed.expectedAvgScore;
  const verdict = delta < 0 ? "meilleur" : delta > 0 ? "moins bon" : "egal";
  return {
    expectedAvgScore: parsed.expectedAvgScore,
    delta,
    verdict,
  };
};
