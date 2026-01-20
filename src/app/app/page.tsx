import Link from "next/link";

export default function AppPage() {
  return (
    <div className="space-y-6">
      <section className="panel rounded-2xl p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
          Accueil
        </p>
        <h2 className="mt-3 font-[var(--font-display)] text-3xl font-semibold">
          Choisis ton espace de travail
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
          Cet espace sert de point de depart. Les dashboards coach et eleve
          arriveront dans les prochaines etapes.
        </p>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <Link
          href="/app/coach"
          className="panel-soft group rounded-2xl p-6 transition hover:-translate-y-1 hover:border-white/30"
        >
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
            Coach
          </p>
          <h3 className="mt-3 text-2xl font-semibold text-[var(--text)]">
            Gérer les eleves
          </h3>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Suivi des eleves, rapports et progression globale.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--text)]">
            Ouvrir l espace coach
            <span>→</span>
          </div>
        </Link>

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
            <span>→</span>
          </div>
        </Link>
      </section>
    </div>
  );
}
