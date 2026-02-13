"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import {
  normalizeSmart2MoveImpactMarkerX,
  resolveSmart2MovePeakWindow,
  resolveSmart2MoveTransitionStartX,
} from "@/lib/radar/smart2move-annotations";

type Smart2MoveMarkers = {
  impactMarkerX: number;
  transitionStartX: number;
};

type Smart2MoveMarkersModalProps = {
  open: boolean;
  imageUrl: string | null;
  fileName?: string | null;
  onCancel: () => void;
  onConfirm: (markers: Smart2MoveMarkers) => void;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export default function Smart2MoveMarkersModal({
  open,
  imageUrl,
  fileName,
  onCancel,
  onConfirm,
}: Smart2MoveMarkersModalProps) {
  const [impactX, setImpactX] = useState<number | null>(null);
  const [transitionStartX, setTransitionStartX] = useState<number | null>(null);
  const [transitionTouched, setTransitionTouched] = useState(false);
  const [activeHandle, setActiveHandle] = useState<"impact" | "transition">("impact");
  const [impactPlaced, setImpactPlaced] = useState(false);

  useEffect(() => {
    if (!open) return;
    const timeoutId = window.setTimeout(() => {
      setImpactX(null);
      setTransitionStartX(null);
      setTransitionTouched(false);
      setActiveHandle("impact");
      setImpactPlaced(false);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [open, imageUrl]);

  const resolvedTransitionStartX = useMemo(
    () => resolveSmart2MoveTransitionStartX(impactX, transitionStartX),
    [impactX, transitionStartX]
  );
  const peakWindow = useMemo(() => resolveSmart2MovePeakWindow(impactX), [impactX]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-black/70 px-4 py-8">
      <div className="mx-auto w-full max-w-5xl rounded-3xl border border-white/10 bg-[var(--bg-elevated)] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--muted)]">Smart2Move</p>
            <h3 className="text-xl font-semibold text-[var(--text)]">
              Placement des reperes avant analyse
            </h3>
            <p className="text-sm text-[var(--muted)]">
              Impact obligatoire. Transition pre-placee, ajustable. Section 3 analysee autour de
              l impact.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
          >
            Fermer
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveHandle("impact")}
              className={`rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-wide transition ${
                activeHandle === "impact"
                  ? "border-amber-100 bg-amber-300 text-zinc-950 shadow-[0_6px_18px_rgba(251,191,36,0.4)] ring-1 ring-amber-100/70"
                  : "border-amber-200/50 bg-amber-400/12 text-amber-100 hover:border-amber-200/80 hover:text-amber-50"
              }`}
            >
              Placer impact
            </button>
            <button
              type="button"
              onClick={() => setActiveHandle("transition")}
              disabled={impactX === null}
              className={`rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-wide transition ${
                activeHandle === "transition"
                  ? "border-sky-300/60 bg-sky-400/20 text-sky-100"
                  : "border-white/10 bg-white/5 text-[var(--muted)] hover:text-[var(--text)]"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              Ajuster debut transition
            </button>
            <button
              type="button"
              onClick={() => {
                if (impactX === null) return;
                setTransitionTouched(false);
                setTransitionStartX(resolveSmart2MoveTransitionStartX(impactX, null));
              }}
              disabled={impactX === null}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Transition auto
            </button>
            <span className="text-[0.68rem] text-[var(--muted)]">
              {activeHandle === "impact"
                ? "Clique sur le trait vertical d impact."
                : "Clique pour deplacer le debut de transition."}
            </span>
          </div>

          <div
            className={`relative overflow-hidden rounded-2xl border border-white/10 bg-black/35 ${
              activeHandle ? "cursor-crosshair" : ""
            }`}
            onClick={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              if (bounds.width <= 0) return;
              const x = clamp01((event.clientX - bounds.left) / bounds.width);
              if (activeHandle === "impact") {
                const nextImpact = normalizeSmart2MoveImpactMarkerX(x);
                if (nextImpact === null) return;
                setImpactX(nextImpact);
                setImpactPlaced(true);
                if (!transitionTouched) {
                  setTransitionStartX(resolveSmart2MoveTransitionStartX(nextImpact, null));
                } else {
                  setTransitionStartX((prev) =>
                    resolveSmart2MoveTransitionStartX(nextImpact, prev)
                  );
                }
              } else {
                if (impactX === null) return;
                setTransitionTouched(true);
                setTransitionStartX(resolveSmart2MoveTransitionStartX(impactX, x));
              }
            }}
            aria-label="Placement des reperes Smart2Move"
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={fileName ? `Graphe Smart2Move ${fileName}` : "Graphe Smart2Move"}
                className="block w-full object-contain"
              />
            ) : (
              <div className="flex min-h-[22rem] items-center justify-center text-sm text-[var(--muted)]">
                Apercu indisponible.
              </div>
            )}

            {peakWindow ? (
              <div
                className="pointer-events-none absolute inset-y-0 z-20 border border-violet-300/55 bg-violet-400/18"
                style={{
                  left: `${peakWindow.start * 100}%`,
                  width: `${Math.max(0, peakWindow.end - peakWindow.start) * 100}%`,
                }}
              >
                <span className="absolute -top-5 left-1 rounded bg-violet-400/85 px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase tracking-wide text-zinc-900">
                  Zone 3 pics
                </span>
              </div>
            ) : null}

            {impactX !== null ? (
              <div
                className="pointer-events-none absolute inset-y-0 z-30 border-l-2 border-amber-300/95"
                style={{ left: `${impactX * 100}%` }}
              >
                <span className="absolute -left-6 top-2 rounded bg-amber-400/85 px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase tracking-wide text-zinc-900">
                  Impact
                </span>
              </div>
            ) : null}

            {impactX !== null && resolvedTransitionStartX !== null ? (
              <div
                className="pointer-events-none absolute inset-y-0 z-10 border border-sky-300/55 bg-sky-400/18"
                style={{
                  left: `${resolvedTransitionStartX * 100}%`,
                  width: `${Math.max(0, impactX - resolvedTransitionStartX) * 100}%`,
                }}
              >
                <span className="absolute left-1 top-10 rounded bg-sky-400/95 px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase tracking-wide text-zinc-900">
                  Zone 2 transition
                </span>
              </div>
            ) : null}

            {resolvedTransitionStartX !== null ? (
              <div
                className="pointer-events-none absolute inset-y-0 z-30 border-l-2 border-sky-300/95"
                style={{ left: `${resolvedTransitionStartX * 100}%` }}
              />
            ) : null}
          </div>

          <div className="grid gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[0.72rem] text-[var(--muted)] md:grid-cols-3">
            <p>
              Impact X:{" "}
              <span className="font-semibold text-[var(--text)]">
                {impactX !== null ? impactX.toFixed(4) : "non place"}
              </span>
            </p>
            <p>
              Transition start X:{" "}
              <span className="font-semibold text-[var(--text)]">
                {resolvedTransitionStartX !== null
                  ? resolvedTransitionStartX.toFixed(4)
                  : "auto"}
              </span>
            </p>
            <p>
              Fichier:{" "}
              <span className="font-semibold text-[var(--text)]">{fileName ?? "-"}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={!impactPlaced || impactX === null}
            onClick={() => {
              if (!impactPlaced || impactX === null) return;
              const resolvedTransition = resolveSmart2MoveTransitionStartX(
                impactX,
                transitionStartX
              );
              if (resolvedTransition === null) return;
              onConfirm({
                impactMarkerX: impactX,
                transitionStartX: resolvedTransition,
              });
            }}
            className="rounded-full bg-gradient-to-r from-amber-300 via-amber-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Confirmer reperes
          </button>
        </div>
      </div>
    </div>
  );
}
