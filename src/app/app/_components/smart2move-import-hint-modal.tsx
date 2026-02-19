"use client";

type Smart2MoveImportHintModalProps = {
  open: boolean;
  dontShowAgain: boolean;
  onDontShowAgainChange: (next: boolean) => void;
  onClose: () => void;
};

export default function Smart2MoveImportHintModal({
  open,
  dontShowAgain,
  onDontShowAgainChange,
  onClose,
}: Smart2MoveImportHintModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Guide import Smart2Move"
    >
      <button
        type="button"
        aria-label="Fermer le guide"
        className="absolute inset-0"
        onClick={onClose}
      />

      <div className="relative w-full max-w-2xl rounded-3xl bg-[var(--bg-elevated)] p-6 shadow-[var(--shadow-strong)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
              Guide import Smart2Move
            </p>
            <h4 className="mt-1 text-sm font-semibold text-[var(--text)]">
              Importe un screenshot d un seul graphe
            </h4>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Cadre uniquement le graphe choisi. Evite les captures qui englobent
              plusieurs charts ou des panneaux lateraux.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-[var(--panel-strong)] px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/10"
          >
            J ai compris
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-emerald-400/20 p-3">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-emerald-100">
              A faire
            </p>
            <div className="mt-2 rounded-lg bg-[var(--panel-strong)] p-2">
              <div className="rounded-md bg-[var(--bg-elevated)] px-2 py-1">
                <div className="h-3 w-20 rounded bg-emerald-300/70" />
                <div className="mt-2 h-8 rounded bg-gradient-to-r from-emerald-300/60 via-emerald-300/30 to-transparent" />
              </div>
            </div>
            <p className="mt-2 text-[0.68rem] text-[var(--text)]">
              1 graphe net, centre et lisible.
            </p>
          </div>

          <div className="rounded-xl bg-amber-400/20 p-3">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-amber-200">
              A eviter
            </p>
            <div className="mt-2 rounded-lg bg-[var(--panel-strong)] p-2">
              <div className="grid grid-cols-2 gap-1.5">
                <div className="h-5 rounded bg-amber-300/45" />
                <div className="h-5 rounded bg-amber-300/45" />
                <div className="h-5 rounded bg-amber-300/45" />
                <div className="h-5 rounded bg-amber-300/45" />
              </div>
            </div>
            <p className="mt-2 text-[0.68rem] text-[var(--text)]">
              Plusieurs graphs ou ecran complet.
            </p>
          </div>
        </div>

        <label className="mt-3 flex items-center gap-2 text-xs text-[var(--muted)]">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(event) => onDontShowAgainChange(event.target.checked)}
            className="h-4 w-4 rounded accent-sky-200"
          />
          Ne plus me montrer
        </label>
      </div>
    </div>
  );
}
