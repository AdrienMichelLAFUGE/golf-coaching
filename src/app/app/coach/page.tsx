"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import RoleGuard from "../_components/role-guard";
import { useProfile } from "../_components/profile-context";

type ReportRow = {
  id: string;
  title: string;
  report_date: string | null;
  created_at: string;
  students:
    | { first_name: string; last_name: string | null }
    | { first_name: string; last_name: string | null }[]
    | null;
};

const formatDate = (
  value?: string | null,
  locale?: string | null,
  timezone?: string | null
) => {
  if (!value) return "-";
  const options = timezone ? { timeZone: timezone } : undefined;
  return new Date(value).toLocaleDateString(locale ?? "fr-FR", options);
};

export default function CoachDashboardPage() {
  const { organization } = useProfile();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [studentsCount, setStudentsCount] = useState<number | null>(null);
  const [reportsCount, setReportsCount] = useState<number | null>(null);
  const locale = organization?.locale ?? "fr-FR";
  const timezone = organization?.timezone ?? "Europe/Paris";

  useEffect(() => {
    const loadStats = async () => {
      const [{ count: studentTotal }, { count: reportTotal }] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }),
        supabase.from("reports").select("id", { count: "exact", head: true }),
      ]);

      setStudentsCount(studentTotal ?? null);
      setReportsCount(reportTotal ?? null);
    };

    const loadReports = async () => {
      const { data } = await supabase
        .from("reports")
        .select("id, title, report_date, created_at, students(first_name, last_name)")
        .order("created_at", { ascending: false })
        .limit(5);

      setReports(data ?? []);
    };

    loadStats();
    loadReports();
  }, []);

  return (
    <RoleGuard allowedRoles={["owner", "coach", "staff"]}>
      <div className="space-y-6">
        <section className="panel rounded-2xl p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
            Dashboard coach
          </p>
          <h2 className="mt-3 font-[var(--font-display)] text-3xl font-semibold">
            Vue d ensemble
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Suivi rapide des eleves et rapports.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {[
            {
              label: "Eleves actifs",
              value: studentsCount !== null ? `${studentsCount}` : "-",
            },
            {
              label: "Rapports",
              value: reportsCount !== null ? `${reportsCount}` : "-",
            },
            { label: "Prochaine action", value: "En attente" },
          ].map((item) => (
            <div key={item.label} className="panel-soft rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                {item.label}
              </p>
              <p className="mt-3 text-2xl font-semibold text-[var(--text)]">
                {item.value}
              </p>
              <p className="mt-2 text-xs text-[var(--muted)]">
                Derniere mise a jour automatique
              </p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="panel rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--text)]">
                Rapports recents
              </h3>
              <Link
                href="/app/coach/rapports"
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--text)]"
              >
                Voir tout
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {reports.length === 0 ? (
                <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                  Aucun rapport pour le moment.
                </div>
              ) : (
                reports.map((report) => (
                  <Link
                    key={report.id}
                    href={`/app/coach/rapports/${report.id}`}
                    className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--text)] transition hover:border-white/20"
                  >
                    <div>
                      <p className="font-medium">{report.title}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {(() => {
                          const student = Array.isArray(report.students)
                            ? report.students[0]
                            : report.students;
                          if (!student) return "Eleve";
                          return `${student.first_name} ${
                            student.last_name ?? ""
                          }`.trim();
                        })()}
                        {" - "}
                        {formatDate(
                          report.report_date ?? report.created_at,
                          locale,
                          timezone
                        )}
                      </p>
                    </div>
                    <span className="text-xs text-[var(--muted)]">Lire -&gt;</span>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="panel rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-[var(--text)]">Acces rapides</h3>
            <div className="mt-4 space-y-3 text-sm text-[var(--muted)]">
              <Link
                href="/app/coach/eleves"
                className="block rounded-xl border border-white/5 bg-white/5 px-4 py-3 transition hover:border-white/20"
              >
                Gerer les eleves
              </Link>
              <Link
                href="/app/coach/tests"
                className="block rounded-xl border border-white/5 bg-white/5 px-4 py-3 transition hover:border-white/20"
              >
                Tests normalises
              </Link>
              <Link
                href="/app/coach/rapports/nouveau"
                className="block rounded-xl border border-white/5 bg-white/5 px-4 py-3 transition hover:border-white/20"
              >
                Creer un rapport
              </Link>
              <Link
                href="/app/coach/rapports"
                className="block rounded-xl border border-white/5 bg-white/5 px-4 py-3 transition hover:border-white/20"
              >
                Voir tous les rapports
              </Link>
            </div>
          </div>
        </section>
      </div>
    </RoleGuard>
  );
}
