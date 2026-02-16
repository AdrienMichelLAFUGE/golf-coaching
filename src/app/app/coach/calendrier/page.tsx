"use client";

import Link from "next/link";
import RoleGuard from "../../_components/role-guard";
import PageHeader from "../../_components/page-header";
import { useProfile } from "../../_components/profile-context";
import CoachCalendar from "../../_components/student-calendar/CoachCalendar";

export default function CoachCalendarPage() {
  const { organization } = useProfile();
  const locale = organization?.locale ?? "fr-FR";
  const timezone = organization?.timezone ?? "Europe/Paris";

  return (
    <RoleGuard
      allowedRoles={["owner", "coach", "staff"]}
      fallback={
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-[var(--muted)]">Acces reserve aux coachs.</p>
        </section>
      }
    >
      <div className="space-y-6">
        <PageHeader
          overline={
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Calendrier coach
            </p>
          }
          title="Echeances de vos eleves"
          subtitle="Vue unifiee des tournois, competitions et entrainements."
          actions={
            <>
              <Link
                href="/app/coach"
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
              >
                Dashboard
              </Link>
              <Link
                href="/app/coach/eleves"
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
              >
                Eleves
              </Link>
            </>
          }
        />

        <div className="panel rounded-2xl p-4 md:p-6">
          <CoachCalendar locale={locale} timezone={timezone} />
        </div>
      </div>
    </RoleGuard>
  );
}
