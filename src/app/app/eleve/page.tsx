import Link from "next/link";

export default function StudentDashboardPage() {
  return (
    <div className="space-y-6">
      <section className="panel rounded-2xl p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
          Dashboard eleve
        </p>
        <h2 className="mt-3 font-[var(--font-display)] text-3xl font-semibold">
          Ton suivi golf
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Acces direct a tes rapports et points clefs.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Dernier rapport", value: "12/01/2026" },
          { label: "Objectifs actifs", value: "3" },
          { label: "Prochaine seance", value: "Jeu. 25/01" },
        ].map((item) => (
          <div key={item.label} className="panel-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
              {item.label}
            </p>
            <p className="mt-3 text-xl font-semibold text-[var(--text)]">
              {item.value}
            </p>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Mise a jour apres le dernier rapport
            </p>
          </div>
        ))}
      </section>

      <section className="panel rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--text)]">
            Derniers rapports
          </h3>
          <Link
            href="/app/eleve/rapports"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--text)]"
          >
            Voir tout
          </Link>
        </div>
        <div className="mt-4 space-y-3">
          {[
            {
              title: "Bilan swing",
              date: "12/01/2026",
              id: "bilan-swing",
            },
            {
              title: "Putting precision",
              date: "05/01/2026",
              id: "putting-precision",
            },
          ].map((report) => (
            <Link
              key={report.id}
              href={`/app/eleve/rapports/${report.id}`}
              className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--text)] transition hover:border-white/20"
            >
              <div>
                <p className="font-medium">{report.title}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {report.date}
                </p>
              </div>
              <span className="text-xs text-[var(--muted)]">Lire →</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
