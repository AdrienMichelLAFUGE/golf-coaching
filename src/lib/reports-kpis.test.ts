import {
  computeMedianCadenceDays,
  extractPrioritySnippet,
  extractTopClubs,
  type ReportKpiRow,
} from "@/lib/reports-kpis";

const mkReport = (partial: Partial<ReportKpiRow> & { id: string }): ReportKpiRow => ({
  id: partial.id,
  title: partial.title ?? "Rapport",
  created_at: partial.created_at ?? "2026-02-09T10:00:00Z",
  report_date: partial.report_date ?? null,
  sent_at: partial.sent_at ?? "2026-02-09T10:00:00Z",
  org_id: partial.org_id ?? "00000000-0000-0000-0000-000000000001",
  organizations: partial.organizations ?? null,
  coach_observations: partial.coach_observations ?? null,
  coach_work: partial.coach_work ?? null,
  coach_club: partial.coach_club ?? null,
});

describe("computeMedianCadenceDays", () => {
  it("returns null for <2 reports", () => {
    expect(computeMedianCadenceDays([mkReport({ id: "00000000-0000-0000-0000-000000000001" })])).toBe(
      null
    );
  });

  it("computes a median cadence in days from newest-first report dates", () => {
    const reports = [
      mkReport({ id: "00000000-0000-0000-0000-000000000010", report_date: "2026-02-09" }),
      mkReport({ id: "00000000-0000-0000-0000-000000000011", report_date: "2026-02-01" }), // 8d
      mkReport({ id: "00000000-0000-0000-0000-000000000012", report_date: "2026-01-20" }), // 12d
      mkReport({ id: "00000000-0000-0000-0000-000000000013", report_date: "2026-01-10" }), // 10d
    ];
    expect(computeMedianCadenceDays(reports)).toBe(10);
  });
});

describe("extractTopClubs", () => {
  it("returns most frequent clubs from coach_club", () => {
    const reports = [
      mkReport({ id: "00000000-0000-0000-0000-000000000020", coach_club: "Driver, Fer 7" }),
      mkReport({ id: "00000000-0000-0000-0000-000000000021", coach_club: "driver\nWedge" }),
      mkReport({ id: "00000000-0000-0000-0000-000000000022", coach_club: "Wedge; Fer 7" }),
    ];
    expect(extractTopClubs(reports, 5, 3)).toEqual(["Driver", "Fer 7", "Wedge"]);
  });
});

describe("extractPrioritySnippet", () => {
  it("returns first non-empty line from coach_work", () => {
    const report = mkReport({
      id: "00000000-0000-0000-0000-000000000030",
      coach_work: "\n\nTravail: tempo et rythme\nDeuxieme ligne",
    });
    expect(extractPrioritySnippet(report)).toBe("Travail: tempo et rythme");
  });

  it("falls back to coach_observations when coach_work is empty", () => {
    const report = mkReport({
      id: "00000000-0000-0000-0000-000000000031",
      coach_work: "   ",
      coach_observations: "Contact un peu talon.",
    });
    expect(extractPrioritySnippet(report)).toBe("Contact un peu talon.");
  });
});

