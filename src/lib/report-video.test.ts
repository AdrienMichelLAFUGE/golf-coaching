import {
  VIDEO_MAX_PER_SECTION,
  VIDEO_MAX_SECTIONS_PER_REPORT,
  hasVideoSection,
  validateVideoSections,
} from "./report-video";

describe("report-video", () => {
  test("hasVideoSection detects a video section", () => {
    expect(hasVideoSection([{ type: "text" }])).toBe(false);
    expect(hasVideoSection([{ type: "video" }])).toBe(true);
  });

  test("validateVideoSections enforces max video sections per report", () => {
    const sections = Array.from({ length: VIDEO_MAX_SECTIONS_PER_REPORT + 1 }, () => ({
      type: "video",
      mediaUrls: [],
    }));
    expect(validateVideoSections(sections)).toMatch(/Une seule section video/i);
  });

  test("validateVideoSections enforces max videos per section", () => {
    expect(
      validateVideoSections([{ type: "video", mediaUrls: Array(VIDEO_MAX_PER_SECTION + 1) }])
    ).toMatch(/Maximum/i);
  });

  test("validateVideoSections accepts valid configuration", () => {
    expect(
      validateVideoSections([{ type: "video", mediaUrls: Array(VIDEO_MAX_PER_SECTION) }])
    ).toBeNull();
  });
});

