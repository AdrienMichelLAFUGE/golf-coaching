import { z } from "zod";
import {
  WEDGING_DRAPEAU_LONG_SEQUENCE,
  type WedgingDrapeauLongResultValue,
  type WedgingDrapeauLongSituation,
  parseWedgingIndexOrFlagLabel,
} from "./wedging-drapeau-long";

export const WEDGING_DRAPEAU_LONG_SITUATIONS = [
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

export const WEDGING_DRAPEAU_LONG_RESULTS = [
  "lt_1m",
  "between_1m_3m",
  "between_3m_5m",
  "between_5m_7m",
  "gt_7m",
  "off_green",
] as const;

export const wedgingAttemptSchema = z.object({
  index: z.number().int().min(1).max(WEDGING_DRAPEAU_LONG_SEQUENCE.length),
  situation: z.enum(WEDGING_DRAPEAU_LONG_SITUATIONS),
  result: z.enum(WEDGING_DRAPEAU_LONG_RESULTS),
});

export type WedgingDrapeauLongAttemptInput = z.infer<typeof wedgingAttemptSchema>;

export const wedgingAttemptsSchema = z.array(wedgingAttemptSchema).superRefine(
  (attempts, ctx) => {
    const expected = WEDGING_DRAPEAU_LONG_SEQUENCE;
    const byIndex = new Map<number, WedgingDrapeauLongSituation>();
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

export const wedgingIndexLabelSchema = z
  .string()
  .trim()
  .max(80)
  .optional()
  .superRefine((value, ctx) => {
    if (!value) return;
    if (!parseWedgingIndexOrFlagLabel(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Index ou drapeau invalide.",
      });
    }
  });

export const isWedgingResultValue = (
  value: string
): value is WedgingDrapeauLongResultValue =>
  (WEDGING_DRAPEAU_LONG_RESULTS as readonly string[]).includes(value);
