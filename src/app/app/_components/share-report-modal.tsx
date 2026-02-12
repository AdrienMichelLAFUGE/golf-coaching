"use client";

import { useState } from "react";
import { z } from "zod";

const emailSchema = z.string().email();

type ShareReportModalProps = {
  onClose: () => void;
  onShare: (email: string) => Promise<{ error?: string; message?: string } | void>;
};

export default function ShareReportModal({ onClose, onShare }: ShareReportModalProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    const parsed = emailSchema.safeParse(normalized);
    if (!parsed.success) {
      setError("Email invalide.");
      return;
    }

    setSubmitting(true);
    setError("");
    const result = await onShare(parsed.data);
    if (result?.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Partage rapport
            </p>
            <h3 className="mt-2 text-lg font-semibold text-[var(--text)]">
              Partager ce rapport
            </h3>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Si l email appartient a un coach SwingFlow, il recevra une demande dans sa
              cloche. Sinon, un email externe sera envoye avec un PDF texte en piece
              jointe et un lien vers SwingFlow pour lire le rapport complet.
            </p>
          </div>
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
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
              Email destinataire
            </label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="coach@email.com"
              className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
            />
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
              disabled={submitting}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "Envoi..." : "Partager"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
