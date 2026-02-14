"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useProfile } from "./profile-context";
import WorkspaceSwitcher from "./workspace-switcher";
import { useThemePreference } from "./use-theme-preference";
import {
  MESSAGES_NOTIFICATIONS_SYNC_EVENT,
  type MessageNotificationsSyncDetail,
} from "@/lib/messages/client-events";
import {
  MessageNotificationsResponseSchema,
  type MessageNotificationsResponse,
} from "@/lib/messages/types";

type AppHeaderProps = {
  onToggleNav?: () => void;
  isNavOpen?: boolean;
};

type ProposalRow = {
  id: string;
  student_id: string;
  status: "pending" | "accepted" | "rejected";
  summary: string | null;
  payload:
    | {
        kind?: string;
        requester_org_name?: string | null;
        requested_student?: {
          email?: string | null;
          first_name?: string | null;
          last_name?: string | null;
        } | null;
      }
    | null;
  created_at: string;
};

type ReportShareInviteRow = {
  id: string;
  source_report_id: string;
  report_title: string;
  sender_name: string;
  source_student_name: string | null;
  created_at: string;
};

const isStudentLinkRequest = (proposal: ProposalRow) =>
  proposal.payload?.kind === "student_link_request";

const emptyMessageNotifications: MessageNotificationsResponse = {
  unreadMessagesCount: 0,
  unreadPreviews: [],
  pendingCoachContactRequestsCount: 0,
};

const readApiError = async (response: Response, fallback: string) => {
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  return payload.error ?? fallback;
};

export default function AppHeader({ onToggleNav, isNavOpen }: AppHeaderProps) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [requests, setRequests] = useState<ProposalRow[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState("");
  const [requestActionId, setRequestActionId] = useState<string | null>(null);
  const [reportShareInvites, setReportShareInvites] = useState<ReportShareInviteRow[]>([]);
  const [reportShareLoading, setReportShareLoading] = useState(false);
  const [reportShareError, setReportShareError] = useState("");
  const [reportShareActionId, setReportShareActionId] = useState<string | null>(null);
  const [messageNotifications, setMessageNotifications] =
    useState<MessageNotificationsResponse>(emptyMessageNotifications);
  const [messageLoading, setMessageLoading] = useState(false);
  const [messageError, setMessageError] = useState("");
  const [requestsOpen, setRequestsOpen] = useState(false);

  useThemePreference();
  const { profile, isWorkspaceAdmin } = useProfile();

  const roleLabel = profile?.role === "student" ? "Eleve" : "Coach";
  const needsProfileName =
    !!profile && profile.role !== "student" && !(profile.full_name ?? "").trim();
  const avatarFallback = (profile?.full_name || email || "Coach").charAt(0).toUpperCase();
  const brandIconUrl = "/branding/logo.png";
  const brandWordmarkUrl = "/branding/wordmark.png";
  const displayName = (profile?.full_name ?? "").trim() || (email ?? "Compte");
  const isStudent = profile?.role === "student";

  const pendingLinkRequests = useMemo(
    () => requests.filter((request) => request.status === "pending"),
    [requests]
  );

  const pendingCount =
    pendingLinkRequests.length +
    reportShareInvites.length +
    messageNotifications.unreadMessagesCount +
    messageNotifications.pendingCoachContactRequestsCount;

  const loadLinkRequests = useCallback(async () => {
    if (!profile || isStudent || !isWorkspaceAdmin) {
      setRequests([]);
      setRequestsError("");
      return;
    }

    setRequestsLoading(true);
    setRequestsError("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setRequests([]);
      setRequestsLoading(false);
      return;
    }

    const response = await fetch("/api/orgs/proposals", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const payload = (await response.json().catch(() => ({}))) as {
      proposals?: ProposalRow[];
      error?: string;
    };

    if (!response.ok) {
      setRequestsError(payload.error ?? "Chargement des demandes impossible.");
      setRequests([]);
      setRequestsLoading(false);
      return;
    }

    const rows = (payload.proposals ?? []).filter(isStudentLinkRequest);
    setRequests(rows);
    setRequestsLoading(false);
  }, [isStudent, isWorkspaceAdmin, profile]);

  const loadReportShareInvites = useCallback(async () => {
    if (!profile || isStudent) {
      setReportShareInvites([]);
      setReportShareError("");
      return;
    }

    setReportShareLoading(true);
    setReportShareError("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setReportShareInvites([]);
      setReportShareLoading(false);
      return;
    }

    const response = await fetch("/api/reports/shares/inbox", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const payload = (await response.json().catch(() => ({}))) as {
      shares?: ReportShareInviteRow[];
      error?: string;
    };

    if (!response.ok) {
      setReportShareError(payload.error ?? "Chargement des partages impossible.");
      setReportShareInvites([]);
      setReportShareLoading(false);
      return;
    }

    setReportShareInvites(payload.shares ?? []);
    setReportShareLoading(false);
  }, [isStudent, profile]);

  const loadMessageNotifications = useCallback(async () => {
    if (!profile) {
      setMessageNotifications(emptyMessageNotifications);
      setMessageError("");
      return;
    }

    setMessageLoading(true);
    setMessageError("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setMessageNotifications(emptyMessageNotifications);
        return;
      }

      const response = await fetch("/api/messages/notifications", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        if (response.status === 403) {
          setMessageNotifications(emptyMessageNotifications);
          setMessageError("");
          return;
        }

        throw new Error(
          await readApiError(response, "Chargement des notifications messages impossible.")
        );
      }

      const payload = await response.json();
      const parsed = MessageNotificationsResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error("Reponse notifications messages invalide.");
      }

      setMessageNotifications(parsed.data);
    } catch (error) {
      setMessageError(
        error instanceof Error ? error.message : "Notifications messages indisponibles."
      );
      setMessageNotifications(emptyMessageNotifications);
    } finally {
      setMessageLoading(false);
    }
  }, [profile]);

  const handleRequestDecision = useCallback(
    async (proposalId: string, decision: "accept" | "reject") => {
      setRequestActionId(proposalId);
      setRequestsError("");

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setRequestsError("Session invalide.");
        setRequestActionId(null);
        return;
      }

      const response = await fetch("/api/orgs/proposals/decide", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ proposalId, decision }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setRequestsError(payload.error ?? "Action impossible.");
        setRequestActionId(null);
        return;
      }

      await loadLinkRequests();
      setRequestActionId(null);
    },
    [loadLinkRequests]
  );

  const handleReportShareDecision = useCallback(
    async (shareId: string, decision: "accept" | "reject") => {
      setReportShareActionId(shareId);
      setReportShareError("");

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setReportShareError("Session invalide.");
        setReportShareActionId(null);
        return;
      }

      const response = await fetch("/api/reports/shares/respond", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ shareId, decision }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        reportId?: string;
      };

      if (!response.ok) {
        setReportShareError(payload.error ?? "Action impossible.");
        setReportShareActionId(null);
        return;
      }

      await loadReportShareInvites();
      if (decision === "accept" && payload.reportId) {
        router.push(`/app/coach/rapports/${payload.reportId}`);
      }
      setReportShareActionId(null);
    },
    [loadReportShareInvites, router]
  );

  useEffect(() => {
    let active = true;

    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setEmail(data.user?.email ?? null);
    };

    void loadUser();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      void loadLinkRequests();
      void loadReportShareInvites();
      void loadMessageNotifications();
    });

    return () => {
      cancelled = true;
    };
  }, [loadLinkRequests, loadReportShareInvites, loadMessageNotifications]);

  useEffect(() => {
    if (!requestsOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (requestActionId || reportShareActionId) return;
      setRequestsOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [requestsOpen, requestActionId, reportShareActionId]);

  useEffect(() => {
    const handleFocus = () => {
      void loadLinkRequests();
      void loadReportShareInvites();
      void loadMessageNotifications();
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [loadLinkRequests, loadReportShareInvites, loadMessageNotifications]);

  useEffect(() => {
    const handleMessageSync = (event: Event) => {
      const customEvent = event as CustomEvent<MessageNotificationsSyncDetail>;
      const unreadMessagesCount = customEvent.detail?.unreadMessagesCount;

      if (typeof unreadMessagesCount === "number") {
        setMessageNotifications((current) => ({
          ...current,
          unreadMessagesCount: Math.max(0, unreadMessagesCount),
        }));
      }

      if (customEvent.detail?.refetch ?? false) {
        void loadMessageNotifications();
      }
    };

    window.addEventListener(
      MESSAGES_NOTIFICATIONS_SYNC_EVENT,
      handleMessageSync as EventListener
    );
    return () => {
      window.removeEventListener(
        MESSAGES_NOTIFICATIONS_SYNC_EVENT,
        handleMessageSync as EventListener
      );
    };
  }, [loadMessageNotifications]);

  return (
    <header className="app-header sticky top-[var(--app-sticky-top)] z-40">
      <div className="relative flex w-full items-center gap-3 rounded-3xl bg-[var(--app-surface)] px-4 py-3 md:px-6 md:py-4">
        <div className="hidden min-[880px]:block">
          <WorkspaceSwitcher />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Link href="/app" className="flex min-w-0 items-center gap-2 min-[880px]:hidden">
            <img src={brandIconUrl} alt="Logo SwingFlow" className="h-10 w-10 shrink-0 object-contain" />
            <img
              src={brandWordmarkUrl}
              alt="SwingFlow"
              className="hidden h-7 w-auto min-w-0 max-w-[min(200px,45vw)] object-contain min-[460px]:block"
            />
          </Link>

          <div className="hidden min-w-0 flex-1 min-[880px]:block">
            <div className="relative w-[min(420px,45vw)]">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>
              </span>
              <input
                type="search"
                placeholder="Rechercher..."
                aria-label="Rechercher"
                className="w-full rounded-full bg-[var(--panel)] py-3 pl-9 pr-4 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/50"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Notifications"
            onClick={() => {
              setMessageNotifications((current) => ({
                ...current,
                unreadMessagesCount: 0,
              }));
              setRequestsOpen(true);
              void loadLinkRequests();
              void loadReportShareInvites();
            }}
            className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[var(--panel)] text-[var(--muted)] transition hover:bg-white hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/50"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
              <path d="M13.7 21a2 2 0 01-3.4 0" />
            </svg>
            {pendingCount > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-400 px-1 text-[0.65rem] font-semibold text-zinc-900">
                {pendingCount > 9 ? "9+" : pendingCount}
              </span>
            ) : null}
          </button>

          {needsProfileName ? (
            <button
              type="button"
              onClick={() => router.push("/app/coach/parametres")}
              className="hidden rounded-full border border-amber-300/40 bg-amber-400/10 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-amber-100 transition hover:border-amber-300/70 min-[880px]:block"
            >
              Profil incomplet
            </button>
          ) : null}

          <div className="hidden min-[880px]:flex items-center gap-3">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="Photo de profil"
                className="h-12 w-12 rounded-full border border-white/10 object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full border-white/10 bg-white/90 text-xs text-[var(--muted)]">
                {avatarFallback}
              </div>
            )}
            <div className="min-w-0 leading-tight">
              <p className="max-w-[200px] truncate text-m py-1 font-semibold text-[var(--text)]">
                {displayName}
              </p>
              <p className="max-w-[220px] truncate text-xs text-[var(--muted)]">
                <span className="hidden min-[1050px]:inline">{email ?? roleLabel}</span>
                <span className="min-[1050px]:hidden">{roleLabel}</span>
              </p>
            </div>
          </div>
          <div className="min-[880px]:hidden">
            <WorkspaceSwitcher />
          </div>
          {onToggleNav ? (
            <button
              type="button"
              onClick={onToggleNav}
              aria-label={isNavOpen ? "Fermer la navigation" : "Ouvrir la navigation"}
              aria-expanded={isNavOpen ?? false}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--muted)] transition hover:bg-white hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/50 min-[880px]:hidden"
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
                {isNavOpen ? (
                  <>
                    <path d="M18 6L6 18" />
                    <path d="M6 6l12 12" />
                  </>
                ) : (
                  <>
                    <path d="M3 6h18" />
                    <path d="M3 12h18" />
                    <path d="M3 18h18" />
                  </>
                )}
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      {requestsOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="header-link-requests-title"
        >
          <button
            type="button"
            aria-label="Fermer"
            className="absolute inset-0 bg-black/35 backdrop-blur-sm"
            onClick={() => {
              if (!requestActionId && !reportShareActionId) setRequestsOpen(false);
            }}
          />
          <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg-elevated)] shadow-[var(--shadow-strong)]">
            <div className="relative border-b border-white/10 px-6 py-4">
              <h3
                id="header-link-requests-title"
                className="text-center text-base font-semibold text-[var(--text)]"
              >
                Notifications
              </h3>
              <button
                type="button"
                onClick={() => setRequestsOpen(false)}
                disabled={Boolean(requestActionId || reportShareActionId)}
                className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-60"
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

            <div className="max-h-[70vh] space-y-3 overflow-auto px-6 py-5">
              {requestsError ? <p className="text-sm text-red-400">{requestsError}</p> : null}
              {reportShareError ? <p className="text-sm text-red-400">{reportShareError}</p> : null}
              {messageError ? <p className="text-sm text-red-400">{messageError}</p> : null}

              {requestsLoading || reportShareLoading || messageLoading ? (
                <p className="text-sm text-[var(--muted)]">Chargement...</p>
              ) : pendingLinkRequests.length === 0 &&
                reportShareInvites.length === 0 &&
                messageNotifications.unreadPreviews.length === 0 &&
                messageNotifications.pendingCoachContactRequestsCount === 0 ? (
                <p className="text-sm text-[var(--muted)]">Aucune notification en attente.</p>
              ) : (
                <>
                  {messageNotifications.unreadPreviews.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-[0.65rem] uppercase tracking-[0.25em] text-[var(--muted)]">
                        Messages non lus
                      </p>
                      {messageNotifications.unreadPreviews.map((preview) => {
                        const href = isStudent
                          ? `/app/eleve/messages?threadId=${preview.threadId}`
                          : `/app/coach/messages?threadId=${preview.threadId}`;

                        return (
                          <Link
                            key={`${preview.threadId}-${preview.createdAt}`}
                            href={href}
                            onClick={() => setRequestsOpen(false)}
                            className="block rounded-2xl border border-violet-300/25 bg-violet-400/10 p-4 transition hover:border-violet-300/40"
                          >
                            <p className="text-sm font-semibold text-[var(--text)]">
                              {preview.fromName ?? "Nouveau message"}
                            </p>
                            <p className="mt-1 text-xs text-[var(--muted)] line-clamp-2">
                              {preview.bodyPreview}
                            </p>
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}

                  {messageNotifications.pendingCoachContactRequestsCount > 0 && !isStudent ? (
                    <div className="rounded-2xl border border-violet-300/25 bg-violet-400/10 p-4">
                      <p className="text-sm text-[var(--text)]">
                        {messageNotifications.pendingCoachContactRequestsCount} demande(s) de contact coach en attente.
                      </p>
                      <Link
                        href="/app/coach/messages"
                        onClick={() => setRequestsOpen(false)}
                        className="mt-3 inline-flex rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs uppercase tracking-wide text-[var(--text)]"
                      >
                        Ouvrir la messagerie
                      </Link>
                    </div>
                  ) : null}

                  {reportShareInvites.map((share) => (
                    <div key={share.id} className="rounded-2xl border border-sky-300/25 bg-sky-400/10 p-4">
                      <p className="text-sm font-semibold text-[var(--text)]">Rapport partage</p>
                      <p className="mt-2 text-[0.65rem] uppercase tracking-[0.25em] text-sky-100">
                        Envoye par
                      </p>
                      <p className="mt-1 text-sm font-semibold text-sky-200">{share.sender_name}</p>
                      <p className="mt-2 text-xs text-[var(--muted)]">Rapport: {share.report_title}</p>
                      {share.source_student_name ? (
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          Eleve source: {share.source_student_name}
                        </p>
                      ) : null}
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          disabled={reportShareActionId === share.id}
                          onClick={() => handleReportShareDecision(share.id, "accept")}
                          className="rounded-full bg-sky-300/90 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-sky-950 transition hover:bg-sky-200 disabled:opacity-60"
                        >
                          Ajouter a mes rapports
                        </button>
                        <button
                          type="button"
                          disabled={reportShareActionId === share.id}
                          onClick={() => handleReportShareDecision(share.id, "reject")}
                          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-60"
                        >
                          Refuser
                        </button>
                      </div>
                    </div>
                  ))}

                  {pendingLinkRequests.map((request) => {
                    const requesterOrgName =
                      request.payload?.requester_org_name?.trim() || "Organisation externe";
                    const studentEmail = request.payload?.requested_student?.email ?? null;
                    return (
                      <div key={request.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-sm font-semibold text-[var(--text)]">
                          Demande d ajout cross-org
                        </p>
                        <p className="mt-2 text-[0.65rem] uppercase tracking-[0.25em] text-emerald-100">
                          Structure demandeuse
                        </p>
                        <p className="mt-1 text-sm font-semibold text-emerald-200">
                          {requesterOrgName}
                        </p>
                        {studentEmail ? (
                          <p className="mt-2 text-xs text-[var(--muted)]">Eleve: {studentEmail}</p>
                        ) : null}
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            type="button"
                            disabled={requestActionId === request.id}
                            onClick={() => handleRequestDecision(request.id, "accept")}
                            className="rounded-full bg-emerald-300/90 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-950 transition hover:bg-emerald-200 disabled:opacity-60"
                          >
                            Autoriser
                          </button>
                          <button
                            type="button"
                            disabled={requestActionId === request.id}
                            onClick={() => handleRequestDecision(request.id, "reject")}
                            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-60"
                          >
                            Refuser
                          </button>
                          <Link
                            href={`/app/coach/eleves/${request.student_id}`}
                            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                            onClick={() => setRequestsOpen(false)}
                          >
                            Fiche eleve
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
