"use client";

import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { useMemo, useState } from "react";
import styles from "./demo.module.css";
import type { Smart2MoveFixture } from "./fixtures";

type FZChartProps = {
  smart2move: Smart2MoveFixture;
  animate?: boolean;
  forceFallback?: boolean;
  showImpactMarker?: boolean;
  showSeriesOverlay?: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const CHART_IMAGE_SRC = "/demo/fz-chart.png?v=20260217";

export default function FZChart({
  smart2move,
  animate = true,
  forceFallback = false,
  showImpactMarker = true,
  showSeriesOverlay = true,
}: FZChartProps) {
  const [imageError, setImageError] = useState(false);
  const [imageTooSmall, setImageTooSmall] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const points = smart2move.points;
  const safeImpactIndex = clamp(smart2move.impactIndex, 0, Math.max(0, points.length - 1));
  const targetPoint = points[safeImpactIndex] ?? { x: 50, y: 50 };
  const firstPoint = points[0] ?? targetPoint;

  const polylinePoints = useMemo(
    () => points.map((point) => `${point.x},${point.y}`).join(" "),
    [points]
  );

  const shouldRenderFallback = forceFallback || imageError || imageTooSmall;
  const shouldAnimateMarker = animate && !prefersReducedMotion;
  const markerInitial = shouldAnimateMarker ? firstPoint : targetPoint;

  return (
    <div
      className={`relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-white/15 bg-slate-900/70 ${styles.chartGlow}`}
    >
      {!shouldRenderFallback ? (
        <Image
          src={CHART_IMAGE_SRC}
          alt="Graphique Force Zone Smart2Move"
          fill
          sizes="(max-width: 1024px) 100vw, 920px"
          unoptimized
          className="object-cover object-center opacity-90"
          onError={() => setImageError(true)}
          onLoad={(event) => {
            const image = event.currentTarget;
            if (image.naturalWidth <= 4 || image.naturalHeight <= 4) {
              setImageTooSmall(true);
            }
          }}
          priority={false}
        />
      ) : (
        <div
          data-testid="fz-fallback"
          className={`absolute inset-0 ${styles.fallbackGrid} bg-slate-800/70`}
        />
      )}

      {showSeriesOverlay ? (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <polyline
            points={polylinePoints}
            fill="none"
            stroke="rgba(52, 211, 153, 0.82)"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.map((point, index) => (
            <circle
              key={`fz-point-${point.x}-${point.y}-${index}`}
              cx={point.x}
              cy={point.y}
              r={index === safeImpactIndex ? 1.8 : 1}
              fill={index === safeImpactIndex ? "rgba(251,191,36,0.95)" : "rgba(255,255,255,0.85)"}
            />
          ))}
        </svg>
      ) : null}

      {showImpactMarker ? (
        <>
          <motion.div
            data-testid="impact-marker"
            className="absolute z-10"
            style={{ transform: "translate(-50%, -50%)" }}
            initial={{ left: `${markerInitial.x}%`, top: `${markerInitial.y}%` }}
            animate={{ left: `${targetPoint.x}%`, top: `${targetPoint.y}%` }}
            transition={shouldAnimateMarker ? { duration: 0.9, ease: "easeOut" } : { duration: 0 }}
          >
            <span className="block h-4 w-4 rounded-full border-2 border-amber-300 bg-amber-400/45 shadow-[0_0_20px_rgba(251,191,36,0.6)]" />
          </motion.div>

          <p
            className={`absolute z-10 rounded-full border border-amber-200/60 bg-slate-900/78 px-2.5 py-1 text-[0.63rem] font-semibold uppercase tracking-[0.18em] text-amber-100 ${styles.impactLabel}`}
            style={{
              left: `${clamp(targetPoint.x + 3, 8, 92)}%`,
              top: `${clamp(targetPoint.y - 9, 8, 92)}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            Zone d&apos;impact
          </p>
        </>
      ) : null}
    </div>
  );
}
