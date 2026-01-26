"use client";

import { isAdminEmail } from "@/lib/admin";
import { useProfile } from "./profile-context";

type AdminGuardProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

export default function AdminGuard({ children, fallback }: AdminGuardProps) {
  const { userEmail, loading } = useProfile();

  if (loading) {
    return (
      <section className="panel rounded-2xl p-6">
        <p className="text-sm text-[var(--muted)]">Chargement des droits...</p>
      </section>
    );
  }

  if (!isAdminEmail(userEmail)) {
    return (
      fallback ?? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-[var(--muted)]">
            Acces reserve a l administrateur.
          </p>
        </section>
      )
    );
  }

  return <>{children}</>;
}
