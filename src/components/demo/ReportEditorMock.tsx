"use client";

import { useMemo, type CSSProperties } from "react";
import styles from "./demo.module.css";
import type { AiSuggestion, DemoReport } from "./fixtures";

type ReportEditorMockProps = {
  report: DemoReport;
  axis: AiSuggestion | null;
  showPropagationResult?: boolean;
  animateTyping?: boolean;
  animatePropagation?: boolean;
};

function InputMock({
  label,
  value,
  animateTyping,
  typingDelayMs = 0,
  typingDurationMs = 1700,
}: {
  label: string;
  value: string;
  animateTyping: boolean;
  typingDelayMs?: number;
  typingDurationMs?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.63rem] uppercase tracking-[0.2em] text-[var(--muted)]">
        {label}
      </span>
      <span className="block rounded-xl border border-white/12 bg-white/7 px-3 py-2 text-sm text-[var(--text)]">
        <span
          className={animateTyping ? styles.typewriterText : ""}
          style={
            animateTyping
              ? ({
                  "--typing-steps": String(Math.max(8, value.length)),
                  "--typing-duration": `${typingDurationMs}ms`,
                  "--typing-delay": `${typingDelayMs}ms`,
                } as CSSProperties)
              : undefined
          }
        >
          {value}
        </span>
      </span>
    </label>
  );
}

export default function ReportEditorMock({
  report,
  axis,
  showPropagationResult = false,
  animateTyping = false,
  animatePropagation = false,
}: ReportEditorMockProps) {
  const propagationSections = useMemo(() => axis?.sectionPayload ?? [], [axis]);

  return (
    <div className="grid h-full w-full gap-4 lg:grid-cols-[1.12fr_0.88fr]">
      <article className="rounded-2xl border border-white/15 bg-slate-900/55 p-4">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[var(--text)]">Éditeur de rapport</h3>
          <span className="rounded-full border border-emerald-300/40 bg-emerald-400/12 px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-emerald-100">
            Draft
          </span>
        </header>

        <div className="space-y-3">
          <InputMock
            label="Club"
            value={report.club}
            animateTyping={animateTyping}
            typingDelayMs={0}
            typingDurationMs={1500}
          />
          <InputMock
            label="Constat"
            value={report.constat}
            animateTyping={animateTyping}
            typingDelayMs={260}
            typingDurationMs={1800}
          />
          <InputMock
            label="Axe de travail"
            value={report.axeTravail}
            animateTyping={animateTyping}
            typingDelayMs={520}
            typingDurationMs={2100}
          />
        </div>
      </article>

      <aside className="rounded-2xl border border-sky-300/30 bg-sky-400/12 p-4">
        <h4 className="text-sm font-semibold text-[var(--text)]">Assistant IA</h4>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {axis
            ? `Axe sélectionné: ${axis.title}`
            : "Sélectionnez un axe pour générer la propagation."}
        </p>

        {axis ? (
          <div className="mt-3 rounded-xl border border-white/15 bg-white/10 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text)]">
              Priorités proposées
            </p>
            <ul className="mt-2 space-y-1 text-xs text-[var(--muted)]">
              {axis.bullets.map((bullet) => (
                <li key={bullet}>• {bullet}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {showPropagationResult && axis ? (
          <div className="mt-3 space-y-2">
            {propagationSections.map((section) => (
              <div
                key={`${axis.id}-${section.section}`}
                className="rounded-xl border border-emerald-300/35 bg-emerald-400/12 px-3 py-2"
              >
                <p className="text-[0.62rem] uppercase tracking-[0.16em] text-emerald-100">
                  {section.section}
                </p>
                <p className="mt-1 text-xs text-[var(--text)]">
                  <span
                    className={animatePropagation ? styles.typewriterBlock : ""}
                    style={
                      animatePropagation
                        ? ({ "--typing-steps": String(Math.max(20, section.value.length)) } as CSSProperties)
                        : undefined
                    }
                  >
                    {section.value}
                  </span>
                </p>
              </div>
            ))}
            <p className="rounded-xl border border-white/12 bg-white/10 px-3 py-2 text-xs text-[var(--text)]">
              <span
                className={animatePropagation ? styles.typewriterBlock : ""}
                style={
                  animatePropagation
                    ? ({ "--typing-steps": String(Math.max(20, axis.readyText.length)) } as CSSProperties)
                    : undefined
                }
              >
                {axis.readyText}
              </span>
            </p>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
