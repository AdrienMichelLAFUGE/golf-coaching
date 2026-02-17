import type { CoachDashboardFixture } from "./fixtures";

type CoachDashboardMockProps = {
  fixture: CoachDashboardFixture;
};

function studentInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

export default function CoachDashboardMock({ fixture }: CoachDashboardMockProps) {
  const maxActivity = Math.max(...fixture.activityBars.map((item) => item.value), 1);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
      <div className="flex flex-col gap-4">
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {fixture.kpis.map((kpi) => (
            <article
              key={kpi.label}
              className="rounded-2xl border border-white/12 bg-white/8 px-4 py-3"
            >
              <p className="text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                {kpi.label}
              </p>
              <p className="mt-1 text-2xl font-semibold text-[var(--text)]">{kpi.value}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">{kpi.hint}</p>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-white/12 bg-white/8 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Activité</p>
              <h3 className="mt-1 text-lg font-semibold text-[var(--text)]">7 derniers jours</h3>
            </div>
            <span className="rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
              Rapports créés
            </span>
          </div>

          <div className="mt-5 grid h-36 grid-cols-7 items-end gap-3">
            {fixture.activityBars.map((bar, index) => {
              const isLatest = index === fixture.activityBars.length - 1;
              return (
                <div key={`${bar.day}-${index}`} className="flex flex-col items-center gap-2">
                  <div className="flex h-24 w-5 items-end">
                    <div
                      className={`w-5 rounded-t-3xl ${
                        isLatest
                          ? "bg-gradient-to-t from-emerald-300 via-emerald-200 to-sky-200"
                          : "bg-white/20"
                      }`}
                      style={{ height: `${Math.max(8, Math.round((bar.value / maxActivity) * 100))}%` }}
                    />
                  </div>
                  <span className="text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                    {bar.day}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-white/12 bg-white/8 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--text)]">Liste élèves</h3>
              <span className="rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                Annuaire
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {fixture.students.map((student) => (
                <div
                  key={student.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/6 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xs font-semibold text-[var(--text)]">
                      {studentInitials(student.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text)]">{student.name}</p>
                      <p className="truncate text-xs text-[var(--muted)]">{student.email}</p>
                    </div>
                  </div>
                  <span className="text-xs text-[var(--muted)]">{student.status}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-white/12 bg-white/8 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--text)]">Liste rapports</h3>
              <span className="rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                Derniers
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {fixture.reports.map((report) => (
                <div
                  key={report.id}
                  className="rounded-xl border border-white/10 bg-white/6 px-3 py-2"
                >
                  <p className="truncate text-sm font-medium text-[var(--text)]">{report.title}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {report.studentName} • {report.dateLabel}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <aside className="space-y-4">
        <section className="rounded-2xl border border-white/12 bg-white/8 p-4">
          <h3 className="text-lg font-semibold text-[var(--text)]">Prochaines actions</h3>
          <div className="mt-3 space-y-3">
            {fixture.reminders.map((reminder) => (
              <article
                key={reminder.title}
                className="rounded-xl border border-white/10 bg-white/6 px-3 py-3"
              >
                <p className="text-sm font-semibold text-[var(--text)]">{reminder.title}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{reminder.description}</p>
                <button
                  type="button"
                  className={`mt-3 rounded-full px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.16em] transition ${
                    reminder.tone === "primary"
                      ? "bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 text-zinc-900 hover:opacity-90"
                      : "border border-white/15 bg-white/10 text-[var(--text)] hover:bg-white/20"
                  }`}
                >
                  {reminder.cta}
                </button>
              </article>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}
