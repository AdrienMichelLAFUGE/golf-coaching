import type { PelzApprochesSubtestKey } from "./pelz-approches";

export const PELZ_APPROCHES_DIAGRAM_KEYS = {
  groupABC: "approche-levee",
  groupDEF: "wedging-50m",
  groupGHI: "bunker-long",
} as const;

export const PELZ_APPROCHES_DIAGRAM_BY_SUBTEST: Record<PelzApprochesSubtestKey, string> =
  {
    approche_levee: PELZ_APPROCHES_DIAGRAM_KEYS.groupABC,
    chip_long: PELZ_APPROCHES_DIAGRAM_KEYS.groupABC,
    chip_court: PELZ_APPROCHES_DIAGRAM_KEYS.groupABC,
    wedging_50m: PELZ_APPROCHES_DIAGRAM_KEYS.groupDEF,
    bunker_court: PELZ_APPROCHES_DIAGRAM_KEYS.groupDEF,
    wedging_30m: PELZ_APPROCHES_DIAGRAM_KEYS.groupDEF,
    bunker_long: PELZ_APPROCHES_DIAGRAM_KEYS.groupGHI,
    approche_mi_distance: PELZ_APPROCHES_DIAGRAM_KEYS.groupGHI,
    approche_rough: PELZ_APPROCHES_DIAGRAM_KEYS.groupGHI,
  };

export const PELZ_APPROCHES_DIAGRAM_ALT_TEXT: Record<PelzApprochesSubtestKey, string> = {
  approche_levee: "Approche levee - situations A=15m, B=20m, C=10m",
  chip_long: "Chip long - situations A=15m, B=20m, C=10m",
  chip_court: "Chip court - situations A=15m, B=20m, C=10m",
  wedging_50m: "Wedging 50m - situations D=50m, E=10m, F=30m",
  bunker_court: "Bunker court - situations D=50m, E=10m, F=30m",
  wedging_30m: "Wedging 30m - situations D=50m, E=10m, F=30m",
  bunker_long: "Bunker long - situations G=25m, H=20m, I=15m",
  approche_mi_distance: "Approche mi-distance - situations G=25m, H=20m, I=15m",
  approche_rough: "Approche rough - situations G=25m, H=20m, I=15m",
};

export const PELZ_APPROCHES_DIAGRAM_BUCKET = "pelz-diagrams";
export const PELZ_APPROCHES_DIAGRAM_EXTENSION = "png";
