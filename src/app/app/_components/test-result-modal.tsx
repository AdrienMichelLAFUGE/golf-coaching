"use client";

import { useEffect, useId } from "react";

type ResultItem = {
  label: string;
  value: string;
};

type TestResultModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  items: ResultItem[];
};

export default function TestResultModal({
  open,
  onClose,
  title,
  description,
  items,
}: TestResultModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg-elevated)] shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <h3 id={titleId} className="text-sm font-semibold text-[var(--text)]">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)]"
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
            >
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-4 p-4">
          {description ? (
            <p className="text-sm text-[var(--muted)]">{description}</p>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            {items.map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  {item.label}
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--text)]">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
