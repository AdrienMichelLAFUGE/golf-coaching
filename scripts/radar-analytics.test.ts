import { readFileSync } from "node:fs";
import { computeAnalytics } from "../src/lib/radar/computeAnalytics";

type Fixture = {
  columns: Array<{
    key: string;
    group: string | null;
    label: string;
    unit: string | null;
  }>;
  shots: Array<Record<string, unknown>>;
};

describe("radar analytics fixture", () => {
  it("computes the expected stats from the sample payload", () => {
    const fixture = JSON.parse(
      readFileSync(new URL("./fixtures/radar-sample.json", import.meta.url), "utf-8")
    ) as Fixture;

    const analytics = computeAnalytics({
      columns: fixture.columns,
      shots: fixture.shots,
    });

    expect(analytics.version).toBe("radar-analytics-v1");
    expect(analytics.meta.shotCount).toBeGreaterThan(0);
    expect(analytics.globalStats.carry.count).toBeGreaterThan(0);
    expect(analytics.chartsData.dispersion_scatter.available).toBe(true);
    const segments = analytics.segments as Record<string, { summaries?: unknown[] }>;
    expect(segments.byShotType?.summaries?.length ?? 0).toBeGreaterThan(0);
  });
});
