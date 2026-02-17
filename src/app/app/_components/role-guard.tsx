"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { useProfile } from "./profile-context";

type RoleGuardProps = {
  allowedRoles: Array<"owner" | "coach" | "staff" | "student" | "parent">;
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

export default function RoleGuard({ allowedRoles, children, fallback }: RoleGuardProps) {
  const { profile, loading } = useProfile();
  const didUpdateStudent = useRef(false);

  useEffect(() => {
    if (didUpdateStudent.current) return;
    if (!profile || profile.role !== "student") return;

    didUpdateStudent.current = true;

    const markStudentActive = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;

      const { data: accounts } = await supabase
        .from("student_accounts")
        .select("student_id")
        .eq("user_id", userId);

      const studentIds = (accounts ?? []).map((account) => account.student_id);
      if (studentIds.length === 0) return;

      const { data: students } = await supabase
        .from("students")
        .select("id, activated_at")
        .in("id", studentIds);

      const idsToUpdate =
        students?.filter((student) => !student.activated_at).map((s) => s.id) ?? [];

      if (idsToUpdate.length === 0) return;

      await supabase
        .from("students")
        .update({ activated_at: new Date().toISOString() })
        .in("id", idsToUpdate);
    };

    markStudentActive();
  }, [profile]);

  if (loading) {
    return (
      <section className="panel rounded-2xl p-6">
        <p className="text-sm text-[var(--muted)]">Chargement des droits...</p>
      </section>
    );
  }

  if (!profile || !allowedRoles.includes(profile.role)) {
    return (
      fallback ?? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-[var(--muted)]">Acces reserve a ce profil.</p>
        </section>
      )
    );
  }

  return <>{children}</>;
}
