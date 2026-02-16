import {
  canDeleteReport,
  canEditReport,
  isReportInActiveWorkspace,
} from "./report-permissions";

describe("report permissions", () => {
  it("allows workspace match and blocks mismatch", () => {
    expect(
      isReportInActiveWorkspace({
        activeOrgId: "org-a",
        reportOrgId: "org-a",
      })
    ).toBe(true);

    expect(
      isReportInActiveWorkspace({
        activeOrgId: "org-a",
        reportOrgId: "org-b",
      })
    ).toBe(false);
  });

  it("allows deletion for shared reports in active workspace", () => {
    expect(
      canDeleteReport({
        activeOrgId: "org-a",
        reportOrgId: "org-a",
      })
    ).toBe(true);
  });

  it("blocks deletion when report belongs to another workspace", () => {
    expect(
      canDeleteReport({
        activeOrgId: "org-a",
        reportOrgId: "org-b",
      })
    ).toBe(false);
  });

  it("blocks edition for shared reports, even in active workspace", () => {
    expect(
      canEditReport({
        activeOrgId: "org-a",
        reportOrgId: "org-a",
        originShareId: "share-1",
      })
    ).toBe(false);
  });

  it("allows edition for owned reports in active workspace", () => {
    expect(
      canEditReport({
        activeOrgId: "org-a",
        reportOrgId: "org-a",
        originShareId: null,
      })
    ).toBe(true);
  });
});
