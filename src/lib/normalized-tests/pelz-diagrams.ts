import type { PelzSubtestKey } from "./pelz-putting";

export const PELZ_DIAGRAM_KEYS = {
  long: "putt-long",
  moyen: "putt-moyen",
  pente: "putt-pente",
  offensif: "putt-offensif",
  court1m: "putt-court-1m",
  court2m: "putt-court-2m",
} as const;

export const PELZ_DIAGRAM_BY_SUBTEST: Record<PelzSubtestKey, string> = {
  putt_long: PELZ_DIAGRAM_KEYS.long,
  putt_moyen: PELZ_DIAGRAM_KEYS.moyen,
  putt_pente: PELZ_DIAGRAM_KEYS.pente,
  putt_offensif: PELZ_DIAGRAM_KEYS.offensif,
  putt_court_1m: PELZ_DIAGRAM_KEYS.court1m,
  putt_court_2m: PELZ_DIAGRAM_KEYS.court2m,
};

export const PELZ_DIAGRAM_ALT_TEXT: Record<PelzSubtestKey, string> = {
  putt_long: "Putt long - situations A=13m, B=19m, C=25m",
  putt_moyen: "Putt moyen - situations A=7m, B=9m, C=11m",
  putt_pente: "Putt en pente - situations A=4m, B=6m, C=8m, D=10m, E=12m",
  putt_offensif: "Putt offensif - situations A=3m, B=4m, C=5m, D=6m, E=7m",
  putt_court_1m: "Putt court 1m - situations A/B/C/D/E a 1m",
  putt_court_2m: "Putt court 2m - situations A/B/C/D/E a 2m",
};

export const PELZ_DIAGRAM_BUCKET = "pelz-diagrams";
export const PELZ_DIAGRAM_EXTENSION = "png";
