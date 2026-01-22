"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import RoleGuard from "../_components/role-guard";
import { useProfile } from "../_components/profile-context";

type Student = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
};

type Report = {
  id: string;
  title: string;
  report_date: string | null;
  created_at: string;
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

      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      const email = userData.user?.email;
      if (userError || !email) {
        setError("Impossible de charger ton profil.");
        setLoading(false);
        return;
      }

      const { data: studentData, error: studentError } = await supabase
        .from("students")
        .select("id, first_name, last_name, email")
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
          <p className="text-sm text-[var(--muted)]">
            Acces reserve aux eleves.
          </p>
        </section>
      }
    >
      {loading ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-[var(--muted)]">
            Chargement du dashboard...
          </p>
        </section>
      ) : error ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-red-400">{error}</p>
        </section>
      ) : noStudent ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-[var(--muted)]">
            Ce compte n est pas associe a un eleve. Connecte toi avec un email
            eleve ou demande au coach de t associer.
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
        </div>
      )}
    </RoleGuard>
  );
}
