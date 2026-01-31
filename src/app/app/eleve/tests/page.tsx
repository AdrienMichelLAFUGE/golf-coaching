"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import RoleGuard from "../../_components/role-guard";
import { useProfile } from "../../_components/profile-context";
import {
  PELZ_PUTTING_TEST,
  PELZ_PUTTING_SLUG,
} from "@/lib/normalized-tests/pelz-putting";
import { PELZ_APPROCHES_TEST } from "@/lib/normalized-tests/pelz-approches";
import {
  WEDGING_DRAPEAU_LONG_TEST,
  WEDGING_DRAPEAU_LONG_SLUG,
} from "@/lib/normalized-tests/wedging-drapeau-long";
import {
  WEDGING_DRAPEAU_COURT_TEST,
  WEDGING_DRAPEAU_COURT_SLUG,
} from "@/lib/normalized-tests/wedging-drapeau-court";

type AssignmentRow = {
  id: string;
  test_slug: string;
  status: "assigned" | "in_progress" | "finalized";
  assigned_at: string;
  updated_at: string;
  archived_at?: string | null;
};

const statusLabel: Record<AssignmentRow["status"], string> = {
  assigned: "A faire",
  in_progress: "En cours",
  finalized: "Finalise",
};

export default function StudentTestsPage() {
  const { organization } = useProfile();
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const locale = organization?.locale ?? "fr-FR";

  useEffect(() => {
    const loadAssignments = async () => {
      setLoading(true);
      setError("");

      const { data, error: loadError } = await supabase
        .from("normalized_test_assignments")
        .select("id, test_slug, status, assigned_at, updated_at, archived_at")
        .order("assigned_at", { ascending: false });

      if (loadError) {
        setError(loadError.message);
        setLoading(false);
        return;
      }

      const visible = (data ?? []).filter((assignment) => !assignment.archived_at);
      setAssignments(visible as AssignmentRow[]);
      setLoading(false);
    };

    loadAssignments();
  }, []);

  const tests = [
    PELZ_PUTTING_TEST,
    PELZ_APPROCHES_TEST,
    WEDGING_DRAPEAU_LONG_TEST,
    WEDGING_DRAPEAU_COURT_TEST,
  ];
  const assignmentsBySlug = useMemo(() => {
    const grouped = new Map<string, AssignmentRow[]>();
    assignments.forEach((assignment) => {
      if (!grouped.has(assignment.test_slug)) {
        grouped.set(assignment.test_slug, []);
      }
      grouped.get(assignment.test_slug)?.push(assignment);
    });
    return grouped;
  }, [assignments]);

  return (
    <RoleGuard allowedRoles={["student"]}>
      {loading ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-[var(--muted)]">Chargement des tests...</p>
        </section>
      ) : error ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-red-400">{error}</p>
        </section>
      ) : (
        <div className="space-y-6">
          <section className="panel rounded-2xl p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Tests
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
              Tests a remplir
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Tes tests assigns par ton coach, a completer sur mobile.
            </p>
          </section>

          {tests.map((test) => {
            const items = assignmentsBySlug.get(test.slug) ?? [];
            return (
              <section key={test.slug} className="panel rounded-2xl p-6">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-[var(--text)]">
                    {test.title}
                  </h3>
                  <span className="text-xs text-[var(--muted)]">
                    {items.length} test(s)
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {items.length === 0 ? (
                    <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                      Aucun test pour le moment.
                    </div>
                  ) : (
                    items.map((assignment) => {
                      const href =
                        assignment.test_slug === PELZ_PUTTING_SLUG
                          ? `/app/eleve/tests/${assignment.id}`
                          : assignment.test_slug === WEDGING_DRAPEAU_LONG_SLUG
                            ? `/app/eleve/tests-wedging-drapeau-long/${assignment.id}`
                            : assignment.test_slug === WEDGING_DRAPEAU_COURT_SLUG
                              ? `/app/eleve/tests-wedging-drapeau-court/${assignment.id}`
                              : `/app/eleve/tests-approches/${assignment.id}`;
                      return (
                        <Link
                          key={assignment.id}
                          href={href}
                          className="flex flex-col gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--text)] transition hover:border-white/20 md:flex-row md:items-center md:justify-between"
                        >
                          <div>
                            <p className="font-medium">{test.title}</p>
                            <p className="mt-1 text-xs text-[var(--muted)]">
                              Assigne le{" "}
                              {new Date(assignment.assigned_at).toLocaleDateString(
                                locale
                              )}
                            </p>
                          </div>
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                            {statusLabel[assignment.status]}
                          </span>
                        </Link>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </RoleGuard>
  );
}
