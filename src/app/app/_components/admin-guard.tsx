"use client";

import { useEffect, useState } from "react";
import { isAdminEmail } from "@/lib/admin";
import { supabase } from "@/lib/supabase/client";
import { useProfile } from "./profile-context";

type AdminGuardProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

type BackofficeStatusResponse = {
  enabled: boolean;
  unlocked: boolean;
  username: string | null;
  error?: string;
};

export default function AdminGuard({ children, fallback }: AdminGuardProps) {
  const { userEmail, loading } = useProfile();
  const [statusLoading, setStatusLoading] = useState(false);
  const [backofficeEnabled, setBackofficeEnabled] = useState(false);
  const [backofficeUnlocked, setBackofficeUnlocked] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");

  const isAdmin = isAdminEmail(userEmail);

  useEffect(() => {
    if (loading || !isAdmin) return;
    let cancelled = false;

    const loadBackofficeStatus = async () => {
      setStatusLoading(true);
      setUnlockError("");

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        if (cancelled) return;
        setBackofficeEnabled(true);
        setBackofficeUnlocked(false);
        setUnlockError("Session invalide. Reconnecte-toi.");
        setStatusLoading(false);
        return;
      }

      const response = await fetch("/api/admin/access/status", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const payload = (await response.json()) as BackofficeStatusResponse;
      if (cancelled) return;

      if (!response.ok) {
        setBackofficeEnabled(true);
        setBackofficeUnlocked(false);
        setUnlockError(payload.error ?? "Verification backoffice impossible.");
        setStatusLoading(false);
        return;
      }

      setBackofficeEnabled(payload.enabled);
      setBackofficeUnlocked(payload.enabled ? payload.unlocked : true);
      setStatusLoading(false);
    };

    loadBackofficeStatus();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, loading]);

  const handleUnlock = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUnlockError("");
    setUnlocking(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setUnlockError("Session invalide. Reconnecte-toi.");
      setUnlocking(false);
      return;
    }

    const response = await fetch("/api/admin/access/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        identifier: identifier.trim(),
        password,
      }),
    });

    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setUnlockError(payload.error ?? "Deblocage impossible.");
      setUnlocking(false);
      return;
    }

    setBackofficeUnlocked(true);
    setPassword("");
    setUnlocking(false);
    window.dispatchEvent(new CustomEvent("backoffice:unlocked"));
  };

  if (loading) {
    return (
      <section className="panel rounded-2xl p-6">
        <p className="text-sm text-[var(--muted)]">Chargement des droits...</p>
      </section>
    );
  }

  if (!isAdmin) {
    return (
      fallback ?? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-[var(--muted)]">Acces reserve a l administrateur.</p>
        </section>
      )
    );
  }

  if (statusLoading) {
    return (
      <section className="panel rounded-2xl p-6">
        <p className="text-sm text-[var(--muted)]">
          Verification du verrou backoffice...
        </p>
      </section>
    );
  }

  if (backofficeEnabled && !backofficeUnlocked) {
    return (
      <section className="panel rounded-2xl p-6">
        <p className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">
          Verrou Backoffice
        </p>
        <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">
          Debloquer l acces administrateur
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Renseigne l identifiant et le mot de passe backoffice.
        </p>

        <form className="mt-4 space-y-3" onSubmit={handleUnlock}>
          <div>
            <label
              htmlFor="backoffice-identifier"
              className="text-xs uppercase tracking-wide text-[var(--muted)]"
            >
              Identifiant
            </label>
            <input
              id="backoffice-identifier"
              name="identifier"
              autoComplete="username"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2.5 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
              placeholder="admin-backoffice"
            />
          </div>
          <div>
            <label
              htmlFor="backoffice-password"
              className="text-xs uppercase tracking-wide text-[var(--muted)]"
            >
              Mot de passe backoffice
            </label>
            <input
              id="backoffice-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2.5 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
            />
          </div>
          {unlockError ? <p className="text-sm text-red-400">{unlockError}</p> : null}
          <button
            type="submit"
            disabled={unlocking}
            className="rounded-full border border-emerald-300/35 bg-emerald-400/15 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-400/20 disabled:opacity-60"
          >
            {unlocking ? "Verification..." : "Debloquer le backoffice"}
          </button>
        </form>
      </section>
    );
  }

  return <>{children}</>;
}
