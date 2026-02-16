"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { StudentEvent, StudentEventRoundResult } from "./types";

type EventResultsModalProps = {
  open: boolean;
  event: StudentEvent | null;
  canEdit: boolean;
  saving: boolean;
  errorMessage: string;
  onClose: () => void;
  onSave: (event: StudentEvent, rounds: StudentEventRoundResult[]) => Promise<void>;
};

type EditableRoundRow = {
  round: number;
  scoreValue: string;
  placeValue: string;
};

const buildRoundRows = (event: StudentEvent): EditableRoundRow[] => {
  const plannedRounds = Math.max(1, event.resultsRoundsPlanned ?? 1);
  const roundMap = new Map<number, StudentEventRoundResult>();
  event.resultsRounds.forEach((round) => {
    roundMap.set(round.round, round);
  });

  return Array.from({ length: plannedRounds }, (_, index) => {
    const roundNumber = index + 1;
    const existing = roundMap.get(roundNumber);
    return {
      round: roundNumber,
      scoreValue: existing?.score !== null && existing?.score !== undefined ? String(existing.score) : "",
      placeValue: existing?.place !== null && existing?.place !== undefined ? String(existing.place) : "",
    };
  });
};

const parseIntegerField = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (!Number.isInteger(numeric)) return null;
  return numeric;
};

export default function EventResultsModal({
  open,
  event,
  canEdit,
  saving,
  errorMessage,
  onClose,
  onSave,
}: EventResultsModalProps) {
  const [rows, setRows] = useState<EditableRoundRow[]>([]);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!open || !event) return;

    let cancelled = false;
    const nextRows = buildRoundRows(event);
    Promise.resolve().then(() => {
      if (cancelled) return;
      setRows(nextRows);
      setLocalError("");
    });

    return () => {
      cancelled = true;
    };
  }, [open, event]);

  const heading = useMemo(() => {
    if (!event) return "Resultats";
    return `Resultats - ${event.title}`;
  }, [event]);

  const handleSave = async () => {
    if (!event || !canEdit) return;

    const parsedRounds: StudentEventRoundResult[] = [];
    for (const row of rows) {
      const score = parseIntegerField(row.scoreValue);
      const place = parseIntegerField(row.placeValue);

      if (row.scoreValue.trim().length > 0 && score === null) {
        setLocalError(`Score invalide pour le tour ${row.round}.`);
        return;
      }
      if (row.placeValue.trim().length > 0 && place === null) {
        setLocalError(`Classement invalide pour le tour ${row.round}.`);
        return;
      }
      if (place !== null && place < 1) {
        setLocalError(`Le classement du tour ${row.round} doit etre >= 1.`);
        return;
      }
      if (score === null && place === null) continue;

      parsedRounds.push({
        round: row.round,
        score,
        place,
      });
    }

    setLocalError("");
    await onSave(event, parsedRounds);
  };

  if (!open || !event) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/65 backdrop-blur-[1px] md:items-center">
      <button
        type="button"
        aria-label="Fermer la fenetre resultats"
        className="absolute inset-0"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-h-[86vh] overflow-y-auto rounded-t-3xl border border-white/10 bg-[var(--bg-elevated)] p-5 shadow-[0_-16px_40px_rgba(0,0,0,0.45)] md:max-w-2xl md:rounded-3xl md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">
              Performance
            </p>
            <h3 className="mt-2 text-lg font-semibold text-[var(--text)]">{heading}</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Renseignez les scores et classements du tournoi.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)]"
            aria-label="Fermer"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {rows.map((row) => (
            <div
              key={`result-round-${row.round}`}
              className="rounded-2xl border border-white/10 bg-white/5 p-3"
            >
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                Tour {row.round}
              </p>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Score
                  </label>
                  <input
                    type="number"
                    value={row.scoreValue}
                    onChange={(event) =>
                      setRows((prev) =>
                        prev.map((item) =>
                          item.round === row.round
                            ? { ...item, scoreValue: event.target.value }
                            : item
                        )
                      )
                    }
                    disabled={!canEdit || saving}
                    placeholder="Ex: 72"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Classement
                  </label>
                  <input
                    type="number"
                    value={row.placeValue}
                    onChange={(event) =>
                      setRows((prev) =>
                        prev.map((item) =>
                          item.round === row.round
                            ? { ...item, placeValue: event.target.value }
                            : item
                        )
                      )
                    }
                    disabled={!canEdit || saving}
                    placeholder="Ex: 3"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {localError ? <p className="mt-4 text-sm text-red-300">{localError}</p> : null}
        {errorMessage ? <p className="mt-2 text-sm text-red-300">{errorMessage}</p> : null}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--text)] transition hover:bg-white/10 disabled:opacity-60"
          >
            Fermer
          </button>
          {canEdit ? (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Enregistrement..." : "Enregistrer les resultats"}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
