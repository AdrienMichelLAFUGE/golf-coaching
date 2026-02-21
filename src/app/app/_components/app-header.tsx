"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  GlobalSearchResponseSchema,
  type GlobalSearchItem,
  type GlobalSearchKind,
} from "@/lib/search/global";

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

const SEARCH_KIND_LABELS: Record<GlobalSearchKind, string> = {
  page: "Page",
  student: "Eleve",
  report: "Rapport",
  test: "Test",
};

const SEARCH_KIND_STYLES: Record<GlobalSearchKind, string> = {
  page: "border-white/20 bg-white/10 text-[var(--muted)]",
  student: "border-emerald-300/30 bg-emerald-400/15 text-emerald-100",
  report: "border-sky-300/30 bg-sky-400/15 text-sky-100",
  test: "border-violet-300/30 bg-violet-400/15 text-violet-100",
};

const isStudentLinkRequest = (proposal: ProposalRow) =>
  proposal.payload?.kind === "student_link_request";

const emptyMessageNotifications: MessageNotificationsResponse = {
  unreadMessagesCount: 0,
  unreadPreviews: [],
  pendingCoachContactRequestsCount: 0,
  pendingCoachContactRequests: [],
  pendingModerationReportsCount: 0,
};

const readApiError = async (response: Response, fallback: string) => {
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  return payload.error ?? fallback;
};

export default function AppHeader({ onToggleNav, isNavOpen }: AppHeaderProps) {
  const router = useRouter();
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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GlobalSearchItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  useThemePreference();
  const { profile, isWorkspaceAdmin, userEmail } = useProfile();

  const roleLabel = profile?.role === "student" ? "Eleve" : "Coach";
  const needsProfileName =
    !!profile && profile.role !== "student" && !(profile.full_name ?? "").trim();
  const avatarFallback = (profile?.full_name || userEmail || "Coach").charAt(0).toUpperCase();
  const brandIconUrl = "/branding/logo.png";
  const brandWordmarkUrl = "/branding/wordmark.png";
  const displayName = (profile?.full_name ?? "").trim() || (userEmail ?? "Compte");
  const isStudent = profile?.role === "student";

  const pendingLinkRequests = useMemo(
    () => requests.filter((request) => request.status === "pending"),
    [requests]
  );

  const pendingCount =
    pendingLinkRequests.length +
    reportShareInvites.length +
    messageNotifications.unreadMessagesCount +
    messageNotifications.pendingCoachContactRequestsCount +
    messageNotifications.pendingModerationReportsCount;

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

  const clearSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchError("");
    setActiveSearchIndex(-1);
  }, []);

  const handleSelectSearchResult = useCallback(
    (item: GlobalSearchItem) => {
      clearSearch();
      router.push(item.href);
    },
    [clearSearch, router]
  );

  useEffect(() => {
    const query = searchQuery.trim();
    setSearchError("");
    if (query.length < 2) {
      searchAbortRef.current?.abort();
      setSearchLoading(false);
      setSearchResults([]);
      setActiveSearchIndex(-1);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setSearchLoading(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          setSearchResults([]);
          setSearchError("Session invalide.");
          setActiveSearchIndex(-1);
          return;
        }

        const response = await fetch(`/api/search/global?q=${encodeURIComponent(query)}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(await readApiError(response, "Recherche indisponible."));
        }

        const payload = await response.json();
        const parsed = GlobalSearchResponseSchema.safeParse(payload);
        if (!parsed.success) {
          throw new Error("Reponse de recherche invalide.");
        }

        setSearchResults(parsed.data.items);
        setActiveSearchIndex(parsed.data.items.length > 0 ? 0 : -1);
        if (document.activeElement === searchInputRef.current) {
          setSearchOpen(true);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setSearchResults([]);
        setActiveSearchIndex(-1);
        setSearchError(error instanceof Error ? error.message : "Recherche indisponible.");
        if (document.activeElement === searchInputRef.current) {
          setSearchOpen(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearchLoading(false);
        }
      }
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (searchContainerRef.current?.contains(target)) return;
      setSearchOpen(false);
      setActiveSearchIndex(-1);
    };
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [searchOpen]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      searchInputRef.current?.focus();
      if (searchQuery.trim().length >= 2) {
        setSearchOpen(true);
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [searchQuery]);

  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        setSearchOpen(false);
        setActiveSearchIndex(-1);
        return;
      }

      if (!searchOpen && event.key === "ArrowDown" && searchResults.length > 0) {
        event.preventDefault();
        setSearchOpen(true);
        setActiveSearchIndex(0);
        return;
      }

      if (event.key === "ArrowDown") {
        if (searchResults.length === 0) return;
        event.preventDefault();
        setSearchOpen(true);
        setActiveSearchIndex((current) =>
          current >= searchResults.length - 1 ? 0 : current + 1
        );
        return;
      }

      if (event.key === "ArrowUp") {
        if (searchResults.length === 0) return;
        event.preventDefault();
        setSearchOpen(true);
        setActiveSearchIndex((current) =>
          current <= 0 ? searchResults.length - 1 : current - 1
        );
        return;
      }

      if (event.key === "Enter") {
        const nextItem =
          activeSearchIndex >= 0 ? searchResults[activeSearchIndex] : searchResults[0];
        if (!nextItem) return;
        event.preventDefault();
        handleSelectSearchResult(nextItem);
      }
    },
    [activeSearchIndex, handleSelectSearchResult, searchOpen, searchResults]
  );

  const shouldShowSearchDropdown = searchOpen && searchQuery.trim().length >= 2;

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
            <div ref={searchContainerRef} className="relative w-[min(460px,48vw)]">
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
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  if (event.target.value.trim().length >= 2) {
                    setSearchOpen(true);
                  } else {
                    setSearchOpen(false);
                  }
                }}
                onFocus={() => {
                  if (searchQuery.trim().length >= 2) {
                    setSearchOpen(true);
                  }
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Rechercher partout... (Ctrl+K)"
                aria-label="Rechercher"
                aria-controls="global-search-results"
                aria-activedescendant={
                  activeSearchIndex >= 0
                    ? `global-search-option-${activeSearchIndex}`
                    : undefined
                }
                autoComplete="off"
                className="w-full rounded-full bg-[var(--panel)] py-3 pl-9 pr-4 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/50"
              />
              {shouldShowSearchDropdown ? (
                <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[80] overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg-elevated)] shadow-[var(--shadow-strong)]">
                  <div
                    id="global-search-results"
                    role="listbox"
                    aria-label="Resultats de recherche"
                    className="max-h-[56vh] space-y-1 overflow-y-auto p-2"
                  >
                    {searchLoading ? (
                      <p className="px-3 py-2 text-xs text-[var(--muted)]">
                        Recherche en cours...
                      </p>
                    ) : searchError ? (
                      <p className="px-3 py-2 text-xs text-red-400">{searchError}</p>
                    ) : searchResults.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-[var(--muted)]">
                        Aucun resultat pour &quot;{searchQuery.trim()}&quot;.
                      </p>
                    ) : (
                      searchResults.map((item, index) => {
                        const isActive = activeSearchIndex === index;
                        return (
                          <button
                            key={`${item.kind}-${item.id}-${item.href}`}
                            id={`global-search-option-${index}`}
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            onMouseDown={(event) => {
                              event.preventDefault();
                            }}
                            onMouseEnter={() => setActiveSearchIndex(index)}
                            onClick={() => handleSelectSearchResult(item)}
                            className={`flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-2 text-left transition ${
                              isActive
                                ? "border-emerald-300/30 bg-emerald-400/15"
                                : "border-transparent hover:border-white/15 hover:bg-white/5"
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-[var(--text)]">
                                {item.title}
                              </span>
                              {item.subtitle ? (
                                <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
                                  {item.subtitle}
                                </span>
                              ) : null}
                            </span>
                            <span
                              className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.55rem] uppercase tracking-wide ${
                                SEARCH_KIND_STYLES[item.kind]
                              }`}
                            >
                              {SEARCH_KIND_LABELS[item.kind]}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                  <div className="border-t border-white/10 px-3 py-2 text-[0.65rem] uppercase tracking-wide text-[var(--muted)]">
                    Fleches pour naviguer - Entree pour ouvrir - Echap pour fermer
                  </div>
                </div>
              ) : null}
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
              void loadMessageNotifications();
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
                <span className="hidden min-[1050px]:inline">{userEmail ?? roleLabel}</span>
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
                messageNotifications.pendingCoachContactRequestsCount === 0 &&
                messageNotifications.pendingModerationReportsCount === 0 ? (
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
                    <div className="space-y-2">
                      <p className="text-[0.65rem] uppercase tracking-[0.25em] text-[var(--muted)]">
                        Demandes contact coach
                      </p>

                      {messageNotifications.pendingCoachContactRequests.length === 0 ? (
                        <div className="rounded-2xl border border-violet-300/25 bg-violet-400/10 p-4">
                          <p className="text-sm text-[var(--text)]">
                            {messageNotifications.pendingCoachContactRequestsCount} demande(s) en attente.
                          </p>
                          <Link
                            href="/app/coach/messages?contacts=open"
                            onClick={() => setRequestsOpen(false)}
                            className="mt-3 inline-flex rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs uppercase tracking-wide text-[var(--text)]"
                          >
                            Traiter dans messages
                          </Link>
                        </div>
                      ) : (
                        <>
                          {messageNotifications.pendingCoachContactRequests.map((request) => (
                            <Link
                              key={request.id}
                              href={`/app/coach/messages?contacts=open&requestId=${request.id}`}
                              onClick={() => setRequestsOpen(false)}
                              className="block rounded-2xl border border-violet-300/25 bg-violet-400/10 p-4 transition hover:border-violet-300/40"
                            >
                              <p className="text-sm font-semibold text-[var(--text)]">
                                {request.requesterName ?? request.requesterEmail ?? "Coach"}
                              </p>
                              <p className="mt-1 text-xs text-[var(--muted)]">
                                {request.requesterEmail ?? "Email indisponible"}
                              </p>
                              <p className="mt-3 inline-flex rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--text)]">
                                Traiter la demande
                              </p>
                            </Link>
                          ))}
                          {messageNotifications.pendingCoachContactRequestsCount >
                          messageNotifications.pendingCoachContactRequests.length ? (
                            <p className="text-xs text-[var(--muted)]">
                              +
                              {messageNotifications.pendingCoachContactRequestsCount -
                                messageNotifications.pendingCoachContactRequests.length}{" "}
                              autre(s) demande(s)
                            </p>
                          ) : null}
                        </>
                      )}
                    </div>
                  ) : null}

                  {messageNotifications.pendingModerationReportsCount > 0 &&
                  !isStudent &&
                  isWorkspaceAdmin ? (
                    <div className="space-y-2">
                      <p className="text-[0.65rem] uppercase tracking-[0.25em] text-[var(--muted)]">
                        Signalements messagerie
                      </p>
                      <Link
                        href="/app/coach/messages?moderation=open"
                        onClick={() => setRequestsOpen(false)}
                        className="block rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 transition hover:border-amber-300/40"
                      >
                        <p className="text-sm font-semibold text-[var(--text)]">
                          {messageNotifications.pendingModerationReportsCount} signalement(s) a traiter
                        </p>
                        <p className="mt-2 text-xs text-[var(--muted)]">
                          Ouvrir la console de moderation messagerie.
                        </p>
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
