"use client";

import PageBack from "../../_components/page-back";
import RoleGuard from "../../_components/role-guard";
import { useProfile } from "../../_components/profile-context";

export default function OrgAnalyticsPage() {
  const { organization } = useProfile();
  const modeLabel =
    (organization?.workspace_type ?? "personal") === "org"
      ? `Organisation : ${organization?.name ?? "Organisation"}`
      : "Espace personnel";
  const modeBadgeTone =
    (organization?.workspace_type ?? "personal") === "org"
      ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
      : "border-sky-300/30 bg-sky-400/10 text-sky-100";

  return (
    <RoleGuard allowedRoles={["owner", "coach", "staff"]}>
      <div className="space-y-6">
        <section className="panel rounded-2xl p-6">
          <div className="flex items-center gap-2">
            <PageBack fallbackHref="/app" />
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Organisation
            </p>
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
            Analytics org
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Suivi des activites et tendances de l organisation.
          </p>
          <div
            className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.6rem] uppercase tracking-[0.25em] ${modeBadgeTone}`}
          >
            Vous travaillez dans {modeLabel}
          </div>
        </section>
      </div>
    </RoleGuard>
  );
}
