export const VIDEO_MAX_DURATION_SECONDS = 60;
export const VIDEO_MAX_PER_SECTION = 3;
export const VIDEO_MAX_SECTIONS_PER_REPORT = 1;

export type ReportSectionLike = {
  type?: string | null;
  mediaUrls?: string[] | null;
};

export const hasVideoSection = (sections: ReportSectionLike[]) =>
  sections.some((section) => section.type === "video");

export const validateVideoSections = (sections: ReportSectionLike[]): string | null => {
  const videoSections = sections.filter((section) => section.type === "video");
  if (videoSections.length > VIDEO_MAX_SECTIONS_PER_REPORT) {
    return "Une seule section video est autorisee par rapport.";
  }

  for (const section of videoSections) {
    const count = (section.mediaUrls ?? []).length;
    if (count > VIDEO_MAX_PER_SECTION) {
      return `Maximum ${VIDEO_MAX_PER_SECTION} videos dans la section video.`;
    }
  }

  return null;
};

