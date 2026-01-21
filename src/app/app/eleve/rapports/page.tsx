"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import RoleGuard from "../../_components/role-guard";

type Report = {
  id: string;
  title: string;
  report_date: string | null;
  created_at: string;
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("fr-FR");
};

export default function StudentReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [noStudent, setNoStudent] = useState(false);

  useEffect(() => {
    const loadReports = async () => {
      setLoading(true);
      setError("");

      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email;

      if (!email) {
        setError("Impossible de charger tes rapports.");
        setLoading(false);
        return;
      }

      const { data: studentData, error: studentError } = await supabase
        .from("students")
        .select("id")
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

      const { data: reportsData, error: reportsError } = await supabase
        .from("reports")
        .select("id, title, report_date, created_at")
        .eq("student_id", studentData.id)
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

    loadReports();
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
          {loading ? (
            <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
              Chargement des rapports...
            </div>
          ) : error ? (
            <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          ) : noStudent ? (
            <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
              Ce compte n est pas associe a un eleve.
            </div>
          ) : reports.length === 0 ? (
            <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
              Aucun rapport disponible pour le moment.
            </div>
          ) : (
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
                      {formatDate(report.report_date ?? report.created_at)}
                    </p>
                  </div>
                  <span className="text-xs text-[var(--muted)]">Lire -&gt;</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </RoleGuard>
  );
}
