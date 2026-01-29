import { computeOutliers } from "./outliers";

describe("computeOutliers", () => {
  it("flags obvious outliers for a metric", () => {
    const shots = Array.from({ length: 10 }, (_, index) => ({
      shot_index: index + 1,
      carry: index === 9 ? 100 : index + 1,
    }));

    const result = computeOutliers(shots, ["carry"]);

    expect(result.byMetric.carry).toContain(10);
    expect(result.flags["10"]).toContain("carry");
  });

  it("returns empty lists when metrics are missing", () => {
    const shots = [{ shot_index: 1 }];
    const result = computeOutliers(shots, ["carry"]);

    expect(result.byMetric.carry ?? []).toEqual([]);
    expect(result.worst10_distance).toEqual([]);
    expect(result.worst10_dispersion).toEqual([]);
    expect(result.top20_strikes).toEqual([]);
  });
});
