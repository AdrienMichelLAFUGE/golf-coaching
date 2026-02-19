"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type ParentChild = {
  id: string;
  firstName: string;
  lastName: string | null;
  fullName: string;
  email: string | null;
};

const fetchWithAuth = async (input: string, init?: RequestInit) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error("Session invalide.");
  }

  return fetch(input, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
    body: init?.body,
  });
};

export default function ParentHomePage() {
  const router = useRouter();
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [unlinkingChildId, setUnlinkingChildId] = useState<string | null>(null);

  const loadChildren = useCallback(async () => {
    setLoading(true);
    setError("");
    setActionMessage("");

    try {
      const response = await fetchWithAuth("/api/parent/children");
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        children?: ParentChild[];
      };
      if (!response.ok) {
        setError(payload.error ?? "Chargement impossible.");
        setChildren([]);
        setLoading(false);
        return;
      }

      setChildren(payload.children ?? []);
      setLoading(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Chargement impossible.");
      setChildren([]);
      setLoading(false);
    }
  }, []);

  const handleUnlinkChild = useCallback(
    async (childId: string) => {
      const confirmed = window.confirm("Dissocier cet enfant de votre compte parent ?");
      if (!confirmed) return;

      setUnlinkingChildId(childId);
      setActionMessage("");
      setError("");

      try {
        const response = await fetchWithAuth(`/api/parent/children/${childId}/link`, {
          method: "DELETE",
        });
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          setError(payload.error ?? "Dissociation impossible.");
          setUnlinkingChildId(null);
          return;
        }

        setChildren((prev) => prev.filter((child) => child.id !== childId));
        setActionMessage("Enfant dissocie.");
        setUnlinkingChildId(null);
      } catch (unlinkError) {
        setError(unlinkError instanceof Error ? unlinkError.message : "Dissociation impossible.");
        setUnlinkingChildId(null);
      }
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      void loadChildren();
    });
    return () => {
      cancelled = true;
    };
  }, [loadChildren]);

  useEffect(() => {
    if (loading || error) return;
    if (children.length > 0) return;
    router.replace("/parent/invitations/accept");
  }, [children.length, error, loading, router]);

  return (
    <section className="space-y-4">
      <header className="panel rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
              Parent
            </p>
            <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">Mes enfants</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Consultez les informations de suivi en lecture seule.
            </p>
          </div>
          <Link
            href="/parent/invitations/accept"
            className="inline-flex rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-400/20"
          >
            Accepter une invitation
          </Link>
        </div>
      </header>

      {actionMessage ? (
        <section className="panel-soft rounded-2xl p-5 text-sm text-emerald-300">
          {actionMessage}
        </section>
      ) : null}

      {loading ? (
        <section className="panel-soft rounded-2xl p-5 text-sm text-[var(--muted)]">
          Chargement...
        </section>
      ) : error ? (
        <section className="panel-soft rounded-2xl p-5 text-sm text-red-400">{error}</section>
      ) : children.length === 0 ? (
        <section className="panel rounded-2xl p-5">
          <p className="text-sm text-[var(--muted)]">
            Aucun enfant rattache. Redirection vers l acceptation d invitation...
          </p>
          <Link
            href="/parent/invitations/accept"
            className="mt-4 inline-flex rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-400/20"
          >
            Accepter une invitation
          </Link>
        </section>
      ) : (
        <section className="grid gap-3 md:grid-cols-2">
          {children.map((child) => (
            <article
              key={child.id}
              className="panel-soft rounded-2xl border border-white/10 p-4"
            >
              <p className="text-sm font-semibold text-[var(--text)]">{child.fullName}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">{child.email ?? "-"}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/parent/children/${child.id}`}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.16em] text-[var(--text)] transition hover:border-white/30"
                >
                  Ouvrir le suivi
                </Link>
                <Link
                  href={`/parent/children/${child.id}/messages`}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.16em] text-[var(--muted)] transition hover:text-[var(--text)]"
                >
                  Messages
                </Link>
                <button
                  type="button"
                  onClick={() => void handleUnlinkChild(child.id)}
                  disabled={unlinkingChildId === child.id}
                  className="rounded-full border border-rose-300/35 bg-rose-400/10 px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.16em] text-rose-100 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {unlinkingChildId === child.id ? "..." : "Dissocier"}
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}
