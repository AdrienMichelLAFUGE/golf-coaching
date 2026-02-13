"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import RoleGuard from "../../_components/role-guard";
import { useProfile } from "../../_components/profile-context";
import PageHeader from "../../_components/page-header";

type Report = {
  id: string;
  title: string;
  report_date: string | null;
  created_at: string;
  org_id: string;
  organizations?:
    | { name: string | null; workspace_type?: "personal" | "org" | null }[]
    | null;
  author_profile?: { full_name: string | null }[] | null;
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

export default function StudentReportsPage() {
  const { organization } = useProfile();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [noStudent, setNoStudent] = useState(false);
  const locale = organization?.locale ?? "fr-FR";
  const timezone = organization?.timezone ?? "Europe/Paris";
  const formatSourceLabel = (report: Report) => {
    const org = report.organizations?.[0];
    const orgName = org?.name ?? null;
    const workspaceType = org?.workspace_type ?? null;
    if (workspaceType === "personal") {
      return orgName ? `Perso - ${orgName}` : "Workspace perso";
    }
    if (orgName) return `Orga - ${orgName}`;
    if (report.org_id === organization?.id) return "Workspace actuel";
    return "Autre workspace";
  };

  useEffect(() => {
    const loadReports = async () => {
      setLoading(true);
      setError("");

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      if (!userId) {
        setError("Impossible de charger tes rapports.");
        setLoading(false);
        return;
      }

      const { data: accountRows, error: accountError } = await supabase
        .from("student_accounts")
        .select("student_id")
        .eq("user_id", userId);

      if (accountError) {
        setError(accountError.message);
        setLoading(false);
        return;
      }

      const studentIds = (accountRows ?? []).map((row) => row.student_id);
      if (studentIds.length === 0) {
        setNoStudent(true);
        setLoading(false);
        return;
      }

      const { data: reportsData, error: reportsError } = await supabase
        .from("reports")
        .select(
          "id, title, report_date, created_at, org_id, organizations(name, workspace_type), author_profile:profiles!reports_author_id_fkey(full_name)"
        )
        .in("student_id", studentIds)
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

    loadReports();
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
      <div className="space-y-6">
        <PageHeader
          overline={
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Rapports
            </p>
          }
          title="Historique complet"
          subtitle="Acces a tous tes rapports et recommandations."
        />

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
              {reports.map((report) => {
                const authorName = report.author_profile?.[0]?.full_name?.trim() ?? null;
                const sourceLabel = formatSourceLabel(report);
                return (
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
                      {authorName || sourceLabel ? (
                        <div className="mt-1 space-y-0.5 text-xs text-[var(--muted)]">
                          {authorName ? <p>Par : {authorName}</p> : null}
                          {sourceLabel ? <p>dans : {sourceLabel}</p> : null}
                        </div>
                      ) : null}
                    </div>
                    <span className="text-xs text-[var(--muted)]">Lire -&gt;</span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </RoleGuard>
  );
}
