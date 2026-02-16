"use client";

import {
  type TouchEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { z } from "zod";
import { supabase } from "@/lib/supabase/client";
import AvatarStack from "./AvatarStack";
import CoachEventDrawer from "./CoachEventDrawer";
import TimelineDayColumn from "./TimelineDayColumn";
import {
  addMonths,
  buildMonthGrid,
  endOfDay,
  endOfMonth,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  toDateKey,
} from "./date-utils";
import {
  buildTimelineDates,
  groupCoachEvents,
  type CoachCalendarEvent,
  type CoachGroupedTimelineEvent,
} from "./utils";
import {
  STUDENT_EVENT_TYPE_OPTIONS,
  STUDENT_EVENT_TYPE_THEME,
  type StudentEvent,
} from "./types";

type CoachCalendarStudent = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

type CoachCalendarProps = {
  locale?: string;
  timezone?: string;
};

const ALL_STUDENTS_FILTER = "__all__";
const WEEKDAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];

const CoachCalendarEventSchema = z.object({
  id: z.string().uuid(),
  studentId: z.string().uuid(),
  title: z.string().min(1),
  type: z.union([
    z.literal("tournament"),
    z.literal("competition"),
    z.literal("training"),
    z.literal("other"),
  ]),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }).nullable(),
  allDay: z.boolean(),
  location: z.string().nullable(),
  notes: z.string().nullable(),
  createdBy: z.string().uuid(),
  updatedBy: z.string().uuid(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  version: z.number().int().min(1),
  resultsEnabled: z.boolean(),
  resultsRoundsPlanned: z.number().int().min(1).max(6).nullable(),
  resultsRounds: z.array(
    z.object({
      round: z.number().int().min(1).max(6),
      score: z.number().int().min(-99).max(400).nullable(),
      place: z.number().int().min(1).max(9999).nullable(),
    })
  ),
  studentName: z.string().min(1),
  studentAvatarUrl: z.string().nullable(),
});

const CoachCalendarStudentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  avatarUrl: z.string().nullable(),
});

const CoachEventsResponseSchema = z.object({
  events: z.array(CoachCalendarEventSchema),
  students: z.array(CoachCalendarStudentSchema),
});

const ErrorResponseSchema = z.object({
  error: z.string().optional(),
});

const EVENT_TYPE_LABEL_MAP = Object.fromEntries(
  STUDENT_EVENT_TYPE_OPTIONS.map((option) => [option.value, option.label])
) as Record<StudentEvent["type"], string>;

const EVENT_TYPE_DISPLAY_ORDER: StudentEvent["type"][] = [
  "tournament",
  "competition",
  "training",
  "other",
];

const sortEvents = (events: CoachCalendarEvent[]) =>
  [...events].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

const eventOccursOnDay = (event: CoachCalendarEvent, day: Date) => {
  const startMs = Date.parse(event.startAt);
  const endMs = event.endAt ? Date.parse(event.endAt) : startMs;
  const dayStart = startOfDay(day).getTime();
  const dayEnd = endOfDay(day).getTime();
  return startMs <= dayEnd && endMs >= dayStart;
};

const formatMonthLabel = (value: Date, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(value);

const formatDayLabel = (value: Date, locale: string, timezone?: string) =>
  new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(value);

const formatEventSchedule = (
  event: Pick<CoachCalendarEvent, "startAt" | "endAt" | "allDay">,
  locale: string,
  timezone?: string
) => {
  const start = new Date(event.startAt);
  const end = event.endAt ? new Date(event.endAt) : null;

  if (event.allDay) {
    if (!end || isSameDay(start, end)) {
      return new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        ...(timezone ? { timeZone: timezone } : {}),
      }).format(start);
    }

    const startLabel = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(start);
    const endLabel = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(end);

    return `${startLabel} - ${endLabel}`;
  }

  const dateLabel = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(start);
  const timeLabel = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(start);

  if (!end) {
    return `${dateLabel} a ${timeLabel}`;
  }

  const endTimeLabel = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(end);
  return `${dateLabel} ${timeLabel} - ${endTimeLabel}`;
};

const getErrorMessage = (payload: unknown, fallback: string) => {
  const parsed = ErrorResponseSchema.safeParse(payload);
  if (!parsed.success) return fallback;
  return parsed.data.error ?? fallback;
};

export default function CoachCalendar({
  locale = "fr-FR",
  timezone,
}: CoachCalendarProps) {
  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [events, setEvents] = useState<CoachCalendarEvent[]>([]);
  const [students, setStudents] = useState<CoachCalendarStudent[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState(ALL_STUDENTS_FILTER);
  const [activeTypes, setActiveTypes] =
    useState<StudentEvent["type"][]>(EVENT_TYPE_DISPLAY_ORDER);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailEvent, setDetailEvent] = useState<CoachGroupedTimelineEvent | null>(null);
  const [agendaExpanded, setAgendaExpanded] = useState(false);

  const touchStartXRef = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();
  const monthGrid = useMemo(() => buildMonthGrid(monthDate), [monthDate]);
  const monthKey = `${monthDate.getFullYear()}-${monthDate.getMonth()}`;

  const activeTypeSet = useMemo(() => new Set(activeTypes), [activeTypes]);
  const studentIdSet = useMemo(() => new Set(students.map((student) => student.id)), [students]);
  const effectiveSelectedStudentId =
    selectedStudentId === ALL_STUDENTS_FILTER || studentIdSet.has(selectedStudentId)
      ? selectedStudentId
      : ALL_STUDENTS_FILTER;

  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        if (!activeTypeSet.has(event.type)) return false;
        if (effectiveSelectedStudentId === ALL_STUDENTS_FILTER) return true;
        return event.studentId === effectiveSelectedStudentId;
      }),
    [activeTypeSet, effectiveSelectedStudentId, events]
  );

  const eventsByDayTypes = useMemo(() => {
    const dayTypes = new Map<string, Set<StudentEvent["type"]>>();
    filteredEvents.forEach((event) => {
      const start = startOfDay(new Date(event.startAt));
      const end = startOfDay(new Date(event.endAt ?? event.startAt));
      for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        const key = toDateKey(cursor);
        const nextSet = dayTypes.get(key) ?? new Set<StudentEvent["type"]>();
        nextSet.add(event.type);
        dayTypes.set(key, nextSet);
      }
    });

    const serialized = new Map<string, StudentEvent["type"][]>();
    dayTypes.forEach((value, key) => {
      const ordered = EVENT_TYPE_DISPLAY_ORDER.filter((type) => value.has(type));
      serialized.set(key, ordered);
    });
    return serialized;
  }, [filteredEvents]);

  const timelineDates = useMemo(() => buildTimelineDates(selectedDate, 7), [selectedDate]);
  const selectedDayGroups = useMemo(
    () => groupCoachEvents(filteredEvents.filter((event) => eventOccursOnDay(event, selectedDate))),
    [filteredEvents, selectedDate]
  );
  const extendedTimelineItems = useMemo(
    () =>
      timelineDates.slice(1).map((date) => ({
        date,
        events: groupCoachEvents(filteredEvents.filter((event) => eventOccursOnDay(event, date))),
      })),
    [filteredEvents, timelineDates]
  );

  const loadMonthEvents = useCallback(
    async (targetMonth: Date) => {
      setLoading(true);
      setError("");

      const fromIso = startOfMonth(targetMonth).toISOString();
      const toIso = endOfMonth(targetMonth).toISOString();

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setError("Session invalide.");
        setEvents([]);
        setStudents([]);
        setLoading(false);
        return;
      }

      const response = await fetch(
        `/api/coach/events?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(getErrorMessage(payload, "Chargement du calendrier impossible."));
        setEvents([]);
        setStudents([]);
        setLoading(false);
        return;
      }

      const parsed = CoachEventsResponseSchema.safeParse(payload);
      if (!parsed.success) {
        setError("Reponse calendrier invalide.");
        setEvents([]);
        setStudents([]);
        setLoading(false);
        return;
      }

      setEvents(sortEvents(parsed.data.events));
      setStudents(parsed.data.students);
      setLoading(false);
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    Promise.resolve().then(() => {
      if (cancelled) return;
      void loadMonthEvents(monthDate);
    });

    return () => {
      cancelled = true;
    };
  }, [loadMonthEvents, monthDate]);

  const moveMonth = (offset: number) => {
    const nextMonth = addMonths(monthDate, offset);
    setMonthDate(nextMonth);
    setSelectedDate(startOfMonth(nextMonth));
  };

  const jumpToToday = () => {
    const today = startOfDay(new Date());
    setSelectedDate(today);
    setMonthDate(startOfMonth(today));
    setAgendaExpanded(false);
  };

  const onDaySelect = (day: Date) => {
    setSelectedDate(startOfDay(day));
    setAgendaExpanded(false);
    if (!isSameMonth(day, monthDate)) {
      setMonthDate(startOfMonth(day));
    }
  };

  const toggleType = (type: StudentEvent["type"]) => {
    setActiveTypes((current) => {
      if (current.includes(type)) {
        if (current.length === 1) return current;
        return EVENT_TYPE_DISPLAY_ORDER.filter(
          (eventType) => eventType !== type && current.includes(eventType)
        );
      }
      return EVENT_TYPE_DISPLAY_ORDER.filter(
        (eventType) => eventType === type || current.includes(eventType)
      );
    });
  };

  const resetTypes = () => {
    setActiveTypes(EVENT_TYPE_DISPLAY_ORDER);
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    touchStartXRef.current = event.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    if (startX === null) return;

    const endX = event.changedTouches[0]?.clientX ?? startX;
    const deltaX = endX - startX;
    if (Math.abs(deltaX) < 50) return;
    moveMonth(deltaX < 0 ? 1 : -1);
  };

  return (
    <section className="space-y-5">
      <div className="px-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[var(--text)] shadow-[0_8px_18px_rgba(0,0,0,0.16)] transition hover:scale-[1.03] hover:bg-white/20"
              aria-label="Mois precedent"
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
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => moveMonth(1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[var(--text)] shadow-[0_8px_18px_rgba(0,0,0,0.16)] transition hover:scale-[1.03] hover:bg-white/20"
              aria-label="Mois suivant"
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
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>

          <p className="text-sm font-semibold capitalize text-[var(--text)]">
            {formatMonthLabel(monthDate, locale)}
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={jumpToToday}
              className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.16em] text-[var(--text)] transition hover:bg-white/20"
            >
              Aujourd hui
            </button>
            <select
              value={effectiveSelectedStudentId}
              onChange={(event) => setSelectedStudentId(event.target.value)}
              className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-[var(--text)]"
              aria-label="Filtrer par eleve"
            >
              <option value={ALL_STUDENTS_FILTER}>Tous les eleves</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {STUDENT_EVENT_TYPE_OPTIONS.map((option) => {
            const active = activeTypeSet.has(option.value);
            return (
              <button
                key={`filter-${option.value}`}
                type="button"
                onClick={() => toggleType(option.value)}
                aria-pressed={active}
                className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.12em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/50 ${
                  active
                    ? `${STUDENT_EVENT_TYPE_THEME[option.value].chipClass} shadow-[0_10px_16px_rgba(0,0,0,0.12)]`
                    : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-[var(--muted)] dark:hover:bg-white/10"
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${STUDENT_EVENT_TYPE_THEME[option.value].dotClass}`}
                />
                <span
                  className="!text-[var(--text)]"
                >
                  {option.label}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={resetTypes}
            disabled={activeTypes.length === EVENT_TYPE_DISPLAY_ORDER.length}
            className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.16em] text-[var(--text)] transition hover:bg-white/20 disabled:cursor-default disabled:opacity-50"
          >
            Tous les types
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <div
        className="relative w-full overflow-hidden rounded-3xl border border-white/15 bg-white/5 p-3 shadow-[0_12px_28px_rgba(15,23,42,0.08)] dark:shadow-[0_24px_48px_rgba(0,0,0,0.18)]"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-14 -right-8 h-44 w-44 rounded-full bg-emerald-300/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-sky-300/20 blur-3xl"
        />

        <AnimatePresence mode="wait">
          <motion.div
            key={monthKey}
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="grid grid-cols-7 gap-1 pb-2">
              {WEEKDAY_LABELS.map((label, index) => (
                <p
                  key={`${label}-${index}`}
                  className="text-center text-[0.65rem] uppercase tracking-[0.2em] text-[var(--muted)]"
                >
                  {label}
                </p>
              ))}
            </div>

            <div className="space-y-1">
              {monthGrid.map((week, weekIndex) => (
                <div key={`week-${weekIndex}`} className="grid grid-cols-7 gap-1">
                  {week.map((day) => {
                    const dayKey = toDateKey(day);
                    const isCurrentMonth = isSameMonth(day, monthDate);
                    const isSelected = isSameDay(day, selectedDate);
                    const types = eventsByDayTypes.get(dayKey) ?? [];

                    return (
                      <motion.button
                        key={dayKey}
                        type="button"
                        onClick={() => onDaySelect(day)}
                        whileTap={reducedMotion ? undefined : { scale: 0.97 }}
                        className={`relative rounded-xl px-1 py-2 text-center text-sm transition md:h-11 md:px-0 md:py-0 md:flex md:items-center md:justify-center ${
                        isSelected
                          ? "bg-gradient-to-br from-emerald-200/80 to-sky-200/80 text-slate-900 shadow-[0_10px_22px_rgba(16,185,129,0.25)] dark:from-emerald-300/35 dark:to-sky-300/35 dark:text-[var(--text)]"
                          : isCurrentMonth
                              ? "text-[var(--text)] hover:bg-white/10"
                              : "text-[var(--muted)]/70 hover:bg-white/5"
                        }`}
                      >
                        <span>{day.getDate()}</span>
                        {types.length > 0 ? (
                          <span className="absolute inset-x-0 bottom-1 flex justify-center">
                            <span className="inline-flex items-center gap-1">
                              {types.slice(0, 3).map((type) => (
                                <span
                                  key={`${dayKey}-dot-${type}`}
                                  className={`h-1.5 w-1.5 rounded-full ${STUDENT_EVENT_TYPE_THEME[type].dotClass}`}
                                />
                              ))}
                            </span>
                          </span>
                        ) : null}
                      </motion.button>
                    );
                  })}
                </div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="relative mt-4 border-t border-white/10 pt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[var(--text)]">
            {formatDayLabel(selectedDate, locale, timezone)}
          </p>
          {loading ? (
            <span className="text-xs uppercase tracking-wide text-[var(--muted)]">Chargement...</span>
          ) : null}
        </div>

        <div className="mt-4 space-y-2">
          {!loading && selectedDayGroups.length === 0 ? (
            <div className="rounded-2xl border border-white/15 bg-white/5 px-3 py-3 text-sm text-[var(--muted)]">
              Aucun evenement sur ce jour.
            </div>
          ) : null}

          {selectedDayGroups.map((event) => {
            const theme = STUDENT_EVENT_TYPE_THEME[event.type];
            return (
              <motion.button
                key={event.key}
                type="button"
                onClick={() => setDetailEvent(event)}
                whileHover={reducedMotion ? undefined : { y: -2, scale: 1.01 }}
                whileTap={reducedMotion ? undefined : { scale: 0.99 }}
                className={`group relative w-full overflow-hidden rounded-2xl border ${theme.borderClass} bg-[var(--panel-strong)] px-3 py-3 text-left transition`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${theme.glowClass}`}
                />
                <div className="relative flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 inline-flex h-10 w-1 shrink-0 rounded-full ${theme.barClass}`}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-[var(--text)]">
                        {event.title}
                      </p>
                      <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
                        Voir
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.18em] !text-[var(--text)] ${theme.chipClass}`}
                      >
                        {EVENT_TYPE_LABEL_MAP[event.type]}
                      </span>
                      <p className="text-xs text-[var(--muted)]">
                        {formatEventSchedule(event, locale, timezone)}
                      </p>
                    </div>

                    {event.location ? (
                      <p className="mt-1 text-xs text-[var(--muted)]">{event.location}</p>
                    ) : null}

                    <div className="mt-2 flex items-center gap-2">
                      <AvatarStack participants={event.participants} maxVisible={6} />
                      <p className="text-xs text-[var(--muted)]">
                        {event.participants.length} eleve
                        {event.participants.length > 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        <div className="mt-4 border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={() => setAgendaExpanded((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.16em] text-[var(--text)] transition hover:bg-white/20"
            aria-expanded={agendaExpanded}
            aria-controls="coach-extended-agenda"
          >
            {agendaExpanded ? "Masquer agenda 7 jours" : "Voir agenda 7 jours"}
          </button>
        </div>

        <AnimatePresence initial={false}>
          {agendaExpanded ? (
            <motion.div
              id="coach-extended-agenda"
              initial={reducedMotion ? { opacity: 1, height: "auto" } : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={reducedMotion ? { opacity: 1, height: "auto" } : { opacity: 0, height: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.28, ease: "easeOut" }}
              className="mt-4 overflow-hidden"
            >
              <p className="mb-3 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                Prochains jours
              </p>
              <div className="space-y-3">
                {extendedTimelineItems.map((item, index) => (
                  <motion.div
                    key={toDateKey(item.date)}
                    initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.24, delay: reducedMotion ? 0 : index * 0.03 }}
                    className="grid grid-cols-[92px_minmax(0,1fr)] gap-3"
                  >
                    <TimelineDayColumn
                      date={item.date}
                      locale={locale}
                      timezone={timezone}
                      selected={isSameDay(item.date, selectedDate)}
                      onClick={() => onDaySelect(item.date)}
                    />

                    <div className="space-y-2">
                      {!loading && item.events.length === 0 ? (
                        <div className="rounded-2xl border border-white/15 bg-white/5 px-3 py-3 text-sm text-[var(--muted)]">
                          Aucun evenement.
                        </div>
                      ) : null}

                      {item.events.map((event) => {
                        const theme = STUDENT_EVENT_TYPE_THEME[event.type];
                        return (
                          <motion.button
                            key={`${item.date.toISOString()}-${event.key}`}
                            type="button"
                            onClick={() => setDetailEvent(event)}
                            whileHover={reducedMotion ? undefined : { y: -2, scale: 1.01 }}
                            whileTap={reducedMotion ? undefined : { scale: 0.99 }}
                            className={`group relative w-full overflow-hidden rounded-2xl border ${theme.borderClass} bg-[var(--panel-strong)] px-3 py-3 text-left transition`}
                          >
                            <span
                              aria-hidden="true"
                              className={`pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${theme.glowClass}`}
                            />
                            <div className="relative flex items-start gap-3">
                              <span
                                aria-hidden="true"
                                className={`mt-0.5 inline-flex h-10 w-1 shrink-0 rounded-full ${theme.barClass}`}
                              />

                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                  <p className="truncate text-sm font-semibold text-[var(--text)]">
                                    {event.title}
                                  </p>
                                  <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
                                    Voir
                                  </span>
                                </div>

                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <span
                                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.18em] !text-[var(--text)] ${theme.chipClass}`}
                                  >
                                    {EVENT_TYPE_LABEL_MAP[event.type]}
                                  </span>
                                  <p className="text-xs text-[var(--muted)]">
                                    {formatEventSchedule(event, locale, timezone)}
                                  </p>
                                </div>

                                {event.location ? (
                                  <p className="mt-1 text-xs text-[var(--muted)]">{event.location}</p>
                                ) : null}

                                <div className="mt-2 flex items-center gap-2">
                                  <AvatarStack participants={event.participants} maxVisible={6} />
                                  <p className="text-xs text-[var(--muted)]">
                                    {event.participants.length} eleve
                                    {event.participants.length > 1 ? "s" : ""}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <CoachEventDrawer
        open={detailEvent !== null}
        event={detailEvent}
        locale={locale}
        timezone={timezone}
        onClose={() => setDetailEvent(null)}
      />
    </section>
  );
}
