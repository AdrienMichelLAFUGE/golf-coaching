import { pointsToIndex } from "./pelz-approches";

describe("pelz-approches tables", () => {
  it.each([
    ["approche_levee", 37],
    ["chip_long", 38],
    ["chip_court", 39],
    ["wedging_50m", 39],
    ["bunker_court", 39],
    ["wedging_30m", 40],
    ["bunker_long", 38],
    ["approche_mi_distance", 39],
    ["approche_rough", 38],
  ] as const)("uses exact lookup for %s", (key, expected) => {
    expect(pointsToIndex(key, 0)).toBe(expected);
  });

  it("clamps total points to the nearest lower key", () => {
    expect(pointsToIndex("total", 13)).toBe(34);
  });
});
