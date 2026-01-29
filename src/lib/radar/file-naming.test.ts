import { buildRadarFileDisplayName } from "./file-naming";

describe("buildRadarFileDisplayName", () => {
  it("builds a display name with tech prefix and extension", () => {
    const name = buildRadarFileDisplayName({
      tech: "trackman",
      studentName: "Jane Doe",
      reportDate: "2026-01-29",
      club: "Driver",
      originalName: "export.jpeg",
      fallbackDate: new Date("2026-01-01T00:00:00Z"),
    });

    expect(name).toBe("TM - Jane Doe - 2026-01-29 - Driver.jpeg");
  });

  it("uses fallbacks when fields are missing", () => {
    const name = buildRadarFileDisplayName({
      tech: "smart2move",
      studentName: " ",
      reportDate: "",
      club: "",
      originalName: "export.png",
      fallbackDate: new Date("2026-02-03T10:00:00Z"),
    });

    expect(name).toBe("S2M - Eleve - 2026-02-03 - Club inconnu.png");
  });
});
