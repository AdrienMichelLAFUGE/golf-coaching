"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { waitForRecoveredSession } from "@/lib/auth/session-recovery";
import { supabase } from "@/lib/supabase/client";
import { useThemePreference } from "@/app/app/_components/use-theme-preference";

type ParentShellProps = {
  children: React.ReactNode;
};

type AuthState = "checking" | "ready";

export default function ParentShell({ children }: ParentShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggleTheme } = useThemePreference();
  const [authState, setAuthState] = useState<AuthState>("checking");

  useEffect(() => {
    let active = true;

    const currentPath =
      typeof window === "undefined"
        ? "/parent"
        : `${window.location.pathname}${window.location.search}`;
    const safeNextPath = currentPath.startsWith("/parent") ? currentPath : "/parent";

    const checkParentSession = async () => {
      const session = await waitForRecoveredSession(supabase.auth, { timeoutMs: 1400 });
      if (!active) return;

      if (!session) {
        router.replace(`/login/parent?next=${encodeURIComponent(safeNextPath)}`);
        return;
      }

      const token = session.access_token;
      const response = await fetch("/api/onboarding/ensure-profile", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json().catch(() => ({}))) as {
        role?: string;
      };

      if (!response.ok || payload.role !== "parent") {
        router.replace("/app");
        return;
      }

      setAuthState("ready");
    };

    void checkParentSession();

    return () => {
      active = false;
    };
  }, [router]);

  const handleSignOut = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (token) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
    }
    await supabase.auth.signOut();
    router.replace("/login/parent");
  };

  if (authState !== "ready") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/35 backdrop-blur-[1.5px]" />
        <div className="relative rounded-full border border-white/15 bg-[var(--bg-elevated)]/80 px-5 py-2 text-xs uppercase tracking-[0.22em] text-[var(--muted)]">
          Verification de la session...
        </div>
      </div>
    );
  }

  const isChildrenView = pathname?.startsWith("/parent/children/") ?? false;

  return (
    <div className="min-h-screen bg-[var(--app-canvas)] px-3 py-4 text-[var(--text)] md:px-6 md:py-6">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4">
        <header className="panel rounded-2xl px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="h-9 w-9 rounded-full border border-white/10 bg-white/10" />
              <div className="min-w-0">
                <p className="truncate text-xs uppercase tracking-[0.25em] text-[var(--muted)]">
                  Espace parent
                </p>
                <h1 className="truncate text-sm font-semibold text-[var(--text)]">
                  SwingFlow
                </h1>
              </div>
              <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-amber-200">
                Lecture seule
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/parent"
                className={`rounded-full border px-3 py-1.5 text-xs uppercase tracking-wide transition ${
                  !isChildrenView
                    ? "border-white/20 bg-white/10 text-[var(--text)]"
                    : "border-white/10 bg-white/5 text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                Mes enfants
              </Link>
              <button
                type="button"
                onClick={toggleTheme}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
              >
                {theme === "light" ? "Mode sombre" : "Mode clair"}
              </button>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
              >
                Deconnexion
              </button>
            </div>
          </div>
        </header>

        <main className="app-main min-w-0 space-y-4 rounded-3xl bg-[var(--app-surface)] p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
