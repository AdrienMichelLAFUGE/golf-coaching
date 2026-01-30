import { getViewerShareAccess } from "./student-share";

describe("getViewerShareAccess", () => {
  it("denies read before active", () => {
    const access = getViewerShareAccess("pending_student");
    expect(access.canRead).toBe(false);
    expect(access.canWrite).toBe(false);
  });

  it("allows read after active but denies write", () => {
    const access = getViewerShareAccess("active");
    expect(access.canRead).toBe(true);
    expect(access.canWrite).toBe(false);
  });
});
