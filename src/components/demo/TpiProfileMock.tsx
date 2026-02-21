"use client";

import { useMemo, useState } from "react";
import type { TpiProfile, TpiTone } from "./fixtures";

type TpiProfileMockProps = {
  profile: TpiProfile;
  imported: boolean;
  isImporting: boolean;
  importPhase: "idle" | "upload" | "analyze";
  importProgress: number;
};

const toneChipClass: Record<TpiTone, string> = {
  red: "border-rose-300/50 bg-rose-400/10 text-rose-100",
  orange: "border-amber-300/50 bg-amber-400/10 text-amber-100",
  green: "border-emerald-300/50 bg-emerald-400/10 text-emerald-100",
};

const toneDotClass: Record<TpiTone, string> = {
  red: "bg-rose-400",
  orange: "bg-amber-400",
  green: "bg-emerald-400",
};

const toneLabel: Record<TpiTone, string> = {
  red: "Bloquant",
  orange: "À surveiller",
  green: "OK",
};

export default function TpiProfileMock({
  profile,
  imported,
  isImporting,
  importPhase,
  importProgress,
}: TpiProfileMockProps) {
  const [filter, setFilter] = useState<"all" | TpiTone>("all");
  const [query, setQuery] = useState("");
  const [selectedTestId, setSelectedTestId] = useState(profile.tests[0]?.id ?? "");

  const selectedTest =
    profile.tests.find((test) => test.id === selectedTestId) ?? profile.tests[0] ?? null;

  const visibleTests = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return profile.tests.filter((test) => {
      if (filter !== "all" && test.tone !== filter) return false;
      if (!normalized) return true;
      return (
        test.name.toLowerCase().includes(normalized) ||
        test.summary.toLowerCase().includes(normalized)
      );
    });
  }, [filter, profile.tests, query]);

  return (
    <section className="rounded-2xl border border-teal-200/30 bg-slate-900/55 p-4">
      <div className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold text-[var(--text)]">
            Profil TPI
            {imported ? (
              <span className="ml-2 text-sm font-medium text-[var(--muted)]">
                Importé le {profile.importedAt}
              </span>
            ) : null}
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Screening physique TPI, synthétisé, et connecté à l’IA SwingFlow.
          </p>

          <div className="mt-2 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[0.62rem] uppercase tracking-[0.16em] text-[var(--text)]">
              <span className="h-1.5 w-1.5 rounded-full bg-white/35" />
              Source: {profile.sourceLabel}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/40 bg-emerald-400/10 px-3 py-1 text-[0.62rem] uppercase tracking-[0.16em] text-emerald-100">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              L’assistant IA s’appuie sur ce profil
            </span>
          </div>
        </div>
      </div>

      {isImporting ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="flex items-center justify-between text-xs text-[var(--muted)]">
            <span>{importPhase === "upload" ? "Upload du rapport..." : "Analyse en cours..."}</span>
            <span className="text-[0.62rem] uppercase tracking-[0.16em]">
              {Math.round(importProgress)}%
            </span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-white/10">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-teal-300 via-emerald-300 to-sky-300 transition-all duration-300"
              style={{ width: `${importProgress}%` }}
            />
          </div>
        </div>
      ) : null}

      {imported ? (
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {profile.summaryCards.map((card) => (
              <article
                key={card.label}
                className="rounded-xl border border-white/12 bg-white/8 px-3 py-2"
              >
                <p className="text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                  {card.label}
                </p>
                <p className="mt-1 text-xl font-semibold text-[var(--text)]">{card.value}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{card.hint}</p>
              </article>
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div>
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      { id: "all" as const, label: `Tous (${profile.counts.total})` },
                      { id: "red" as const, label: `Bloquants (${profile.counts.red})` },
                      {
                        id: "orange" as const,
                        label: `À surveiller (${profile.counts.orange})`,
                      },
                      { id: "green" as const, label: `OK (${profile.counts.green})` },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setFilter(option.id)}
                      className={`rounded-full border px-3 py-1 text-[0.62rem] uppercase tracking-[0.16em] transition ${
                        filter === option.id
                          ? "border-white/30 bg-white/15 text-[var(--text)]"
                          : "border-white/10 bg-white/5 text-[var(--muted)] hover:border-white/20 hover:text-[var(--text)]"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="w-full rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] sm:w-56"
                  placeholder="Rechercher un test..."
                  aria-label="Rechercher un test TPI"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visibleTests.map((test) => {
                  const selected = selectedTest?.id === test.id;
                  return (
                    <button
                      key={test.id}
                      type="button"
                      onClick={() => setSelectedTestId(test.id)}
                      className={`h-24 rounded-xl border px-3 py-2 text-left transition ${
                        selected
                          ? `${toneChipClass[test.tone]}`
                          : "border-white/10 bg-white/5 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${toneDotClass[test.tone]}`}
                        />
                        <p className="truncate text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text)]">
                          {test.name}
                        </p>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs text-[var(--muted)]">{test.summary}</p>
                      <span className="sr-only">{toneLabel[test.tone]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <aside className="rounded-2xl border border-white/12 bg-white/8 p-4">
              {selectedTest ? (
                <div className="flex h-full flex-col gap-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                    Détail test
                  </p>
                  <h4 className="text-base font-semibold text-[var(--text)]">{selectedTest.name}</h4>
                  <p className="text-sm text-[var(--muted)]">{selectedTest.details}</p>
                  <div className="mt-auto rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-[var(--text)]">
                    <p className="text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                      Priorité de cycle
                    </p>
                    <p className="mt-1 leading-relaxed">{profile.detailPanel.description}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[var(--muted)]">Sélectionnez un test.</p>
              )}
            </aside>
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
          Aucun rapport TPI importé pour le moment.
        </div>
      )}
    </section>
  );
}
