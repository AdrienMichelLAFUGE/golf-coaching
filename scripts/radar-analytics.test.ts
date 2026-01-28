import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { computeAnalytics } from "../src/lib/radar/computeAnalytics";

type Fixture = {
  columns: Array<{ key: string; group: string | null; label: string; unit: string | null }>;
  shots: Array<Record<string, unknown>>;
};

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/radar-sample.json", import.meta.url), "utf-8")
) as Fixture;

const analytics = computeAnalytics({
  columns: fixture.columns,
  shots: fixture.shots,
});

assert.equal(analytics.version, "radar-analytics-v1");
assert.ok(analytics.meta.shotCount > 0);
assert.ok(analytics.globalStats.carry.count > 0);
assert.ok(analytics.chartsData.dispersion_scatter.available);
assert.ok(analytics.segments.byShotType?.summaries?.length ?? 0);
console.log("Radar analytics tests passed.");
