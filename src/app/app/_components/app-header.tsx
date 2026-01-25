"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useProfile } from "./profile-context";

export default function AppHeader() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const { profile, organization } = useProfile();

  const roleLabel = profile?.role === "student" ? "Eleve" : "Coach";
  const avatarFallback = (profile?.full_name || email || "Coach")
    .charAt(0)
    .toUpperCase();
  const logoFallback = (organization?.name || "Golf Coaching")
    .charAt(0)
    .toUpperCase();

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
    const storedTheme = window.localStorage.getItem("gc.theme");
    const prefersLight =
      window.matchMedia?.("(prefers-color-scheme: light)").matches ?? false;
    const nextTheme =
      storedTheme === "light" || storedTheme === "dark"
        ? storedTheme
        : prefersLight
        ? "light"
        : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("gc.theme", theme);
  }, [theme]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/");
  };

  const toggleTheme = () => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  };

  return (
    <header className="flex flex-col gap-4 rounded-2xl border border-white/5 bg-white/5 px-6 py-4 shadow-[0_18px_45px_rgba(0,0,0,0.35)] backdrop-blur md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
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
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
            Golf Coaching
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-[var(--text)] md:text-3xl">
            Tableau de bord
          </h1>
        </div>
      </div>
      <div className="flex w-full flex-wrap items-center gap-3 md:w-auto">
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
        <div className="min-w-0 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-[var(--muted)]">
          <span className="block max-w-[180px] truncate">
            {email ?? "Session active"}
          </span>
        </div>
        {profile ? (
          <div className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-[var(--muted)]">
            {roleLabel}
          </div>
        ) : null}
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
    </header>
  );
}
