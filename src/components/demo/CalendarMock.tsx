"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  DEMO_SEASON_CALENDAR,
  type CalendarEventType,
  type SeasonCalendarEvent,
} from "./fixtures";

type CalendarMockProps = {
  mode: "student" | "coach";
  animated?: boolean;
};

type CalendarCell = {
  key: string;
  date: Date;
  inCurrentMonth: boolean;
};

const typeStyle: Record<
  CalendarEventType,
  {
    dot: string;
    chip: string;
    border: string;
    bar: string;
  }
> = {
  tournoi: {
    dot: "bg-amber-300",
    chip: "border-amber-300/50 bg-amber-400/12 text-amber-100",
    border: "border-amber-300/40",
    bar: "bg-amber-300",
  },
  compétition: {
    dot: "bg-sky-300",
    chip: "border-sky-300/50 bg-sky-400/12 text-sky-100",
    border: "border-sky-300/40",
    bar: "bg-sky-300",
  },
  entraînement: {
    dot: "bg-emerald-300",
    chip: "border-emerald-300/50 bg-emerald-400/12 text-emerald-100",
    border: "border-emerald-300/40",
    bar: "bg-emerald-300",
  },
};

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function toDateKey(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function toUtcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

function parseDateKey(key: string) {
  const [year, month, day] = key.split("-").map((value) => Number(value));
  return toUtcDate(year, month, day);
}

function shiftMonth(year: number, month: number, delta: number) {
  const next = month + delta;
  if (next < 1) return { year: year - 1, month: 12 };
  if (next > 12) return { year: year + 1, month: 1 };
  return { year, month: next };
}

function buildMonthGrid(year: number, month: number) {
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const firstWeekdayMondayBased = (firstDay.getUTCDay() + 6) % 7;
  const daysInCurrentMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prevMeta = shiftMonth(year, month, -1);
  const daysInPrevMonth = new Date(Date.UTC(prevMeta.year, prevMeta.month, 0)).getUTCDate();

  const cells: CalendarCell[] = [];
  for (let index = 0; index < 42; index += 1) {
    if (index < firstWeekdayMondayBased) {
      const day = daysInPrevMonth - firstWeekdayMondayBased + index + 1;
      const date = toUtcDate(prevMeta.year, prevMeta.month, day);
      cells.push({ key: toDateKey(date), date, inCurrentMonth: false });
      continue;
    }

    const currentIndex = index - firstWeekdayMondayBased;
    if (currentIndex < daysInCurrentMonth) {
      const day = currentIndex + 1;
      const date = toUtcDate(year, month, day);
      cells.push({ key: toDateKey(date), date, inCurrentMonth: true });
      continue;
    }

    const nextMeta = shiftMonth(year, month, 1);
    const day = currentIndex - daysInCurrentMonth + 1;
    const date = toUtcDate(nextMeta.year, nextMeta.month, day);
    cells.push({ key: toDateKey(date), date, inCurrentMonth: false });
  }

  return cells;
}

function addDays(date: Date, delta: number) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + delta);
  return next;
}

function formatDayHeader(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
}

function formatTimelineLabel(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  })
    .format(date)
    .replace(".", "");
}

function initials(name: string) {
  const parts = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function ParticipantAvatars({ participants }: { participants: string[] }) {
  const visible = participants.slice(0, 4);
  const remaining = participants.length - visible.length;

  return (
    <div className="flex items-center" data-testid="calendar-participant-avatars">
      <div className="flex -space-x-2">
        {visible.map((participant) => (
          <span
            key={participant}
            title={participant}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/45 bg-slate-900/80 text-[0.58rem] font-semibold uppercase text-white"
          >
            {initials(participant)}
          </span>
        ))}
      </div>
      {remaining > 0 ? (
        <span className="ml-2 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[0.58rem] uppercase tracking-[0.12em] text-[var(--muted)]">
          +{remaining}
        </span>
      ) : null}
    </div>
  );
}

function TimelineColumn({
  date,
  selected,
  onSelect,
}: {
  date: Date;
  selected: boolean;
  onSelect: (key: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(toDateKey(date))}
      className={`rounded-2xl border px-3 py-2 text-left transition ${
        selected
          ? "border-sky-300/45 bg-sky-400/12"
          : "border-white/12 bg-white/8 hover:border-white/25"
      }`}
    >
      <p className="text-[0.62rem] uppercase tracking-[0.18em] text-[var(--muted)]">Jour</p>
      <p className="mt-1 text-sm font-semibold uppercase text-[var(--text)]">
        {formatTimelineLabel(date)}
      </p>
    </button>
  );
}

function medalForPlace(place: 1 | 2 | 3) {
  if (place === 1) return "🥇";
  if (place === 2) return "🥈";
  return "🥉";
}

export default function CalendarMock({ mode, animated = true }: CalendarMockProps) {
  const reducedMotion = useReducedMotion();
  const fixture = DEMO_SEASON_CALENDAR;
  const events = mode === "coach" ? fixture.coachEvents : fixture.studentEvents;
  const monthCells = useMemo(() => buildMonthGrid(fixture.year, fixture.month), [fixture.month, fixture.year]);

  const initialDateKey = useMemo(
    () => toDateKey(toUtcDate(fixture.year, fixture.month, fixture.referenceDay)),
    [fixture.month, fixture.referenceDay, fixture.year]
  );
  const referenceDateKey = useMemo(
    () => toDateKey(toUtcDate(fixture.year, fixture.month, fixture.referenceDay)),
    [fixture.month, fixture.referenceDay, fixture.year]
  );

  const [selectedDateKey, setSelectedDateKey] = useState(initialDateKey);
  const [agendaExpanded, setAgendaExpanded] = useState(true);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, SeasonCalendarEvent[]>();
    events.forEach((event) => {
      const key = toDateKey(toUtcDate(fixture.year, fixture.month, event.day));
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    });
    return map;
  }, [events, fixture.month, fixture.year]);

  const selectedDate = parseDateKey(selectedDateKey);
  const selectedDayEvents = eventsByDate.get(selectedDateKey) ?? [];
  const agendaDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(selectedDate, index)),
    [selectedDate]
  );
  const dotsAnimated = animated && !reducedMotion;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
      <article className="rounded-2xl border border-white/12 bg-slate-900/55 p-4">
        <header className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              {mode === "coach" ? "Vue coach agrégée" : "Vue élève"}
            </p>
            <h3 className="mt-1 text-base font-semibold text-[var(--text)]">{fixture.monthLabel}</h3>
          </div>
          <span className="rounded-full border border-white/12 bg-white/10 px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
            Calendrier
          </span>
        </header>

        <div className="grid grid-cols-7 gap-2 text-center text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
          {fixture.weekdayLabels.map((label, index) => (
            <span key={`${label}-${index}`}>{label}</span>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-2">
          {monthCells.map((cell) => {
            const cellEvents = eventsByDate.get(cell.key) ?? [];
            const medalEvent = cellEvents.find((event) => typeof event.resultPlace === "number");
            const isSelected = cell.key === selectedDateKey;
            const dayNumber = cell.date.getUTCDate();
            const isPast = cell.key < referenceDateKey;
            const medalPlace =
              mode === "student" && isPast ? medalEvent?.resultPlace : undefined;

            return (
              <button
                key={cell.key}
                type="button"
                onClick={() => setSelectedDateKey(cell.key)}
                data-testid="calendar-day-cell"
                data-date-key={cell.key}
                className={`relative flex aspect-square items-start justify-between rounded-xl border p-1.5 text-left transition ${
                  isSelected
                    ? "border-sky-300/50 bg-sky-400/12"
                    : "border-white/10 bg-white/5 hover:border-white/20"
                } ${cell.inCurrentMonth ? "" : "opacity-60"}`}
              >
                <span className="text-[0.72rem] text-[var(--text)]">{dayNumber}</span>
                {cellEvents.length > 0 ? (
                  <span className="absolute right-1 top-1 flex items-center gap-1">
                    {cellEvents.slice(0, 3).map((event, index) => (
                      <motion.span
                        key={`${event.id}-${index}`}
                        data-testid="calendar-event-dot"
                        className={`inline-flex h-2.5 w-2.5 rounded-full border border-white/35 ${typeStyle[event.type].dot}`}
                        initial={dotsAnimated ? { scale: 0, opacity: 0 } : false}
                        animate={
                          dotsAnimated
                            ? { scale: [0, 1.2, 1], opacity: [0, 1, 1] }
                            : { scale: 1, opacity: 1 }
                        }
                        transition={{
                          duration: dotsAnimated ? 0.36 : 0,
                          delay: dotsAnimated ? index * 0.08 : 0,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      />
                    ))}
                  </span>
                ) : null}
                {medalPlace ? (
                  <span className="absolute bottom-1 right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-white/40 bg-slate-900/70 px-1 text-[0.62rem] leading-none">
                    {medalForPlace(medalPlace)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </article>

      <aside className="rounded-2xl border border-white/12 bg-slate-900/50 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[var(--text)]">{formatDayHeader(selectedDate)}</p>
          <button
            type="button"
            onClick={() => setAgendaExpanded((previous) => !previous)}
            className="rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[0.62rem] uppercase tracking-[0.16em] text-[var(--text)] transition hover:bg-white/20"
          >
            {agendaExpanded ? "Masquer agenda 7 jours" : "Voir agenda 7 jours"}
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {selectedDayEvents.length === 0 ? (
            <div className="rounded-xl border border-white/12 bg-white/8 px-3 py-3 text-sm text-[var(--muted)]">
              Aucun événement sur ce jour.
            </div>
          ) : (
            selectedDayEvents.map((event) => (
              <article
                key={event.id}
                className={`rounded-2xl border bg-white/8 px-3 py-3 ${typeStyle[event.type].border}`}
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 inline-flex h-10 w-1 shrink-0 rounded-full ${typeStyle[event.type].bar}`}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--text)]">{event.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.16em] ${typeStyle[event.type].chip}`}
                      >
                        {event.type}
                      </span>
                      <span className="text-xs text-[var(--muted)]">{event.time}</span>
                    </div>
                    {mode === "coach" ? (
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <ParticipantAvatars participants={event.participants} />
                        <span className="text-xs text-[var(--muted)]">
                          {event.participants.length} élèves
                        </span>
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-[var(--muted)]">{event.studentName}</p>
                    )}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>

        {agendaExpanded ? (
          <div className="mt-4 border-t border-white/10 pt-3">
            <p className="mb-3 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
              Prochains jours
            </p>
            <div className="space-y-3">
              {agendaDates.map((date, index) => {
                const dayKey = toDateKey(date);
                const dayEvents = eventsByDate.get(dayKey) ?? [];
                return (
                  <motion.div
                    key={`timeline-day-${dayKey}`}
                    initial={animated && !reducedMotion ? { opacity: 0, y: 8 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: animated && !reducedMotion ? 0.2 : 0,
                      delay: index * 0.03,
                    }}
                    className="grid grid-cols-[110px_minmax(0,1fr)] gap-3"
                  >
                    <TimelineColumn
                      date={date}
                      selected={dayKey === selectedDateKey}
                      onSelect={setSelectedDateKey}
                    />
                    <div className="space-y-2">
                      {dayEvents.length === 0 ? (
                        <div className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs text-[var(--muted)]">
                          Aucun événement.
                        </div>
                      ) : (
                        dayEvents.map((event) => (
                          <div
                            key={`${event.id}-timeline`}
                            className={`rounded-xl border bg-white/8 px-3 py-2 ${typeStyle[event.type].border}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-semibold text-[var(--text)]">
                                {event.title}
                              </p>
                              <span className="text-xs text-[var(--muted)]">{event.time}</span>
                            </div>
                            {mode === "coach" ? (
                              <div className="mt-1 flex items-center justify-between gap-2">
                                <ParticipantAvatars participants={event.participants} />
                                <span className="text-xs text-[var(--muted)]">
                                  {event.participants.length} élèves
                                </span>
                              </div>
                            ) : (
                              <p className="mt-1 text-xs text-[var(--muted)]">{event.studentName}</p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
