export const SMART2MOVE_BUBBLE_ORDER = [
  "address_backswing",
  "transition_impact",
  "peak_intensity_timing",
  "summary",
] as const;

export type Smart2MoveBubbleKey = (typeof SMART2MOVE_BUBBLE_ORDER)[number];

export const SMART2MOVE_BUBBLE_LABELS: Record<Smart2MoveBubbleKey, string> = {
  address_backswing: "Adresse -> Backswing",
  transition_impact: "Transition -> Impact",
  peak_intensity_timing: "Intensite des pics et chronologie",
  summary: "Resume global",
};

export const SMART2MOVE_BUBBLE_ANCHOR_FALLBACK: Record<
  Smart2MoveBubbleKey,
  { x: number; y: number }
> = {
  address_backswing: { x: 0.2, y: 0.3 },
  transition_impact: { x: 0.48, y: 0.42 },
  peak_intensity_timing: { x: 0.72, y: 0.38 },
  summary: { x: 0.86, y: 0.7 },
};

export type Smart2MoveFxAnnotation = {
  bubbleKey: Smart2MoveBubbleKey;
  id: string;
  title: string;
  detail: string;
  reasoning: string | null;
  solution: string | null;
  anchor: {
    x: number | null;
    y: number | null;
  };
  evidence: string | null;
};

export type Smart2MoveZoneBand = {
  bubbleKey: Smart2MoveBubbleKey;
  start: number;
  end: number;
  width: number;
};

type Smart2MoveFxContextPayload = {
  kind?: string;
  annotations?: unknown;
  miniSummary?: unknown;
  impactMarkerX?: unknown;
  transitionStartX?: unknown;
};

type AnnotationCandidate = Omit<Smart2MoveFxAnnotation, "bubbleKey"> & {
  bubbleKey?: Smart2MoveBubbleKey | null;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const SMART2MOVE_TRANSITION_MIN_GAP = 0.02;

export const SMART2MOVE_PEAK_WINDOW_BEFORE = 0.05;
export const SMART2MOVE_PEAK_WINDOW_AFTER = 0.08;

const normalizeText = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

export const normalizeSmart2MoveAxisValue = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return clamp01(value);
};

export const normalizeSmart2MoveImpactMarkerX = (value: unknown) =>
  normalizeSmart2MoveAxisValue(value);

export const normalizeSmart2MoveTransitionStartX = (value: unknown) =>
  normalizeSmart2MoveAxisValue(value);

export const resolveSmart2MoveTransitionStartX = (
  impactMarkerX: number | null,
  transitionStartX: number | null
) => {
  const normalizedImpactX = normalizeSmart2MoveImpactMarkerX(impactMarkerX);
  if (normalizedImpactX === null) return null;
  const fallback = clamp01(normalizedImpactX - 0.18);
  const normalizedTransitionX = normalizeSmart2MoveTransitionStartX(transitionStartX) ?? fallback;
  const maxAllowed = Math.max(0, normalizedImpactX - SMART2MOVE_TRANSITION_MIN_GAP);
  return clamp01(Math.min(normalizedTransitionX, maxAllowed));
};

export const resolveSmart2MovePeakWindow = (impactMarkerX: number | null) => {
  const normalizedImpactX = normalizeSmart2MoveImpactMarkerX(impactMarkerX);
  if (normalizedImpactX === null) return null;
  return {
    start: clamp01(normalizedImpactX - SMART2MOVE_PEAK_WINDOW_BEFORE),
    end: clamp01(normalizedImpactX + SMART2MOVE_PEAK_WINDOW_AFTER),
  };
};

export const resolveSmart2MoveAnchor = (annotation: Smart2MoveFxAnnotation) => {
  const fallback = SMART2MOVE_BUBBLE_ANCHOR_FALLBACK[annotation.bubbleKey];
  return {
    x: normalizeSmart2MoveAxisValue(annotation.anchor.x) ?? fallback.x,
    y: normalizeSmart2MoveAxisValue(annotation.anchor.y) ?? fallback.y,
  };
};

export const buildSmart2MoveZoneBands = (
  annotations: Smart2MoveFxAnnotation[],
  markers: {
    impactMarkerX: number | null;
    transitionStartX: number | null;
  }
): Smart2MoveZoneBand[] => {
  if (!annotations.length) return [];
  const centersFromAnchors = annotations.map((annotation) => resolveSmart2MoveAnchor(annotation).x);
  const isStrictlyIncreasing = centersFromAnchors.every(
    (center, index) => index === 0 || center > centersFromAnchors[index - 1] + 0.02
  );
  const centers = isStrictlyIncreasing
    ? centersFromAnchors
    : annotations.map((annotation) => SMART2MOVE_BUBBLE_ANCHOR_FALLBACK[annotation.bubbleKey].x);

  const boundaries: number[] = [0];
  for (let index = 1; index < centers.length; index += 1) {
    boundaries.push((centers[index - 1] + centers[index]) / 2);
  }
  boundaries.push(1);

  const transitionIndex = annotations.findIndex(
    (annotation) => annotation.bubbleKey === "transition_impact"
  );
  if (transitionIndex >= 0 && transitionIndex + 1 < boundaries.length - 1) {
    const impactX =
      normalizeSmart2MoveImpactMarkerX(markers.impactMarkerX) ?? centers[transitionIndex];
    const transitionStartX =
      resolveSmart2MoveTransitionStartX(impactX, markers.transitionStartX) ??
      Math.max(0, impactX - 0.18);
    const minGap = SMART2MOVE_TRANSITION_MIN_GAP;
    const leftBoundaryIndex = transitionIndex;
    const splitBoundaryIndex = transitionIndex + 1;
    const rightBoundaryIndex = transitionIndex + 2;
    if (leftBoundaryIndex >= 0 && rightBoundaryIndex < boundaries.length) {
      boundaries[leftBoundaryIndex] = Math.max(0, Math.min(transitionStartX, impactX - minGap));
      if (boundaries[rightBoundaryIndex] < impactX + minGap) {
        boundaries[rightBoundaryIndex] = Math.min(1, impactX + 0.12);
      }
      boundaries[splitBoundaryIndex] = impactX;
    }
  }

  return annotations.map((annotation, index) => {
    const start = clamp01(boundaries[index]);
    const end = clamp01(boundaries[index + 1]);
    return {
      bubbleKey: annotation.bubbleKey,
      start,
      end,
      width: Math.max(0, end - start),
    };
  });
};

const normalizeToken = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const mapBubbleKeyByToken = (token: string): Smart2MoveBubbleKey | null => {
  if (!token) return null;
  if (
    token.includes("address backswing") ||
    token.includes("adresse backswing") ||
    token.includes("adresse") ||
    token.includes("backswing")
  ) {
    return "address_backswing";
  }
  if (
    token.includes("transition impact") ||
    token.includes("transition") ||
    token.includes("impact")
  ) {
    return "transition_impact";
  }
  if (
    token.includes("peak intensity timing") ||
    token.includes("intensite") ||
    token.includes("chronologie") ||
    token.includes("timing")
  ) {
    return "peak_intensity_timing";
  }
  if (
    token.includes("post impact summary") ||
    token.includes("post impact") ||
    token.includes("summary") ||
    token.includes("resume")
  ) {
    return "summary";
  }
  return null;
};

const normalizeBubbleKey = (source: Record<string, unknown>) => {
  const rawKey =
    normalizeText(source.bubble_key) ||
    normalizeText(source.bubbleKey) ||
    normalizeText(source.id) ||
    normalizeText(source.title);
  if (!rawKey) return null;
  const token = normalizeToken(rawKey);
  if (SMART2MOVE_BUBBLE_ORDER.includes(token as Smart2MoveBubbleKey)) {
    return token as Smart2MoveBubbleKey;
  }
  if (token === "1" || token === "a1" || token === "bulle 1" || token === "bubble 1") {
    return "address_backswing";
  }
  if (token === "2" || token === "a2" || token === "bulle 2" || token === "bubble 2") {
    return "transition_impact";
  }
  if (token === "3" || token === "a3" || token === "bulle 3" || token === "bubble 3") {
    return "peak_intensity_timing";
  }
  if (token === "4" || token === "a4" || token === "bulle 4" || token === "bubble 4") {
    return "summary";
  }
  return mapBubbleKeyByToken(token);
};

const normalizeItem = (value: unknown, index: number): AnnotationCandidate | null => {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const title = normalizeText(source.title);
  const detail = normalizeText(source.detail);
  const reasoning = normalizeText(source.reasoning) || null;
  const solution = normalizeText(source.solution) || null;
  const evidence = normalizeText(source.evidence) || null;
  if (!title && !detail && !reasoning && !solution && !evidence) return null;
  const sourceAnchor =
    source.anchor && typeof source.anchor === "object"
      ? (source.anchor as Record<string, unknown>)
      : null;
  const x = normalizeSmart2MoveAxisValue(sourceAnchor?.x);
  const y = normalizeSmart2MoveAxisValue(sourceAnchor?.y);
  const idSource = normalizeText(source.id);
  return {
    bubbleKey: normalizeBubbleKey(source),
    id: idSource || `a-${index + 1}`,
    title,
    detail,
    reasoning,
    solution,
    anchor: { x, y },
    evidence,
  };
};

const buildFallbackAnnotation = (bubbleKey: Smart2MoveBubbleKey): Smart2MoveFxAnnotation => ({
  bubbleKey,
  id: bubbleKey,
  title: SMART2MOVE_BUBBLE_LABELS[bubbleKey],
  detail: "",
  reasoning: null,
  solution: null,
  anchor: {
    x: SMART2MOVE_BUBBLE_ANCHOR_FALLBACK[bubbleKey].x,
    y: SMART2MOVE_BUBBLE_ANCHOR_FALLBACK[bubbleKey].y,
  },
  evidence: null,
});

export const sanitizeSmart2MoveAnnotations = (input: unknown): Smart2MoveFxAnnotation[] => {
  const raw = Array.isArray(input) ? input : [];
  const candidates = raw
    .map((item, index) => normalizeItem(item, index))
    .filter((item): item is AnnotationCandidate => Boolean(item));
  if (!candidates.length) return [];
  const keyed = new Map<Smart2MoveBubbleKey, AnnotationCandidate>();
  const withoutKey: AnnotationCandidate[] = [];

  candidates.forEach((item) => {
    if (item.bubbleKey && !keyed.has(item.bubbleKey)) {
      keyed.set(item.bubbleKey, item);
      return;
    }
    withoutKey.push(item);
  });

  const ordered = SMART2MOVE_BUBBLE_ORDER.map((bubbleKey) => {
    const fromKey = keyed.get(bubbleKey);
    const candidate = fromKey ?? withoutKey.shift() ?? null;
    if (!candidate) return buildFallbackAnnotation(bubbleKey);
    return {
      ...candidate,
      bubbleKey,
      title: candidate.title || SMART2MOVE_BUBBLE_LABELS[bubbleKey],
      id: candidate.id || bubbleKey,
      anchor: {
        x:
          typeof candidate.anchor.x === "number"
            ? candidate.anchor.x
            : SMART2MOVE_BUBBLE_ANCHOR_FALLBACK[bubbleKey].x,
        y:
          typeof candidate.anchor.y === "number"
            ? candidate.anchor.y
            : SMART2MOVE_BUBBLE_ANCHOR_FALLBACK[bubbleKey].y,
      },
    };
  });

  return ordered;
};

const resolveFallbackImpactMarkerX = (annotations: Smart2MoveFxAnnotation[]) => {
  const transition = annotations.find((annotation) => annotation.bubbleKey === "transition_impact");
  if (!transition) return null;
  return resolveSmart2MoveAnchor(transition).x;
};

const resolveFallbackTransitionStartX = (
  annotations: Smart2MoveFxAnnotation[],
  impactMarkerX: number | null
) => {
  const address = annotations.find((annotation) => annotation.bubbleKey === "address_backswing");
  const fallbackFromAddress = address ? resolveSmart2MoveAnchor(address).x + 0.18 : null;
  return resolveSmart2MoveTransitionStartX(
    impactMarkerX,
    fallbackFromAddress ?? null
  );
};

export const buildSmart2MoveAiContext = (
  annotations: Smart2MoveFxAnnotation[],
  miniSummary?: string | null,
  impactMarkerX?: number | null,
  transitionStartX?: number | null
) =>
  {
    const sanitized = sanitizeSmart2MoveAnnotations(annotations);
    const normalizedImpactMarkerX =
      normalizeSmart2MoveImpactMarkerX(impactMarkerX) ?? resolveFallbackImpactMarkerX(sanitized);
    const normalizedTransitionStartX =
      resolveSmart2MoveTransitionStartX(normalizedImpactMarkerX, transitionStartX ?? null) ??
      resolveFallbackTransitionStartX(sanitized, normalizedImpactMarkerX);
    return JSON.stringify({
      kind: "smart2move_graph_v2",
      annotations: sanitized,
      miniSummary: typeof miniSummary === "string" ? miniSummary.trim() || null : null,
      impactMarkerX: normalizedImpactMarkerX,
      transitionStartX: normalizedTransitionStartX,
    });
  };

export const parseSmart2MoveAiContextPayload = (aiContext?: string | null) => {
  if (!aiContext) {
    return {
      annotations: [] as Smart2MoveFxAnnotation[],
      miniSummary: null as string | null,
      impactMarkerX: null as number | null,
      transitionStartX: null as number | null,
    };
  }
  try {
    const parsed = JSON.parse(aiContext) as Smart2MoveFxContextPayload;
    const miniSummary =
      typeof parsed.miniSummary === "string" ? parsed.miniSummary.trim() || null : null;
    const annotations = sanitizeSmart2MoveAnnotations(parsed.annotations);
    const impactMarkerX =
      normalizeSmart2MoveImpactMarkerX(parsed.impactMarkerX) ??
      resolveFallbackImpactMarkerX(annotations);
    const transitionStartX =
      resolveSmart2MoveTransitionStartX(
        impactMarkerX,
        normalizeSmart2MoveTransitionStartX(parsed.transitionStartX)
      ) ??
      resolveFallbackTransitionStartX(annotations, impactMarkerX);
    return { annotations, miniSummary, impactMarkerX, transitionStartX };
  } catch {
    return {
      annotations: [] as Smart2MoveFxAnnotation[],
      miniSummary: null as string | null,
      impactMarkerX: null as number | null,
      transitionStartX: null as number | null,
    };
  }
};

export const parseSmart2MoveAiContext = (aiContext?: string | null) =>
  parseSmart2MoveAiContextPayload(aiContext).annotations;
