"use client";

import { FormEvent, useMemo, useState } from "react";
import MessagesContactRequests from "@/app/app/_components/messages-contact-requests";
import type { MessageContactsResponse } from "@/lib/messages/types";

type MessagesContactsModalProps = {
  open: boolean;
  loading: boolean;
  error: string;
  canRequestCoachContact: boolean;
  canCreateInformationalThreads: boolean;
  organizationName: string | null;
  highlightRequestId?: string | null;
  data: MessageContactsResponse | null;
  submittingKey: string | null;
  actionRequestId: string | null;
  onClose: () => void;
  onReload: () => Promise<void>;
  onStartStudentThread: (studentId: string, coachId: string) => Promise<void>;
  onStartCoachThread: (coachUserId: string) => Promise<void>;
  onStartGroupThread: (groupId: string) => Promise<void>;
  onStartGroupInfoThread: (groupId: string) => Promise<void>;
  onStartOrgInfoThread: () => Promise<void>;
  onStartOrgCoachesThread: () => Promise<void>;
  onRequestCoachContact: (targetEmail: string) => Promise<void>;
  onRespondCoachRequest: (requestId: string, decision: "accept" | "reject") => Promise<void>;
};

export default function MessagesContactsModal({
  open,
  loading,
  error,
  canRequestCoachContact,
  canCreateInformationalThreads,
  organizationName,
  highlightRequestId = null,
  data,
  submittingKey,
  actionRequestId,
  onClose,
  onReload,
  onStartStudentThread,
  onStartCoachThread,
  onStartGroupThread,
  onStartGroupInfoThread,
  onStartOrgInfoThread,
  onStartOrgCoachesThread,
  onRequestCoachContact,
  onRespondCoachRequest,
}: MessagesContactsModalProps) {
  const [targetEmail, setTargetEmail] = useState("");
  const [localError, setLocalError] = useState("");

  const hasCoachSections = useMemo(
    () => canRequestCoachContact && data !== null,
    [canRequestCoachContact, data]
  );

  const sameOrgCoachContacts = useMemo(
    () => (data?.coachContacts ?? []).filter((coach) => coach.availability === "same_org"),
    [data]
  );

  const externalCoachContacts = useMemo(
    () => (data?.coachContacts ?? []).filter((coach) => coach.availability !== "same_org"),
    [data]
  );

  const hasCoachRequests = useMemo(() => {
    if (!data) return false;
    return (
      data.pendingIncomingCoachContactRequests.length > 0 ||
      data.pendingOutgoingCoachContactRequests.length > 0
    );
  }, [data]);

  if (!open) return null;

  const handleRequestCoachContact = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = targetEmail.trim().toLowerCase();
    if (!normalizedEmail) return;

    setLocalError("");
    try {
      await onRequestCoachContact(normalizedEmail);
      setTargetEmail("");
    } catch (requestError) {
      setLocalError(requestError instanceof Error ? requestError.message : "Demande impossible.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-black/35 backdrop-blur-sm"
        aria-label="Fermer"
      />
      <div className="relative max-h-[85vh] w-full max-w-3xl overflow-auto rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-strong)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">
              Messagerie
            </p>
            <h3 className="mt-1 text-lg font-semibold text-[var(--text)]">Nouvelle conversation</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
          >
            Fermer
          </button>
        </div>

        <div className="mt-4 flex items-center justify-end">
          <button
            type="button"
            onClick={() => void onReload()}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
          >
            Actualiser
          </button>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-[var(--muted)]">Chargement des contacts...</p>
        ) : null}
        {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
        {localError ? <p className="mt-2 text-sm text-red-400">{localError}</p> : null}

        {data ? (
          <div className="mt-4 space-y-6">
            <section>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Eleves assignes</p>
              <div className="mt-2 space-y-2">
                {data.studentTargets.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">Aucun eleve disponible.</p>
                ) : (
                  data.studentTargets.map((target) => {
                    const key = `student:${target.studentId}:${target.coachUserId ?? ""}`;
                    const canCreate = Boolean(target.coachUserId);
                    return (
                      <div
                        key={key}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-[var(--text)]">{target.studentName}</p>
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            {target.studentEmail ?? "Email eleve indisponible"}
                          </p>
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            Coach: {target.coachName ?? target.coachEmail ?? "Coach"}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={!canCreate || submittingKey === key}
                          onClick={() => {
                            if (!target.coachUserId) return;
                            void onStartStudentThread(target.studentId, target.coachUserId);
                          }}
                          className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
                        >
                          {submittingKey === key ? "Ouverture..." : "Ouvrir"}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Groupes</p>
              <div className="mt-2 space-y-2">
                {data.groupTargets.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">Aucun groupe disponible.</p>
                ) : (
                  data.groupTargets.map((group) => {
                    const discussionKey = `group:${group.groupId}`;
                    const infoKey = `group_info:${group.groupId}`;
                    return (
                      <div
                        key={group.groupId}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-[var(--text)]">{group.groupName}</p>
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            {group.studentCount} eleve(s) · {group.coachCount} coach(s)
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={submittingKey === discussionKey}
                          onClick={() => void onStartGroupThread(group.groupId)}
                          className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
                        >
                          {submittingKey === discussionKey ? "Ouverture..." : "Discussion"}
                        </button>
                        {canCreateInformationalThreads ? (
                          <button
                            type="button"
                            disabled={submittingKey === infoKey}
                            onClick={() => void onStartGroupInfoThread(group.groupId)}
                            className="rounded-full border border-violet-300/35 bg-violet-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-violet-100 transition hover:border-violet-300/55 disabled:opacity-60"
                          >
                            {submittingKey === infoKey ? "Ouverture..." : "Info groupe"}
                          </button>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            {canCreateInformationalThreads ? (
              <section>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  Canaux organisation
                </p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div className="rounded-xl border border-violet-300/25 bg-violet-400/10 p-3">
                    <p className="text-sm font-medium text-[var(--text)]">
                      Info organisation
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {organizationName ?? "Structure"} en lecture pour tous, publication coach/admin.
                    </p>
                    <button
                      type="button"
                      disabled={submittingKey === "org_info"}
                      onClick={() => void onStartOrgInfoThread()}
                      className="mt-3 rounded-full border border-violet-300/35 bg-violet-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-violet-100 transition hover:border-violet-300/55 disabled:opacity-60"
                    >
                      {submittingKey === "org_info" ? "Ouverture..." : "Ouvrir"}
                    </button>
                  </div>
                  <div className="rounded-xl border border-sky-300/25 bg-sky-400/10 p-3">
                    <p className="text-sm font-medium text-[var(--text)]">
                      Tous les coachs
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Conversation reservee aux coachs/admin de l organisation.
                    </p>
                    <button
                      type="button"
                      disabled={submittingKey === "org_coaches"}
                      onClick={() => void onStartOrgCoachesThread()}
                      className="mt-3 rounded-full border border-sky-300/35 bg-sky-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-sky-100 transition hover:border-sky-300/55 disabled:opacity-60"
                    >
                      {submittingKey === "org_coaches" ? "Ouverture..." : "Ouvrir"}
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            {hasCoachSections ? (
              <section className="space-y-4">
                {sameOrgCoachContacts.length > 0 ? (
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                      Coachs de ma structure
                    </p>
                    <div className="mt-2 space-y-2">
                      {sameOrgCoachContacts.map((coach) => {
                        const key = `coach:${coach.userId}`;
                        return (
                          <div
                            key={coach.userId}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300/25 bg-emerald-400/10 p-3"
                          >
                            <div>
                              <p className="text-sm font-medium text-[var(--text)]">
                                {coach.fullName ?? coach.email ?? "Coach"}
                              </p>
                              <p className="mt-1 text-xs text-[var(--muted)]">
                                {coach.email ?? "Email indisponible"}
                              </p>
                              <p className="mt-1 text-[0.65rem] uppercase tracking-[0.2em] text-emerald-200">
                                Acces direct
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={submittingKey === key}
                              onClick={() => void onStartCoachThread(coach.userId)}
                              className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
                            >
                              {submittingKey === key ? "Ouverture..." : "Ouvrir"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                    {sameOrgCoachContacts.length > 0
                      ? "Coachs externes autorises"
                      : "Contacts coach"}
                  </p>
                  <div className="mt-2 space-y-2">
                    {externalCoachContacts.length === 0 ? (
                      <p className="text-sm text-[var(--muted)]">
                        Aucun coach externe autorise.
                      </p>
                    ) : (
                      externalCoachContacts.map((coach) => {
                        const key = `coach:${coach.userId}`;
                        return (
                          <div
                            key={coach.userId}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
                          >
                            <div>
                              <p className="text-sm font-medium text-[var(--text)]">
                                {coach.fullName ?? coach.email ?? "Coach"}
                              </p>
                              <p className="mt-1 text-xs text-[var(--muted)]">
                                {coach.email ?? "Email indisponible"}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={submittingKey === key}
                              onClick={() => void onStartCoachThread(coach.userId)}
                              className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
                            >
                              {submittingKey === key ? "Ouverture..." : "Ouvrir"}
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <form onSubmit={handleRequestCoachContact} className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                    Inviter un coach externe
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    Entrez son email pour envoyer une demande de contact.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="email"
                      value={targetEmail}
                      onChange={(event) => setTargetEmail(event.target.value)}
                      placeholder="coach@email.com"
                      className="min-w-[220px] flex-1 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/40"
                    />
                    <button
                      type="submit"
                      className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
                    >
                      Envoyer
                    </button>
                  </div>
                </form>

                {hasCoachRequests ? (
                  <MessagesContactRequests
                    incoming={data.pendingIncomingCoachContactRequests}
                    outgoing={data.pendingOutgoingCoachContactRequests}
                    highlightRequestId={highlightRequestId}
                    actionRequestId={actionRequestId}
                    onRespond={onRespondCoachRequest}
                  />
                ) : null}
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
