"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import RoleGuard from "../../_components/role-guard";
import PageHeader from "../../_components/page-header";
import { useProfile } from "../../_components/profile-context";
import StudentCalendar from "../../_components/student-calendar/StudentCalendar";
import { supabase } from "@/lib/supabase/client";

type StudentRow = {
  id: string;
  org_id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  created_at: string | null;
};

export default function StudentCalendarPage() {
  const { organization } = useProfile();
  const [student, setStudent] = useState<StudentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [noStudent, setNoStudent] = useState(false);

  const locale = organization?.locale ?? "fr-FR";
  const timezone = organization?.timezone ?? "Europe/Paris";

  const studentName = useMemo(() => {
    if (!student) return "Eleve";
    return `${student.first_name} ${student.last_name ?? ""}`.trim();
  }, [student]);

  useEffect(() => {
    let cancelled = false;

    const loadStudent = async () => {
      setLoading(true);
      setError("");
      setNoStudent(false);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (userError || !userId) {
        if (!cancelled) {
          setError("Impossible de charger ton profil.");
          setLoading(false);
        }
        return;
      }

      const { data: accountRows, error: accountError } = await supabase
        .from("student_accounts")
        .select("student_id")
        .eq("user_id", userId);

      if (accountError) {
        if (!cancelled) {
          setError(accountError.message);
          setLoading(false);
        }
        return;
      }

      const studentIds = (accountRows ?? []).map((row) => row.student_id);
      if (studentIds.length === 0) {
        if (!cancelled) {
          setNoStudent(true);
          setLoading(false);
        }
        return;
      }

      const { data: studentsData, error: studentsError } = await supabase
        .from("students")
        .select("id, org_id, first_name, last_name, email, created_at")
        .in("id", studentIds)
        .order("created_at", { ascending: false });

      if (studentsError) {
        if (!cancelled) {
          setError(studentsError.message);
          setLoading(false);
        }
        return;
      }

      const studentRows = (studentsData ?? []) as StudentRow[];
      const workspaceStudent =
        organization?.id
          ? studentRows.find((row) => row.org_id === organization.id) ?? null
          : null;
      const firstStudent = workspaceStudent ?? studentRows[0] ?? null;
      if (!firstStudent) {
        if (!cancelled) {
          setNoStudent(true);
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setStudent(firstStudent);
        setLoading(false);
      }
    };

    void loadStudent();

    return () => {
      cancelled = true;
    };
  }, [organization?.id]);

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
          <p className="text-sm text-[var(--muted)]">Chargement du calendrier...</p>
        </section>
      ) : error ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-red-300">{error}</p>
        </section>
      ) : noStudent || !student ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-[var(--muted)]">
            Ce compte n est pas associe a un eleve.
          </p>
        </section>
      ) : (
        <div className="space-y-6">
          <PageHeader
            overline={
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                Calendrier eleve
              </p>
            }
            title={studentName}
            subtitle="Gere tes echeances de tournois, competitions et entrainements."
            actions={
              <>
                <Link
                  href="/app/eleve"
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                >
                  Dashboard
                </Link>
                <Link
                  href="/app/eleve/rapports"
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                >
                  Rapports
                </Link>
              </>
            }
          />

          <div className="panel rounded-2xl p-4 md:p-6">
            <StudentCalendar
              studentId={student.id}
              mode="student"
              locale={locale}
              timezone={timezone}
            />
          </div>
        </div>
      )}
    </RoleGuard>
  );
}
