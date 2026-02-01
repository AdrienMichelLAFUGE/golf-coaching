"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "./_components/profile-context";
import WorkspaceSelector from "./_components/workspace-selector";

export default function AppPage() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const isStudent = profile?.role === "student";
  const isCoach = profile && profile.role !== "student";

  useEffect(() => {
    if (!loading && profile?.role === "student") {
      router.replace("/app/eleve");
    }
  }, [loading, profile?.role, router]);

  if (!loading && isStudent) {
    return (
      <section className="panel rounded-2xl p-6">
        <p className="text-sm text-[var(--muted)]">Redirection vers ton dashboard...</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <WorkspaceSelector />
      <section className="panel rounded-2xl p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Accueil</p>
        <h2 className="mt-3 font-[var(--font-display)] text-3xl font-semibold">
          Bienvenue sur Golf Coaching
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
          Choisis ton espace de travail selon ton profil.
        </p>
      </section>

      {loading ? (
        <section className="panel-soft rounded-2xl p-6 text-sm text-[var(--muted)]">
          Chargement du profil...
        </section>
      ) : (
        <section className="grid gap-6 md:grid-cols-2">
          {isCoach ? (
            <Link
              href="/app/coach"
              className="panel-soft group rounded-2xl p-6 transition hover:-translate-y-1 hover:border-white/30"
            >
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                Coach
              </p>
              <h3 className="mt-3 text-2xl font-semibold text-[var(--text)]">
                Gerer les eleves
              </h3>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Suivi des eleves, rapports et progression globale.
              </p>
              <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--text)]">
                Ouvrir l espace coach
                <span>-&gt;</span>
              </div>
            </Link>
          ) : null}

          {isStudent ? (
            <Link
              href="/app/eleve"
              className="panel-soft group rounded-2xl p-6 transition hover:-translate-y-1 hover:border-white/30"
            >
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                Eleve
              </p>
              <h3 className="mt-3 text-2xl font-semibold text-[var(--text)]">
                Consulter les rapports
              </h3>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Acces rapide aux insights et a l historique.
              </p>
              <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--text)]">
                Ouvrir l espace eleve
                <span>-&gt;</span>
              </div>
            </Link>
          ) : null}
        </section>
      )}
    </div>
  );
}
