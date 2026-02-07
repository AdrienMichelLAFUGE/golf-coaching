"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { useReducedMotion, useScroll } from "framer-motion";

import styles from "./hero.module.css";
import { clamp01, lerp, smoothstep } from "./orbitMath";
import { MORPH_END, MORPH_START, TABLET_OPACITY_END, TABLET_OPACITY_START } from "./timings";

type LogoConfig = {
  id: string;
  src: string;
  label: string;
  lane: 1 | 2 | 3;
  phase: number;
  speed: number;
  baseSize: number;
};

// Edit this list to add/remove chips (keep it small: 6-8 max).
const logos: LogoConfig[] = [
  { id: "trackman", src: "/hero/logos/trackman.svg", label: "Trackman", lane: 2, phase: 0.2, speed: 1.0, baseSize: 56 },
  { id: "flightscope", src: "/hero/logos/flightscope.svg", label: "Flightscope", lane: 3, phase: 1.6, speed: -0.85, baseSize: 52 },
  { id: "tpi", src: "/hero/logos/tpi.svg", label: "TPI", lane: 1, phase: 2.4, speed: 1.25, baseSize: 48 },
  { id: "smart2move", src: "/hero/logos/smart2move.svg", label: "Smart2Move", lane: 2, phase: 3.7, speed: -1.15, baseSize: 54 },
  { id: "foresight", src: "/hero/logos/foresight.svg", label: "Foresight", lane: 3, phase: 4.9, speed: 0.95, baseSize: 50 },
  { id: "hackmotion", src: "/hero/logos/hackmotion.svg", label: "HackMotion", lane: 1, phase: 5.6, speed: -1.3, baseSize: 46 },
];

const ORBIT_LANES = [
  { rx: 180, ry: 120 },
  { rx: 240, ry: 150 },
  { rx: 300, ry: 190 },
] as const;

const BASE_DOM_SIZE = 52;

type LayoutSnapshot = {
  cx: number;
  cy: number;
  tablet: { x: number; y: number; w: number; h: number };
  lanes: Array<{ rx: number; ry: number }>;
  gridOffsets: Array<{ x: number; y: number }>;
};

const computeGridOffsets = (layout: {
  cx: number;
  cy: number;
  tabletX: number;
  tabletY: number;
  tabletW: number;
  tabletH: number;
}) => {
  // Default: 2x3 for 6 logos
  const cols = 3;
  const rows = 2;
  const padding = 14;
  const gap = 10;

  const cellW = (layout.tabletW - padding * 2 - gap * (cols - 1)) / cols;
  const cellH = (layout.tabletH - padding * 2 - gap * (rows - 1)) / rows;

  return logos.map((_, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const centerX = layout.tabletX + padding + col * (cellW + gap) + cellW / 2;
    const centerY = layout.tabletY + padding + row * (cellH + gap) + cellH / 2;
    return {
      x: centerX - layout.cx,
      y: centerY - layout.cy,
    };
  });
};

export default function OrbitScene({
  heroRef,
}: {
  heroRef: React.RefObject<HTMLElement | HTMLDivElement | null>;
}) {
  const reducedMotion = useReducedMotion();
  const [isMobile, setIsMobile] = useState(false);

  const sceneRef = useRef<HTMLDivElement | null>(null);
  const tabletRef = useRef<HTMLDivElement | null>(null);
  const chipRefs = useRef<Array<HTMLDivElement | null>>([]);
  const anglesRef = useRef<number[]>(logos.map((logo) => logo.phase));
  const layoutRef = useRef<LayoutSnapshot | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 899px)");

    const update = () => setIsMobile(media.matches);
    update();

    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const isStatic = Boolean(reducedMotion) || isMobile;

  useEffect(() => {
    // Clear RAF-driven inline styles so CSS/static mode can take over cleanly.
    if (!isStatic) return;
    const tablet = tabletRef.current;
    if (!tablet) return;
    tablet.style.opacity = "";
    tablet.style.transform = "";
  }, [isStatic]);

  useEffect(() => {
    const scene = sceneRef.current;
    const tablet = tabletRef.current;
    if (!scene || !tablet) return;

    const measure = () => {
      const sceneRect = scene.getBoundingClientRect();
      const tabletRect = tablet.getBoundingClientRect();

      const cx = sceneRect.width / 2;
      const cy = sceneRect.height / 2;

      // Prevent chips from being clipped by the stage edges on smaller displays.
      // We clamp lane radii based on the stage size and a conservative safety margin.
      const safety = 60; // px
      const maxRx = Math.max(0, sceneRect.width / 2 - safety);
      const maxRy = Math.max(0, sceneRect.height / 2 - safety);
      const lanes = ORBIT_LANES.map((lane) => ({
        rx: Math.min(lane.rx, maxRx),
        ry: Math.min(lane.ry, maxRy),
      }));

      const tabletX = tabletRect.left - sceneRect.left;
      const tabletY = tabletRect.top - sceneRect.top;
      const tabletW = tabletRect.width;
      const tabletH = tabletRect.height;

      const gridOffsets = computeGridOffsets({
        cx,
        cy,
        tabletX,
        tabletY,
        tabletW,
        tabletH,
      });

      layoutRef.current = {
        cx,
        cy,
        tablet: { x: tabletX, y: tabletY, w: tabletW, h: tabletH },
        lanes,
        gridOffsets,
      };
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(scene);
    ro.observe(tablet);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    // Safety: never start RAF on mobile or reduced-motion, even before
    // `isMobile` / `useReducedMotion()` have settled after hydration.
    if (typeof window !== "undefined") {
      if (window.matchMedia("(max-width: 899px)").matches) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    }

    if (isStatic) return;

    lastTimeRef.current = performance.now();

    const tick = (now: number) => {
      const dtRaw = (now - lastTimeRef.current) / 1000;
      const dt = Math.min(0.05, Math.max(0, dtRaw));
      lastTimeRef.current = now;

      const layout = layoutRef.current;
      if (!layout) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const p = clamp01(scrollYProgress.get());
      const m = smoothstep(MORPH_START, MORPH_END, p);
      const rs = 1 - m;

      const tabletOpacity = smoothstep(TABLET_OPACITY_START, TABLET_OPACITY_END, p);
      const tabletScale = lerp(0.98, 1.0, tabletOpacity);

      const tablet = tabletRef.current;
      if (tablet) {
        tablet.style.opacity = `${tabletOpacity}`;
        tablet.style.transform = `scale(${tabletScale})`;
      }

      for (let index = 0; index < logos.length; index += 1) {
        const node = chipRefs.current[index];
        if (!node) continue;

        const logo = logos[index];
        const lane = layout.lanes[logo.lane - 1] ?? ORBIT_LANES[logo.lane - 1];

        // Integrate angle by dt so rs changes don't produce jumps.
        const nextAngle = anglesRef.current[index] + logo.speed * dt * rs;
        anglesRef.current[index] = nextAngle;

        const orbitX = Math.cos(nextAngle) * lane.rx;
        const orbitY = Math.sin(nextAngle) * lane.ry;

        const depth = (Math.sin(nextAngle) + 1) / 2;
        const final = layout.gridOffsets[index] ?? { x: 0, y: 0 };

        const x = lerp(orbitX, final.x, m);
        const y = lerp(orbitY, final.y, m);

        const scaleOrbit =
          lerp(0.85, 1.15, depth) * (logo.baseSize / BASE_DOM_SIZE);
        const scale = lerp(scaleOrbit, 1.0, m);

        const opacity = lerp(lerp(0.6, 1.0, depth), 1.0, m);
        const blur = lerp(lerp(1.5, 0.0, depth), 0.0, m);

        const z = m > 0.55 ? 3 : depth > 0.5 ? 3 : 1;

        node.style.transform = `translate(-50%, -50%) translate3d(${x}px, ${y}px, 0) scale(${scale})`;
        node.style.opacity = `${opacity}`;
        node.style.filter = `blur(${blur}px)`;
        node.style.zIndex = `${z}`;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = null;
    };
  }, [isStatic, scrollYProgress]);

  return (
    <div className={styles.stageWrap}>
      <div ref={sceneRef} className={styles.stage} aria-hidden="true">
        {/* Orbiting chips layer (desktop animated only). */}
        {!isStatic
          ? logos.map((logo, index) => (
              <div
                key={logo.id}
                ref={(node) => {
                  chipRefs.current[index] = node;
                }}
                className={`${styles.chip} ${styles.chipOrbit}`}
                style={{ width: BASE_DOM_SIZE, height: BASE_DOM_SIZE }}
                title={logo.label}
              >
                <img
                  src={logo.src}
                  alt=""
                  className={styles.chipLogo}
                  draggable={false}
                />
              </div>
            ))
          : null}

        {/* Coach silhouette */}
        <img
          src="/hero/coach.svg"
          alt=""
          className={styles.coach}
          draggable={false}
        />

        {/* Tablet overlay aligned to the SVG screen area (percent-based). */}
        <div
          ref={tabletRef}
          className={`${styles.tabletOverlay} ${isStatic ? styles.tabletOverlayStatic : ""}`}
        >
          <div className={styles.tabletGrid}>
            {logos.map((logo) => (
              <div key={logo.id} className={styles.chip} title={logo.label}>
                <img
                  src={logo.src}
                  alt=""
                  className={styles.chipLogo}
                  draggable={false}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
