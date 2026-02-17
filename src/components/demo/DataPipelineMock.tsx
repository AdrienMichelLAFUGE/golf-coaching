import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import FZChart from "./FZChart";
import type { DataTechnology, DemoMediaAsset, Smart2MoveFixture } from "./fixtures";

type DataPipelineMockProps = {
  importVisual: DemoMediaAsset;
  technology: DataTechnology | null;
  imported: boolean;
  preprocessed: boolean;
  analyzed: boolean;
  smart2move: Smart2MoveFixture;
  onSelectTechnology: (technology: DataTechnology) => void;
  onImport: () => void;
  onExtract: () => void;
};

const TECHNOLOGIES: Array<{ id: DataTechnology; label: string; hint: string; enabled: boolean }> = [
  { id: "smart2move", label: "Smart2Move", hint: "Force plates et FZ", enabled: true },
  { id: "trackman", label: "TrackMan", hint: "Disponible bientôt", enabled: false },
  { id: "flightscope", label: "FlightScope", hint: "Disponible bientôt", enabled: false },
];

const ANALYSIS_SECTIONS = [
  {
    title: "Synchronisation",
    value: "Transition retardée de 70 ms sur la jambe lead : ajustement de séquence recommandé.",
  },
  {
    title: "Zone d'impact",
    value: "Pic de force latéral à l'impact : bon transfert mais stabilité à renforcer.",
  },
  {
    title: "Production de force",
    value: "Montée progressive propre, plateau exploitable pour augmenter la vitesse club.",
  },
  {
    title: "Action coach",
    value: "Prioriser un drill d'appuis + tempo 3:1 avant la prochaine séance parcours.",
  },
];

function StatusChip({ label, done }: { label: string; done: boolean }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.16em] ${
        done
          ? "border-emerald-300/45 bg-emerald-400/12 text-emerald-100"
          : "border-white/15 bg-white/8 text-[var(--muted)]"
      }`}
    >
      {label}
    </span>
  );
}

export default function DataPipelineMock({
  importVisual,
  technology,
  imported,
  preprocessed,
  analyzed,
  smart2move,
  onSelectTechnology,
  onImport,
  onExtract,
}: DataPipelineMockProps) {
  const [impactPlaced, setImpactPlaced] = useState(false);
  const [transitionPlaced, setTransitionPlaced] = useState(false);
  const [extractLaunched, setExtractLaunched] = useState(false);

  useEffect(() => {
    if (technology !== "smart2move") {
      onSelectTechnology("smart2move");
    }
  }, [onSelectTechnology, technology]);

  const canExtract = imported && impactPlaced && transitionPlaced && !analyzed;
  const showAnalysis = analyzed || (extractLaunched && preprocessed);
  const impactMarker = useMemo(
    () => (impactPlaced ? { left: "61%", top: "44%" } : { left: "39%", top: "58%" }),
    [impactPlaced]
  );
  const transitionMarker = useMemo(
    () => (transitionPlaced ? { left: "48%", top: "63%" } : { left: "57%", top: "38%" }),
    [transitionPlaced]
  );

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-white/12 bg-white/8 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip label="Technologie" done={technology === "smart2move"} />
          <StatusChip label="Import" done={imported} />
          <StatusChip label="Pré-traitement" done={preprocessed} />
          <StatusChip label="Analyse" done={analyzed} />
        </div>
      </header>

      {!imported ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_0.95fr]">
          <article className="rounded-2xl border border-white/12 bg-white/8 p-3">
            <div className="relative aspect-video overflow-hidden rounded-xl border border-white/12">
              <Image
                src={importVisual.src}
                alt={importVisual.alt}
                fill
                sizes="(max-width: 1024px) 100vw, 820px"
                className="object-cover"
              />
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">{importVisual.label}</p>
          </article>

          <aside className="space-y-3 rounded-2xl border border-white/12 bg-white/8 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
              Étape 1 · Sélection technologie
            </p>
            <div className="space-y-2">
              {TECHNOLOGIES.map((option) => {
                const selected = option.id === "smart2move";
                return (
                  <div
                    key={option.id}
                    className={`rounded-xl border px-3 py-2 ${
                      selected
                        ? "border-cyan-300/55 bg-cyan-400/12"
                        : "border-white/12 bg-white/5 opacity-70"
                    }`}
                  >
                    <p className="text-sm font-semibold text-[var(--text)]">{option.label}</p>
                    <p className="text-xs text-[var(--muted)]">{option.hint}</p>
                    {!option.enabled ? (
                      <p className="mt-1 text-[0.62rem] uppercase tracking-[0.14em] text-[var(--muted)]">
                        verrouillé sur cette démo
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              data-testid="data-step-import"
              className="rounded-full border border-cyan-300/45 bg-cyan-400/15 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-cyan-100 transition hover:bg-cyan-400/25"
              onClick={() => {
                setImpactPlaced(false);
                setTransitionPlaced(false);
                setExtractLaunched(false);
                onImport();
              }}
            >
              Importer Smart2Move
            </button>
          </aside>
        </div>
      ) : null}

      {imported && !showAnalysis ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_0.95fr]">
          <article className="rounded-2xl border border-white/12 bg-white/8 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
              Étape 2 · Pré-traitement
            </p>
            <h4 className="mt-1 text-sm font-semibold text-[var(--text)]">
              Placez les marqueurs Impact et Transition sur le graphe
            </h4>

            <div className="mt-4 rounded-2xl border border-white/12 bg-slate-900/40 p-4">
              <div className="relative overflow-hidden rounded-xl border border-white/10 bg-slate-900/65">
                <FZChart
                  smart2move={smart2move}
                  animate={false}
                  showImpactMarker={false}
                  showSeriesOverlay={false}
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/35 via-transparent to-transparent" />
                <span
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-300/55 bg-slate-950/75 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.14em] text-amber-100 transition-all"
                  style={impactMarker}
                >
                  Impact
                </span>
                <span
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-300/55 bg-slate-950/75 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.14em] text-sky-100 transition-all"
                  style={transitionMarker}
                >
                  Transition
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setImpactPlaced(true)}
                  className={`rounded-full border px-3 py-1 text-[0.62rem] uppercase tracking-[0.16em] transition ${
                    impactPlaced
                      ? "border-emerald-300/45 bg-emerald-400/12 text-emerald-100"
                      : "border-white/15 bg-white/8 text-[var(--text)] hover:bg-white/12"
                  }`}
                >
                  {impactPlaced ? "Impact placé" : "Placer impact"}
                </button>
                <button
                  type="button"
                  onClick={() => setTransitionPlaced(true)}
                  className={`rounded-full border px-3 py-1 text-[0.62rem] uppercase tracking-[0.16em] transition ${
                    transitionPlaced
                      ? "border-emerald-300/45 bg-emerald-400/12 text-emerald-100"
                      : "border-white/15 bg-white/8 text-[var(--text)] hover:bg-white/12"
                  }`}
                >
                  {transitionPlaced ? "Transition placée" : "Placer transition"}
                </button>
              </div>
            </div>
          </article>

          <aside className="space-y-3 rounded-2xl border border-white/12 bg-white/8 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
              Étape 3 · Extraction
            </p>
            <p className="text-sm text-[var(--muted)]">
              Une fois les barres positionnées, l’extraction génère la courbe FZ et les blocs
              d’analyse.
            </p>
            <button
              type="button"
              data-testid="data-step-extract"
              disabled={!canExtract}
              onClick={() => {
                setExtractLaunched(true);
                onExtract();
              }}
              className="rounded-full border border-emerald-300/45 bg-emerald-400/15 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-emerald-100 transition hover:bg-emerald-400/25 disabled:cursor-default disabled:opacity-55"
            >
              Extraire
            </button>
          </aside>
        </div>
      ) : null}

      {showAnalysis ? (
        <div className="space-y-3 rounded-2xl border border-cyan-300/35 bg-cyan-400/10 p-3">
          <p className="text-xs uppercase tracking-[0.16em] text-cyan-100">
            Résultat Smart2Move · Courbe + overlays + analyse
          </p>
          <FZChart smart2move={smart2move} animate showSeriesOverlay={false} />

          <div className="grid gap-2 md:grid-cols-2">
            {ANALYSIS_SECTIONS.map((section) => (
              <article
                key={section.title}
                className="rounded-xl border border-white/15 bg-slate-900/45 px-3 py-2"
              >
                <p className="text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                  {section.title}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text)]">{section.value}</p>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
