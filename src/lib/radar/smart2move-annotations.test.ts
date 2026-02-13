import {
  buildSmart2MoveAiContext,
  buildSmart2MoveZoneBands,
  parseSmart2MoveAiContextPayload,
  type Smart2MoveFxAnnotation,
} from "./smart2move-annotations";

const FIXTURE_ANNOTATIONS: Smart2MoveFxAnnotation[] = [
  {
    bubbleKey: "address_backswing",
    id: "a-1",
    title: "Adresse -> Backswing",
    detail: "detail 1",
    reasoning: null,
    solution: null,
    anchor: { x: 0.2, y: 0.3 },
    evidence: null,
  },
  {
    bubbleKey: "transition_impact",
    id: "a-2",
    title: "Transition -> Impact",
    detail: "detail 2",
    reasoning: null,
    solution: null,
    anchor: { x: 0.47, y: 0.4 },
    evidence: null,
  },
  {
    bubbleKey: "peak_intensity_timing",
    id: "a-3",
    title: "Intensite des pics et chronologie",
    detail: "detail 3",
    reasoning: null,
    solution: null,
    anchor: { x: 0.75, y: 0.38 },
    evidence: null,
  },
  {
    bubbleKey: "summary",
    id: "a-4",
    title: "Resume global",
    detail: "detail 4",
    reasoning: null,
    solution: null,
    anchor: { x: 0.9, y: 0.7 },
    evidence: null,
  },
];

describe("smart2move annotations context", () => {
  it("stores and restores impact marker x in aiContext", () => {
    const payload = buildSmart2MoveAiContext(FIXTURE_ANNOTATIONS, "mini", 0.72, 0.58);
    const parsed = parseSmart2MoveAiContextPayload(payload);

    expect(parsed.miniSummary).toBe("mini");
    expect(parsed.annotations).toHaveLength(4);
    expect(parsed.impactMarkerX).toBeCloseTo(0.72, 4);
    expect(parsed.transitionStartX).toBeCloseTo(0.58, 4);
  });

  it("clamps transition/impact boundary exactly on impact marker", () => {
    const bands = buildSmart2MoveZoneBands(FIXTURE_ANNOTATIONS, {
      impactMarkerX: 0.68,
      transitionStartX: 0.53,
    });
    const transitionBand = bands.find((band) => band.bubbleKey === "transition_impact");
    const peaksBand = bands.find((band) => band.bubbleKey === "peak_intensity_timing");

    expect(transitionBand).toBeDefined();
    expect(peaksBand).toBeDefined();
    expect(transitionBand?.start).toBeCloseTo(0.53, 6);
    expect(transitionBand?.end).toBeCloseTo(0.68, 6);
    expect(peaksBand?.start).toBeCloseTo(0.68, 6);
  });

  it("falls back to transition anchor for legacy aiContext payload", () => {
    const legacyPayload = JSON.stringify({
      kind: "smart2move_fx_v1",
      annotations: FIXTURE_ANNOTATIONS.map((item) => ({
        bubble_key: item.bubbleKey,
        id: item.id,
        title: item.title,
        detail: item.detail,
        reasoning: item.reasoning,
        solution: item.solution,
        anchor: item.anchor,
        evidence: item.evidence,
      })),
      miniSummary: null,
    });

    const parsed = parseSmart2MoveAiContextPayload(legacyPayload);
    expect(parsed.impactMarkerX).toBeCloseTo(0.47, 6);
    expect(parsed.transitionStartX).toBeLessThan(0.47);
  });
});
