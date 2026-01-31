import {
  PELZ_APPROCHES_POINTS_TABLES,
  PELZ_APPROCHES_TOTAL_POINTS_TO_INDEX,
} from "./pelz-approches.tables";

export const PELZ_APPROCHES_SLUG = "pelz-approches" as const;

export type PelzApprochesSubtestKey =
  | "approche_levee"
  | "chip_long"
  | "chip_court"
  | "wedging_50m"
  | "bunker_court"
  | "wedging_30m"
  | "bunker_long"
  | "approche_mi_distance"
  | "approche_rough";

export type PelzApprochesResultValue = "holed" | "lt_1m" | "between_1m_2m" | "gt_2m";

type ResultOption = {
  value: PelzApprochesResultValue;
  label: string;
  points: number;
};

export type PelzApprochesSubtestDefinition = {
  key: PelzApprochesSubtestKey;
  label: string;
  distanceLabel: string;
  sequence: string[];
  results: ResultOption[];
  pointsToIndex: Record<number, number>;
};

export type PelzApprochesTestDefinition = {
  slug: typeof PELZ_APPROCHES_SLUG;
  title: string;
  description: string;
  attemptsPerSubtest: number;
  subtests: PelzApprochesSubtestDefinition[];
  totalPointsToIndex: Record<number, number>;
};

const APPROCHES_RESULTS: ResultOption[] = [
  { value: "holed", label: "Balle rentree", points: 4 },
  { value: "lt_1m", label: "A moins de 1m", points: 2 },
  { value: "between_1m_2m", label: "Entre 1m et 2m", points: 1 },
  { value: "gt_2m", label: "A plus de 2m", points: 0 },
];

const SEQUENCE_ABC = ["A", "B", "C", "A", "B", "C", "A", "B", "C", "A"];
const SEQUENCE_DEF = ["D", "E", "F", "D", "E", "F", "D", "E", "F", "D"];
const SEQUENCE_GHI = ["G", "H", "I", "G", "H", "I", "G", "H", "I", "G"];

const PELZ_APPROCHES_SUBTESTS: PelzApprochesSubtestDefinition[] = [
  {
    key: "approche_levee",
    label: "Approche levee",
    distanceLabel: "A=15m, B=20m, C=10m",
    sequence: SEQUENCE_ABC,
    results: APPROCHES_RESULTS,
    pointsToIndex: PELZ_APPROCHES_POINTS_TABLES.approche_levee,
  },
  {
    key: "chip_long",
    label: "Chip long",
    distanceLabel: "A=15m, B=20m, C=10m",
    sequence: SEQUENCE_ABC,
    results: APPROCHES_RESULTS,
    pointsToIndex: PELZ_APPROCHES_POINTS_TABLES.chip_long,
  },
  {
    key: "chip_court",
    label: "Chip court",
    distanceLabel: "A=15m, B=20m, C=10m",
    sequence: SEQUENCE_ABC,
    results: APPROCHES_RESULTS,
    pointsToIndex: PELZ_APPROCHES_POINTS_TABLES.chip_court,
  },
  {
    key: "wedging_50m",
    label: "Wedging 50m",
    distanceLabel: "D=50m, E=10m, F=30m",
    sequence: SEQUENCE_DEF,
    results: APPROCHES_RESULTS,
    pointsToIndex: PELZ_APPROCHES_POINTS_TABLES.wedging_50m,
  },
  {
    key: "bunker_court",
    label: "Bunker court",
    distanceLabel: "D=50m, E=10m, F=30m",
    sequence: SEQUENCE_DEF,
    results: APPROCHES_RESULTS,
    pointsToIndex: PELZ_APPROCHES_POINTS_TABLES.bunker_court,
  },
  {
    key: "wedging_30m",
    label: "Wedging 30m",
    distanceLabel: "D=50m, E=10m, F=30m",
    sequence: SEQUENCE_DEF,
    results: APPROCHES_RESULTS,
    pointsToIndex: PELZ_APPROCHES_POINTS_TABLES.wedging_30m,
  },
  {
    key: "bunker_long",
    label: "Bunker long",
    distanceLabel: "G=25m, H=20m, I=15m",
    sequence: SEQUENCE_GHI,
    results: APPROCHES_RESULTS,
    pointsToIndex: PELZ_APPROCHES_POINTS_TABLES.bunker_long,
  },
  {
    key: "approche_mi_distance",
    label: "Approche mi-distance",
    distanceLabel: "G=25m, H=20m, I=15m",
    sequence: SEQUENCE_GHI,
    results: APPROCHES_RESULTS,
    pointsToIndex: PELZ_APPROCHES_POINTS_TABLES.approche_mi_distance,
  },
  {
    key: "approche_rough",
    label: "Approche rough",
    distanceLabel: "G=25m, H=20m, I=15m",
    sequence: SEQUENCE_GHI,
    results: APPROCHES_RESULTS,
    pointsToIndex: PELZ_APPROCHES_POINTS_TABLES.approche_rough,
  },
];

export const PELZ_APPROCHES_TEST: PelzApprochesTestDefinition = {
  slug: PELZ_APPROCHES_SLUG,
  title: "Pelz Approches",
  description: "Serie de 9 sous-tests pour evaluer la precision sur les approches.",
  attemptsPerSubtest: 10,
  subtests: PELZ_APPROCHES_SUBTESTS,
  totalPointsToIndex: PELZ_APPROCHES_TOTAL_POINTS_TO_INDEX,
};

export const getPelzApprochesSubtestDefinition = (key: PelzApprochesSubtestKey) =>
  PELZ_APPROCHES_SUBTESTS.find((subtest) => subtest.key === key) ?? null;

export const getPelzApprochesResultOptions = (key: PelzApprochesSubtestKey) =>
  getPelzApprochesSubtestDefinition(key)?.results ?? [];

export const getPelzApprochesResultLabel = (
  key: PelzApprochesSubtestKey,
  value: PelzApprochesResultValue
) => {
  const option = getPelzApprochesResultOptions(key).find(
    (entry) => entry.value === value
  );
  return option?.label ?? value;
};

export const isPelzApprochesResultValue = (
  key: PelzApprochesSubtestKey,
  value: string
) => {
  const options = getPelzApprochesResultOptions(key);
  return options.some((option) => option.value === value);
};

export const getPelzApprochesResultPoints = (
  key: PelzApprochesSubtestKey,
  value: PelzApprochesResultValue
) => {
  const option = getPelzApprochesResultOptions(key).find(
    (entry) => entry.value === value
  );
  return option ? option.points : 0;
};

const lookupIndexFloor = (points: number, table: Record<number, number>) => {
  const keys = Object.keys(table)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
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

export const pointsToIndex = (
  key: PelzApprochesSubtestKey | "total",
  totalPoints: number
) => {
  if (key === "total") {
    return lookupIndexFloor(totalPoints, PELZ_APPROCHES_TOTAL_POINTS_TO_INDEX);
  }
  return lookupIndexFloor(totalPoints, PELZ_APPROCHES_POINTS_TABLES[key]);
};

export const computePelzApprochesSubtestScore = (
  key: PelzApprochesSubtestKey,
  results: Array<PelzApprochesResultValue | null>
) => {
  const totalPoints = results.reduce((acc, value) => {
    if (!value) return acc;
    return acc + getPelzApprochesResultPoints(key, value);
  }, 0);
  const indexValue = results.every(Boolean) ? pointsToIndex(key, totalPoints) : null;
  return { totalPoints, indexValue };
};

export const computePelzApprochesTotalIndex = (totalPoints: number) =>
  pointsToIndex("total", totalPoints);
