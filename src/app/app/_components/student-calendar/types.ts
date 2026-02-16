export type StudentCalendarMode = "student" | "coach";

export type StudentEventType = "tournament" | "competition" | "training" | "other";

export type StudentEventRoundResult = {
  round: number;
  score: number | null;
  place: number | null;
};

export type StudentEvent = {
  id: string;
  studentId: string;
  title: string;
  type: StudentEventType;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  resultsEnabled: boolean;
  resultsRoundsPlanned: number | null;
  resultsRounds: StudentEventRoundResult[];
};

export type EventSheetMode = "create" | "edit" | "view";

export type EventUpsertInput = {
  title: string;
  type: StudentEventType;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  resultsEnabled: boolean;
  resultsRoundsPlanned: number | null;
  resultsRounds: StudentEventRoundResult[];
  version?: number;
};

export const STUDENT_EVENT_TYPE_OPTIONS: Array<{
  value: StudentEventType;
  label: string;
}> = [
  { value: "tournament", label: "Tournoi" },
  { value: "competition", label: "Competition" },
  { value: "training", label: "Entrainement" },
  { value: "other", label: "Autre" },
];

export const STUDENT_EVENT_TYPE_THEME: Record<
  StudentEventType,
  {
    dotClass: string;
    chipClass: string;
    barClass: string;
    badgeBgClass: string;
    badgeTextClass: string;
    borderClass: string;
    glowClass: string;
  }
> = {
  tournament: {
    dotClass:
      "bg-amber-500 shadow-[0_0_0_2px_rgba(245,158,11,0.25)] dark:bg-amber-300 dark:shadow-[0_0_0_2px_rgba(251,191,36,0.24)]",
    chipClass:
      "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-300/60 dark:bg-amber-400/20 dark:text-amber-100",
    barClass:
      "bg-gradient-to-b from-amber-400 to-amber-600 dark:from-amber-300 dark:to-amber-500 shadow-[0_0_16px_rgba(245,158,11,0.38)]",
    badgeBgClass: "bg-amber-100 dark:bg-amber-400/25",
    badgeTextClass: "text-amber-900 dark:text-amber-100",
    borderClass: "border-amber-300/80 dark:border-amber-300/45",
    glowClass: "shadow-[0_14px_28px_rgba(245,158,11,0.2)]",
  },
  competition: {
    dotClass:
      "bg-sky-500 shadow-[0_0_0_2px_rgba(14,165,233,0.25)] dark:bg-sky-300 dark:shadow-[0_0_0_2px_rgba(56,189,248,0.24)]",
    chipClass:
      "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-300/60 dark:bg-sky-400/20 dark:text-sky-100",
    barClass:
      "bg-gradient-to-b from-sky-400 to-sky-600 dark:from-sky-300 dark:to-sky-500 shadow-[0_0_16px_rgba(14,165,233,0.38)]",
    badgeBgClass: "bg-sky-100 dark:bg-sky-400/25",
    badgeTextClass: "text-sky-900 dark:text-sky-100",
    borderClass: "border-sky-300/80 dark:border-sky-300/45",
    glowClass: "shadow-[0_14px_28px_rgba(14,165,233,0.2)]",
  },
  training: {
    dotClass:
      "bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.25)] dark:bg-emerald-300 dark:shadow-[0_0_0_2px_rgba(52,211,153,0.24)]",
    chipClass:
      "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-300/60 dark:bg-emerald-400/20 dark:text-emerald-100",
    barClass:
      "bg-gradient-to-b from-emerald-400 to-emerald-600 dark:from-emerald-300 dark:to-emerald-500 shadow-[0_0_16px_rgba(16,185,129,0.38)]",
    badgeBgClass: "bg-emerald-100 dark:bg-emerald-400/25",
    badgeTextClass: "text-emerald-900 dark:text-emerald-100",
    borderClass: "border-emerald-300/80 dark:border-emerald-300/45",
    glowClass: "shadow-[0_14px_28px_rgba(16,185,129,0.2)]",
  },
  other: {
    dotClass:
      "bg-slate-500 shadow-[0_0_0_2px_rgba(100,116,139,0.25)] dark:bg-slate-300 dark:shadow-[0_0_0_2px_rgba(148,163,184,0.24)]",
    chipClass:
      "border-slate-300 bg-slate-100 text-slate-900 dark:border-white/30 dark:bg-white/10 dark:text-[var(--text)]",
    barClass:
      "bg-gradient-to-b from-slate-400 to-slate-600 dark:from-slate-300 dark:to-slate-500 shadow-[0_0_14px_rgba(100,116,139,0.35)]",
    badgeBgClass: "bg-slate-100 dark:bg-white/10",
    badgeTextClass: "text-slate-900 dark:text-[var(--text)]",
    borderClass: "border-slate-300/80 dark:border-white/20",
    glowClass: "shadow-[0_14px_28px_rgba(100,116,139,0.18)]",
  },
};
