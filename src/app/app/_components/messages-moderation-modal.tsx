"use client";

import type {
  MessageReportDto,
  MessageReportThreadMessagesResponse,
} from "@/lib/messages/types";

type MessagesModerationModalProps = {
  open: boolean;
  loading: boolean;
  error: string;
  reports: MessageReportDto[];
  actionReportId: string | null;
  selectedReportId: string | null;
  contextLoading: boolean;
  contextError: string;
  contextData: MessageReportThreadMessagesResponse | null;
  onClose: () => void;
  onReload: () => Promise<void>;
  onViewReport: (reportId: string) => Promise<void>;
  onUpdateReportStatus: (
    reportId: string,
    status: "open" | "in_review" | "resolved",
    freezeThread: boolean
  ) => Promise<void>;
};

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function MessagesModerationModal({
  open,
  loading,
  error,
  reports,
  actionReportId,
  selectedReportId,
  contextLoading,
  contextError,
  contextData,
  onClose,
  onReload,
  onViewReport,
  onUpdateReportStatus,
}: MessagesModerationModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="messages-moderation-title"
    >
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <div className="relative z-10 grid w-full max-w-6xl gap-4 rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-4 md:grid-cols-[360px_1fr]">
        <section className="max-h-[75vh] space-y-3 overflow-auto pr-1">
          <div className="flex items-center justify-between gap-2">
            <h2
              id="messages-moderation-title"
              className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text)]"
            >
              Signalements messagerie
            </h2>
            <button
              type="button"
              onClick={() => void onReload()}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
            >
              Recharger
            </button>
          </div>

          {loading ? <p className="text-sm text-[var(--muted)]">Chargement...</p> : null}
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          {!loading && reports.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Aucun signalement.</p>
          ) : null}

          {reports.map((report) => {
            const selected = selectedReportId === report.id;
            return (
              <article
                key={report.id}
                className={`rounded-xl border p-3 ${
                  selected
                    ? "border-amber-300/45 bg-amber-400/10"
                    : "border-white/10 bg-white/5"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text)]">
                    {report.status}
                  </p>
                  <p className="text-[0.65rem] text-[var(--muted)]">
                    {formatDateTime(report.createdAt)}
                  </p>
                </div>

                <p className="mt-2 text-sm font-semibold text-[var(--text)]">{report.reason}</p>
                {report.details ? (
                  <p className="mt-1 text-xs text-[var(--muted)]">{report.details}</p>
                ) : null}
                <p className="mt-2 text-[0.65rem] text-[var(--muted)]">
                  Signale par {report.reportedByName ?? "Utilisateur"}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void onViewReport(report.id)}
                    className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--text)]"
                  >
                    Ouvrir
                  </button>
                  <button
                    type="button"
                    disabled={actionReportId === report.id}
                    onClick={() =>
                      void onUpdateReportStatus(report.id, "in_review", true)
                    }
                    className="rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-amber-200 disabled:opacity-60"
                  >
                    In review + geler
                  </button>
                  <button
                    type="button"
                    disabled={actionReportId === report.id}
                    onClick={() =>
                      void onUpdateReportStatus(report.id, "resolved", false)
                    }
                    className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-emerald-200 disabled:opacity-60"
                  >
                    Resoudre
                  </button>
                </div>
              </article>
            );
          })}
        </section>

        <section className="max-h-[75vh] space-y-3 overflow-auto rounded-xl border border-white/10 bg-white/5 p-3">
          {selectedReportId === null ? (
            <p className="text-sm text-[var(--muted)]">
              Selectionnez un signalement pour voir le contexte.
            </p>
          ) : contextLoading ? (
            <p className="text-sm text-[var(--muted)]">Chargement du contexte...</p>
          ) : contextError ? (
            <p className="text-sm text-red-400">{contextError}</p>
          ) : !contextData ? (
            <p className="text-sm text-[var(--muted)]">Contexte indisponible.</p>
          ) : (
            <>
              <div className="rounded-xl border border-white/10 bg-[var(--panel)] p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  Snapshot au moment du signalement
                </p>
                <div className="mt-3 space-y-2">
                  {contextData.snapshot.length === 0 ? (
                    <p className="text-xs text-[var(--muted)]">Snapshot vide.</p>
                  ) : (
                    contextData.snapshot.map((message) => (
                      <div key={`snapshot-${message.id}`} className="rounded-lg border border-white/10 bg-white/5 p-2">
                        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-[var(--text)]">
                          {message.senderName ?? "Utilisateur"} - {formatDateTime(message.createdAt)}
                        </p>
                        <p className="mt-1 text-xs text-[var(--text)] whitespace-pre-wrap break-words">
                          {message.body}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-[var(--panel)] p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  Conversation actuelle
                </p>
                <div className="mt-3 space-y-2">
                  {contextData.messages.length === 0 ? (
                    <p className="text-xs text-[var(--muted)]">Aucun message.</p>
                  ) : (
                    contextData.messages.map((message) => (
                      <div key={`current-${message.id}`} className="rounded-lg border border-white/10 bg-white/5 p-2">
                        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-[var(--text)]">
                          {message.senderName ?? "Utilisateur"} - {formatDateTime(message.createdAt)}
                        </p>
                        <p className="mt-1 text-xs text-[var(--text)] whitespace-pre-wrap break-words">
                          {message.body}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
