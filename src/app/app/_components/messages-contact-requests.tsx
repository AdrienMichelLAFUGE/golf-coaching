"use client";

import type { CoachContactRequestDto } from "@/lib/messages/types";

type MessagesContactRequestsProps = {
  incoming: CoachContactRequestDto[];
  outgoing: CoachContactRequestDto[];
  actionRequestId: string | null;
  onRespond: (requestId: string, decision: "accept" | "reject") => Promise<void>;
};

const formatDate = (value: string) => {
  const date = new Date(value);
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

export default function MessagesContactRequests({
  incoming,
  outgoing,
  actionRequestId,
  onRespond,
}: MessagesContactRequestsProps) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
          Demandes recues
        </p>
        <div className="mt-2 space-y-2">
          {incoming.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Aucune demande en attente.</p>
          ) : (
            incoming.map((request) => (
              <div
                key={request.id}
                className="rounded-xl border border-white/10 bg-white/5 p-3"
              >
                <p className="text-sm text-[var(--text)]">
                  {request.requesterName ?? request.requesterEmail ?? "Coach"}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {request.requesterEmail ?? "Email indisponible"} · {formatDate(request.createdAt)}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={actionRequestId === request.id}
                    onClick={() => void onRespond(request.id, "accept")}
                    className="rounded-full bg-emerald-300/90 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-950 transition hover:bg-emerald-200 disabled:opacity-60"
                  >
                    Accepter
                  </button>
                  <button
                    type="button"
                    disabled={actionRequestId === request.id}
                    onClick={() => void onRespond(request.id, "reject")}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-60"
                  >
                    Refuser
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
          Demandes envoyees
        </p>
        <div className="mt-2 space-y-2">
          {outgoing.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Aucune demande envoyee.</p>
          ) : (
            outgoing.map((request) => (
              <div
                key={request.id}
                className="rounded-xl border border-white/10 bg-white/5 p-3"
              >
                <p className="text-sm text-[var(--text)]">
                  {request.targetName ?? request.targetEmail ?? "Coach"}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {request.targetEmail ?? "Email indisponible"} · {formatDate(request.createdAt)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
