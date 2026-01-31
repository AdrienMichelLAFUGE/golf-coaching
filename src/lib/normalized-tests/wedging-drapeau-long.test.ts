import {
  computeWedgingDrapeauLongObjectivation,
  computeWedgingDrapeauLongTotalScore,
  getWedgingDrapeauLongEquivalentIndexLabel,
  getWedgingDrapeauLongResultPoints,
  parseWedgingIndexOrFlagLabel,
} from "./wedging-drapeau-long";
import { wedgingAttemptsSchema } from "./wedging-drapeau-long.validation";

describe("wedging drapeau long", () => {
  it("computes points and total score", () => {
    const points = [
      getWedgingDrapeauLongResultPoints("lt_1m"),
      getWedgingDrapeauLongResultPoints("between_1m_3m"),
      getWedgingDrapeauLongResultPoints("between_3m_5m"),
      getWedgingDrapeauLongResultPoints("off_green"),
    ];
    expect(points).toEqual([-2, -1, 0, 3]);
    const partialResults = [
      "lt_1m",
      "between_1m_3m",
      "between_3m_5m",
      "off_green",
    ] as const;
    expect(computeWedgingDrapeauLongTotalScore([...partialResults])).toBe(0);
  });

  it("rejects an invalid situation sequence", () => {
    const result = wedgingAttemptsSchema.safeParse([
      { index: 1, situation: "A", result: "lt_1m" },
      { index: 2, situation: "A", result: "between_1m_3m" },
    ]);
    expect(result.success).toBe(false);
  });

  it("maps index and flag labels to expected averages", () => {
    const indexResult = parseWedgingIndexOrFlagLabel("12");
    expect(indexResult?.expectedAvgScore).toBe(5.5);

    const flagResult = parseWedgingIndexOrFlagLabel("Drapeau Bleu");
    expect(flagResult?.expectedAvgScore).toBe(43.8);

    const objectivation = computeWedgingDrapeauLongObjectivation("Drapeau Bleu", 40);
    expect(objectivation?.expectedAvgScore).toBe(43.8);
    expect(objectivation?.delta).toBeCloseTo(-3.8, 5);
    expect(objectivation?.verdict).toBe("meilleur");
  });

  it("derives an equivalent index range from total score", () => {
    const label = getWedgingDrapeauLongEquivalentIndexLabel(6);
    expect(label).toBe("Index 10 a 15");
  });
});
