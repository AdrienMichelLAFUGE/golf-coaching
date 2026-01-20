export default function CoachStudentsPage() {
  return (
    <div className="space-y-6">
      <section className="panel rounded-2xl p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Eleves
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
              Annuaire eleves
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Recherche rapide, suivi et historique des rapports.
            </p>
          </div>
          <button
            type="button"
            className="rounded-full bg-white/10 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
          >
            Nouvel eleve
          </button>
        </div>
      </section>

      <section className="panel-soft rounded-2xl p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <input
            type="text"
            placeholder="Rechercher un eleve"
            className="w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-4 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500 md:max-w-sm"
          />
          <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <span>24 eleves actifs</span>
            <span>•</span>
            <span>4 en attente de rapport</span>
          </div>
        </div>
      </section>

      <section className="panel rounded-2xl p-6">
        <div className="grid gap-3 text-sm text-[var(--muted)]">
          <div className="grid grid-cols-[1.5fr_1fr_1fr] gap-3 uppercase tracking-wide text-[0.7rem] text-[var(--muted)]">
            <span>Eleve</span>
            <span>Dernier rapport</span>
            <span>Statut</span>
          </div>
          {[
            {
              name: "Camille Dupont",
              lastReport: "Bilan swing - 12/01",
              status: "En attente",
            },
            {
              name: "Liam Martin",
              lastReport: "Putting - 05/01",
              status: "Envoye",
            },
            {
              name: "Nora Petit",
              lastReport: "Driver - 19/12",
              status: "Envoye",
            },
          ].map((student) => (
            <div
              key={student.name}
              className="grid grid-cols-[1.5fr_1fr_1fr] gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-[var(--text)]"
            >
              <span className="font-medium">{student.name}</span>
              <span className="text-sm text-[var(--muted)]">
                {student.lastReport}
              </span>
              <span className="text-xs uppercase tracking-wide text-[var(--accent)]">
                {student.status}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
