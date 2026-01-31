import { z } from "zod";
import {
  WEDGING_DRAPEAU_COURT_SEQUENCE,
  type WedgingDrapeauCourtResultValue,
  type WedgingDrapeauCourtSituation,
  parseWedgingCourtIndexOrFlagLabel,
} from "./wedging-drapeau-court";

export const WEDGING_DRAPEAU_COURT_SITUATIONS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
] as const;

export const WEDGING_DRAPEAU_COURT_RESULTS = [
  "lt_1m",
  "between_1m_3m",
  "between_3m_5m",
  "between_5m_7m",
  "gt_7m",
  "off_green",
] as const;

export const wedgingCourtAttemptSchema = z.object({
  index: z.number().int().min(1).max(WEDGING_DRAPEAU_COURT_SEQUENCE.length),
  situation: z.enum(WEDGING_DRAPEAU_COURT_SITUATIONS),
  result: z.enum(WEDGING_DRAPEAU_COURT_RESULTS),
});

export type WedgingDrapeauCourtAttemptInput = z.infer<typeof wedgingCourtAttemptSchema>;

export const wedgingCourtAttemptsSchema = z.array(wedgingCourtAttemptSchema).superRefine(
  (attempts, ctx) => {
    const expected = WEDGING_DRAPEAU_COURT_SEQUENCE;
    const byIndex = new Map<number, WedgingDrapeauCourtSituation>();
    attempts.forEach((attempt, idx) => {
      if (byIndex.has(attempt.index)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [idx, "index"],
          message: "Tentative en double.",
        });
      }
      byIndex.set(attempt.index, attempt.situation);
    });

    attempts.forEach((attempt, idx) => {
      const expectedSituation = expected[attempt.index - 1];
      if (expectedSituation && attempt.situation !== expectedSituation) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [idx, "situation"],
          message: "Situation hors sequence.",
        });
      }
    });
  }
);

export const wedgingCourtIndexLabelSchema = z
  .string()
  .trim()
  .max(80)
  .optional()
  .superRefine((value, ctx) => {
    if (!value) return;
    if (!parseWedgingCourtIndexOrFlagLabel(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Index ou drapeau invalide.",
      });
    }
  });

export const isWedgingCourtResultValue = (
  value: string
): value is WedgingDrapeauCourtResultValue =>
  (WEDGING_DRAPEAU_COURT_RESULTS as readonly string[]).includes(value);
