import {
  REPORT_UNDO_HISTORY_LIMIT,
  buildNextUndoStack,
  cloneReportSectionsForHistory,
  popUndoSnapshot,
  reportSectionHasContent,
} from "./report-history";

type Section = {
  id: string;
  type: "text" | "image" | "video" | "radar";
  content?: string;
  contentFormatted?: string | null;
  mediaUrls?: string[];
  mediaCaptions?: string[];
  radarFileId?: string | null;
  radarConfig?: { smart2move?: { impactMarkerX: number } } | null;
};

const makeSection = (overrides: Partial<Section> = {}): Section => ({
  id: "s-1",
  type: "text",
  content: "",
  contentFormatted: null,
  mediaUrls: [],
  mediaCaptions: [],
  radarFileId: null,
  radarConfig: null,
  ...overrides,
});

describe("report-history helpers", () => {
  it("detecte correctement le contenu d'une section", () => {
    expect(reportSectionHasContent(makeSection())).toBe(false);
    expect(reportSectionHasContent(makeSection({ content: "texte" }))).toBe(true);
    expect(
      reportSectionHasContent(makeSection({ contentFormatted: "<p>format</p>" }))
    ).toBe(true);
    expect(reportSectionHasContent(makeSection({ mediaUrls: ["img-1"] }))).toBe(true);
    expect(
      reportSectionHasContent(
        makeSection({
          type: "radar",
          radarFileId: "radar-1",
        })
      )
    ).toBe(true);
  });

  it("clone les sections sans partager les references internes", () => {
    const original = [
      makeSection({
        id: "s-1",
        mediaUrls: ["a"],
        mediaCaptions: ["caption"],
        radarConfig: { smart2move: { impactMarkerX: 42 } },
      }),
    ];

    const cloned = cloneReportSectionsForHistory(original);

    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned[0].mediaUrls).not.toBe(original[0].mediaUrls);
    expect(cloned[0].mediaCaptions).not.toBe(original[0].mediaCaptions);
    expect(cloned[0].radarConfig).not.toBe(original[0].radarConfig);
  });

  it("alimente la pile undo dans le bon ordre et respecte la limite", () => {
    const makeSnapshot = (id: string): Section[] => [makeSection({ id, content: id })];

    let stack: Section[][] = [];
    for (let index = 1; index <= REPORT_UNDO_HISTORY_LIMIT + 2; index += 1) {
      stack = buildNextUndoStack(makeSnapshot(`s-${index}`), stack);
    }

    expect(stack).toHaveLength(REPORT_UNDO_HISTORY_LIMIT);
    expect(stack[0][0].id).toBe(`s-${REPORT_UNDO_HISTORY_LIMIT + 2}`);
    expect(stack[REPORT_UNDO_HISTORY_LIMIT - 1][0].id).toBe("s-3");
  });

  it("depile correctement la pile undo", () => {
    const stack = [
      [makeSection({ id: "latest", content: "latest" })],
      [makeSection({ id: "older", content: "older" })],
    ];

    const { previous, rest } = popUndoSnapshot(stack);

    expect(previous?.[0].id).toBe("latest");
    expect(rest).toHaveLength(1);
    expect(rest[0][0].id).toBe("older");
  });
});
