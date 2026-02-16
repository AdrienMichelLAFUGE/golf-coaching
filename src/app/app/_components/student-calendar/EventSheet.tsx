"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  parseDateInputToIso,
  parseDateTimeInputToIso,
  toDateInputValue,
  toDateTimeInputValue,
} from "./date-utils";
import {
  STUDENT_EVENT_TYPE_OPTIONS,
  STUDENT_EVENT_TYPE_THEME,
  type EventSheetMode,
  type EventUpsertInput,
  type StudentEvent,
  type StudentEventRoundResult,
  type StudentEventType,
} from "./types";

type EventSheetProps = {
  open: boolean;
  mode: EventSheetMode;
  canEdit: boolean;
  initialEvent: StudentEvent | null;
  initialDate: Date;
  saving: boolean;
  deleting: boolean;
  errorMessage: string;
  onClose: () => void;
  onSave: (input: EventUpsertInput) => Promise<void>;
  onDelete: (event: StudentEvent) => Promise<void>;
  onOpenResults: (event: StudentEvent) => void;
};

const buildInitialState = (event: StudentEvent | null, initialDate: Date) => {
  const baseStart = event?.startAt ? new Date(event.startAt) : initialDate;
  const baseEnd = event?.endAt ? new Date(event.endAt) : null;
  const allDay = event?.allDay ?? false;

  return {
    title: event?.title ?? "",
    type: (event?.type ?? "other") as StudentEventType,
    allDay,
    startValue: allDay ? toDateInputValue(baseStart) : toDateTimeInputValue(baseStart),
    endValue: baseEnd
      ? allDay
        ? toDateInputValue(baseEnd)
        : toDateTimeInputValue(baseEnd)
      : "",
    location: event?.location ?? "",
    notes: event?.notes ?? "",
    resultsEnabled: event?.resultsEnabled ?? false,
    resultsRoundsPlanned: event?.resultsRoundsPlanned ? String(event.resultsRoundsPlanned) : "1",
    resultsRounds: event?.resultsRounds ?? [],
  };
};

const EVENT_TYPE_LABEL_MAP = Object.fromEntries(
  STUDENT_EVENT_TYPE_OPTIONS.map((option) => [option.value, option.label])
) as Record<StudentEventType, string>;

type EventStatus = "A venir" | "En cours" | "Termine";

const getEventStatus = (event: StudentEvent): EventStatus => {
  const now = Date.now();
  const startMs = Date.parse(event.startAt);
  const endMs = Date.parse(event.endAt ?? event.startAt);
  if (now < startMs) return "A venir";
  if (now > endMs) return "Termine";
  return "En cours";
};

const EVENT_STATUS_CLASS: Record<EventStatus, string> = {
  "A venir":
    "border-amber-500/70 bg-amber-100 text-amber-200 dark:border-amber-300/50 dark:bg-amber-400/15 dark:text-amber-100",
  "En cours":
    "border-sky-500/70 bg-sky-100 text-sky-200 dark:border-sky-300/50 dark:bg-sky-400/15 dark:text-sky-100",
  Termine:
    "border-emerald-500/70 bg-emerald-100 text-emerald-200 dark:border-emerald-300/50 dark:bg-emerald-400/15 dark:text-emerald-100",
};

const formatEventSchedule = (event: StudentEvent) => {
  const start = new Date(event.startAt);
  const end = event.endAt ? new Date(event.endAt) : null;

  if (event.allDay) {
    const startLabel = new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(start);
    if (!end) return `${startLabel} (journee)`;
    const endLabel = new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(end);
    return startLabel === endLabel ? `${startLabel} (journee)` : `${startLabel} - ${endLabel}`;
  }

  const startLabel = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(start);
  if (!end) return startLabel;

  const endLabel = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(end);
  return `${startLabel} - ${endLabel}`;
};

const getFinalPlace = (event: StudentEvent) => {
  const placeRounds = event.resultsRounds.filter((round) => round.place !== null);
  if (placeRounds.length === 0) return null;
  const latest = [...placeRounds].sort((a, b) => b.round - a.round)[0];
  return latest?.place ?? null;
};

export default function EventSheet({
  open,
  mode,
  canEdit,
  initialEvent,
  initialDate,
  saving,
  deleting,
  errorMessage,
  onClose,
  onSave,
  onDelete,
  onOpenResults,
}: EventSheetProps) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<StudentEventType>("other");
  const [allDay, setAllDay] = useState(false);
  const [startValue, setStartValue] = useState("");
  const [endValue, setEndValue] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [resultsEnabled, setResultsEnabled] = useState(false);
  const [resultsRoundsPlanned, setResultsRoundsPlanned] = useState("1");
  const [resultsRounds, setResultsRounds] = useState<StudentEventRoundResult[]>([]);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const next = buildInitialState(initialEvent, initialDate);
    Promise.resolve().then(() => {
      if (cancelled) return;
      setTitle(next.title);
      setType(next.type);
      setAllDay(next.allDay);
      setStartValue(next.startValue);
      setEndValue(next.endValue);
      setLocation(next.location);
      setNotes(next.notes);
      setResultsEnabled(next.resultsEnabled);
      setResultsRoundsPlanned(next.resultsRoundsPlanned);
      setResultsRounds(next.resultsRounds);
      setLocalError("");
    });

    return () => {
      cancelled = true;
    };
  }, [open, initialEvent, initialDate]);

  const heading = useMemo(() => {
    if (mode === "create") return "Nouvel evenement";
    if (mode === "edit") return "Modifier evenement";
    return "Detail evenement";
  }, [mode]);

  const isReadOnly = mode === "view" || !canEdit;
  const readOnlyStatus = initialEvent ? getEventStatus(initialEvent) : null;
  const isResultsType = type === "tournament" || type === "competition";
  const canShowResultsConfig = isResultsType || resultsEnabled;
  const plannedRoundsCount = Math.max(1, Number(resultsRoundsPlanned) || 1);
  const filledRoundsCount = resultsRounds.filter(
    (round) => round.score !== null || round.place !== null
  ).length;
  const sortedResultRounds = useMemo(
    () => [...resultsRounds].sort((a, b) => a.round - b.round),
    [resultsRounds]
  );
  const startInputType = allDay ? "date" : "datetime-local";
  const endInputType = allDay ? "date" : "datetime-local";

  const handleTypeChange = (nextType: StudentEventType) => {
    setType(nextType);
    if (nextType === "tournament" || nextType === "competition") return;
    setResultsEnabled(false);
    setResultsRoundsPlanned("1");
    setResultsRounds([]);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isReadOnly) return;

    const titleValue = title.trim();
    if (!titleValue) {
      setLocalError("Le titre est obligatoire.");
      return;
    }

    const startAt = allDay
      ? parseDateInputToIso(startValue)
      : parseDateTimeInputToIso(startValue);
    if (!startAt) {
      setLocalError("Date de debut invalide.");
      return;
    }

    const endAt = endValue
      ? allDay
        ? parseDateInputToIso(endValue)
        : parseDateTimeInputToIso(endValue)
      : null;

    if (endValue && !endAt) {
      setLocalError("Date de fin invalide.");
      return;
    }

    if (endAt && Date.parse(endAt) < Date.parse(startAt)) {
      setLocalError("La date de fin doit etre apres la date de debut.");
      return;
    }

    if (resultsEnabled && !isResultsType) {
      setLocalError("Le suivi resultat est reserve aux tournois et competitions.");
      return;
    }

    const parsedPlannedRounds = resultsEnabled
      ? Math.min(6, Math.max(1, Number(resultsRoundsPlanned) || 1))
      : null;
    const normalizedRounds = resultsEnabled
      ? resultsRounds
          .filter((round) => round.round <= (parsedPlannedRounds ?? 0))
          .sort((a, b) => a.round - b.round)
      : [];

    setLocalError("");
    await onSave({
      title: titleValue,
      type,
      startAt,
      endAt,
      allDay,
      location: location.trim() || null,
      notes: notes.trim() || null,
      resultsEnabled,
      resultsRoundsPlanned: parsedPlannedRounds,
      resultsRounds: normalizedRounds,
      ...(mode === "edit" && initialEvent ? { version: initialEvent.version } : {}),
    });
  };

  const handleDelete = async () => {
    if (!initialEvent || mode !== "edit" || !canEdit) return;
    await onDelete(initialEvent);
  };

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/65 backdrop-blur-[1px] md:items-center">
      <button
        type="button"
        aria-label="Fermer la fenetre evenement"
        className="absolute inset-0"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-h-[86vh] overflow-y-auto rounded-t-3xl border border-white/10 bg-[var(--bg-elevated)] p-5 shadow-[0_-16px_40px_rgba(0,0,0,0.45)] md:max-h-[88vh] md:max-w-2xl md:rounded-3xl md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">
              Calendrier eleve
            </p>
            <h3 className="mt-2 text-lg font-semibold text-[var(--text)]">{heading}</h3>
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

        {isReadOnly && initialEvent ? (
          <div className="mt-5 space-y-4">
            <section
              className={`rounded-2xl border ${STUDENT_EVENT_TYPE_THEME[initialEvent.type].borderClass} bg-[var(--panel-strong)] p-4`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.16em] ${STUDENT_EVENT_TYPE_THEME[initialEvent.type].chipClass} ${
                      initialEvent.type === "tournament" ? "!text-amber-600" : ""
                    }`}
                  >
                    {EVENT_TYPE_LABEL_MAP[initialEvent.type]}
                  </span>
                  <h4 className="mt-2 text-lg font-semibold text-[var(--text)]">
                    {initialEvent.title}
                  </h4>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {formatEventSchedule(initialEvent)}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.16em] font-semibold ${
                    readOnlyStatus ? EVENT_STATUS_CLASS[readOnlyStatus] : ""
                  }`}
                >
                  {readOnlyStatus}
                </span>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/5">
              <dl className="divide-y divide-white/10">
                <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 px-4 py-3">
                  <dt className="text-[0.66rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                    Debut
                  </dt>
                  <dd className="text-sm font-medium text-[var(--text)]">
                    {new Intl.DateTimeFormat("fr-FR", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      ...(initialEvent.allDay ? {} : { hour: "2-digit", minute: "2-digit" }),
                    }).format(new Date(initialEvent.startAt))}
                  </dd>
                </div>
                <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 px-4 py-3">
                  <dt className="text-[0.66rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                    Fin
                  </dt>
                  <dd className="text-sm font-medium text-[var(--text)]">
                    {initialEvent.endAt
                      ? new Intl.DateTimeFormat("fr-FR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          ...(initialEvent.allDay ? {} : { hour: "2-digit", minute: "2-digit" }),
                        }).format(new Date(initialEvent.endAt))
                      : "Non renseignee"}
                  </dd>
                </div>
                <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 px-4 py-3">
                  <dt className="text-[0.66rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                    Lieu
                  </dt>
                  <dd className="text-sm font-medium text-[var(--text)]">
                    {initialEvent.location?.trim() || "Non renseigne"}
                  </dd>
                </div>
              </dl>
            </section>

            {initialEvent.resultsEnabled ? (
              <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[0.66rem] uppercase tracking-[0.18em] text-[var(--muted)]">
                    Resultats
                  </p>
                  <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.16em] text-[var(--text)]">
                    {sortedResultRounds.length}/{initialEvent.resultsRoundsPlanned ?? 0} tours
                  </span>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-[var(--panel-strong)] px-3 py-2">
                    <p className="text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                      Place finale
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[var(--text)]">
                      {getFinalPlace(initialEvent) !== null
                        ? `P${getFinalPlace(initialEvent)}`
                        : "Non renseignee"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[var(--panel-strong)] px-3 py-2">
                    <p className="text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                      Dernier score brut
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[var(--text)]">
                      {sortedResultRounds.length > 0
                        ? (sortedResultRounds[sortedResultRounds.length - 1]?.score ?? "-")
                        : "-"}
                    </p>
                  </div>
                </div>

                {sortedResultRounds.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {sortedResultRounds.map((round) => (
                      <li
                        key={`readonly-round-${round.round}`}
                        className="grid grid-cols-[70px_1fr_1fr] items-center rounded-xl border border-white/10 bg-[var(--panel-strong)] px-3 py-2 text-sm"
                      >
                        <span className="text-[var(--text)]">Tour {round.round}</span>
                        <span className="text-[var(--muted)]">Brut: {round.score ?? "-"}</span>
                        <span className="text-[var(--muted)]">Place: {round.place ?? "-"}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-[var(--muted)]">
                    Aucun tour renseigne pour le moment.
                  </p>
                )}
              </section>
            ) : null}

            {initialEvent.notes?.trim() ? (
              <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-[0.66rem] uppercase tracking-[0.18em] text-[var(--muted)]">
                  Notes
                </p>
                <p className="mt-2 whitespace-pre-line text-sm text-[var(--text)]">
                  {initialEvent.notes}
                </p>
              </section>
            ) : null}

            {errorMessage ? <p className="text-sm text-red-300">{errorMessage}</p> : null}

            <div className="flex items-center justify-end border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--text)] transition hover:bg-white/10"
              >
                Fermer
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-[var(--muted)]">Titre</label>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={isReadOnly || saving}
              placeholder="Tournoi, competition, entrainement..."
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)]"
            />
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Type</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {STUDENT_EVENT_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleTypeChange(option.value)}
                  disabled={isReadOnly || saving}
                  className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wide transition ${
                    type === option.value
                      ? "border-emerald-300/40 bg-emerald-400/20 text-emerald-100"
                      : "border-white/10 bg-white/5 text-[var(--muted)] hover:text-[var(--text)]"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {canShowResultsConfig ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                    Resultats competition
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Activez le suivi pour saisir les scores et classements tour par tour.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={resultsEnabled}
                  onChange={(event) => {
                    const next = event.target.checked;
                    setResultsEnabled(next);
                    if (!next) {
                      setResultsRoundsPlanned("1");
                      setResultsRounds([]);
                    }
                  }}
                  disabled={isReadOnly || saving || !isResultsType}
                  className="h-4 w-4 rounded border-white/10 bg-white/5"
                />
              </div>

              {resultsEnabled ? (
                <>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      Tours prevus
                    </label>
                    <select
                      value={resultsRoundsPlanned}
                      onChange={(event) => setResultsRoundsPlanned(event.target.value)}
                      disabled={isReadOnly || saving}
                      className="rounded-full border border-white/10 bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text)]"
                    >
                      {Array.from({ length: 6 }, (_, index) => index + 1).map((roundsCount) => (
                        <option key={`planned-rounds-${roundsCount}`} value={String(roundsCount)}>
                          {roundsCount} tour{roundsCount > 1 ? "s" : ""}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-[var(--muted)]">
                      {filledRoundsCount}/{plannedRoundsCount} tours renseignes.
                    </span>
                  </div>

                  <div className="mt-3 rounded-xl border border-white/10 bg-[var(--bg-elevated)] p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                      Resultats saisis
                    </p>
                    {sortedResultRounds.length === 0 ? (
                      <p className="mt-2 text-xs text-[var(--muted)]">
                        Aucun resultat saisi. Utilisez le bouton &quot;Resultat&quot; sur la carte agenda.
                      </p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {sortedResultRounds.map((round) => (
                          <p
                            key={`result-round-preview-${round.round}`}
                            className="text-xs text-[var(--text)]"
                          >
                            Tour {round.round}: score {round.score ?? "-"} • place{" "}
                            {round.place ?? "-"}
                          </p>
                        ))}
                      </div>
                    )}
                    {canEdit && mode !== "create" && initialEvent ? (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => onOpenResults(initialEvent)}
                          disabled={saving || deleting}
                          className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.16em] text-[var(--text)] transition hover:bg-white/20 disabled:opacity-60"
                        >
                          <span aria-hidden="true">🏅</span>
                          Renseigner resultat
                        </button>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <span className="text-sm text-[var(--text)]">Journee complete</span>
            <input
              type="checkbox"
              checked={allDay}
              onChange={(event) => {
                const next = event.target.checked;
                setAllDay(next);
                if (startValue) {
                  const parsedStart = new Date(startValue);
                  if (!Number.isNaN(parsedStart.getTime())) {
                    setStartValue(
                      next ? toDateInputValue(parsedStart) : toDateTimeInputValue(parsedStart)
                    );
                  }
                }
                if (endValue) {
                  const parsedEnd = new Date(endValue);
                  if (!Number.isNaN(parsedEnd.getTime())) {
                    setEndValue(
                      next ? toDateInputValue(parsedEnd) : toDateTimeInputValue(parsedEnd)
                    );
                  }
                }
              }}
              disabled={isReadOnly || saving}
              className="h-4 w-4 rounded border-white/10 bg-white/5"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Debut
              </label>
              <input
                type={startInputType}
                value={startValue}
                onChange={(event) => setStartValue(event.target.value)}
                disabled={isReadOnly || saving}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)]"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Fin (optionnelle)
              </label>
              <input
                type={endInputType}
                value={endValue}
                onChange={(event) => setEndValue(event.target.value)}
                disabled={isReadOnly || saving}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)]"
              />
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
              Lieu
            </label>
            <input
              type="text"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              disabled={isReadOnly || saving}
              placeholder="Club, ville, practice..."
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)]"
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={isReadOnly || saving}
              rows={4}
              placeholder="Infos utiles, objectifs, consignes..."
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)]"
            />
          </div>

          {localError ? <p className="text-sm text-red-300">{localError}</p> : null}
          {errorMessage ? <p className="text-sm text-red-300">{errorMessage}</p> : null}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/10 pt-4">
            {mode === "edit" && canEdit && initialEvent ? (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={saving || deleting}
                className="rounded-full border border-red-300/40 bg-red-500/10 px-4 py-2 text-xs uppercase tracking-wide text-red-200 transition hover:bg-red-500/20 disabled:opacity-60"
              >
                {deleting ? "Suppression..." : "Delete"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              disabled={saving || deleting}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--text)] transition hover:bg-white/10 disabled:opacity-60"
            >
              Cancel
            </button>
            {!isReadOnly ? (
              <button
                type="submit"
                disabled={saving || deleting}
                className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
              >
                {saving ? "Save..." : "Save"}
              </button>
            ) : null}
          </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
