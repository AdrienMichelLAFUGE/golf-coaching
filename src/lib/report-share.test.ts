import { buildSharedReportPdf } from "./report-share";

describe("buildSharedReportPdf", () => {
  it("includes student name and preserves structured text content", () => {
    const pdf = buildSharedReportPdf({
      title: "Bilan technique",
      reportDate: "2026-02-12",
      studentName: "Camille Dupont",
      sections: [
        {
          title: "Observations",
          content:
            "# Synthese\n- Axe 1\n- Axe 2\n\n**Important**: garder le tempo sur les mises en jeu.",
          type: "text",
        },
      ],
    });

    const raw = pdf.toString("utf8");
    expect(raw).toContain("Eleve: Camille Dupont");
    expect(raw).toContain("Synthese");
    expect(raw).toContain("- Axe 1");
    expect(raw).toContain("Important");
  });

  it("adds a media note when section contains non-text content", () => {
    const pdf = buildSharedReportPdf({
      title: "Rapport multimedia",
      reportDate: "2026-02-12",
      studentName: "Eleve Test",
      sections: [
        {
          title: "Analyse video",
          content: "",
          type: "video",
          hasRichMedia: true,
          mediaCount: 2,
        },
      ],
    });

    const raw = pdf.toString("utf8");
    expect(raw).toContain("Note media: 2 videos.");
    expect(raw).toContain("version SwingFlow");
  });
});
