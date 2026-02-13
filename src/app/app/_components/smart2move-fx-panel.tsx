"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildSmart2MoveZoneBands,
  parseSmart2MoveAiContextPayload,
  resolveSmart2MovePeakWindow,
  SMART2MOVE_BUBBLE_LABELS,
  SMART2MOVE_BUBBLE_ORDER,
  resolveSmart2MoveAnchor,
  sanitizeSmart2MoveAnnotations,
  type Smart2MoveBubbleKey,
  type Smart2MoveFxAnnotation,
} from "@/lib/radar/smart2move-annotations";

type Smart2MoveFxPanelProps = {
  analysis?: string | null;
  imageUrl?: string | null;
  fileName?: string | null;
  compact?: boolean;
  aiContext?: string | null;
  annotations?: Smart2MoveFxAnnotation[] | null;
};

const IMPACT_STORAGE_KEY_PREFIX = "smart2move-impact-x:";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const compactText = (value: string | null, max = 220) => {
  const source = (value ?? "").replace(/\s+/g, " ").trim();
  if (!source) return "";
  if (source.length <= max) return source;
  return `${source.slice(0, max - 1).trim()}...`;
};


const resolveImageIdentity = (fileName?: string | null, imageUrl?: string | null) => {
  const fromFileName = fileName?.trim();
  if (fromFileName) return fromFileName;
  if (!imageUrl) return null;
  try {
    const parsed = new URL(imageUrl);
    return parsed.pathname || imageUrl;
  } catch {
    return imageUrl.split("?")[0] ?? imageUrl;
  }
};

const detectImpactLineX = (image: HTMLImageElement) => {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height || width < 64 || height < 64) {
    return { x: null as number | null, confidence: 0 };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return { x: null as number | null, confidence: 0 };
  }

  try {
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;

    const left = Math.floor(width * 0.22);
    const right = Math.floor(width * 0.86);
    const top = Math.floor(height * 0.12);
    const bottom = Math.floor(height * 0.92);
    const roiHeight = Math.max(1, bottom - top + 1);

    let bestX: number | null = null;
    let bestScore = -1;

    const luminanceAt = (x: number, y: number) => {
      const safeX = Math.max(0, Math.min(width - 1, x));
      const safeY = Math.max(0, Math.min(height - 1, y));
      const offset = (safeY * width + safeX) * 4;
      const alpha = pixels[offset + 3];
      if (alpha < 100) return 255;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    for (let x = left; x <= right; x += 1) {
      let darkCount = 0;
      let longestRun = 0;
      let run = 0;

      for (let y = top; y <= bottom; y += 1) {
        const lum = Math.min(
          luminanceAt(x, y),
          luminanceAt(x - 1, y),
          luminanceAt(x + 1, y)
        );
        const isDark = lum < 42;
        if (isDark) {
          darkCount += 1;
          run += 1;
          if (run > longestRun) longestRun = run;
        } else {
          run = 0;
        }
      }

      const coverage = darkCount / roiHeight;
      const runRatio = longestRun / roiHeight;
      if (coverage < 0.2 || runRatio < 0.18) continue;

      const centerBias = 1 - Math.min(1, Math.abs(x / width - 0.54) / 0.5);
      const score = coverage * 0.72 + runRatio * 0.24 + centerBias * 0.04;
      if (score > bestScore) {
        bestScore = score;
        bestX = x / width;
      }
    }

    if (bestX === null) return { x: null as number | null, confidence: 0 };
    return { x: clamp01(bestX), confidence: clamp01(bestScore) };
  } catch {
    return { x: null as number | null, confidence: 0 };
  }
};


export default function Smart2MoveFxPanel({
  analysis,
  imageUrl,
  fileName,
  compact = false,
  aiContext,
  annotations,
}: Smart2MoveFxPanelProps) {
  const parsedContext = useMemo(
    () => parseSmart2MoveAiContextPayload(aiContext),
    [aiContext]
  );
  const resolvedAnnotations = useMemo(() => {
    if (annotations?.length) return sanitizeSmart2MoveAnnotations(annotations);
    return sanitizeSmart2MoveAnnotations(parsedContext.annotations);
  }, [annotations, parsedContext.annotations]);
  const bubbles = useMemo(
    () =>
      SMART2MOVE_BUBBLE_ORDER.map((bubbleKey) =>
        resolvedAnnotations.find((item) => item.bubbleKey === bubbleKey)
      ).filter((item): item is Smart2MoveFxAnnotation => Boolean(item)),
    [resolvedAnnotations]
  );

  const imageRef = useRef<HTMLImageElement | null>(null);
  const [requestedBubble, setRequestedBubble] = useState<Smart2MoveBubbleKey | null>(null);
  const [detectedImpactX, setDetectedImpactX] = useState<number | null>(null);
  const [detectionConfidence, setDetectionConfidence] = useState(0);
  const [manualImpactX, setManualImpactX] = useState<number | null>(null);
  const [impactPickMode, setImpactPickMode] = useState(false);

  const imageIdentity = useMemo(
    () => resolveImageIdentity(fileName, imageUrl),
    [fileName, imageUrl]
  );
  const impactStorageKey = imageIdentity ? `${IMPACT_STORAGE_KEY_PREFIX}${imageIdentity}` : null;

  const transitionBubble = useMemo(
    () => bubbles.find((bubble) => bubble.bubbleKey === "transition_impact") ?? null,
    [bubbles]
  );
  const transitionAnchorX = transitionBubble ? resolveSmart2MoveAnchor(transitionBubble).x : null;
  const analysisImpactX = parsedContext.impactMarkerX ?? null;
  const analysisTransitionStartX = parsedContext.transitionStartX ?? null;
  const canManualAdjust = analysisImpactX === null;

  const activeBubbleKey = useMemo(() => {
    if (!bubbles.length) return null;
    if (requestedBubble && bubbles.some((item) => item.bubbleKey === requestedBubble)) {
      return requestedBubble;
    }
    return bubbles[0].bubbleKey;
  }, [bubbles, requestedBubble]);

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      setImpactPickMode(false);
      setDetectedImpactX(null);
      setDetectionConfidence(0);
      setManualImpactX(null);
      if (analysisImpactX !== null) return;
      if (!impactStorageKey) return;
      try {
        const raw = sessionStorage.getItem(impactStorageKey);
        if (!raw) return;
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) return;
        setManualImpactX(clamp01(parsed));
      } catch {
        // Ignore storage failures.
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [impactStorageKey, analysisImpactX]);

  const runImpactDetection = useCallback(() => {
    const image = imageRef.current;
    if (!image) return;
    const detected = detectImpactLineX(image);
    setDetectedImpactX(detected.x);
    setDetectionConfidence(detected.confidence);
  }, []);

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    if (image.complete) {
      runImpactDetection();
    }
  }, [imageUrl, runImpactDetection]);

  const resolvedImpactX = useMemo(() => {
    if (manualImpactX !== null) return manualImpactX;
    if (analysisImpactX !== null) return analysisImpactX;
    if (detectedImpactX !== null && detectionConfidence >= 0.45) return detectedImpactX;
    if (transitionAnchorX !== null) return transitionAnchorX;
    return detectedImpactX;
  }, [manualImpactX, analysisImpactX, detectedImpactX, detectionConfidence, transitionAnchorX]);

  const hasBubbles = bubbles.length > 0;
  const bubblesByKey = useMemo(() => new Map(bubbles.map((bubble) => [bubble.bubbleKey, bubble])), [bubbles]);
  const zoneBands = useMemo(
    () =>
      buildSmart2MoveZoneBands(bubbles, {
        impactMarkerX: resolvedImpactX ?? null,
        transitionStartX: analysisTransitionStartX,
      }),
    [bubbles, resolvedImpactX, analysisTransitionStartX]
  );
  const peakWindow = useMemo(
    () => resolveSmart2MovePeakWindow(resolvedImpactX ?? null),
    [resolvedImpactX]
  );
  const fallbackText =
    analysis?.trim() || "Analyse Smart2Move indisponible. Aucun contenu de bulle disponible.";

  const detectionStatus = useMemo(() => {
    if (manualImpactX !== null) return "Impact manuel";
    if (analysisImpactX !== null) return "Impact analyse (IA)";
    if (detectedImpactX !== null && detectionConfidence >= 0.45) {
      return `Impact auto (${Math.round(detectionConfidence * 100)}%)`;
    }
    if (transitionAnchorX !== null) return "Impact fallback (annotation)";
    return "Impact non detecte";
  }, [manualImpactX, analysisImpactX, detectedImpactX, detectionConfidence, transitionAnchorX]);

  const detectionNeedsHelp =
    manualImpactX === null &&
    analysisImpactX === null &&
    (detectedImpactX === null || detectionConfidence < 0.45);

  const handleManualImpactPick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!impactPickMode) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (bounds.width <= 0) return;
      const relativeX = clamp01((event.clientX - bounds.left) / bounds.width);
      setManualImpactX(relativeX);
      setImpactPickMode(false);
      if (!impactStorageKey) return;
      try {
        sessionStorage.setItem(impactStorageKey, String(relativeX));
      } catch {
        // Ignore storage failures.
      }
    },
    [impactPickMode, impactStorageKey]
  );

  const handleResetManualImpact = useCallback(() => {
    setManualImpactX(null);
    if (!impactStorageKey) return;
    try {
      sessionStorage.removeItem(impactStorageKey);
    } catch {
      // Ignore storage failures.
    }
  }, [impactStorageKey]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
        Smart2Move - graphe source
      </p>

      {imageUrl ? (
        <>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[0.66rem] text-[var(--muted)]">
            <span>{detectionStatus}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!canManualAdjust}
                onClick={() => {
                  if (!canManualAdjust) return;
                  setImpactPickMode((previous) => !previous);
                }}
                className={`rounded-full border px-2.5 py-1 uppercase tracking-wide transition ${
                  !canManualAdjust
                    ? "cursor-not-allowed border-white/10 bg-white/5 text-[var(--muted)] opacity-70"
                    : impactPickMode
                    ? "border-amber-300/60 bg-amber-400/20 text-amber-100"
                    : "border-white/10 bg-white/5 text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                {!canManualAdjust
                  ? "Impact sync analyse IA"
                  : impactPickMode
                    ? "Clique sur l impact..."
                    : "Ajuster impact (1 clic)"}
              </button>
              {manualImpactX !== null && canManualAdjust ? (
                <button
                  type="button"
                  onClick={handleResetManualImpact}
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                >
                  Revenir auto
                </button>
              ) : null}
            </div>
          </div>

          <div
            className={`relative mt-2 overflow-hidden rounded-xl border border-white/10 bg-black/30 ${
              impactPickMode && canManualAdjust ? "cursor-crosshair" : ""
            }`}
            onClick={handleManualImpactPick}
            aria-label={
              impactPickMode && canManualAdjust ? "Clique pour definir la ligne d impact" : undefined
            }
            data-testid="s2m-overlay-preview"
          >
            <img
              ref={imageRef}
              src={imageUrl}
              alt={fileName ? `Graphe Smart2Move ${fileName}` : "Graphe Smart2Move"}
              crossOrigin="anonymous"
              onLoad={runImpactDetection}
              className={`block w-full object-contain ${compact ? "min-h-[20rem] max-h-[76vh]" : "min-h-[24rem] max-h-[82vh]"}`}
            />

            {resolvedImpactX !== null ? (
              <div
                className="pointer-events-none absolute inset-y-0 z-20 border-l-2 border-amber-300/90"
                style={{ left: `${resolvedImpactX * 100}%` }}
                data-testid="s2m-impact-marker"
                data-impact-x={resolvedImpactX.toFixed(4)}
              >
                <span className="absolute -left-6 top-2 rounded bg-amber-400/80 px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase tracking-wide text-zinc-900">
                  Impact
                </span>
              </div>
            ) : null}
            {peakWindow && activeBubbleKey === "peak_intensity_timing" ? (
              <div
                className="pointer-events-none absolute inset-y-0 z-[18] border border-violet-300/55 bg-violet-400/15"
                style={{
                  left: `${peakWindow.start * 100}%`,
                  width: `${Math.max(0, peakWindow.end - peakWindow.start) * 100}%`,
                }}
                data-testid="s2m-peak-window"
              >
                <span className="absolute -top-5 left-1 rounded bg-violet-400/80 px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase tracking-wide text-zinc-900">
                  Zone pics
                </span>
              </div>
            ) : null}

            {hasBubbles
              ? zoneBands.map(({ bubbleKey, start, width }) => {
                  const bubble = bubblesByKey.get(bubbleKey);
                  if (!bubble || width <= 0) return null;
                  const isActive = bubble.bubbleKey === activeBubbleKey;
                  const isSectionThreeOrFour =
                    bubble.bubbleKey === "peak_intensity_timing" ||
                    bubble.bubbleKey === "summary";
                  return (
                    <button
                      key={`zone-${bubble.bubbleKey}`}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setRequestedBubble(bubble.bubbleKey);
                      }}
                      className={`absolute inset-y-0 z-10 border-x transition ${
                        impactPickMode && canManualAdjust ? "pointer-events-none" : ""
                      } ${
                        isSectionThreeOrFour
                          ? isActive
                            ? "border-violet-300/40 bg-transparent"
                            : "border-transparent bg-transparent"
                          : isActive
                            ? "border-sky-300/55 bg-sky-400/22"
                            : "border-sky-200/20 bg-sky-400/8 hover:bg-sky-400/14"
                      }`}
                      style={{
                        left: `${start * 100}%`,
                        width: `${width * 100}%`,
                      }}
                      aria-label={SMART2MOVE_BUBBLE_LABELS[bubble.bubbleKey]}
                      data-testid={`s2m-zone-${bubble.bubbleKey}`}
                      data-zone-key={bubble.bubbleKey}
                    />
                  );
                })
              : null}
          </div>

          {detectionNeedsHelp ? (
            <p className="mt-2 rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-[0.7rem] text-amber-100">
              Detection automatique impact incertaine. Utilise le bouton Ajuster impact (1 clic)
              pour placer la fin de la zone Transition {"->"} Impact exactement sur le trait noir.
            </p>
          ) : null}
        </>
      ) : (
        <div className="mt-2 rounded-xl border border-dashed border-white/15 bg-white/5 px-3 py-4 text-xs text-[var(--muted)]">
          Image du graphe indisponible.
        </div>
      )}

      {hasBubbles ? (
        <div className="mt-4 space-y-2">
          <p className="text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
            4 bulles d analyse
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {bubbles.map((bubble, index) => {
              const isActive = bubble.bubbleKey === activeBubbleKey;
              const detail = compactText(bubble.detail, 420);
              const reasoning = compactText(bubble.reasoning, 260);
              const solution = compactText(bubble.solution, 240);
              const evidence = compactText(bubble.evidence, 200);
              return (
                <button
                  key={`card-${bubble.bubbleKey}`}
                  type="button"
                  onClick={() => setRequestedBubble(bubble.bubbleKey)}
                  className={`min-h-[14rem] rounded-xl border p-3 text-left transition ${
                    isActive
                      ? "border-sky-300/65 bg-sky-400/15 text-[var(--text)]"
                      : "border-white/10 bg-white/5 text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-sky-300/40 bg-sky-400/15 px-1 text-[0.6rem] font-semibold text-sky-100">
                      {index + 1}
                    </span>
                    <div className="min-w-0 space-y-1.5">
                      <p className="text-xs font-semibold leading-tight text-[var(--text)]">
                        {SMART2MOVE_BUBBLE_LABELS[bubble.bubbleKey]}
                      </p>
                      <p className="text-[0.74rem] leading-tight text-[var(--text)]">
                        {detail || "Analyse indisponible."}
                      </p>
                      {evidence ? (
                        <p className="text-[0.68rem] leading-tight">
                          <span className="text-[var(--text)]">Explication biomecanique:</span>{" "}
                          {evidence}
                        </p>
                      ) : null}
                      {reasoning ? (
                        <p className="text-[0.68rem] leading-tight">
                          <span className="text-[var(--text)]">Raisonnement:</span> {reasoning}
                        </p>
                      ) : null}
                      {solution ? (
                        <p className="text-[0.68rem] leading-tight">
                          <span className="text-[var(--text)]">Solution:</span> {solution}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-white/10 bg-[var(--bg-elevated)]/55 px-4 py-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]">
            {fallbackText}
          </p>
        </div>
      )}
    </div>
  );
}
