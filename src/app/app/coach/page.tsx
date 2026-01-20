export default function CoachDashboardPage() {
  return (
    <div className="space-y-6">
      <section className="panel rounded-2xl p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
          Dashboard coach
        </p>
        <h2 className="mt-3 font-[var(--font-display)] text-3xl font-semibold">
          Vue d ensemble
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Suivi rapide des eleves, rapports et sessions a venir.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Eleves actifs", value: "24" },
          { label: "Rapports envoyes", value: "58" },
          { label: "Sessions cette semaine", value: "6" },
        ].map((item) => (
          <div key={item.label} className="panel-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
              {item.label}
            </p>
            <p className="mt-3 text-3xl font-semibold text-[var(--text)]">
              {item.value}
            </p>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Derniere mise a jour aujourd hui
            </p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="panel rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-[var(--text)]">
            Eleves a suivre
          </h3>
          <div className="mt-4 space-y-3">
            {[
              { name: "Camille Dupont", note: "Bilan swing a valider" },
              { name: "Liam Martin", note: "Programme putting a revoir" },
              { name: "Nora Petit", note: "Progression driver rapide" },
            ].map((student) => (
              <div
                key={student.name}
                className="rounded-xl border border-white/5 bg-white/5 px-4 py-3"
              >
                <p className="text-sm font-medium text-[var(--text)]">
                  {student.name}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {student.note}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="panel rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-[var(--text)]">
            Prochaines actions
          </h3>
          <ul className="mt-4 space-y-3 text-sm text-[var(--muted)]">
            <li className="rounded-xl border border-white/5 bg-white/5 px-4 py-3">
              Envoyer le rapport a Jules (technique wedge)
            </li>
            <li className="rounded-xl border border-white/5 bg-white/5 px-4 py-3">
              Preparer la seance du jeudi (drills power)
            </li>
            <li className="rounded-xl border border-white/5 bg-white/5 px-4 py-3">
              Relancer 2 eleves sans feedback
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
