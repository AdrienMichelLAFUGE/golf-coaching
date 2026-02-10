"use client";

import type { ReactNode } from "react";

type PageHeaderProps = {
  overline?: ReactNode;
  title: string;
  titleBadges?: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
};

export default function PageHeader({
  overline,
  title,
  titleBadges,
  subtitle,
  leading,
  actions,
  meta,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={`flex flex-col gap-4 px-1 md:flex-row md:items-end md:justify-between ${
        className ?? ""
      }`.trim()}
    >
      <div className="min-w-0">
        {overline ? <div className="min-w-0">{overline}</div> : null}

        <div className="mt-3 flex items-center gap-3">
          {leading ? <div className="shrink-0">{leading}</div> : null}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 font-[var(--font-display)] text-3xl font-semibold tracking-tight text-[var(--text)] md:text-4xl">
                {title}
              </h1>
              {titleBadges ? <div className="flex flex-wrap gap-2">{titleBadges}</div> : null}
            </div>
            {subtitle ? (
              <div className="mt-2 text-sm text-[var(--muted)]">{subtitle}</div>
            ) : null}
            {meta ? <div className="mt-3">{meta}</div> : null}
          </div>
        </div>
      </div>

      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

