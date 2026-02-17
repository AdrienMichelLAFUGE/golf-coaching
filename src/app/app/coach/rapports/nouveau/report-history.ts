type ReportHistorySection = {
  type: "text" | "image" | "video" | "radar";
  content?: string;
  contentFormatted?: string | null;
  mediaUrls?: string[];
  mediaCaptions?: string[];
  radarFileId?: string | null;
  radarConfig?: unknown;
};

export const REPORT_UNDO_HISTORY_LIMIT = 6;

const deepCloneForHistory = <T,>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

export const cloneReportSectionsForHistory = <T extends ReportHistorySection>(
  sections: T[]
): T[] =>
  sections.map((section) => ({
    ...section,
    mediaUrls: [...(section.mediaUrls ?? [])],
    mediaCaptions: [...(section.mediaCaptions ?? [])],
    radarConfig: section.radarConfig ? deepCloneForHistory(section.radarConfig) : null,
  }));

export const reportSectionHasContent = (section: ReportHistorySection) => {
  if ((section.content ?? "").trim().length > 0) return true;
  if ((section.contentFormatted ?? "").trim().length > 0) return true;
  if ((section.mediaUrls ?? []).length > 0) return true;
  if (section.type === "radar" && section.radarFileId) return true;
  return false;
};

export const buildNextUndoStack = <T extends ReportHistorySection>(
  previousSnapshot: T[] | null,
  currentStack: T[][],
  limit = REPORT_UNDO_HISTORY_LIMIT
): T[][] => {
  if (!previousSnapshot) return [...currentStack];
  return [cloneReportSectionsForHistory(previousSnapshot), ...currentStack].slice(0, limit);
};

export const popUndoSnapshot = <T extends ReportHistorySection>(stack: T[][]) => {
  const [previous, ...rest] = stack;
  return {
    previous: previous ? cloneReportSectionsForHistory(previous) : null,
    rest,
  };
};
