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
import EventSheet from "./EventSheet";
import EventResultsModal from "./EventResultsModal";
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
import { buildTimelineDates } from "./utils";
import type {
  EventSheetMode,
  EventUpsertInput,
  StudentCalendarMode,
  StudentEvent,
  StudentEventRoundResult,
} from "./types";
import { STUDENT_EVENT_TYPE_OPTIONS, STUDENT_EVENT_TYPE_THEME } from "./types";

const StudentEventSchema = z.object({
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
});

const EventsListResponseSchema = z.object({
  events: z.array(StudentEventSchema),
});

const EventsHistoryResponseSchema = z.object({
  events: z.array(StudentEventSchema),
  nextCursor: z.string().datetime({ offset: true }).nullable().optional(),
  hasMore: z.boolean().optional(),
});

const EventMutationResponseSchema = z.object({
  event: StudentEventSchema,
});

const ErrorResponseSchema = z.object({
  error: z.string().optional(),
  event: StudentEventSchema.optional(),
});

type StudentCalendarProps = {
  studentId: string;
  mode: StudentCalendarMode;
  editable?: boolean;
  locale?: string;
  timezone?: string;
};

const WEEKDAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];

const EVENT_TYPE_LABEL_MAP = Object.fromEntries(
  STUDENT_EVENT_TYPE_OPTIONS.map((option) => [option.value, option.label])
) as Record<StudentEvent["type"], string>;

const EVENT_TYPE_DISPLAY_ORDER: StudentEvent["type"][] = [
  "tournament",
  "competition",
  "training",
  "other",
];

const isCompetitionEvent = (event: StudentEvent) =>
  event.type === "tournament" || event.type === "competition";

const getFinalPlace = (event: StudentEvent) => {
  const placeRounds = event.resultsRounds.filter((round) => round.place !== null);
  if (placeRounds.length === 0) return null;
  const latest = [...placeRounds].sort((a, b) => b.round - a.round)[0];
  return latest?.place ?? null;
};

const getPlaceMedal = (place: number | null) => {
  if (place === null) return null;
  if (place === 1) return "🥇";
  if (place === 2) return "🥈";
  if (place === 3) return "🥉";
  if (place <= 10) return "🎖";
  return "🏅";
};

const getFilledRoundsCount = (event: StudentEvent) =>
  event.resultsRounds.filter((round) => round.score !== null || round.place !== null).length;

const sortEvents = (events: StudentEvent[]) =>
  [...events].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

const sortEventsDesc = (events: StudentEvent[]) =>
  [...events].sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt));

const eventOccursOnDay = (event: StudentEvent, day: Date) => {
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

const formatEventSchedule = (event: StudentEvent, locale: string, timezone?: string) => {
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

export default function StudentCalendar({
  studentId,
  mode,
  editable = false,
  locale = "fr-FR",
  timezone,
}: StudentCalendarProps) {
  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [events, setEvents] = useState<StudentEvent[]>([]);
  const [activeTypes, setActiveTypes] =
    useState<StudentEvent["type"][]>(EVENT_TYPE_DISPLAY_ORDER);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(
    null
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<EventSheetMode>("create");
  const [sheetEvent, setSheetEvent] = useState<StudentEvent | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sheetError, setSheetError] = useState("");
  const [resultsEvent, setResultsEvent] = useState<StudentEvent | null>(null);
  const [resultsSaving, setResultsSaving] = useState(false);
  const [resultsError, setResultsError] = useState("");
  const [agendaExpanded, setAgendaExpanded] = useState(false);
  const [historyEvents, setHistoryEvents] = useState<StudentEvent[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyInitialized, setHistoryInitialized] = useState(false);
  const [isCalendarSectionInView, setIsCalendarSectionInView] = useState(false);

  const calendarSectionRef = useRef<HTMLElement | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const canEdit = mode === "student" || editable;
  const isParentReadOnly = mode === "parent";
  const reducedMotion = useReducedMotion();

  const monthGrid = useMemo(() => buildMonthGrid(monthDate), [monthDate]);
  const monthKey = `${monthDate.getFullYear()}-${monthDate.getMonth()}`;

  const activeTypeSet = useMemo(() => new Set(activeTypes), [activeTypes]);
  const filteredEvents = useMemo(
    () => events.filter((event) => activeTypeSet.has(event.type)),
    [events, activeTypeSet]
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
  const eventsByDayBestPlace = useMemo(() => {
    const dayBestPlace = new Map<string, number>();

    filteredEvents.forEach((event) => {
      if (!isCompetitionEvent(event) || !event.resultsEnabled) return;

      const finalPlace = getFinalPlace(event);
      if (finalPlace === null) return;

      const start = startOfDay(new Date(event.startAt));
      const end = startOfDay(new Date(event.endAt ?? event.startAt));

      for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        const key = toDateKey(cursor);
        const currentBest = dayBestPlace.get(key);
        if (currentBest === undefined || finalPlace < currentBest) {
          dayBestPlace.set(key, finalPlace);
        }
      }
    });

    return dayBestPlace;
  }, [filteredEvents]);

  const timelineDates = useMemo(() => buildTimelineDates(selectedDate, 7), [selectedDate]);
  const selectedDayEvents = useMemo(
    () => sortEvents(filteredEvents.filter((event) => eventOccursOnDay(event, selectedDate))),
    [filteredEvents, selectedDate]
  );
  const extendedTimelineItems = useMemo(
    () =>
      timelineDates.slice(1).map((date) => ({
        date,
        events: sortEvents(filteredEvents.filter((event) => eventOccursOnDay(event, date))),
      })),
    [filteredEvents, timelineDates]
  );
  const seasonResultEvents = useMemo(
    () =>
      sortEvents(
        events.filter(
          (event) => isCompetitionEvent(event) && event.resultsEnabled && event.resultsRounds.length > 0
        )
      ),
    [events]
  );
  const seasonSummary = useMemo(() => {
    if (seasonResultEvents.length === 0) {
      return {
        playedEvents: 0,
        podiums: 0,
        bestPlace: null as number | null,
      };
    }

    const finalPlaces = seasonResultEvents
      .map((event) => getFinalPlace(event))
      .filter((place): place is number => place !== null);
    const bestPlace = finalPlaces.length > 0 ? Math.min(...finalPlaces) : null;
    const podiums = finalPlaces.filter((place) => place <= 3).length;

    return {
      playedEvents: seasonResultEvents.length,
      podiums,
      bestPlace,
    };
  }, [seasonResultEvents]);

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
        setLoading(false);
        return;
      }

      const response = await fetch(
        `/api/students/${studentId}/events?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(getErrorMessage(payload, "Chargement du calendrier impossible."));
        setEvents([]);
        setLoading(false);
        return;
      }

      const parsed = EventsListResponseSchema.safeParse(payload);
      if (!parsed.success) {
        setError("Reponse calendrier invalide.");
        setEvents([]);
        setLoading(false);
        return;
      }

      setEvents(sortEvents(parsed.data.events));
      setLoading(false);
    },
    [studentId]
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

  const closeSheet = () => {
    setSheetOpen(false);
    setSheetError("");
  };

  const closeResultsModal = () => {
    setResultsEvent(null);
    setResultsError("");
  };

  const openCreateSheet = () => {
    if (!canEdit) return;
    setSheetMode("create");
    setSheetEvent(null);
    setSheetError("");
    setSheetOpen(true);
  };

  const openEventSheet = (event: StudentEvent) => {
    setSheetMode(canEdit ? "edit" : "view");
    setSheetEvent(event);
    setSheetError("");
    setSheetOpen(true);
  };

  const openResultsModal = (event: StudentEvent) => {
    setResultsEvent(event);
    setResultsError("");
  };

  const handleOpenResultsFromSheet = (event: StudentEvent) => {
    closeSheet();
    openResultsModal(event);
  };

  const withAuthHeaders = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return null;
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }, []);

  const loadHistoryEvents = useCallback(
    async ({ cursor, append }: { cursor: string | null; append: boolean }) => {
      if (historyLoading) return;

      setHistoryLoading(true);
      setHistoryError("");
      setHistoryInitialized(true);

      const headers = await withAuthHeaders();
      if (!headers) {
        setHistoryError("Session invalide.");
        setHistoryLoading(false);
        return;
      }

      const query = new URLSearchParams({ limit: "24" });
      if (cursor) {
        query.set("cursor", cursor);
      }

      const response = await fetch(`/api/students/${studentId}/events/history?${query.toString()}`, {
        headers: { Authorization: headers.Authorization },
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setHistoryError(getErrorMessage(payload, "Chargement historique impossible."));
        setHistoryLoading(false);
        return;
      }

      const parsed = EventsHistoryResponseSchema.safeParse(payload);
      if (!parsed.success) {
        setHistoryError("Reponse historique invalide.");
        setHistoryLoading(false);
        return;
      }

      const incoming = sortEventsDesc(parsed.data.events);
      const nextCursor = parsed.data.nextCursor ?? null;
      const hasMore = Boolean(parsed.data.hasMore && nextCursor);

      setHistoryEvents((current) => {
        const merged = new Map<string, StudentEvent>();
        const base = append ? current : [];
        [...base, ...incoming].forEach((event) => {
          merged.set(event.id, event);
        });
        return sortEventsDesc(Array.from(merged.values()));
      });
      setHistoryCursor(nextCursor);
      setHistoryHasMore(hasMore);
      setHistoryLoading(false);
    },
    [historyLoading, studentId, withAuthHeaders]
  );

  useEffect(() => {
    let cancelled = false;

    Promise.resolve().then(() => {
      if (cancelled || historyInitialized || historyLoading) return;
      void loadHistoryEvents({ cursor: null, append: false });
    });

    return () => {
      cancelled = true;
    };
  }, [historyInitialized, historyLoading, loadHistoryEvents]);

  useEffect(() => {
    if (!canEdit) return;

    const section = calendarSectionRef.current;
    if (!section || typeof window === "undefined") return;
    if (typeof window.IntersectionObserver === "undefined") return;

    const observer = new window.IntersectionObserver(
      ([entry]) => {
        setIsCalendarSectionInView(entry.isIntersecting);
      },
      {
        threshold: [0.12, 0.3],
        rootMargin: "-8% 0px -8% 0px",
      }
    );

    observer.observe(section);

    return () => {
      observer.disconnect();
    };
  }, [canEdit]);

  const handleSaveEvent = async (input: EventUpsertInput) => {
    if (!canEdit) return;
    setSaving(true);
    setSheetError("");

    const headers = await withAuthHeaders();
    if (!headers) {
      setSheetError("Session invalide.");
      setSaving(false);
      return;
    }

    if (sheetMode === "create") {
      const response = await fetch(`/api/students/${studentId}/events`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: input.title,
          type: input.type,
          startAt: input.startAt,
          endAt: input.endAt,
          allDay: input.allDay,
          location: input.location,
          notes: input.notes,
          resultsEnabled: input.resultsEnabled,
          resultsRoundsPlanned: input.resultsRoundsPlanned,
          resultsRounds: input.resultsRounds,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSheetError(getErrorMessage(payload, "Creation impossible."));
        setSaving(false);
        return;
      }

      const parsed = EventMutationResponseSchema.safeParse(payload);
      if (!parsed.success) {
        setSheetError("Reponse creation invalide.");
        setSaving(false);
        return;
      }

      setEvents((prev) => sortEvents([...prev, parsed.data.event]));
      setNotice({ tone: "success", message: "Evenement cree." });
      void loadHistoryEvents({ cursor: null, append: false });
      setSaving(false);
      closeSheet();
      return;
    }

    if (!sheetEvent) {
      setSheetError("Evenement introuvable.");
      setSaving(false);
      return;
    }

    const response = await fetch(`/api/events/${sheetEvent.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        title: input.title,
        type: input.type,
        startAt: input.startAt,
        endAt: input.endAt,
        allDay: input.allDay,
        location: input.location,
        notes: input.notes,
        resultsEnabled: input.resultsEnabled,
        resultsRoundsPlanned: input.resultsRoundsPlanned,
        resultsRounds: input.resultsRounds,
        version: input.version ?? sheetEvent.version,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (response.status === 409) {
      const parsed = ErrorResponseSchema.safeParse(payload);
      if (parsed.success && parsed.data.event) {
        setEvents((prev) =>
          sortEvents(
            prev.map((item) => (item.id === parsed.data.event?.id ? parsed.data.event : item))
          )
        );
        setSheetEvent(parsed.data.event);
      }
      setSheetError("Conflit de version. Recharge les donnees et reessaie.");
      setSaving(false);
      return;
    }

    if (!response.ok) {
      setSheetError(getErrorMessage(payload, "Mise a jour impossible."));
      setSaving(false);
      return;
    }

    const parsed = EventMutationResponseSchema.safeParse(payload);
    if (!parsed.success) {
      setSheetError("Reponse mise a jour invalide.");
      setSaving(false);
      return;
    }

    setEvents((prev) =>
      sortEvents(prev.map((item) => (item.id === parsed.data.event.id ? parsed.data.event : item)))
    );
    setNotice({ tone: "success", message: "Evenement mis a jour." });
    void loadHistoryEvents({ cursor: null, append: false });
    setSaving(false);
    closeSheet();
  };

  const handleDeleteEvent = async (event: StudentEvent) => {
    if (!canEdit) return;
    setDeleting(true);
    setSheetError("");

    const headers = await withAuthHeaders();
    if (!headers) {
      setSheetError("Session invalide.");
      setDeleting(false);
      return;
    }

    const response = await fetch(`/api/events/${event.id}`, {
      method: "DELETE",
      headers,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setSheetError(getErrorMessage(payload, "Suppression impossible."));
      setDeleting(false);
      return;
    }

    setEvents((prev) => prev.filter((item) => item.id !== event.id));
    setNotice({ tone: "success", message: "Evenement supprime." });
    void loadHistoryEvents({ cursor: null, append: false });
    setDeleting(false);
    closeSheet();
  };

  const handleSaveEventResults = async (
    event: StudentEvent,
    rounds: StudentEventRoundResult[]
  ) => {
    if (!canEdit) return;
    if (!event.resultsEnabled || event.resultsRoundsPlanned === null) {
      setResultsError("Activez le suivi resultat et configurez le nombre de tours.");
      return;
    }

    setResultsSaving(true);
    setResultsError("");

    const headers = await withAuthHeaders();
    if (!headers) {
      setResultsError("Session invalide.");
      setResultsSaving(false);
      return;
    }

    const response = await fetch(`/api/events/${event.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        type: event.type,
        resultsEnabled: event.resultsEnabled,
        resultsRoundsPlanned: event.resultsRoundsPlanned,
        resultsRounds: rounds,
        version: event.version,
      }),
    });

    const payload = await response.json().catch(() => ({}));

    if (response.status === 409) {
      const parsed = ErrorResponseSchema.safeParse(payload);
      if (parsed.success && parsed.data.event) {
        setEvents((prev) =>
          sortEvents(
            prev.map((item) => (item.id === parsed.data.event?.id ? parsed.data.event : item))
          )
        );
        setResultsEvent(parsed.data.event);
      }
      setResultsError("Conflit de version. Recharge les donnees et reessaie.");
      setResultsSaving(false);
      return;
    }

    if (!response.ok) {
      setResultsError(getErrorMessage(payload, "Mise a jour des resultats impossible."));
      setResultsSaving(false);
      return;
    }

    const parsed = EventMutationResponseSchema.safeParse(payload);
    if (!parsed.success) {
      setResultsError("Reponse mise a jour invalide.");
      setResultsSaving(false);
      return;
    }

    setEvents((prev) =>
      sortEvents(prev.map((item) => (item.id === parsed.data.event.id ? parsed.data.event : item)))
    );
    setSheetEvent((current) => (current?.id === parsed.data.event.id ? parsed.data.event : current));
    setResultsEvent(parsed.data.event);
    setNotice({ tone: "success", message: "Resultats enregistres." });
    void loadHistoryEvents({ cursor: null, append: false });
    setResultsSaving(false);
    closeResultsModal();
  };

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

  const renderEventResultsBadge = (event: StudentEvent) => {
    if (!event.resultsEnabled) return null;
    const planned = event.resultsRoundsPlanned ?? 0;
    if (planned <= 0) return null;

    const filled = getFilledRoundsCount(event);
    const finalPlace = getFinalPlace(event);
    const medal = getPlaceMedal(finalPlace);
    const resultLabel =
      finalPlace !== null
        ? `${medal ?? ""} P${finalPlace}`
        : `${filled}/${planned} tour${planned > 1 ? "s" : ""}`;

    return (
      <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.16em] text-[var(--text)]">
        {resultLabel}
      </span>
    );
  };

  const showStickyCreateButton = (canEdit || isParentReadOnly) && isCalendarSectionInView;

  return (
    <section ref={calendarSectionRef} className="space-y-5">
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

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {STUDENT_EVENT_TYPE_OPTIONS.map((option) => {
            const active = activeTypeSet.has(option.value);
            return (
              <button
                key={`legend-${option.value}`}
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
        </div>
      </div>

      {notice ? (
        <p
          className={`text-sm ${
            notice.tone === "success" ? "text-emerald-600 dark:text-emerald-200" : "text-red-300"
          }`}
        >
          {notice.message}
        </p>
      ) : null}
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
                    const bestPlace = eventsByDayBestPlace.get(dayKey) ?? null;
                    const medal = getPlaceMedal(bestPlace);

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
                        {medal ? (
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute right-0.5 top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-slate-300/80 bg-transparent px-1 py-0.5 text-[0.65rem] leading-none dark:border-white/25 md:right-1 md:top-1 md:h-6 md:min-w-6 md:px-1.5 md:text-[0.9rem]"
                          >
                            {medal}
                          </span>
                        ) : null}
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

      {canEdit || isParentReadOnly ? (
        <div className="mt-3 hidden lg:flex justify-end">
          <button
            type="button"
            onClick={openCreateSheet}
            disabled={!canEdit}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 shadow-[0_10px_22px_rgba(0,0,0,0.18)] transition ${
              canEdit
                ? "bg-white/10 text-[var(--text)] hover:scale-[1.03] hover:bg-white/20"
                : "cursor-not-allowed bg-white/5 text-[var(--muted)] opacity-60"
            }`}
            aria-label="Ajouter un evenement"
            title={canEdit ? "Ajouter un evenement" : "Lecture seule (parent)"}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </button>
        </div>
      ) : null}

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
          {!loading && selectedDayEvents.length === 0 ? (
            <div className="rounded-2xl border border-white/15 bg-white/5 px-3 py-3 text-sm text-[var(--muted)]">
              Aucun evenement sur ce jour.
            </div>
          ) : null}

          {selectedDayEvents.map((event) => {
            const theme = STUDENT_EVENT_TYPE_THEME[event.type];
            return (
              <motion.button
                key={event.id}
                type="button"
                onClick={() => openEventSheet(event)}
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
                        {canEdit ? "Editer" : "Voir"}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.18em] !text-[var(--text)] ${theme.chipClass}`}
                      >
                        {EVENT_TYPE_LABEL_MAP[event.type]}
                      </span>
                      {renderEventResultsBadge(event)}
                      <p className="text-xs text-[var(--muted)]">
                        {formatEventSchedule(event, locale, timezone)}
                      </p>
                    </div>
                    {event.location ? (
                      <p className="mt-1 text-xs text-[var(--muted)]">{event.location}</p>
                    ) : null}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        <div className="mt-4 rounded-2xl border border-white/15 bg-white/5 p-3">
          <p className="text-[0.65rem] uppercase tracking-[0.2em] text-[var(--muted)]">
            Suivi saison (periode affichee)
          </p>
          {seasonSummary.playedEvents === 0 ? (
            <p className="mt-2 text-sm text-[var(--muted)]">
              Aucun resultat enregistre sur la periode.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.16em] text-[var(--text)]">
                Tournois joues: {seasonSummary.playedEvents}
              </span>
              <span className="inline-flex rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.16em] text-[var(--text)]">
                Podiums: {seasonSummary.podiums}
              </span>
              <span className="inline-flex rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.16em] text-[var(--text)]">
                Meilleure place:{" "}
                {seasonSummary.bestPlace !== null
                  ? `${getPlaceMedal(seasonSummary.bestPlace) ?? ""} P${seasonSummary.bestPlace}`
                  : "-"}
              </span>
            </div>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-white/15 bg-white/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[0.65rem] uppercase tracking-[0.2em] text-[var(--muted)]">
              Historique tournois
            </p>
            <button
              type="button"
              onClick={() => void loadHistoryEvents({ cursor: null, append: false })}
              disabled={historyLoading}
              className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[0.6rem] uppercase tracking-[0.16em] text-[var(--text)] transition hover:bg-white/20 disabled:cursor-default disabled:opacity-60"
            >
              {historyLoading ? "Chargement..." : "Actualiser"}
            </button>
          </div>

          {historyError ? <p className="mt-2 text-xs text-red-300">{historyError}</p> : null}

          {!historyLoading && historyEvents.length === 0 && !historyError ? (
            <p className="mt-2 text-sm text-[var(--muted)]">Aucun resultat tournoi enregistre.</p>
          ) : null}

          {historyEvents.length > 0 ? (
            <div className="mt-3 space-y-2">
              {historyEvents.map((event) => {
                const finalPlace = getFinalPlace(event);
                const medal = getPlaceMedal(finalPlace);
                const rounds = [...event.resultsRounds].sort((a, b) => a.round - b.round);
                return (
                  <div
                    key={`history-${event.id}`}
                    className="rounded-2xl border border-white/10 bg-[var(--panel-strong)] px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--text)]">{event.title}</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {formatEventSchedule(event, locale, timezone)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {finalPlace !== null ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.16em] text-[var(--text)]">
                            <span aria-hidden="true">{medal ?? ""}</span>P{finalPlace}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                            En cours
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => openEventSheet(event)}
                          className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.16em] text-[var(--text)] transition hover:bg-white/20"
                        >
                          Voir
                        </button>
                      </div>
                    </div>

                    {rounds.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {rounds.map((round) => (
                          <span
                            key={`history-round-${event.id}-${round.round}`}
                            className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.62rem] text-[var(--muted)]"
                          >
                            T{round.round} • Brut {round.score ?? "-"} • P{round.place ?? "-"}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {historyHasMore ? (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => void loadHistoryEvents({ cursor: historyCursor, append: true })}
                disabled={historyLoading || !historyCursor}
                className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.16em] text-[var(--text)] transition hover:bg-white/20 disabled:cursor-default disabled:opacity-60"
              >
                {historyLoading ? "Chargement..." : "Charger plus"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="mt-4 border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={() => setAgendaExpanded((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.16em] text-[var(--text)] transition hover:bg-white/20"
            aria-expanded={agendaExpanded}
            aria-controls="student-extended-agenda"
          >
            {agendaExpanded ? "Masquer agenda 7 jours" : "Voir agenda 7 jours"}
          </button>
        </div>

        <AnimatePresence initial={false}>
          {agendaExpanded ? (
            <motion.div
              id="student-extended-agenda"
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
                            key={`${item.date.toISOString()}-${event.id}`}
                            type="button"
                            onClick={() => openEventSheet(event)}
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
                                    {canEdit ? "Editer" : "Voir"}
                                  </span>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <span
                                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.18em] !text-[var(--text)] ${theme.chipClass}`}
                                  >
                                    {EVENT_TYPE_LABEL_MAP[event.type]}
                                  </span>
                                  {renderEventResultsBadge(event)}
                                  <p className="text-xs text-[var(--muted)]">
                                    {formatEventSchedule(event, locale, timezone)}
                                  </p>
                                </div>
                                {event.location ? (
                                  <p className="mt-1 text-xs text-[var(--muted)]">{event.location}</p>
                                ) : null}
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

      {showStickyCreateButton ? (
        <button
          type="button"
          onClick={openCreateSheet}
          disabled={!canEdit}
          title={canEdit ? "Ajouter un evenement" : "Lecture seule (parent)"}
          className={`fixed bottom-6 left-6 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full shadow-[0_14px_30px_rgba(0,0,0,0.35)] transition lg:hidden ${
            canEdit
              ? "bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 text-zinc-900 hover:scale-[1.02]"
              : "cursor-not-allowed border border-white/20 bg-white/10 text-[var(--muted)] opacity-60"
          }`}
          aria-label="Ajouter un evenement"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </button>
      ) : null}

      <EventSheet
        open={sheetOpen}
        mode={sheetMode}
        canEdit={canEdit}
        initialEvent={sheetEvent}
        initialDate={selectedDate}
        saving={saving}
        deleting={deleting}
        errorMessage={sheetError}
        onClose={closeSheet}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
        onOpenResults={handleOpenResultsFromSheet}
      />

      <EventResultsModal
        open={resultsEvent !== null}
        event={resultsEvent}
        canEdit={canEdit}
        saving={resultsSaving}
        errorMessage={resultsError}
        onClose={closeResultsModal}
        onSave={handleSaveEventResults}
      />
    </section>
  );
}
