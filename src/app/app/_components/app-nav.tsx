"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useProfile } from "./profile-context";
import { isAdminEmail } from "@/lib/admin";
import { supabase } from "@/lib/supabase/client";
import { useThemePreference } from "./use-theme-preference";
import { resolveEffectivePlanTier } from "@/lib/plans";
import {
  MESSAGES_NOTIFICATIONS_SYNC_EVENT,
  type MessageNotificationsSyncDetail,
} from "@/lib/messages/client-events";
import { MessageNotificationsResponseSchema } from "@/lib/messages/types";

type NavItem = {
  label: string;
  href: string;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

type AppNavProps = {
  onNavigate?: () => void;
  onCollapse?: () => void;
  forceExpanded?: boolean;
};

export default function AppNav({ onNavigate, onCollapse, forceExpanded }: AppNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useThemePreference();
  const { profile, loading, userEmail, organization, isWorkspaceAdmin, planTier } =
    useProfile();
  const isAdmin = isAdminEmail(userEmail);
  const workspaceType = organization?.workspace_type ?? "personal";
  const orgPlanTier = resolveEffectivePlanTier(
    organization?.plan_tier,
    organization?.plan_tier_override,
    organization?.plan_tier_override_expires_at,
    new Date(),
    organization?.plan_tier_override_starts_at,
    organization?.plan_tier_override_unlimited
  ).tier;
  const effectiveOrgMessagingTier =
    orgPlanTier === "free" && planTier !== "free" ? planTier : orgPlanTier;
  const showMessagingEntry =
    profile?.role === "student" ||
    !(workspaceType === "org" && effectiveOrgMessagingTier === "free");
  const [messageUnreadCount, setMessageUnreadCount] = useState(0);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("gc.navCollapsed") === "true";
  });
  const isCollapsed = forceExpanded ? false : collapsed;

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("gc.navCollapsed", String(collapsed));
  }, [collapsed]);

  const loadMessageUnreadCount = useCallback(async () => {
    if (!profile || !showMessagingEntry) {
      setMessageUnreadCount(0);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setMessageUnreadCount(0);
      return;
    }

    const response = await fetch("/api/messages/notifications", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      setMessageUnreadCount(0);
      return;
    }

    const payload = await response.json().catch(() => null);
    const parsed = MessageNotificationsResponseSchema.safeParse(payload);
    if (!parsed.success) {
      setMessageUnreadCount(0);
      return;
    }

    setMessageUnreadCount(parsed.data.unreadMessagesCount);
  }, [profile, showMessagingEntry]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadMessageUnreadCount();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadMessageUnreadCount]);

  useEffect(() => {
    const handleFocus = () => {
      void loadMessageUnreadCount();
    };

    const interval = window.setInterval(() => {
      void loadMessageUnreadCount();
    }, 30_000);

    window.addEventListener("focus", handleFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadMessageUnreadCount]);

  useEffect(() => {
    const handleSync = (event: Event) => {
      const customEvent = event as CustomEvent<MessageNotificationsSyncDetail>;
      const unreadMessagesCount = customEvent.detail?.unreadMessagesCount;
      if (typeof unreadMessagesCount === "number") {
        setMessageUnreadCount(Math.max(0, unreadMessagesCount));
      }

      if (customEvent.detail?.refetch ?? false) {
        void loadMessageUnreadCount();
      }
    };

    window.addEventListener(MESSAGES_NOTIFICATIONS_SYNC_EVENT, handleSync as EventListener);
    return () => {
      window.removeEventListener(
        MESSAGES_NOTIFICATIONS_SYNC_EVENT,
        handleSync as EventListener
      );
    };
  }, [loadMessageUnreadCount]);

  const sections: NavSection[] = [];

  if (!loading) {
    if (profile?.role === "parent") {
      sections.push({
        title: "Parent",
        items: [{ label: "Portail parent", href: "/parent" }],
      });
    } else if (profile?.role === "student") {
      sections.push({
        title: "Eleve",
        items: [
          { label: "Dashboard eleve", href: "/app/eleve" },
          { label: "Calendrier", href: "/app/eleve/calendrier" },
          { label: "Tests", href: "/app/eleve/tests" },
          { label: "Rapports", href: "/app/eleve/rapports" },
          ...(showMessagingEntry
            ? [{ label: "Messages", href: "/app/eleve/messages" }]
            : []),
        ],
      });
    } else if (workspaceType === "org") {
      sections.push({
        title: "Organisation",
        items: [
          { label: "Dashboard", href: "/app/coach" },
          { label: "Elèves", href: "/app/coach/eleves" },
          { label: "Calendrier", href: "/app/coach/calendrier" },
          { label: "Tests", href: "/app/coach/tests" },
          ...(showMessagingEntry
            ? [{ label: "Messages", href: "/app/coach/messages" }]
            : []),
          { label: "Propositions", href: "/app/org/proposals" },
          { label: "Gestion Groupe", href: "/app/org" },
          ...(isWorkspaceAdmin
            ? [
                { label: "Gestion Staff", href: "/app/org/members" },
                { label: "Reglages org", href: "/app/org/settings" },
              ]
            : []),
        ],
      });
    } else {
      sections.push({
        title: "Menu",
        items: [
          { label: "Dashboard", href: "/app/coach" },
          { label: "Elèves", href: "/app/coach/eleves" },
          { label: "Calendrier", href: "/app/coach/calendrier" },
          { label: "Tests", href: "/app/coach/tests" },
          ...(showMessagingEntry
            ? [{ label: "Messages", href: "/app/coach/messages" }]
            : []),
          { label: "Rapports", href: "/app/coach/rapports" },
        ],
      });
    }
  }

  if (!loading && isAdmin) {
    sections.push({
      title: "Backoffice",
      items: [
        { label: "Dashboard", href: "/app/admin" },
        { label: "Tarifs", href: "/app/admin/pricing" },
        { label: "Coachs", href: "/app/admin/coaches" },
        { label: "Analytics", href: "/app/admin/analytics" },
        { label: "Logs", href: "/app/admin/logs" },
      ],
    });
  }

  const handleCollapse = () => {
    if (onCollapse) {
      onCollapse();
      return;
    }
    setCollapsed((prev) => !prev);
  };

  const isActive = (href: string) => {
    const currentPath = pathname ?? "";

    if (href === "/app") {
      return currentPath === "/app";
    }
    if (href === "/app/coach") {
      return currentPath === "/app/coach";
    }
    if (href === "/app/eleve") {
      return currentPath === "/app/eleve";
    }
    if (href === "/app/admin") {
      return currentPath === "/app/admin";
    }
    if (href === "/app/org") {
      return (
        currentPath === "/app/org" ||
        currentPath === "/app/org/groups" ||
        currentPath.startsWith("/app/org/groups/")
      );
    }
    if (href === "/app/org/proposals") {
      return currentPath === "/app/org/proposals" || currentPath.startsWith("/app/org/proposals/");
    }
    if (href === "/app/org/members") {
      return currentPath === "/app/org/members" || currentPath.startsWith("/app/org/members/");
    }
    if (href === "/app/org/settings") {
      return (
        currentPath === "/app/org/settings" || currentPath.startsWith("/app/org/settings/")
      );
    }
    return currentPath === href || currentPath.startsWith(`${href}/`);
  };

  const settingsNavItem: NavItem | null = !loading
    ? profile?.role === "student"
      ? { label: "Parametres", href: "/app/eleve/parametres" }
      : profile?.role === "parent"
        ? null
      : {
          label: workspaceType === "org" ? "Parametres org" : "Parametres",
          href: "/app/coach/parametres",
        }
    : null;
  const workspacesNavItem: NavItem | null =
    !loading && profile?.role !== "student" && profile?.role !== "parent"
      ? { label: "Espace de travail", href: "/app" }
      : null;

  const handleSignOut = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (token) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }).catch(() => null);
    }
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("gc.rememberMe");
    }
    router.replace("/");
  };

  const brandIconUrl = "/branding/logo.png";
  const brandWordmarkUrl = "/branding/wordmark.png";

  const iconForHref = (href: string) => {
    const sharedProps = {
      className: "h-4 w-4",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round" as const,
      strokeLinejoin: "round" as const,
    };
    if (href === "/app") {
      return (
        <svg viewBox="0 0 24 24" {...sharedProps}>
          <path d="M3 10.5l9-7 9 7" />
          <path d="M5 10v10h14V10" />
        </svg>
      );
    }
    if (href === "/app/coach") {
      return (
        <svg viewBox="0 0 24 24" {...sharedProps}>
          <rect x="3" y="3" width="8" height="8" rx="2" />
          <rect x="13" y="3" width="8" height="8" rx="2" />
          <rect x="3" y="13" width="8" height="8" rx="2" />
          <rect x="13" y="13" width="8" height="8" rx="2" />
        </svg>
      );
    }
    if (href === "/app/coach/eleves") {
      return (
        <svg viewBox="0 0 24 24" {...sharedProps}>
          <circle cx="8" cy="8" r="3" />
          <circle cx="16" cy="10" r="3" />
          <path d="M3 20c0-3 3-5 6-5" />
          <path d="M12 20c0-3 3-5 6-5" />
        </svg>
      );
    }
    if (href === "/app/coach/calendrier") {
      return (
        <svg viewBox="0 0 24 24" {...sharedProps}>
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M16 2v4" />
          <path d="M8 2v4" />
          <path d="M3 10h18" />
        </svg>
      );
    }
    if (href === "/app/coach/rapports") {
      return (
        <svg viewBox="0 0 24 24" {...sharedProps}>
          <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          <path d="M14 3v5h5" />
        </svg>
      );
    }
    if (href === "/app/coach/tests") {
      return (
        <svg viewBox="0 0 24 24" {...sharedProps}>
          <path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
          <path d="M9 7h6" />
          <path d="M9 11h6" />
          <path d="M9 15h4" />
        </svg>
      );
    }
    if (href === "/app/coach/messages" || href === "/app/eleve/messages") {
      return (
        <svg viewBox="0 0 24 24" {...sharedProps}>
          <path d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4V8a2 2 0 0 1 2-2z" />
        </svg>
      );
    }
    if (href === "/app/coach/rapports/nouveau") {
      return (
        <svg viewBox="0 0 24 24" {...sharedProps}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    }
    if (href === "/app/coach/parametres") {
      return (
        <svg viewBox="0 0 24 24" {...sharedProps}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a7.8 7.8 0 0 0 .1-6l2-1-2-3-2 1a8 8 0 0 0-5-2l-.5-2h-4l-.5 2a8 8 0 0 0-5 2l-2-1-2 3 2 1a7.8 7.8 0 0 0 .1 6l-2 1 2 3 2-1a8 8 0 0 0 5 2l.5 2h4l.5-2a8 8 0 0 0 5-2l2 1 2-3-2-1z" />
        </svg>
      );
    }
    if (href === "/app/org/members") {
      return (
        <svg viewBox="0 0 24 24" {...sharedProps}>
          <circle cx="8" cy="8" r="3" />
          <circle cx="16" cy="8" r="3" />
          <path d="M3 20c0-3 3-5 6-5" />
          <path d="M12 20c0-3 3-5 6-5" />
        </svg>
      );
    }
    if (href === "/app/org/settings") {
      return (
        <svg viewBox="0 0 24 24" {...sharedProps}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a7.8 7.8 0 0 0 .1-6l2-1-2-3-2 1a8 8 0 0 0-5-2l-.5-2h-4l-.5 2a8 8 0 0 0-5 2l-2-1-2 3 2 1a7.8 7.8 0 0 0 .1 6l-2 1 2 3 2-1a8 8 0 0 0 5 2l.5 2h4l.5-2a8 8 0 0 0 5-2l2 1 2-3-2-1z" />
        </svg>
      );
    }
    if (href === "/app/org/proposals") {
      return (
        <svg viewBox="0 0 24 24" {...sharedProps}>
          <path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
          <path d="M9 7h6" />
          <path d="M9 11h6" />
          <path d="M9 15h4" />
        </svg>
      );
    }
    if (href === "/app/eleve") {
      return (
        <svg viewBox="0 0 24 24" {...sharedProps}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
        </svg>
      );
    }
    if (href === "/app/eleve/rapports") {
      return (
        <svg viewBox="0 0 24 24" {...sharedProps}>
          <path d="M6 3h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          <path d="M14 3v5h5" />
          <path d="M8 13h8" />
          <path d="M8 17h5" />
        </svg>
      );
    }
    if (href === "/app/eleve/tests") {
      return (
        <svg viewBox="0 0 24 24" {...sharedProps}>
          <path d="M5 4h10a3 3 0 0 1 3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
          <path d="M9 4V2h6v2" />
          <path d="M7 10h10" />
          <path d="M7 14h7" />
        </svg>
      );
    }
    if (href === "/app/eleve/calendrier") {
      return (
        <svg viewBox="0 0 24 24" {...sharedProps}>
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M16 2v4" />
          <path d="M8 2v4" />
          <path d="M3 10h18" />
        </svg>
      );
    }
    if (href === "/app/eleve/parametres") {
      return (
        <svg viewBox="0 0 24 24" {...sharedProps}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a7.8 7.8 0 0 0 .1-6l2-1-2-3-2 1a8 8 0 0 0-5-2l-.5-2h-4l-.5 2a8 8 0 0 0-5 2l-2-1-2 3 2 1a7.8 7.8 0 0 0 .1 6l-2 1 2 3 2-1a8 8 0 0 0 5 2l.5 2h4l.5-2a8 8 0 0 0 5-2l2 1 2-3-2-1z" />
        </svg>
      );
    }
    if (href === "/app/admin") {
      return (
        <svg viewBox="0 0 24 24" {...sharedProps}>
          <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z" />
        </svg>
      );
    }
    if (href === "/app/admin/pricing") {
      return (
        <svg viewBox="0 0 24 24" {...sharedProps}>
          <path d="M12 3v18" />
          <path d="M8 7h7a2 2 0 0 1 0 4H9a2 2 0 0 0 0 4h7" />
        </svg>
      );
    }
    if (href === "/app/admin/coaches") {
      return (
        <svg viewBox="0 0 24 24" {...sharedProps}>
          <circle cx="8" cy="8" r="3" />
          <circle cx="16" cy="10" r="3" />
          <path d="M3 20c0-3 3-5 6-5" />
          <path d="M12 20c0-3 3-5 6-5" />
        </svg>
      );
    }
    if (href === "/app/admin/analytics") {
      return (
        <svg viewBox="0 0 24 24" {...sharedProps}>
          <path d="M4 19h16" />
          <path d="M6 16V9" />
          <path d="M12 16V5" />
          <path d="M18 16v-7" />
        </svg>
      );
    }
    if (href === "/app/admin/logs") {
      return (
        <svg viewBox="0 0 24 24" {...sharedProps}>
          <path d="M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
          <path d="M7 8h10" />
          <path d="M7 12h10" />
          <path d="M7 16h6" />
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 24 24" {...sharedProps}>
        <circle cx="12" cy="12" r="9" />
      </svg>
    );
  };

  return (
    <aside
      className={`flex h-full min-h-0 w-auto flex-col overflow-hidden rounded-3xl bg-[var(--app-surface)] transition-[width,padding] duration-200 ${
        isCollapsed ? "py-4 lg:w-16" : "py-4 lg:w-60"
      }`}
    >
      <div className={`flex items-center justify-between gap-2 ${isCollapsed ? "px-1" : ""}`}>
        <Link
          href="/app"
          onClick={onNavigate}
          className={`group flex min-w-0 items-center gap-2 rounded-2xl border border-transparent py-2 transition hover:border-white/10 hover:bg-white/5 ${
            isCollapsed ? "px-1 justify-center" : "px-2"
          }`}
          aria-label="Aller au dashboard"
          title="Dashboard"
        >
          <img
            src={brandIconUrl}
            alt="Logo SwingFlow"
            className="h-9 w-9 object-contain"
          />
          {!isCollapsed ? (
            <img
              src={brandWordmarkUrl}
              alt="SwingFlow"
              className="h-7 w-auto max-w-[160px] object-contain"
            />
          ) : null}
        </Link>

        {onCollapse ? (
          <button
            type="button"
            onClick={handleCollapse}
            aria-label="Fermer la navigation"
            title="Fermer"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted)] opacity-70 transition hover:bg-white/5 hover:text-[var(--text)] hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/40"
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
        ) : !forceExpanded ? (
          <button
            type="button"
            onClick={handleCollapse}
            title={isCollapsed ? "Etendre la navigation" : "Reduire la navigation"}
            aria-label={isCollapsed ? "Etendre la navigation" : "Reduire la navigation"}
            className="hidden h-9 w-9 items-center justify-center rounded-full text-[var(--muted)] opacity-70 transition hover:bg-white/5 hover:text-[var(--text)] hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/40 lg:inline-flex"
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
              <path d={isCollapsed ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
            </svg>
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <nav className="min-h-0 flex-1 space-y-6 overflow-auto pr-1 text-sm">
        {loading ? (
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
            Chargement...
          </p>
        ) : null}
        {sections.map((section) => (
          <div key={section.title} className="space-y-3">
            {!isCollapsed ? (
              <p className="text-xs font-semibold px-5 uppercase tracking-[0.2em] text-[var(--muted)]">
                {section.title}
              </p>
            ) : null}
            <div
              className={`space-y-2 ${isCollapsed ? "" : " border-white/10"}`}
            >
              {section.items.map((item) => {
                const active = isActive(item.href);
                const isMessagingItem =
                  item.href === "/app/coach/messages" || item.href === "/app/eleve/messages";
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    aria-label={item.label}
                    onClick={onNavigate}
                    className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2 transition ${
                      isCollapsed
                        ? `justify-center px-2 py-3 ${
                            active
                              ? "text-[var(--text)]"
                              : "text-[var(--muted)] hover:text-[var(--text)]"
                          }`
                        : `justify-between ${
                            active
                              ? "text-[var(--text)]"
                              : "text-[var(--muted)] hover:text-[var(--text)]"
                          }`
                    }`}
                  >
                    {active ? (
                      <span className="absolute left-0 top-1/2 h-12 w-3 -translate-y-1/2 -translate-x-1.25 rounded-full bg-[var(--accent)]" />
                    ) : null}
                    <span className="flex min-w-0 flex-1 items-center gap-3">
                      <span
                        className={`relative flex h-8 w-8 items-center justify-center transition ${
                          isCollapsed
                            ? active
                              ? "text-[var(--accent)]"
                              : "text-[var(--muted)] group-hover:text-[var(--text)]"
                            : active
                              ? "text-[var(--accent)]"
                              : "text-[var(--muted)] group-hover:text-[var(--text)]"
                        }`}
                      >
                        {iconForHref(item.href)}
                        {isMessagingItem && messageUnreadCount > 0 ? (
                          <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[0.6rem] font-semibold text-white">
                            {messageUnreadCount > 99 ? "99+" : messageUnreadCount}
                          </span>
                        ) : null}
                      </span>
                      {!isCollapsed ? (
                        <span className={`whitespace-nowrap ${active ? "font-medium" : ""}`}>
                          {item.label}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
        </nav>

        <div className="mt-4 shrink-0 pt-4">
          {!isCollapsed ? (
            <p className="text-xs pl-5 font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
              General
            </p>
          ) : null}
          <div className={`mt-3 space-y-2 ${isCollapsed ? "" : "pl-1"}`}>
            {workspacesNavItem ? (() => {
              const active = isActive(workspacesNavItem.href);
              return (
                <Link
                  href={workspacesNavItem.href}
                  onClick={onNavigate}
                  title={workspacesNavItem.label}
                  aria-label={workspacesNavItem.label}
                  className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/40 ${
                    isCollapsed
                      ? `justify-center ${
                          active
                            ? "text-[var(--text)]"
                            : "text-[var(--muted)] hover:text-[var(--text)]"
                        }`
                      : `justify-between ${
                          active
                            ? "bg-white/10 text-[var(--text)]"
                            : "text-[var(--muted)] hover:bg-white/5 hover:text-[var(--text)]"
                        }`
                  }`}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      className={`flex h-8 w-8 items-center justify-center transition ${
                        active
                          ? "text-[var(--accent)]"
                          : "text-[var(--muted)] group-hover:text-[var(--text)]"
                      }`}
                      aria-hidden="true"
                    >
                      {iconForHref(workspacesNavItem.href)}
                    </span>
                    {!isCollapsed ? <span className="truncate">{workspacesNavItem.label}</span> : null}
                  </span>
                </Link>
              );
            })() : null}
            {settingsNavItem ? (() => {
              const active = isActive(settingsNavItem.href);
              return (
                <Link
                  href={settingsNavItem.href}
                  onClick={onNavigate}
                  title={settingsNavItem.label}
                  aria-label={settingsNavItem.label}
                  className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/40 ${
                    isCollapsed
                      ? `justify-center ${
                          active
                            ? "text-[var(--text)]"
                            : "text-[var(--muted)] hover:text-[var(--text)]"
                        }`
                      : `justify-between ${
                          active
                            ? "bg-white/10 text-[var(--text)]"
                            : "text-[var(--muted)] hover:bg-white/5 hover:text-[var(--text)]"
                        }`
                  }`}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      className={`flex h-8 w-8 items-center justify-center transition ${
                        active
                          ? "text-[var(--accent)]"
                          : "text-[var(--muted)] group-hover:text-[var(--text)]"
                      }`}
                      aria-hidden="true"
                    >
                      {iconForHref(settingsNavItem.href)}
                    </span>
                    {!isCollapsed ? <span className="truncate">{settingsNavItem.label}</span> : null}
                  </span>
                </Link>
              );
            })() : null}
              <button
                type="button"
                onClick={toggleTheme}
                title="Theme"
                aria-label={theme === "light" ? "Basculer en mode sombre" : "Basculer en mode clair"}
                role="switch"
                aria-checked={theme === "light"}
                className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/40 ${
                  isCollapsed
                    ? "justify-center text-[var(--muted)] hover:bg-white/50 hover:text-[var(--text)]"
                    : "justify-between text-[var(--muted)] hover:bg-white/50 hover:text-[var(--text)]"
                }`}
              >
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center text-[var(--muted)] transition group-hover:text-[var(--text)]">
                    {theme === "dark" ? (
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
                        <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
                      </svg>
                    ) : (
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
                        <circle cx="12" cy="12" r="4" />
                        <path d="M12 2v2" />
                        <path d="M12 20v2" />
                        <path d="M4.93 4.93l1.41 1.41" />
                        <path d="M17.66 17.66l1.41 1.41" />
                        <path d="M2 12h2" />
                        <path d="M20 12h2" />
                        <path d="M6.34 17.66l-1.41 1.41" />
                        <path d="M19.07 4.93l-1.41 1.41" />
                      </svg>
                    )}
                  </span>
                  {!isCollapsed ? <span className="truncate">Theme</span> : null}
                </span>

                {!isCollapsed ? (
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                      {theme === "light" ? "Clair" : "Sombre"}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`relative inline-flex h-6 w-11 items-center rounded-full border transition ${
                        theme === "light"
                          ? "border-emerald-300/40 bg-emerald-400/10"
                          : "border-white/15 bg-white/5"
                      }`}
                    >
                      <span
                        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full border border-white/10 bg-white shadow-sm transition-transform ${
                          theme === "light" ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </span>
                  </span>
                ) : null}
              </button>

            <button
              type="button"
              onClick={() => void handleSignOut()}
              title="Se deconnecter"
              aria-label="Se deconnecter"
              className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2 transition ${
                isCollapsed
                  ? "justify-center text-[var(--muted)] hover:text-[var(--text)]"
                  : "justify-between text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center text-[var(--muted)] transition group-hover:text-[var(--text)]">
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
                    <path d="M10 17l5-5-5-5" />
                    <path d="M15 12H3" />
                    <path d="M21 3v18" />
                  </svg>
                </span>
                {!isCollapsed ? <span className="whitespace-nowrap">Se deconnecter</span> : null}
              </span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

