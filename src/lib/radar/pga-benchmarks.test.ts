import { findPgaBenchmark } from "./pga-benchmarks";

describe("findPgaBenchmark", () => {
  it("matches driver variants", () => {
    expect(findPgaBenchmark("Driver")?.club).toBe("Driver");
    expect(findPgaBenchmark("Bois 1")?.club).toBe("Driver");
  });

  it("matches iron numbers", () => {
    expect(findPgaBenchmark("7 iron")?.club).toBe("7 Iron");
  });

  it("returns null when no match", () => {
    expect(findPgaBenchmark("Hybrid 2")).toBeNull();
  });
});
