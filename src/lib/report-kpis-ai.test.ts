import { ReportKpisPayloadSchema } from "@/lib/report-kpis-ai";

describe("ReportKpisPayloadSchema", () => {
  it("accepts exactly 3 short_term and 3 long_term items", () => {
    const payload = {
      short_term: [
        { id: "st_1", title: "A", value: "B", confidence: 0.7, evidence: "ev" },
        { id: "st_2", title: "A", value: "B", confidence: 0.7, evidence: "ev" },
        { id: "st_3", title: "A", value: "B", confidence: 0.7, evidence: "ev" },
      ],
      long_term: [
        { id: "lt_1", title: "A", value: "B", confidence: 0.7, evidence: "ev" },
        { id: "lt_2", title: "A", value: "B", confidence: 0.7, evidence: "ev" },
        { id: "lt_3", title: "A", value: "B", confidence: 0.7, evidence: "ev" },
      ],
      meta: { sampleSize: 5 },
    };

    expect(ReportKpisPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("rejects when arrays are not length 3", () => {
    const payload = {
      short_term: [{ id: "st_1", title: "A", value: "B", confidence: 0.7, evidence: "ev" }],
      long_term: [{ id: "lt_1", title: "A", value: "B", confidence: 0.7, evidence: "ev" }],
      meta: { sampleSize: 1 },
    };

    expect(ReportKpisPayloadSchema.safeParse(payload).success).toBe(false);
  });
});

