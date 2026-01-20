type ReportDetailPageProps = {
  params: { id: string };
};

export default function ReportDetailPage({ params }: ReportDetailPageProps) {
  const reportTitle = params?.id ? params.id.replace(/-/g, " ") : "rapport";

  return (
    <div className="space-y-6">
      <section className="panel rounded-2xl p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
          Rapport detaille
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
          {reportTitle}
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Resume et recommandations personnalisees.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="panel rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-[var(--text)]">Resume</h3>
          <p className="mt-3 text-sm text-[var(--muted)]">
            Cette seance s est concentree sur la stabilite du bas du corps et
            l alignement du club. Bon rythme global, a maintenir sur les swings
            longs.
          </p>
          <h3 className="mt-6 text-lg font-semibold text-[var(--text)]">
            Exercices recommandes
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
            <li className="rounded-xl border border-white/5 bg-white/5 px-4 py-2">
              20 swings sans balle pour fixer le tempo
            </li>
            <li className="rounded-xl border border-white/5 bg-white/5 px-4 py-2">
              Routine putting 3 distances
            </li>
            <li className="rounded-xl border border-white/5 bg-white/5 px-4 py-2">
              Drill alignement avec 2 clubs au sol
            </li>
          </ul>
        </div>

        <div className="panel-soft rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-[var(--text)]">
            Points clefs
          </h3>
          <div className="mt-4 space-y-3">
            {[
              "Garder le poids sur l avant pied a l impact.",
              "Stabiliser le poignet gauche dans le backswing.",
              "Respiration lente avant chaque swing.",
            ].map((note) => (
              <div
                key={note}
                className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--text)]"
              >
                {note}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
