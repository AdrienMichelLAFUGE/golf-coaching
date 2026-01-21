"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import RoleGuard from "../../../_components/role-guard";

type Student = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  invited_at: string | null;
  created_at: string;
};

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

export default function CoachStudentDetailPage() {
  const params = useParams();
  const studentId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [student, setStudent] = useState<Student | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) return;

    const loadStudent = async () => {
      setLoading(true);
      setError("");

      const { data: studentData, error: studentError } = await supabase
        .from("students")
        .select("id, first_name, last_name, email, invited_at, created_at")
        .eq("id", studentId)
        .single();

      if (studentError) {
        setError(studentError.message);
        setLoading(false);
        return;
      }

      setStudent(studentData);

      const { data: reportData, error: reportError } = await supabase
        .from("reports")
        .select("id, title, report_date, created_at")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false });

      if (reportError) {
        setError(reportError.message);
        setLoading(false);
        return;
      }

      setReports(reportData ?? []);
      setLoading(false);
    };

    loadStudent();
  }, [studentId]);

  const handleDeleteReport = async (report: Report) => {
    const confirmed = window.confirm(`Supprimer le rapport "${report.title}" ?`);
    if (!confirmed) return;

    setDeletingId(report.id);
    const { error: deleteError } = await supabase
      .from("reports")
      .delete()
      .eq("id", report.id);

    if (deleteError) {
      setError(deleteError.message);
      setDeletingId(null);
      return;
    }

    setReports((prev) => prev.filter((item) => item.id !== report.id));
    setDeletingId(null);
  };

  return (
    <RoleGuard allowedRoles={["owner", "coach", "staff"]}>
      {loading ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-[var(--muted)]">
            Chargement de l eleve...
          </p>
        </section>
      ) : error || !student ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-red-400">
            {error || "Eleve introuvable."}
          </p>
        </section>
      ) : (
        <div className="space-y-6">
          <section className="panel rounded-2xl p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Eleve
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
              {student.first_name} {student.last_name ?? ""}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {student.email || "-"}
            </p>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Invite le {formatDate(student.invited_at)} - Cree le{" "}
              {formatDate(student.created_at)}
            </p>
          </section>

          <section className="panel rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--text)]">
                Rapports
              </h3>
              <Link
                href={`/app/coach/rapports/nouveau?studentId=${student.id}`}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--text)]"
              >
                Nouveau rapport
              </Link>
            </div>
            {reports.length === 0 ? (
              <div className="mt-4 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                Aucun rapport pour cet eleve.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {reports.map((report) => (
                  <div
                    key={report.id}
                    className="flex flex-col gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--text)] md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="font-medium">{report.title}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {formatDate(report.report_date ?? report.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/app/coach/rapports/${report.id}`}
                        className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
                      >
                        Ouvrir
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDeleteReport(report)}
                        disabled={deletingId === report.id}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-red-300 transition hover:text-red-200 disabled:opacity-60"
                      >
                        {deletingId === report.id
                          ? "Suppression..."
                          : "Supprimer"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </RoleGuard>
  );
}
