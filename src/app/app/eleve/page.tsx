"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import RoleGuard from "../_components/role-guard";
import { useProfile } from "../_components/profile-context";

type Student = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  tpi_report_id: string | null;
};

type Report = {
  id: string;
  title: string;
  report_date: string | null;
  created_at: string;
};

type TpiReport = {
  id: string;
  status: "processing" | "ready" | "error";
  created_at?: string;
};

type TpiTest = {
  id: string;
  test_name: string;
  result_color: "green" | "orange" | "red";
  mini_summary: string | null;
  position: number;
};

const tpiColorRank: Record<TpiTest["result_color"], number> = {
  red: 0,
  orange: 1,
  green: 2,
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

export default function StudentDashboardPage() {
  const { organization } = useProfile();
  const [student, setStudent] = useState<Student | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [tpiReport, setTpiReport] = useState<TpiReport | null>(null);
  const [tpiTests, setTpiTests] = useState<TpiTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [noStudent, setNoStudent] = useState(false);
  const locale = organization?.locale ?? "fr-FR";
  const timezone = organization?.timezone ?? "Europe/Paris";

  const latestReport = useMemo(() => reports[0], [reports]);
  const studentName = useMemo(() => {
    if (!student) return "Eleve";
    return `${student.first_name} ${student.last_name ?? ""}`.trim();
  }, [student]);

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      setError("");

      const { data: userData, error: userError } = await supabase.auth.getUser();

      const email = userData.user?.email;
      if (userError || !email) {
        setError("Impossible de charger ton profil.");
        setLoading(false);
        return;
      }

      const { data: studentData, error: studentError } = await supabase
        .from("students")
        .select("id, first_name, last_name, email, tpi_report_id")
        .ilike("email", email)
        .maybeSingle();

      if (studentError) {
        setError(studentError.message);
        setLoading(false);
        return;
      }

      if (!studentData) {
        setNoStudent(true);
        setLoading(false);
        return;
      }

      setStudent(studentData);

      let reportData: TpiReport | null = null;

      if (studentData.tpi_report_id) {
        const { data } = await supabase
          .from("tpi_reports")
          .select("id, status, created_at")
          .eq("id", studentData.tpi_report_id)
          .single();
        if (data) reportData = data as TpiReport;
      }

      if (!reportData) {
        const { data } = await supabase
          .from("tpi_reports")
          .select("id, status, created_at")
          .eq("student_id", studentData.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) reportData = data as TpiReport;
      }

      if (reportData && reportData.status !== "ready") {
        const { data } = await supabase
          .from("tpi_reports")
          .select("id, status, created_at")
          .eq("student_id", studentData.id)
          .eq("status", "ready")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) reportData = data as TpiReport;
      }

      if (reportData) {
        setTpiReport(reportData);
        const { data: testsData } = await supabase
          .from("tpi_tests")
          .select("id, test_name, result_color, mini_summary, position")
          .eq("report_id", reportData.id)
          .order("position", { ascending: true });
        const normalizedTests = (testsData ?? []) as TpiTest[];
        const sorted = [...normalizedTests].sort((a, b) => {
          const rank = tpiColorRank[a.result_color] - tpiColorRank[b.result_color];
          if (rank !== 0) return rank;
          return a.position - b.position;
        });
        setTpiTests(sorted);
      } else {
        setTpiReport(null);
        setTpiTests([]);
      }

      const { data: reportsData, error: reportsError } = await supabase
        .from("reports")
        .select("id, title, report_date, created_at")
        .eq("student_id", studentData.id)
        .not("sent_at", "is", null)
        .order("report_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (reportsError) {
        setError(reportsError.message);
        setLoading(false);
        return;
      }

      setReports(reportsData ?? []);
      setLoading(false);
    };

    loadDashboard();
  }, []);

  return (
    <RoleGuard
      allowedRoles={["student"]}
      fallback={
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-[var(--muted)]">Acces reserve aux eleves.</p>
        </section>
      }
    >
      {loading ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-[var(--muted)]">Chargement du dashboard...</p>
        </section>
      ) : error ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-red-400">{error}</p>
        </section>
      ) : noStudent ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-[var(--muted)]">
            Ce compte n est pas associe a un eleve. Connecte toi avec un email eleve ou
            demande au coach de t associer.
          </p>
        </section>
      ) : (
        <div className="space-y-6">
          <section className="panel rounded-2xl p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Dashboard eleve
            </p>
            <h2 className="mt-3 font-[var(--font-display)] text-3xl font-semibold">
              Bienvenue {studentName}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Acces direct a tes rapports et points clefs.
            </p>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            {[
              {
                label: "Dernier rapport",
                value: formatDate(
                  latestReport?.report_date ?? latestReport?.created_at,
                  locale,
                  timezone
                ),
              },
              {
                label: "Rapports disponibles",
                value: `${reports.length}`,
              },
              {
                label: "Mise a jour",
                value: formatDate(
                  latestReport?.report_date ?? latestReport?.created_at,
                  locale,
                  timezone
                ),
              },
            ].map((item) => (
              <div key={item.label} className="panel-soft rounded-2xl p-4">
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  {item.label}
                </p>
                <p className="mt-3 text-xl font-semibold text-[var(--text)]">
                  {item.value}
                </p>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Donnees basees sur tes rapports
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
              {reports.length === 0 ? (
                <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                  Aucun rapport disponible pour le moment.
                </div>
              ) : (
                reports.slice(0, 3).map((report) => (
                  <Link
                    key={report.id}
                    href={`/app/eleve/rapports/${report.id}`}
                    className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--text)] transition hover:border-white/20"
                  >
                    <div>
                      <p className="font-medium">{report.title}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
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
          </section>

          <section className="panel relative rounded-2xl border-l-2 border-rose-400/40 p-6">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-0 h-0.5 w-full rounded-t-2xl bg-rose-400/80"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text)]">
                  Profil TPI
                  {tpiReport?.created_at ? (
                    <span className="text-sm font-medium text-[var(--muted)]">
                      {" "}
                      - {formatDate(tpiReport.created_at, locale, timezone)}
                    </span>
                  ) : null}
                </h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Resume visuel de ton screening physique pour suivre tes progres.
                </p>
              </div>
              {tpiReport ? (
                <span className="rounded-full border border-rose-300/30 bg-rose-400/10 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-rose-200">
                  {tpiReport.status === "processing"
                    ? "Analyse en cours"
                    : tpiReport.status === "ready"
                      ? "Pret"
                      : "Erreur"}
                </span>
              ) : null}
            </div>

            {tpiReport?.status === "ready" ? (
              <div className="mt-4 grid gap-3">
                {tpiTests.length === 0 ? (
                  <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                    Aucun test TPI disponible.
                  </div>
                ) : (
                  tpiTests.map((test) => {
                    const colorClass =
                      test.result_color === "green"
                        ? "bg-emerald-400"
                        : test.result_color === "orange"
                          ? "bg-amber-400"
                          : "bg-rose-400";
                    return (
                      <div
                        key={test.id}
                        className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${colorClass}`} />
                          <p className="text-sm font-semibold text-[var(--text)]">
                            {test.test_name}
                          </p>
                        </div>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {test.mini_summary || "-"}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            ) : tpiReport?.status === "processing" ? (
              <p className="mt-3 text-sm text-[var(--muted)]">
                Analyse en cours. Le resume sera disponible bientot.
              </p>
            ) : (
              <p className="mt-3 text-sm text-[var(--muted)]">
                Aucun rapport TPI disponible pour le moment.
              </p>
            )}
          </section>
        </div>
      )}
    </RoleGuard>
  );
}
