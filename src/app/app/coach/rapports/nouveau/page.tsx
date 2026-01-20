"use client";

import { useLayoutEffect, useRef, useState } from "react";

const defaultSections = [
  "Resume de la seance",
  "Objectifs prioritaires",
  "Technique",
  "Exercices recommandes",
  "Feedback mental",
  "Statistiques",
  "Plan pour la semaine",
];

const defaultReportSections = [
  "Resume de la seance",
  "Technique",
  "Plan pour la semaine",
];

export default function CoachReportBuilderPage() {
  const [availableSections, setAvailableSections] =
    useState<string[]>(defaultSections);
  const [reportSections, setReportSections] =
    useState<string[]>(defaultReportSections);
  const [customSection, setCustomSection] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement | null>());
  const positions = useRef(new Map<string, DOMRect>());
  const shouldAnimate = useRef(false);
  const showSlots = dragIndex !== null;

  const handleAutoResize = (
    event: React.FormEvent<HTMLTextAreaElement>
  ) => {
    const target = event.currentTarget;
    target.style.height = "auto";
    target.style.height = `${target.scrollHeight}px`;
  };

  const handleAddCustomSection = () => {
    const next = customSection.trim();
    if (!next) return;

    const exists = availableSections.some(
      (section) => section.toLowerCase() === next.toLowerCase()
    );

    if (!exists) {
      setAvailableSections((prev) => [...prev, next]);
    }

    setCustomSection("");
  };

  const handleAddToReport = (section: string) => {
    setReportSections((prev) =>
      prev.includes(section) ? prev : [...prev, section]
    );
    shouldAnimate.current = true;
  };

  const handleRemoveFromReport = (section: string) => {
    setReportSections((prev) => prev.filter((item) => item !== section));
    shouldAnimate.current = true;
  };

  const handleRemoveFromAvailable = (section: string) => {
    setAvailableSections((prev) => prev.filter((item) => item !== section));
    setReportSections((prev) => prev.filter((item) => item !== section));
    shouldAnimate.current = true;
  };

  const handleDragStart = (
    index: number,
    event: React.DragEvent<HTMLElement>
  ) => {
    setDragIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", reportSections[index]);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleDrop = (index: number) => {
    if (dragIndex === null) {
      setHoverIndex(null);
      return;
    }

    const nextIndex = dragIndex < index ? index - 1 : index;
    if (nextIndex === dragIndex) {
      setHoverIndex(null);
      return;
    }

    shouldAnimate.current = true;
    setReportSections((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(nextIndex, 0, moved);
      return next;
    });

    setDragIndex(null);
    setHoverIndex(null);
  };

  useLayoutEffect(() => {
    const nextPositions = new Map<string, DOMRect>();
    reportSections.forEach((section) => {
      const element = itemRefs.current.get(section);
      if (element) {
        nextPositions.set(section, element.getBoundingClientRect());
      }
    });

    if (shouldAnimate.current && positions.current.size > 0) {
      reportSections.forEach((section) => {
        const element = itemRefs.current.get(section);
        const prev = positions.current.get(section);
        const next = nextPositions.get(section);
        if (!element || !prev || !next) return;

        const deltaX = prev.left - next.left;
        const deltaY = prev.top - next.top;

        if (deltaX || deltaY) {
          element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
          element.style.transition = "transform 0s";
          requestAnimationFrame(() => {
            element.style.transition =
              "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)";
            element.style.transform = "";
          });
        }
      });
    }

    positions.current = nextPositions;
    shouldAnimate.current = false;
  }, [reportSections]);

  return (
    <div className="space-y-6">
      <section className="panel rounded-2xl p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
          Rapport
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
          Nouveau rapport
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Compose le rapport avec des sections predefinies, puis remplis le
          contenu.
        </p>
      </section>

      <section className="panel-soft rounded-2xl p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
              Eleve
            </label>
            <select className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]">
              <option>Choisir un eleve</option>
              <option>Camille Dupont</option>
              <option>Liam Martin</option>
              <option>Nora Petit</option>
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
              Titre du rapport
            </label>
            <input
              type="text"
              placeholder="Bilan swing du 20/01"
              className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
              Date
            </label>
            <input
              type="date"
              className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
            />
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="panel rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-[var(--text)]">
            Sections disponibles
          </h3>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Clique pour ajouter une section au rapport ou cree la tienne.
          </p>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
              Nouvelle section
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={customSection}
                onChange={(event) => setCustomSection(event.target.value)}
                placeholder="Ex: Routine pre-shot"
                className="w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
              />
              <button
                type="button"
                onClick={handleAddCustomSection}
                className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
              >
                Ajouter
              </button>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {availableSections.map((section) => (
              <div
                key={section}
                className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--text)]"
              >
                <span>{section}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddToReport(section)}
                    className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
                  >
                    Ajouter
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveFromAvailable(section)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-[var(--text)]">
            Rapport en cours
          </h3>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Organise les sections et remplis le contenu. Drag & drop actif.
          </p>
          <div className="mt-4 space-y-3">
            {reportSections.map((section, index) => (
              <div key={`${section}-slot`} className="space-y-3">
                <div
                  onDragOver={handleDragOver}
                  onDragEnter={() => setHoverIndex(index)}
                  onDrop={() => handleDrop(index)}
                  className={`overflow-hidden transition-[height,margin] duration-200 ease-out ${
                    showSlots
                      ? hoverIndex === index
                        ? "my-2 h-16"
                        : "my-2 h-2"
                      : "my-0 h-0"
                  }`}
                >
                  {showSlots && hoverIndex === index ? (
                    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[var(--accent)] bg-[var(--accent)]/10 text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
                      Deposer ici
                    </div>
                  ) : (
                    <div className="h-full rounded-full bg-white/10" />
                  )}
                </div>

                <div
                  ref={(node) => {
                    if (node) {
                      itemRefs.current.set(section, node);
                    } else {
                      itemRefs.current.delete(section);
                    }
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setHoverIndex(null);
                  }}
                  className={`rounded-2xl border bg-white/5 px-4 py-4 transition ${
                    dragIndex === index
                      ? "border-white/20 bg-white/10 opacity-80 shadow-[0_20px_45px_rgba(0,0,0,0.45)]"
                      : "border-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        draggable
                        onDragStart={(event) => handleDragStart(index, event)}
                        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)] active:cursor-grabbing"
                        title="Glisser pour reordonner"
                      >
                        <span className="text-xs">|||</span>
                        Glisser
                      </button>
                      <p className="text-sm font-semibold text-[var(--text)]">
                        {section}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFromReport(section)}
                      className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                    >
                      Retirer
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    placeholder="Ecris le contenu de cette section..."
                    onInput={handleAutoResize}
                    className="mt-3 w-full resize-none overflow-hidden rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                  />
                </div>
              </div>
            ))}
            <div
              onDragOver={handleDragOver}
              onDragEnter={() => setHoverIndex(reportSections.length)}
              onDrop={() => handleDrop(reportSections.length)}
              className={`overflow-hidden transition-[height,margin] duration-200 ease-out ${
                showSlots
                  ? hoverIndex === reportSections.length
                    ? "my-2 h-16"
                    : "my-2 h-2"
                  : "my-0 h-0"
              }`}
            >
              {showSlots && hoverIndex === reportSections.length ? (
                <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[var(--accent)] bg-[var(--accent)]/10 text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
                  Deposer ici
                </div>
              ) : (
                <div className="h-full rounded-full bg-white/10" />
              )}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900"
            >
              Envoyer le rapport
            </button>
            <button
              type="button"
              className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)]"
            >
              Sauvegarder le brouillon
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
