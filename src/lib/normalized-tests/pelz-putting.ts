export const PELZ_PUTTING_SLUG = "pelz-putting" as const;

export type PelzSubtestKey =
  | "putt_long"
  | "putt_moyen"
  | "putt_pente"
  | "putt_offensif"
  | "putt_court_1m"
  | "putt_court_2m";

export type PelzResultValue =
  | "holed"
  | "lt_1m"
  | "between_1m_2m"
  | "gt_2m"
  | "in_zone"
  | "out_zone"
  | "miss";

type ResultOption = {
  value: PelzResultValue;
  label: string;
  points: number;
};

export type PelzSubtestDefinition = {
  key: PelzSubtestKey;
  label: string;
  distanceLabel: string;
  sequence: string[];
  results: ResultOption[];
  pointsToIndex: Record<number, number>;
};

export type PelzTestDefinition = {
  slug: typeof PELZ_PUTTING_SLUG;
  title: string;
  description: string;
  attemptsPerSubtest: number;
  subtests: PelzSubtestDefinition[];
  totalPointsToIndex: Record<number, number>;
};

const LONG_MEDIUM_RESULTS: ResultOption[] = [
  { value: "holed", label: "Balle rentree", points: 4 },
  { value: "lt_1m", label: "A moins de 1m", points: 2 },
  { value: "between_1m_2m", label: "Entre 1m et 2m", points: 1 },
  { value: "gt_2m", label: "A plus de 2m", points: 0 },
];

const ZONE_RESULTS: ResultOption[] = [
  { value: "holed", label: "Balle rentree", points: 2 },
  { value: "in_zone", label: "Dans la zone", points: 1 },
  { value: "out_zone", label: "Hors zone", points: 0 },
];

const SHORT_RESULTS: ResultOption[] = [
  { value: "holed", label: "Balle rentree", points: 1 },
  { value: "miss", label: "Rate", points: 0 },
];

const PELZ_PUTTING_SUBTESTS: PelzSubtestDefinition[] = [
  {
    key: "putt_long",
    label: "Putt long",
    distanceLabel: "13m / 19m / 25m",
    sequence: ["A", "B", "C", "A", "B", "C", "A", "B", "C", "A"],
    results: LONG_MEDIUM_RESULTS,
    pointsToIndex: {
      0: 48,
      1: 38,
      2: 34,
      3: 30,
      4: 26,
      5: 22,
      6: 18,
      7: 14,
      8: 11,
      9: 8,
      10: 6,
      11: 4,
      12: 2,
      13: 0,
      14: -2,
      15: -3,
      16: -4,
      17: -5,
      18: -6,
      19: -7,
      20: -8,
    },
  },
  {
    key: "putt_moyen",
    label: "Putt moyen",
    distanceLabel: "7m / 9m / 11m",
    sequence: ["A", "B", "C", "A", "B", "C", "A", "B", "C", "A"],
    results: LONG_MEDIUM_RESULTS,
    pointsToIndex: {
      2: 36,
      3: 34,
      4: 32,
      5: 30,
      6: 28,
      7: 26,
      8: 24,
      9: 22,
      10: 20,
      11: 18,
      12: 16,
      13: 14,
      14: 12,
      15: 10,
      16: 8,
      17: 6,
      18: 4,
      19: 2,
      20: 0,
      21: -2,
      22: -4,
      23: -6,
    },
  },
  {
    key: "putt_pente",
    label: "Putt en pente",
    distanceLabel: "4m / 6m / 8m / 10m / 12m",
    sequence: ["A", "B", "C", "D", "E", "A", "B", "C", "D", "E"],
    results: ZONE_RESULTS,
    pointsToIndex: {
      0: 39,
      1: 33,
      2: 27,
      3: 21,
      4: 16,
      5: 12,
      6: 9,
      7: 6,
      8: 4,
      9: 2,
      10: 0,
      11: -2,
      12: -3,
      13: -4,
      14: -5,
      15: -6,
      16: -7,
      17: -8,
    },
  },
  {
    key: "putt_offensif",
    label: "Putt offensif",
    distanceLabel: "3m / 4m / 5m / 6m / 7m",
    sequence: ["A", "B", "C", "D", "E", "A", "B", "C", "D", "E"],
    results: ZONE_RESULTS,
    pointsToIndex: {
      0: 40,
      1: 34,
      2: 28,
      3: 23,
      4: 19,
      5: 16,
      6: 13,
      7: 10,
      8: 7,
      9: 4,
      10: 1,
      11: -1,
      12: -3,
      13: -5,
      14: -6,
      15: -7,
      16: -8,
    },
  },
  {
    key: "putt_court_1m",
    label: "Putt court 1m",
    distanceLabel: "1m",
    sequence: ["A", "B", "C", "D", "E", "A", "B", "C", "D", "E"],
    results: SHORT_RESULTS,
    pointsToIndex: {
      0: 40,
      1: 39,
      2: 37,
      3: 31,
      4: 25,
      5: 19,
      6: 14,
      7: 9,
      8: 5,
      9: 1,
      10: -2,
    },
  },
  {
    key: "putt_court_2m",
    label: "Putt court 2m",
    distanceLabel: "2m",
    sequence: ["A", "B", "C", "D", "E", "A", "B", "C", "D", "E"],
    results: SHORT_RESULTS,
    pointsToIndex: {
      0: 38,
      1: 31,
      2: 25,
      3: 20,
      4: 16,
      5: 12,
      6: 8,
      7: 4,
      8: 1,
      9: -2,
      10: -4,
    },
  },
];

const TOTAL_POINTS_TO_INDEX: Record<number, number> = {
  2: 36,
  4: 35,
  5: 34,
  7: 33,
  8: 32,
  10: 31,
  11: 30,
  12: 29,
  14: 28,
  16: 27,
  17: 26,
  19: 25,
  20: 24,
  22: 23,
  24: 22,
  26: 21,
  27: 20,
  28: 19,
  31: 18,
  32: 17,
  34: 16,
  36: 15,
  38: 14,
  41: 13,
  42: 12,
  45: 11,
  48: 10,
  50: 9,
  51: 8,
  54: 7,
  57: 6,
  60: 5,
  62: 4,
  64: 3,
  70: 2,
  72: 1,
  76: 0,
  81: -1,
  85: -2,
  90: -3,
  95: -4,
  100: -5,
  105: -6,
  110: -7,
};

export const PELZ_PUTTING_TEST: PelzTestDefinition = {
  slug: PELZ_PUTTING_SLUG,
  title: "Pelz Putting",
  description:
    "Serie de 6 sous-tests pour evaluer la precision et le toucher au putting.",
  attemptsPerSubtest: 10,
  subtests: PELZ_PUTTING_SUBTESTS,
  totalPointsToIndex: TOTAL_POINTS_TO_INDEX,
};

export const getPelzSubtestDefinition = (key: PelzSubtestKey) =>
  PELZ_PUTTING_SUBTESTS.find((subtest) => subtest.key === key) ?? null;

export const getPelzResultOptions = (key: PelzSubtestKey) =>
  getPelzSubtestDefinition(key)?.results ?? [];

export const getPelzResultLabel = (key: PelzSubtestKey, value: PelzResultValue) => {
  const option = getPelzResultOptions(key).find((entry) => entry.value === value);
  return option?.label ?? value;
};

export const isPelzResultValue = (key: PelzSubtestKey, value: string) => {
  const options = getPelzResultOptions(key);
  return options.some((option) => option.value === value);
};

export const getPelzResultPoints = (key: PelzSubtestKey, value: PelzResultValue) => {
  const option = getPelzResultOptions(key).find((entry) => entry.value === value);
  return option ? option.points : 0;
};

const lookupIndexFloor = (points: number, table: Record<number, number>) => {
  const keys = Object.keys(table)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (keys.length === 0) return null;
  const min = keys[0];
  const max = keys[keys.length - 1];
  if (points <= min) return table[min];
  if (points >= max) return table[max];
  for (let idx = keys.length - 1; idx >= 0; idx -= 1) {
    const key = keys[idx];
    if (points >= key) return table[key];
  }
  return table[min];
};

export const computePelzSubtestScore = (
  key: PelzSubtestKey,
  results: Array<PelzResultValue | null>
) => {
  const totalPoints = results.reduce((acc, value) => {
    if (!value) return acc;
    return acc + getPelzResultPoints(key, value);
  }, 0);
  const indexValue = results.every(Boolean)
    ? lookupIndexFloor(totalPoints, getPelzSubtestDefinition(key)?.pointsToIndex ?? {})
    : null;
  return { totalPoints, indexValue };
};

export const computePelzTotalIndex = (totalPoints: number) =>
  lookupIndexFloor(totalPoints, TOTAL_POINTS_TO_INDEX);
