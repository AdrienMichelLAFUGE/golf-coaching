"use client";

type TimelineDayColumnProps = {
  date: Date;
  locale?: string;
  timezone?: string;
  selected?: boolean;
  onClick?: () => void;
};

export default function TimelineDayColumn({
  date,
  locale = "fr-FR",
  timezone,
  selected = false,
  onClick,
}: TimelineDayColumnProps) {
  const dayLabel = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(date);

  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "short",
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(date);

  const weekDayLabel = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(date);

  const content = (
    <span
      className={`inline-flex w-full flex-col rounded-2xl border px-3 py-2 text-left transition ${
        selected
          ? "border-sky-400/70 bg-gradient-to-b from-sky-300/30 to-sky-200/15 text-[var(--text)] shadow-[0_8px_16px_rgba(56,189,248,0.16)] dark:from-sky-400/25 dark:to-sky-300/10 dark:shadow-[0_12px_24px_rgba(56,189,248,0.25)]"
          : "border-white/15 bg-white/10 text-[var(--muted)]"
      }`}
    >
      <span className="text-xs uppercase tracking-[0.2em]">{monthLabel}</span>
      <span className="mt-1 text-lg font-semibold leading-none">{dayLabel}</span>
      <span className="mt-1 text-[0.65rem] uppercase tracking-[0.18em]">{weekDayLabel}</span>
    </span>
  );

  if (!onClick) {
    return content;
  }

  return (
    <button type="button" onClick={onClick} className="w-full text-left">
      {content}
    </button>
  );
}
