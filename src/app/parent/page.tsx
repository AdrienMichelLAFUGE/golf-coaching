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

const fetchWithAuth = async (input: string) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error("Session invalide.");
  }

  return fetch(input, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

export default function ParentHomePage() {
  const router = useRouter();
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadChildren = useCallback(async () => {
    setLoading(true);
    setError("");

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
    router.replace("/parent/link-child");
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
            href="/parent/link-child"
            className="inline-flex rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-400/20"
          >
            Ajouter un enfant
          </Link>
        </div>
      </header>

      {loading ? (
        <section className="panel-soft rounded-2xl p-5 text-sm text-[var(--muted)]">
          Chargement...
        </section>
      ) : error ? (
        <section className="panel-soft rounded-2xl p-5 text-sm text-red-400">{error}</section>
      ) : children.length === 0 ? (
        <section className="panel rounded-2xl p-5">
          <p className="text-sm text-[var(--muted)]">
            Aucun enfant rattache. Redirection vers le formulaire de rattachement...
          </p>
          <Link
            href="/parent/link-child"
            className="mt-4 inline-flex rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-400/20"
          >
            Rattacher un enfant
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
              </div>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}
