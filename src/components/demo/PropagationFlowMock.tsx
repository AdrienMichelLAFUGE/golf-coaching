"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import type { AiSuggestion } from "./fixtures";

type PropagationFlowMockProps = {
  axis: AiSuggestion | null;
  running: boolean;
  activeCount: number;
  completed: boolean;
};

type Particle = {
  id: number;
  top: number;
  delay: number;
  duration: number;
};

const PARTICLES: Particle[] = Array.from({ length: 14 }, (_, index) => ({
  id: index,
  top: 12 + ((index * 13) % 74),
  delay: index * 0.03,
  duration: 0.55 + (index % 4) * 0.08,
}));

export default function PropagationFlowMock({
  axis,
  running,
  activeCount,
  completed,
}: PropagationFlowMockProps) {
  const reducedMotion = useReducedMotion();
  const payload = axis?.sectionPayload ?? [];

  const progressPercent = useMemo(() => {
    if (payload.length === 0) return 0;
    return Math.round((Math.min(payload.length, activeCount) / payload.length) * 100);
  }, [activeCount, payload.length]);

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[0.95fr_1.05fr]">
      <aside className="min-w-0 rounded-2xl border border-white/12 bg-white/8 p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Propagation IA</p>
        <h3 className="mt-2 text-lg font-semibold text-[var(--text)]">
          {axis?.title ?? "Choisissez un axe"}
        </h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Injection automatique du texte dans les sections du rapport.
        </p>

        <div className="mt-4 rounded-xl border border-white/10 bg-[var(--panel)] px-3 py-3">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
            <span>Progression</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-white/10">
            <motion.div
              className="h-2 rounded-full bg-gradient-to-r from-emerald-300 via-cyan-300 to-sky-300"
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: reducedMotion ? 0 : 0.22 }}
            />
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-white/7 px-3 py-2 text-xs text-[var(--muted)]">
          {completed
            ? "Propagation terminée: sections remplies."
            : running
              ? "Propagation en cours..."
              : "Cliquez sur Propagation pour lancer l’injection."}
        </div>
      </aside>

      <div className="relative min-w-0 overflow-hidden rounded-2xl border border-white/12 bg-white/6 p-4">
        {running ? (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {PARTICLES.map((particle) => (
              <motion.span
                key={`particle-${particle.id}`}
                className="absolute left-0 h-1.5 w-1.5 rounded-full bg-cyan-200/90 shadow-[0_0_12px_rgba(34,211,238,0.7)]"
                style={{ top: `${particle.top}%` }}
                initial={{ x: 8, opacity: 0 }}
                animate={{ x: [8, 120, 260, 420], opacity: [0, 1, 1, 0] }}
                transition={{
                  duration: reducedMotion ? 0 : particle.duration,
                  delay: reducedMotion ? 0 : particle.delay,
                  ease: "easeOut",
                  repeat: reducedMotion ? 0 : Infinity,
                  repeatDelay: reducedMotion ? 0 : 0.18,
                }}
              />
            ))}
          </div>
        ) : null}

        <div className="space-y-3">
          {payload.map((entry, index) => {
            const active = completed || index < activeCount;
            return (
              <motion.article
                key={`${entry.section}-${index}`}
                initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.2, delay: index * 0.02 }}
                className={`relative overflow-hidden rounded-2xl border px-4 py-3 transition ${
                  active
                    ? "border-emerald-300/45 bg-emerald-400/12 shadow-[0_12px_26px_rgba(16,185,129,0.16)]"
                    : "border-white/12 bg-white/8"
                }`}
              >
                <span className="text-[0.62rem] uppercase tracking-[0.18em] text-[var(--muted)]">
                  {entry.section}
                </span>
                <p className="mt-1 break-words text-sm leading-relaxed text-[var(--text)]">
                  {active ? entry.value : "Section vide"}
                </p>

                <motion.span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-0 w-1 rounded-r-full bg-gradient-to-b from-cyan-300 via-emerald-300 to-sky-300"
                  animate={{ opacity: active ? 1 : 0.15 }}
                  transition={{ duration: reducedMotion ? 0 : 0.24 }}
                />
              </motion.article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
