"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useProfile } from "./profile-context";
import WorkspaceSwitcher from "./workspace-switcher";
import { useThemePreference } from "./use-theme-preference";

type AppHeaderProps = {
  onToggleNav?: () => void;
  isNavOpen?: boolean;
};

export default function AppHeader({ onToggleNav, isNavOpen }: AppHeaderProps) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  useThemePreference();
  const { profile } = useProfile();

  const roleLabel = profile?.role === "student" ? "Eleve" : "Coach";
  const needsProfileName =
    !!profile && profile.role !== "student" && !(profile.full_name ?? "").trim();
  const avatarFallback = (profile?.full_name || email || "Coach").charAt(0).toUpperCase();
  const brandIconUrl = "/branding/logo.png";
  const brandWordmarkUrl = "/branding/wordmark.png";
  const displayName = (profile?.full_name ?? "").trim() || (email ?? "Compte");

  useEffect(() => {
    let active = true;

    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setEmail(data.user?.email ?? null);
    };

    loadUser();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (!mobileMenuRef.current) return;
      if (mobileMenuRef.current.contains(event.target as Node)) return;
      setMobileMenuOpen(false);
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [mobileMenuOpen]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("gc.rememberMe");
    }
    router.replace("/");
  };

  return (
    <header className="relative sticky top-4 z-40 flex w-full items-center gap-3 rounded-3xl bg-[var(--app-surface)] px-4 py-3 min-[880px]:top-6 min-[880px]:px-6 min-[880px]:py-4">
      <WorkspaceSwitcher />
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {onToggleNav ? (
          <button
            type="button"
            onClick={onToggleNav}
            aria-label={isNavOpen ? "Fermer la navigation" : "Ouvrir la navigation"}
            aria-expanded={isNavOpen ?? false}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[var(--muted)] transition hover:bg-white hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/50 min-[880px]:hidden"
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

        <Link
          href="/app"
          className="flex min-w-0 items-center gap-2 min-[880px]:hidden"
        >
          <img
            src={brandIconUrl}
            alt="Logo SwingFlow"
            className="h-10 w-10 shrink-0 object-contain"
          />
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
              className="w-full rounded-full border-white/20 bg-white/90 py-4 pl-9 pr-4 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/50"
            />
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-2 min-[880px]:flex">
          <button
            type="button"
            aria-label="Messages"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-[var(--muted)] transition hover:bg-white hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/50"
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
              <path d="M4 4h16v14H5.2L4 19.2V4z" />
              <path d="M6 8h12" />
              <path d="M6 12h10" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Notifications"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-[var(--muted)] transition hover:bg-white hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/50"
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
          </button>
        </div>

        

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

        <div className="relative min-[880px]:hidden" ref={mobileMenuRef}>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-haspopup="menu"
            aria-expanded={mobileMenuOpen}
            aria-label="Actions"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[var(--muted)] transition hover:text-[var(--text)]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
          </button>
          {mobileMenuOpen ? (
            <div
              role="menu"
              className="absolute right-0 z-50 mt-2 w-44 rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-2 shadow-[0_20px_50px_rgba(0,0,0,0.45)]"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMobileMenuOpen(false);
                  void handleSignOut();
                }}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs text-[var(--text)] transition hover:bg-white/5"
              >
                <span>Se deconnecter</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
