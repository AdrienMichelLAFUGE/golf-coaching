"use client";

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
