import {
  computeWedgingDrapeauCourtObjectivation,
  computeWedgingDrapeauCourtTotalScore,
  getWedgingDrapeauCourtEquivalentIndexLabel,
  getWedgingDrapeauCourtResultPoints,
  parseWedgingCourtIndexOrFlagLabel,
} from "./wedging-drapeau-court";
import { wedgingCourtAttemptsSchema } from "./wedging-drapeau-court.validation";

describe("wedging drapeau court", () => {
  it("computes points and total score", () => {
    const points = [
      getWedgingDrapeauCourtResultPoints("lt_1m"),
      getWedgingDrapeauCourtResultPoints("between_1m_3m"),
      getWedgingDrapeauCourtResultPoints("between_3m_5m"),
      getWedgingDrapeauCourtResultPoints("off_green"),
    ];
    expect(points).toEqual([-2, -1, 0, 3]);
    const partialResults = [
      "lt_1m",
      "between_1m_3m",
      "between_3m_5m",
      "off_green",
    ] as const;
    expect(computeWedgingDrapeauCourtTotalScore([...partialResults])).toBe(0);
  });

  it("maps index and flag labels to expected averages", () => {
    const indexResult = parseWedgingCourtIndexOrFlagLabel("12");
    expect(indexResult?.expectedAvgScore).toBe(11.3);

    const flagResult = parseWedgingCourtIndexOrFlagLabel("Drapeau Rouge");
    expect(flagResult?.expectedAvgScore).toBe(49.8);

    const objectivation = computeWedgingDrapeauCourtObjectivation("Drapeau Rouge", 40);
    expect(objectivation?.expectedAvgScore).toBe(49.8);
    expect(objectivation?.delta).toBeCloseTo(-9.8, 5);
    expect(objectivation?.verdict).toBe("meilleur");
  });

  it("rejects an invalid situation sequence", () => {
    const result = wedgingCourtAttemptsSchema.safeParse([
      { index: 1, situation: "A", result: "lt_1m" },
      { index: 2, situation: "A", result: "between_1m_3m" },
    ]);
    expect(result.success).toBe(false);
  });

  it("derives an equivalent index range from total score", () => {
    const label = getWedgingDrapeauCourtEquivalentIndexLabel(12);
    expect(label).toBe("Index 10 a 15");
  });
});
