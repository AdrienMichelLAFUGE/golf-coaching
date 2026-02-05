"use client";

import { useEffect, useMemo, useState } from "react";
import type { RadarColumn, RadarShot } from "./radar-charts";

type RadarReviewFile = {
  id: string;
  original_name?: string | null;
  error?: string | null;
  analytics?: { meta?: { club?: string | null } | null } | null;
  columns: RadarColumn[];
  shots: RadarShot[];
};

type RadarReviewModalProps = {
  file: RadarReviewFile | null;
  onClose: () => void;
  onConfirm: (payload: {
    columns: RadarColumn[];
    shots: RadarShot[];
    club: "auto" | "driver" | "iron";
  }) => Promise<void>;
};

const formatCellValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "-";
    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2);
  }
  return String(value);
};

const cloneShots = (shots: RadarShot[]) => shots.map((shot) => ({ ...shot }));

const getDataKeys = (columns: RadarColumn[]) =>
  columns.filter((column) => column.key !== "shot_index").map((column) => column.key);

export default function RadarReviewModal({ file, onClose, onConfirm }: RadarReviewModalProps) {
  const [columns, setColumns] = useState<RadarColumn[]>([]);
  const [shots, setShots] = useState<RadarShot[]>([]);
  const [clubSelection, setClubSelection] = useState<"auto" | "driver" | "iron">(
    "auto"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!file) return;
    setColumns(Array.isArray(file.columns) ? file.columns : []);
    setShots(Array.isArray(file.shots) ? cloneShots(file.shots) : []);
    const knownClub = file.analytics?.meta?.club?.toLowerCase() ?? "";
    if (knownClub.includes("driver")) {
      setClubSelection("driver");
    } else if (knownClub) {
      setClubSelection("iron");
    } else {
      setClubSelection("auto");
    }
    setSaving(false);
    setError("");
  }, [file]);

  const hasHashColumn = useMemo(
    () => columns.some((column) => column.label.trim() === "#"),
    [columns]
  );

  const dataKeys = useMemo(() => getDataKeys(columns), [columns]);

  const displayColumns = useMemo(() => {
    const shotColumn =
      columns.find((column) => column.key === "shot_index") ?? {
        key: "shot_index",
        group: "Shot",
        label: "Shot",
        unit: null,
      };
    const rest = columns.filter((column) => column.key !== "shot_index");
    return [shotColumn, ...rest];
  }, [columns]);

  const sortedShots = useMemo(() => {
    const list = [...shots];
    list.sort((a, b) => {
      const left = typeof a.shot_index === "number" ? a.shot_index : Number(a.shot_index);
      const right = typeof b.shot_index === "number" ? b.shot_index : Number(b.shot_index);
      const leftScore = Number.isFinite(left) ? left : 0;
      const rightScore = Number.isFinite(right) ? right : 0;
      return leftScore - rightScore;
    });
    return list;
  }, [shots]);

  const applyShift = (direction: "left" | "right") => {
    if (dataKeys.length < 2) return;
    const nextShots = cloneShots(shots).map((shot) => {
      const updated = { ...shot };
      if (direction === "left") {
        for (let i = 0; i < dataKeys.length - 1; i += 1) {
          updated[dataKeys[i]] = updated[dataKeys[i + 1]] ?? null;
        }
        updated[dataKeys[dataKeys.length - 1]] = null;
      } else {
        for (let i = dataKeys.length - 1; i > 0; i -= 1) {
          updated[dataKeys[i]] = updated[dataKeys[i - 1]] ?? null;
        }
        updated[dataKeys[0]] = null;
      }
      return updated;
    });
    setShots(nextShots);
  };

  const applyRemoveEmptyColumns = () => {
    if (!dataKeys.length) return;
    const emptyKeys = dataKeys.filter((key) =>
      shots.every((shot) => {
        const value = shot[key];
        return value === null || value === undefined || value === "" || value === "-";
      })
    );
    if (!emptyKeys.length) return;
    const nextColumns = columns.filter((column) => !emptyKeys.includes(column.key));
    const nextShots = cloneShots(shots).map((shot) => {
      const updated = { ...shot };
      emptyKeys.forEach((key) => {
        delete updated[key];
      });
      return updated;
    });
    setColumns(nextColumns);
    setShots(nextShots);
  };

  const applyHashToShot = () => {
    const hashIndex = columns.findIndex((column) => column.label.trim() === "#");
    if (hashIndex < 0) return;
    const hashKey = columns[hashIndex].key;
    if (hashKey === "shot_index") {
      const nextColumns = columns.map((column, index) =>
        index === hashIndex ? { ...column, label: "Shot" } : column
      );
      setColumns(nextColumns);
      return;
    }
    const nextShots = cloneShots(shots).map((shot) => {
      const updated = { ...shot };
      const rawShot = updated[hashKey];
      const parsed =
        typeof rawShot === "number" ? rawShot : Number(String(rawShot ?? ""));
      if (Number.isFinite(parsed)) {
        updated.shot_index = parsed;
      }
      const keys = getDataKeys(columns);
      const startIndex = keys.indexOf(hashKey);
      if (startIndex >= 0) {
        for (let i = startIndex; i < keys.length - 1; i += 1) {
          updated[keys[i]] = updated[keys[i + 1]] ?? null;
        }
        updated[keys[keys.length - 1]] = null;
      }
      delete updated[hashKey];
      return updated;
    });
    const nextColumns = columns.filter((_column, index) => index !== hashIndex);
    setColumns(nextColumns);
    setShots(nextShots);
  };

  const handleConfirm = async () => {
    if (!file) return;
    setSaving(true);
    setError("");
    try {
      await onConfirm({ columns, shots, club: clubSelection });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation impossible.");
    } finally {
      setSaving(false);
    }
  };

  if (!file) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="panel w-full max-w-6xl max-h-[92vh] overflow-y-auto rounded-2xl p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Previsualisation extraction
            </p>
            <h4 className="mt-2 text-lg font-semibold text-[var(--text)]">
              {file.original_name || "Extraction datas"}
            </h4>
            {file.error ? (
              <p className="mt-2 max-w-2xl text-xs text-amber-200">
                {file.error.startsWith("A verifier")
                  ? file.error
                  : `A verifier: ${file.error}`}
              </p>
            ) : (
              <p className="mt-2 text-xs text-[var(--muted)]">
                Verifie que les colonnes sont bien alignees avant validation.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
          >
            Fermer
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-[0.65rem] uppercase tracking-wide">
          <button
            type="button"
            onClick={applyHashToShot}
            disabled={!hasHashColumn}
            className={`rounded-full border px-3 py-1 transition ${
              hasHashColumn
                ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/20"
                : "cursor-not-allowed border-white/5 bg-white/5 text-[var(--muted)]"
            }`}
          >
            Renommer # → Shot
          </button>
          <button
            type="button"
            onClick={() => applyShift("left")}
            disabled={dataKeys.length < 2}
            className={`rounded-full border px-3 py-1 transition ${
              dataKeys.length >= 2
                ? "border-white/10 bg-white/10 text-[var(--text)] hover:bg-white/20"
                : "cursor-not-allowed border-white/5 bg-white/5 text-[var(--muted)]"
            }`}
          >
            Decaler colonnes ←
          </button>
          <button
            type="button"
            onClick={() => applyShift("right")}
            disabled={dataKeys.length < 2}
            className={`rounded-full border px-3 py-1 transition ${
              dataKeys.length >= 2
                ? "border-white/10 bg-white/10 text-[var(--text)] hover:bg-white/20"
                : "cursor-not-allowed border-white/5 bg-white/5 text-[var(--muted)]"
            }`}
          >
            Decaler colonnes →
          </button>
          <button
            type="button"
            onClick={applyRemoveEmptyColumns}
            className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[var(--text)] transition hover:bg-white/20"
          >
            Supprimer colonne vide
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
          <div className="max-h-[55vh] overflow-auto">
            <table className="w-full border-separate border-spacing-0 text-xs text-[var(--text)]">
              <thead className="sticky top-0 bg-[var(--bg-elevated)]">
                <tr>
                  {displayColumns.map((column) => (
                    <th
                      key={column.key}
                      className="whitespace-nowrap border-b border-white/10 px-3 py-2 text-left text-[0.6rem] uppercase tracking-wide text-[var(--muted)]"
                    >
                      {column.label || column.key}
                      {column.unit ? ` (${column.unit})` : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedShots.map((shot, index) => (
                  <tr key={`shot-row-${index}`} className="odd:bg-white/5">
                    {displayColumns.map((column) => (
                      <td
                        key={`shot-${index}-${column.key}`}
                        className="whitespace-nowrap border-b border-white/5 px-3 py-2"
                      >
                        {formatCellValue(shot[column.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-[0.7rem] text-[var(--muted)]">
            <span>Club :</span>
            <select
              value={clubSelection}
              onChange={(event) =>
                setClubSelection(event.target.value as "auto" | "driver" | "iron")
              }
              className="rounded-full border border-white/10 bg-[var(--bg-elevated)] px-3 py-1 text-[0.7rem] text-[var(--text)]"
            >
              <option value="auto">Auto</option>
              <option value="driver">Driver</option>
              <option value="iron">Fers</option>
            </select>
            <span className="text-[0.65rem] text-[var(--muted)]">
              Impact Face utilise ce choix.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[0.7rem] text-[var(--muted)]">
              La validation remplace l extraction actuelle.
            </p>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={saving}
              className={`rounded-full border px-4 py-2 text-[0.7rem] uppercase tracking-wide transition ${
                saving
                  ? "cursor-wait border-white/10 bg-white/10 text-[var(--muted)]"
                  : "border-emerald-300/30 bg-emerald-400/20 text-emerald-100 hover:bg-emerald-400/30"
              }`}
            >
              {saving ? "Validation..." : "Valider extraction"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
