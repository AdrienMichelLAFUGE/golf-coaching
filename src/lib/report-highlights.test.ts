import {
  buildLongTermHighlights,
  buildReportHighlights,
  type ReportSectionKpi,
} from "@/lib/report-highlights";

const section = (
  overrides: Partial<
    Pick<
      ReportSectionKpi,
      "id" | "report_id" | "title" | "content" | "content_formatted"
    >
  > = {}
): ReportSectionKpi => ({
  id: overrides.id ?? "00000000-0000-0000-0000-000000000001",
  report_id: overrides.report_id ?? "00000000-0000-0000-0000-000000000010",
  title: overrides.title ?? "Technique",
  content: overrides.content ?? "Tempo a stabiliser.",
  content_formatted: overrides.content_formatted ?? null,
});

describe("buildReportHighlights", () => {
  it("extracts snippets by section titles", () => {
    const highlights = buildReportHighlights([
      section({ title: "Points forts", content: "Contact centre de face." }),
      section({ title: "Technique", content: "Rythme plus stable." }),
      section({ title: "Physique", content: "Mobilite hanches a travailler." }),
      section({ title: "Points faibles", content: "Face ouverte a l impact." }),
    ]);

    expect(highlights.strength).toBe("Contact centre de face.");
    expect(highlights.technical).toBe("Rythme plus stable.");
    expect(highlights.physical).toBe("Mobilite hanches a travailler.");
    expect(highlights.weakness).toBe("Face ouverte a l impact.");
  });
});

describe("buildLongTermHighlights", () => {
  it("counts mentions across reports and picks most recent snippet", () => {
    const r1 = "00000000-0000-0000-0000-000000000101";
    const r2 = "00000000-0000-0000-0000-000000000102";
    const r3 = "00000000-0000-0000-0000-000000000103";

    const highlights = buildLongTermHighlights(
      [r1, r2, r3],
      [
        section({
          id: "00000000-0000-0000-0000-000000000201",
          report_id: r2,
          title: "Technique",
          content: "Axe plus stable.",
        }),
        section({
          id: "00000000-0000-0000-0000-000000000202",
          report_id: r3,
          title: "Technique",
          content: "Grip a clarifier.",
        }),
        section({
          id: "00000000-0000-0000-0000-000000000203",
          report_id: r1,
          title: "Physique",
          content: "Cheville gauche.",
        }),
      ]
    );

    expect(highlights.technical.mentions).toBe(2);
    expect(highlights.technical.snippet).toBe("Axe plus stable.");
    expect(highlights.physical.mentions).toBe(1);
    expect(highlights.physical.snippet).toBe("Cheville gauche.");
  });
});
