"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import AvatarStack from "./AvatarStack";
import { STUDENT_EVENT_TYPE_OPTIONS, STUDENT_EVENT_TYPE_THEME } from "./types";
import type { CoachGroupedTimelineEvent } from "./utils";

type CoachEventDrawerProps = {
  open: boolean;
  event: CoachGroupedTimelineEvent | null;
  locale?: string;
  timezone?: string;
  onClose: () => void;
};

const formatEventSchedule = (
  event: Pick<CoachGroupedTimelineEvent, "startAt" | "endAt" | "allDay">,
  locale: string,
  timezone?: string
) => {
  const start = new Date(event.startAt);
  const end = event.endAt ? new Date(event.endAt) : null;

  if (event.allDay) {
    if (!end) {
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

export default function CoachEventDrawer({
  open,
  event,
  locale = "fr-FR",
  timezone,
  onClose,
}: CoachEventDrawerProps) {
  const reducedMotion = useReducedMotion();
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const onChange = () => setIsDesktop(mediaQuery.matches);
    onChange();
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  const EVENT_TYPE_LABEL_MAP = Object.fromEntries(
    STUDENT_EVENT_TYPE_OPTIONS.map((option) => [option.value, option.label])
  ) as Record<CoachGroupedTimelineEvent["type"], string>;

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && event ? (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/65 backdrop-blur-[1px] md:justify-end"
          initial={reducedMotion ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reducedMotion ? { opacity: 1 } : { opacity: 0 }}
        >
          <button
            type="button"
            aria-label="Fermer le detail evenement"
            className="absolute inset-0"
            onClick={onClose}
          />

          <motion.aside
            initial={
              reducedMotion
                ? isDesktop
                  ? { x: 0 }
                  : { y: 0 }
                : isDesktop
                  ? { x: 420 }
                  : { y: 360 }
            }
            animate={isDesktop ? { x: 0 } : { y: 0 }}
            exit={
              reducedMotion
                ? isDesktop
                  ? { x: 0 }
                  : { y: 0 }
                : isDesktop
                  ? { x: 420 }
                  : { y: 360 }
            }
            transition={
              reducedMotion
                ? undefined
                : { type: "spring", stiffness: 360, damping: 34, mass: 0.8 }
            }
            className="relative z-10 w-full max-h-[85vh] overflow-y-auto rounded-t-3xl border border-white/20 bg-[var(--bg-elevated)] p-5 shadow-[0_0_60px_rgba(0,0,0,0.45)] md:h-full md:max-h-none md:max-w-md md:rounded-none md:border-y-0 md:border-r-0"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
                  Detail evenement
                </p>
                <h3 className="mt-2 text-xl font-semibold text-[var(--text)]">
                  {event.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[var(--text)] transition hover:bg-white/20"
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

            <div className="mt-5 space-y-4 text-sm text-[var(--muted)]">
              <div className="rounded-2xl border border-white/15 bg-white/5 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.18em] ${STUDENT_EVENT_TYPE_THEME[event.type].chipClass}`}
                  >
                    {EVENT_TYPE_LABEL_MAP[event.type]}
                  </span>
                  <p className="text-sm font-medium text-[var(--text)]">
                    {formatEventSchedule(event, locale, timezone)}
                  </p>
                </div>
              </div>

              {event.location ? (
                <div className="rounded-2xl border border-white/15 bg-white/5 p-3">
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-[var(--muted)]">
                    Lieu
                  </p>
                  <p className="mt-2 text-sm font-medium text-[var(--text)]">{event.location}</p>
                </div>
              ) : null}

              {event.notes ? (
                <div className="rounded-2xl border border-white/15 bg-white/5 p-3">
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-[var(--muted)]">
                    Notes
                  </p>
                  <p className="mt-2 whitespace-pre-line text-sm text-[var(--text)]">
                    {event.notes}
                  </p>
                </div>
              ) : null}

              <div className="rounded-2xl border border-white/15 bg-white/5 p-3">
                <p className="text-[0.65rem] uppercase tracking-[0.2em] text-[var(--muted)]">
                  Eleves concernes
                </p>
                <div className="mt-3">
                  <AvatarStack participants={event.participants} maxVisible={7} />
                </div>
                <ul className="mt-3 space-y-2">
                  {event.participants.map((participant) => (
                    <li key={`${event.key}-${participant.studentId}`}>
                      <Link
                        href={`/app/coach/eleves/${participant.studentId}`}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-[var(--text)] transition hover:border-white/30 hover:bg-white/10"
                      >
                        <span>{participant.name}</span>
                        <svg
                          viewBox="0 0 24 24"
                          className="h-3.5 w-3.5 text-[var(--muted)]"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M7 17L17 7" />
                          <path d="M9 7h8v8" />
                        </svg>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
