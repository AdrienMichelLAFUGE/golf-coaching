"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useProfile } from "./profile-context";
import { isAdminEmail } from "@/lib/admin";

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
  const { profile, loading, userEmail } = useProfile();
  const isAdmin = isAdminEmail(userEmail);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("gc.navCollapsed") === "true";
  });
  const isCollapsed = forceExpanded ? false : collapsed;

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("gc.navCollapsed", String(collapsed));
  }, [collapsed]);

  const sections: NavSection[] = [];

  if (!loading) {
    if (profile?.role === "student") {
      sections.push({
        title: "Eleve",
        items: [
          { label: "Dashboard eleve", href: "/app/eleve" },
          { label: "Tests", href: "/app/eleve/tests" },
          { label: "Rapports", href: "/app/eleve/rapports" },
          { label: "Parametres", href: "/app/eleve/parametres" },
        ],
      });
    } else {
      sections.push({
        title: "General",
        items: [{ label: "Accueil", href: "/app" }],
      });
      sections.push({
        title: "Coach",
        items: [
          { label: "Dashboard", href: "/app/coach" },
          { label: "Eleves", href: "/app/coach/eleves" },
          { label: "Tests", href: "/app/coach/tests" },
          { label: "Rapports", href: "/app/coach/rapports" },
          { label: "Parametres", href: "/app/coach/parametres" },
        ],
      });
    }
  }

  if (!loading && isAdmin) {
    sections.push({
      title: "Admin",
      items: [
        { label: "Dashboard", href: "/app/admin" },
        { label: "Tarifs", href: "/app/admin/pricing" },
        { label: "Coachs", href: "/app/admin/coaches" },
        { label: "Analytics", href: "/app/admin/analytics" },
      ],
    });
  }

  const isActive = (href: string) => {
    if (href === "/app") {
      return pathname === "/app";
    }
    if (href === "/app/coach") {
      return pathname === "/app/coach";
    }
    if (href === "/app/eleve") {
      return pathname === "/app/eleve";
    }
    return pathname === href || pathname?.startsWith(`${href}/`);
  };

  const showReportSectionsToggle = Boolean(
    pathname?.startsWith("/app/coach/rapports/nouveau")
  );

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
    return (
      <svg viewBox="0 0 24 24" {...sharedProps}>
        <circle cx="12" cy="12" r="9" />
      </svg>
    );
  };

  return (
    <aside
      className={`panel-soft w-full rounded-2xl transition-[width,padding] duration-200 ${
        isCollapsed ? "px-2 py-4 lg:w-16" : "px-4 py-5 lg:w-60"
      }`}
    >
      <div
        className={`flex items-center gap-2 ${
          isCollapsed ? "justify-center" : "justify-between"
        }`}
      >
        {!isCollapsed ? (
          <p className="text-[0.65rem] uppercase tracking-[0.25em] text-[var(--muted)]">
            Navigation
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => {
            if (onCollapse) {
              onCollapse();
              return;
            }
            setCollapsed((prev) => !prev);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)]"
          aria-label={
            onCollapse
              ? "Masquer la navigation"
              : isCollapsed
                ? "Etendre le menu"
                : "Reduire le menu"
          }
        >
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={isCollapsed ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
          </svg>
        </button>
      </div>
      <nav className="mt-4 space-y-6 text-sm">
        {loading ? (
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
            Chargement du profil...
          </p>
        ) : null}
        {sections.map((section) => (
          <div key={section.title} className="space-y-3">
            {!isCollapsed ? (
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                {section.title}
              </p>
            ) : null}
            <div
              className={`space-y-2 ${isCollapsed ? "" : "border-l border-white/10 pl-3"}`}
            >
              {section.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    aria-label={item.label}
                    onClick={onNavigate}
                    className={`group relative flex w-full items-center gap-3 transition ${
                      isCollapsed
                        ? `justify-center rounded-xl border px-2 py-3 ${
                            active
                              ? "border-white/30 bg-white/10 text-[var(--text)] shadow-[0_12px_25px_rgba(0,0,0,0.35)]"
                              : "border-white/5 bg-white/5 text-[var(--muted)] hover:border-white/20 hover:bg-white/10 hover:text-[var(--text)]"
                          }`
                        : `justify-between px-2 py-2 ${
                            active
                              ? "text-[var(--text)]"
                              : "text-[var(--muted)] hover:text-[var(--text)]"
                          }`
                    }`}
                  >
                    {active ? (
                      <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-emerald-300/70" />
                    ) : null}
                    <span className="flex min-w-0 flex-1 items-center gap-3">
                      <span
                        className={`flex h-8 w-8 items-center justify-center text-[var(--muted)] transition ${
                          isCollapsed
                            ? "rounded-lg border border-transparent bg-transparent group-hover:text-[var(--text)]"
                            : active
                              ? "text-[var(--text)]"
                              : "group-hover:text-[var(--text)]"
                        }`}
                      >
                        {iconForHref(item.href)}
                      </span>
                      {!isCollapsed ? (
                        <span className="whitespace-nowrap">{item.label}</span>
                      ) : null}
                    </span>
                    {!isCollapsed ? (
                      <span
                        className={`ml-auto flex h-5 w-5 items-center justify-center text-[var(--muted)] transition ${
                          active ? "text-[var(--text)]" : "group-hover:text-[var(--text)]"
                        }`}
                        aria-hidden="true"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="h-3.5 w-3.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
        {showReportSectionsToggle ? (
          <div className="space-y-3">
            {!isCollapsed ? (
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                Rapport
              </p>
            ) : null}
            <div
              className={`space-y-2 ${isCollapsed ? "" : "border-l border-white/10 pl-3"}`}
            >
              <button
                type="button"
                onClick={() => {
                  if (typeof window === "undefined") return;
                  window.dispatchEvent(new CustomEvent("gc:toggle-report-sections"));
                }}
                className={`group relative flex w-full items-center gap-3 transition ${
                  isCollapsed
                    ? "justify-center rounded-xl border border-white/5 bg-white/5 px-2 py-3 text-[var(--muted)] hover:border-white/20 hover:bg-white/10 hover:text-[var(--text)]"
                    : "justify-between px-2 py-2 text-[var(--muted)] hover:text-[var(--text)]"
                }`}
                aria-label="Sections du rapport"
                title="Sections"
              >
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <span
                    className={`flex h-8 w-8 items-center justify-center text-[var(--muted)] transition ${
                      isCollapsed
                        ? "rounded-lg border border-transparent bg-transparent group-hover:text-[var(--text)]"
                        : "group-hover:text-[var(--text)]"
                    }`}
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
                      <rect x="3" y="5" width="7" height="14" rx="1.5" />
                      <rect x="14" y="5" width="7" height="14" rx="1.5" />
                    </svg>
                  </span>
                  {!isCollapsed ? (
                    <span className="whitespace-nowrap">Sections</span>
                  ) : null}
                </span>
                {!isCollapsed ? (
                  <span
                    className="ml-auto flex h-5 w-5 items-center justify-center text-[var(--muted)] transition group-hover:text-[var(--text)]"
                    aria-hidden="true"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </span>
                ) : null}
              </button>
            </div>
          </div>
        ) : null}
      </nav>
    </aside>
  );
}
