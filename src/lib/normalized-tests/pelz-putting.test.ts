import {
  computePelzSubtestScore,
  computePelzTotalIndex,
  type PelzResultValue,
} from "./pelz-putting";

const buildAttempts = (value: PelzResultValue) => Array.from({ length: 10 }, () => value);

describe("pelz putting scoring", () => {
  it("computes points and index only when complete", () => {
    const complete = computePelzSubtestScore("putt_court_1m", buildAttempts("holed"));
    expect(complete.totalPoints).toBe(10);
    expect(complete.indexValue).toBe(-2);

    const incomplete = computePelzSubtestScore("putt_court_1m", [
      "holed",
      "holed",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(incomplete.totalPoints).toBe(2);
    expect(incomplete.indexValue).toBeNull();
  });

  it("clamps to the closest lower index for missing totals", () => {
    const index = computePelzTotalIndex(3);
    expect(index).toBe(36);
  });
});
