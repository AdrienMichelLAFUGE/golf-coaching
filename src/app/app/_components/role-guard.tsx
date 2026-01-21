"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProfile } from "./profile-context";

type RoleGuardProps = {
  allowedRoles: Array<"owner" | "coach" | "staff" | "student">;
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

export default function RoleGuard({
  allowedRoles,
  children,
  fallback,
}: RoleGuardProps) {
  const { profile, loading } = useProfile();
  const didUpdateStudent = useRef(false);

  useEffect(() => {
    if (didUpdateStudent.current) return;
    if (!profile || profile.role !== "student") return;

    didUpdateStudent.current = true;

    const markStudentActive = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email;
      if (!email) return;

      const { data: student } = await supabase
        .from("students")
        .select("id, activated_at")
        .ilike("email", email)
        .maybeSingle();

      if (!student || student.activated_at) return;

      await supabase
        .from("students")
        .update({ activated_at: new Date().toISOString() })
        .eq("id", student.id);
    };

    markStudentActive();
  }, [profile]);

  if (loading) {
    return (
      <section className="panel rounded-2xl p-6">
        <p className="text-sm text-[var(--muted)]">
          Chargement des droits...
        </p>
      </section>
    );
  }

  if (!profile || !allowedRoles.includes(profile.role)) {
    return (
      fallback ?? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-[var(--muted)]">
            Acces reserve a ce profil.
          </p>
        </section>
      )
    );
  }

  return <>{children}</>;
}
