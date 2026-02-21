"use client";

import { FormEvent, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import ToastStack from "./toast-stack";
import useToastStack from "./use-toast-stack";
import { useProfile } from "./profile-context";

type BugSeverity = "low" | "medium" | "high" | "critical";
type SupportRequestType = "bug" | "question" | "billing" | "feature_request";

const severityLabel: Record<BugSeverity, string> = {
  low: "Faible",
  medium: "Moyen",
  high: "Eleve",
  critical: "Critique",
};

const requestTypeLabel: Record<SupportRequestType, string> = {
  bug: "Bug",
  question: "Question",
  billing: "Facturation",
  feature_request: "Demande de fonctionnalite",
};

export default function BugReportWidget() {
  const pathname = usePathname();
  const { profile, loading } = useProfile();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requestType, setRequestType] = useState<SupportRequestType>("bug");
  const [severity, setSeverity] = useState<BugSeverity>("medium");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const { toasts, pushToast, dismissToast } = useToastStack(5200);

  const disabled = useMemo(
    () =>
      submitting ||
      title.trim().length < 3 ||
      description.trim().length < 10 ||
      description.trim().length > 6000,
    [description, submitting, title]
  );

  if (loading || !profile) return null;

  const handleClose = () => {
    if (submitting) return;
    setOpen(false);
    setError("");
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setRequestType("bug");
    setSeverity("medium");
    setError("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    setSubmitting(true);
    setError("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Session invalide. Reconnecte-toi.");
      setSubmitting(false);
      return;
    }

    const context =
      typeof window === "undefined"
        ? {}
        : {
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            language: navigator.language || "unknown",
            timezone:
              Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown",
          };

    const response = await fetch("/api/bug-reports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim(),
        requestType,
        severity,
        pagePath: pathname ?? "/app",
        userAgent:
          typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        context,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Demande d'aide impossible pour le moment.");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setOpen(false);
    resetForm();
    pushToast("Demande envoyee. Merci, on revient vers toi rapidement.", "success");
  };

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <div className="fixed bottom-4 left-4 z-[90]">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--muted)] shadow-[0_8px_18px_rgba(0,0,0,0.2)] backdrop-blur-sm transition hover:bg-white/16 hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
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
            <circle cx="12" cy="12" r="9" />
            <path d="M9.3 9.2a2.7 2.7 0 0 1 5.3.8c0 1.8-2.1 2.2-2.5 3.5" />
            <path d="M12 17h.01" />
          </svg>
          <span className="hidden sm:inline">Besoin d&apos;aide ?</span>
          <span className="sm:hidden">Aide</span>
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/55 p-4">
          <button
            type="button"
            aria-label="Fermer"
            className="absolute inset-0"
            onClick={handleClose}
          />
          <div
            className="relative w-full max-w-lg rounded-3xl bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-strong)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bug-report-title"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  Feedback
                </p>
                <h3 id="bug-report-title" className="mt-1 text-lg font-semibold text-[var(--text)]">
                  Besoin d&apos;aide ?
                </h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Explique ton besoin. Le contexte de la page est ajoute automatiquement.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-60"
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

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  Objet
                </span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={160}
                  placeholder="Ex: extraction data incoherente"
                  className="w-full rounded-xl bg-white/6 px-3 py-2.5 text-sm text-[var(--text)] outline-none transition focus:bg-white/10"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  Description
                </span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={5}
                  maxLength={6000}
                  placeholder="Etapes, comportement attendu, comportement observe..."
                  className="w-full rounded-xl bg-white/6 px-3 py-2.5 text-sm text-[var(--text)] outline-none transition focus:bg-white/10"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  Type de demande
                </span>
                <select
                  value={requestType}
                  onChange={(event) => setRequestType(event.target.value as SupportRequestType)}
                  className="w-full rounded-xl bg-white/6 px-3 py-2.5 text-sm text-[var(--text)] outline-none transition focus:bg-white/10"
                >
                  {(Object.keys(requestTypeLabel) as SupportRequestType[]).map((value) => (
                    <option key={value} value={value}>
                      {requestTypeLabel[value]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  Priorite
                </span>
                <select
                  value={severity}
                  onChange={(event) => setSeverity(event.target.value as BugSeverity)}
                  className="w-full rounded-xl bg-white/6 px-3 py-2.5 text-sm text-[var(--text)] outline-none transition focus:bg-white/10"
                >
                  {(Object.keys(severityLabel) as BugSeverity[]).map((value) => (
                    <option key={value} value={value}>
                      {severityLabel[value]}
                    </option>
                  ))}
                </select>
              </label>

              {error ? <p className="text-sm text-red-200">{error}</p> : null}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={submitting}
                  className="rounded-full bg-white/10 px-4 py-2 text-xs font-medium uppercase tracking-wide text-[var(--text)] transition hover:bg-white/15 disabled:opacity-60"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={disabled}
                  className="rounded-full bg-rose-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Envoi..." : "Envoyer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
