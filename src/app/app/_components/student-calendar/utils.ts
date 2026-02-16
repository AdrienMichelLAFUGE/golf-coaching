import { addDays, startOfDay } from "./date-utils";
import type { StudentEvent } from "./types";

export type CalendarEventParticipant = {
  studentId: string;
  name: string;
  avatarUrl: string | null;
};

export type CoachCalendarEvent = StudentEvent & {
  studentName: string;
  studentAvatarUrl: string | null;
};

export type CoachGroupedTimelineEvent = {
  key: string;
  title: string;
  type: StudentEvent["type"];
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  participants: CalendarEventParticipant[];
};

export const buildTimelineDates = (selectedDate: Date, days = 7) => {
  const safeDays = Number.isFinite(days) ? Math.max(1, Math.floor(days)) : 7;
  const start = startOfDay(selectedDate);
  return Array.from({ length: safeDays }, (_, index) => startOfDay(addDays(start, index)));
};

export const getInitials = (value: string) => {
  const tokens = value
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);

  if (tokens.length === 0) return "??";
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return `${tokens[0][0] ?? ""}${tokens[1][0] ?? ""}`.toUpperCase();
};

const buildCoachEventGroupKey = (event: CoachCalendarEvent) =>
  [
    event.type,
    event.title.trim().toLowerCase(),
    event.startAt,
    event.endAt ?? "",
    event.allDay ? "all-day" : "timed",
    event.location?.trim().toLowerCase() ?? "",
  ].join("|");

export const groupCoachEvents = (events: CoachCalendarEvent[]) => {
  const groups = new Map<string, CoachGroupedTimelineEvent>();

  events.forEach((event) => {
    const key = buildCoachEventGroupKey(event);
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        key,
        title: event.title,
        type: event.type,
        startAt: event.startAt,
        endAt: event.endAt,
        allDay: event.allDay,
        location: event.location,
        notes: event.notes,
        participants: [
          {
            studentId: event.studentId,
            name: event.studentName,
            avatarUrl: event.studentAvatarUrl,
          },
        ],
      });
      return;
    }

    const participantExists = existing.participants.some(
      (participant) => participant.studentId === event.studentId
    );
    if (participantExists) return;

    existing.participants.push({
      studentId: event.studentId,
      name: event.studentName,
      avatarUrl: event.studentAvatarUrl,
    });
  });

  return Array.from(groups.values())
    .map((event) => ({
      ...event,
      participants: [...event.participants].sort((a, b) =>
        a.name.localeCompare(b.name, "fr")
      ),
    }))
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
};
