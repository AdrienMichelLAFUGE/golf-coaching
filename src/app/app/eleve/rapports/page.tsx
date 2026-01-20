import Link from "next/link";

const reports = [
  { id: "bilan-swing", title: "Bilan swing", date: "12/01/2026" },
  { id: "putting-precision", title: "Putting precision", date: "05/01/2026" },
  { id: "drills-approche", title: "Approche 30m", date: "19/12/2025" },
];

export default function StudentReportsPage() {
  return (
    <div className="space-y-6">
      <section className="panel rounded-2xl p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
          Rapports
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
          Historique complet
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Acces a tous tes rapports et recommandations.
        </p>
      </section>

      <section className="panel rounded-2xl p-6">
        <div className="space-y-3">
          {reports.map((report) => (
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
