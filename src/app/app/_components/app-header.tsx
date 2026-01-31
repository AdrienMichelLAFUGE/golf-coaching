"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useProfile } from "./profile-context";

type AppHeaderProps = {
  onToggleNav?: () => void;
  isNavOpen?: boolean;
};

export default function AppHeader({ onToggleNav, isNavOpen }: AppHeaderProps) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    const storedTheme = window.localStorage.getItem("gc.theme");
    const prefersLight =
      window.matchMedia?.("(prefers-color-scheme: light)").matches ?? false;
    if (storedTheme === "light" || storedTheme === "dark") {
      return storedTheme;
    }
    return prefersLight ? "light" : "dark";
  });
  const { profile, organization } = useProfile();

  const roleLabel = profile?.role === "student" ? "Eleve" : "Coach";
  const avatarFallback = (profile?.full_name || email || "Coach").charAt(0).toUpperCase();
  const logoFallback = (organization?.name || "Golf Coaching").charAt(0).toUpperCase();
  const mobileIdentityUrl = profile?.avatar_url ?? organization?.logo_url ?? null;
  const mobileIdentityAlt = profile?.avatar_url ? "Photo de profil" : "Logo";
  const mobileIdentityFallback = profile?.avatar_url ? avatarFallback : logoFallback;

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
    if (typeof window === "undefined") return;
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("gc.theme", theme);
  }, [theme]);

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
    router.replace("/");
  };

  const toggleTheme = () => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  };

  return (
    <header className="relative sticky top-0 z-40 -mx-4 flex w-[calc(100%+2rem)] items-center justify-between gap-3 rounded-none border border-white/5 bg-white/5 px-4 py-2 shadow-[0_18px_45px_rgba(0,0,0,0.35)] backdrop-blur md:px-6 md:py-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="md:hidden">
          {mobileIdentityUrl ? (
            <img
              src={mobileIdentityUrl}
              alt={mobileIdentityAlt}
              className="h-10 w-10 rounded-xl border border-white/10 object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-xs text-[var(--muted)]">
              {mobileIdentityFallback}
            </div>
          )}
        </div>
        <div className="hidden md:block">
          {organization?.logo_url ? (
            <img
              src={organization.logo_url}
              alt="Logo"
              className="h-11 w-11 rounded-xl border border-white/10 object-cover"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-xs text-[var(--muted)]">
              {logoFallback}
            </div>
          )}
        </div>
        <div className="hidden min-w-0 md:block">
          <p className="text-[0.6rem] uppercase tracking-[0.2em] text-[var(--muted)] md:text-xs">
            Golf Coaching
          </p>
        </div>
        {profile ? (
          <div className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.65rem] text-[var(--muted)] md:hidden">
            {roleLabel}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2 pr-16 md:gap-3 md:pr-0">
        <div className="hidden md:block">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt="Photo de profil"
              className="h-10 w-10 rounded-full border border-white/10 object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/10 text-xs text-[var(--muted)]">
              {avatarFallback}
            </div>
          )}
        </div>
        <div className="hidden min-w-0 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-[var(--muted)] md:block">
          <span className="block max-w-[180px] truncate">
            {email ?? "Session active"}
          </span>
        </div>
        {profile ? (
          <div className="hidden rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-[var(--muted)] md:inline-flex">
            {roleLabel}
          </div>
        ) : null}
        <div className="hidden md:flex items-center gap-3">
          <button
            type="button"
            onClick={toggleTheme}
            role="switch"
            aria-checked={theme === "dark"}
            aria-label="Basculer le theme"
            className="relative inline-flex h-9 w-16 items-center rounded-full border border-white/10 bg-white/10 px-1 transition hover:border-white/30"
          >
            <span
              className={`absolute left-1 top-1 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-[var(--bg-elevated)] text-[var(--text)] shadow-[0_8px_16px_rgba(0,0,0,0.25)] transition-transform ${
                theme === "dark" ? "translate-x-0" : "translate-x-7"
              }`}
            >
              {theme === "dark" ? (
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
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
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:border-white/30 hover:bg-white/20"
          >
            Se deconnecter
          </button>
        </div>
        <div className="relative md:hidden" ref={mobileMenuRef}>
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
                  toggleTheme();
                }}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs text-[var(--text)] transition hover:bg-white/5"
              >
                <span>Theme</span>
                <span className="text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                  {theme === "dark" ? "Clair" : "Sombre"}
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMobileMenuOpen(false);
                  void handleSignOut();
                }}
                className="mt-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs text-[var(--text)] transition hover:bg-white/5"
              >
                <span>Se deconnecter</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={onToggleNav}
        aria-label={isNavOpen ? "Fermer la navigation" : "Ouvrir la navigation"}
        aria-expanded={isNavOpen ?? false}
        className="absolute right-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[var(--muted)] transition hover:text-[var(--text)] md:hidden"
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
    </header>
  );
}
