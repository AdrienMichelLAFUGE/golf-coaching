"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import RoleGuard from "../../_components/role-guard";
import { useProfile } from "../../_components/profile-context";
import PremiumOfferModal from "../../_components/premium-offer-modal";
import { isAdminEmail } from "@/lib/admin";
import {
  PELZ_PUTTING_TEST,
  PELZ_PUTTING_SLUG,
} from "@/lib/normalized-tests/pelz-putting";

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
};

type StudentOption = StudentRow & {
  isShared: boolean;
};

type AssignmentRow = {
  id: string;
  status: "assigned" | "in_progress" | "finalized";
  assigned_at: string;
  updated_at: string;
  students: StudentRow | StudentRow[] | null;
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("fr-FR");
};

const formatStudentName = (student?: StudentRow | StudentRow[] | null) => {
  if (!student) return "Eleve";
  const entry = Array.isArray(student) ? student[0] : student;
  if (!entry) return "Eleve";
  return `${entry.first_name} ${entry.last_name ?? ""}`.trim();
};

const statusLabel: Record<AssignmentRow["status"], string> = {
  assigned: "Assigne",
  in_progress: "En cours",
  finalized: "Finalise",
};

export default function CoachTestsPage() {
  const { organization, userEmail } = useProfile();
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState("");
  const [assignError, setAssignError] = useState("");
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [premiumModalOpen, setPremiumModalOpen] = useState(false);
  const isAdmin = isAdminEmail(userEmail);
  const addonEnabled = isAdmin || organization?.coaching_dynamic_enabled;

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) => {
      const name = formatStudentName(student).toLowerCase();
      const email = (student.email ?? "").toLowerCase();
      return name.includes(query) || email.includes(query);
    });
  }, [search, students]);

  const loadStudents = useCallback(async () => {
    if (!userEmail) return;
    const { data: orgStudents, error: orgError } = await supabase
      .from("students")
      .select("id, first_name, last_name, email")
      .order("created_at", { ascending: false });

    if (orgError) {
      setError(orgError.message);
      return;
    }

    const { data: sharedRows } = await supabase
      .from("student_shares")
      .select("student_id")
      .eq("status", "active")
      .eq("viewer_email", userEmail.toLowerCase());

    const sharedIds = (sharedRows ?? []).map((row) => row.student_id);
    let sharedStudents: StudentRow[] = [];

    if (sharedIds.length > 0) {
      const { data: sharedData } = await supabase
        .from("students")
        .select("id, first_name, last_name, email")
        .in("id", sharedIds);
      sharedStudents = (sharedData ?? []) as StudentRow[];
    }

    const merged = new Map<string, StudentOption>();

    (orgStudents ?? []).forEach((student) => {
      merged.set(student.id, { ...student, isShared: false });
    });

    sharedStudents.forEach((student) => {
      if (!merged.has(student.id)) {
        merged.set(student.id, { ...student, isShared: true });
      }
    });

    const sorted = Array.from(merged.values()).sort((a, b) =>
      formatStudentName(a).localeCompare(formatStudentName(b), "fr-FR")
    );
    setStudents(sorted);
  }, [userEmail]);

  const loadAssignments = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("normalized_test_assignments")
      .select("id, status, assigned_at, updated_at, students(first_name, last_name)")
      .eq("test_slug", PELZ_PUTTING_SLUG)
      .order("created_at", { ascending: false })
      .limit(20);

    if (loadError) {
      setError(loadError.message);
      return;
    }

    setAssignments((data ?? []) as AssignmentRow[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadAll = async () => {
      setLoading(true);
      setError("");
      if (addonEnabled) {
        await Promise.all([loadStudents(), loadAssignments()]);
      } else {
        await loadAssignments();
      }
      if (!cancelled) setLoading(false);
    };
    loadAll();
    return () => {
      cancelled = true;
    };
  }, [addonEnabled, loadAssignments, loadStudents]);

  const toggleSelected = (studentId: string) => {
    setSelectedIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  };

  const openAssignModal = () => {
    setAssignError("");
    setSelectedIds([]);
    setSearch("");
    setAssignModalOpen(true);
  };

  const closeAssignModal = () => {
    setAssignModalOpen(false);
    setAssignError("");
    setSelectedIds([]);
  };

  const handleAssign = async () => {
    if (selectedIds.length === 0) {
      setAssignError("Selectionne au moins un eleve.");
      return;
    }

    setAssignError("");
    setAssigning(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setAssignError("Session invalide.");
      setAssigning(false);
      return;
    }

    const response = await fetch("/api/normalized-tests/assign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        testSlug: PELZ_PUTTING_SLUG,
        studentIds: selectedIds,
      }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setAssignError(payload.error ?? "Assignation impossible.");
      setAssigning(false);
      return;
    }

    closeAssignModal();
    await loadAssignments();
    setAssigning(false);
  };

  return (
    <RoleGuard allowedRoles={["owner", "coach", "staff"]}>
      <div className="space-y-6">
        <section className="panel rounded-2xl p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
            Tests normalises
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
            Bibliotheque de tests
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Selectionne un test normalise et assigne-le a tes eleves.
          </p>
        </section>

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
            {!addonEnabled ? (
              <section className="panel-soft rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-[var(--text)]">
                  Add-on Coaching dynamique requis
                </h3>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Active l add-on pour debloquer les tests normalises et le suivi
                  dynamique.
                </p>
                <button
                  type="button"
                  onClick={() => setPremiumModalOpen(true)}
                  className="mt-4 rounded-full border border-emerald-300/40 bg-emerald-400/15 px-4 py-2 text-xs uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-400/25"
                >
                  Voir les offres
                </button>
              </section>
            ) : null}

            <section className="panel rounded-2xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--text)]">
                    Tests disponibles
                  </h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Tests standardises pour un suivi comparable.
                  </p>
                </div>
                <button
                  type="button"
                  disabled
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] opacity-60"
                >
                  Creer un test (bientot)
                </button>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                        Test
                      </p>
                      <h4 className="mt-2 text-lg font-semibold text-[var(--text)]">
                        {PELZ_PUTTING_TEST.title}
                      </h4>
                    </div>
                    <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-emerald-200">
                      Normalise
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-[var(--muted)]">
                    {PELZ_PUTTING_TEST.description}
                  </p>
                  <div className="mt-4 flex items-center gap-3 text-xs text-[var(--muted)]">
                    <span>{PELZ_PUTTING_TEST.subtests.length} sous-tests</span>
                    <span>•</span>
                    <span>{PELZ_PUTTING_TEST.attemptsPerSubtest} tentatives</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!addonEnabled) {
                        setPremiumModalOpen(true);
                        return;
                      }
                      openAssignModal();
                    }}
                    className={`mt-5 rounded-full border px-4 py-2 text-xs uppercase tracking-wide transition ${
                      addonEnabled
                        ? "border-white/10 bg-white/10 text-[var(--text)] hover:bg-white/20"
                        : "border-white/10 bg-white/5 text-[var(--muted)] opacity-70"
                    }`}
                  >
                    Assigner a des eleves
                  </button>
                </div>
              </div>
            </section>

            <section className="panel rounded-2xl p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-[var(--text)]">
                  Assignations recentes
                </h3>
                <span className="text-xs text-[var(--muted)]">
                  {assignments.length} assignations
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {assignments.length === 0 ? (
                  <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                    Aucune assignation pour le moment.
                  </div>
                ) : (
                  assignments.map((assignment) => (
                    <Link
                      key={assignment.id}
                      href={`/app/coach/tests/${assignment.id}`}
                      className="flex flex-col gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--text)] transition hover:border-white/20 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <p className="font-medium">
                          {formatStudentName(assignment.students)}
                        </p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {PELZ_PUTTING_TEST.title} • Assigne le{" "}
                          {formatDate(assignment.assigned_at)}
                        </p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                        {statusLabel[assignment.status]}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </div>

      {assignModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8">
          <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[var(--bg-elevated)] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  Assigner le test
                </p>
                <h4 className="mt-2 text-lg font-semibold text-[var(--text)]">
                  {PELZ_PUTTING_TEST.title}
                </h4>
              </div>
              <button
                type="button"
                onClick={closeAssignModal}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)]"
                aria-label="Fermer"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher un eleve"
                className="w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-4 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
              />
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {filteredStudents.length === 0 ? (
                  <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                    Aucun eleve disponible.
                  </div>
                ) : (
                  filteredStudents.map((student) => (
                    <label
                      key={student.id}
                      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
                        student.isShared
                          ? "border-white/5 bg-white/5 text-[var(--muted)]"
                          : "border-white/10 bg-white/10 text-[var(--text)]"
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(student.id)}
                          onChange={() => toggleSelected(student.id)}
                          disabled={student.isShared}
                          className="h-4 w-4 rounded border border-white/10 bg-[var(--bg-elevated)]"
                        />
                        <span>
                          <span className="font-medium">
                            {formatStudentName(student)}
                          </span>
                          <span className="block text-xs text-[var(--muted)]">
                            {student.email ?? "Email indisponible"}
                          </span>
                        </span>
                      </span>
                      {student.isShared ? (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                          Partage
                        </span>
                      ) : null}
                    </label>
                  ))
                )}
              </div>
              {assignError ? <p className="text-sm text-red-400">{assignError}</p> : null}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-[var(--muted)]">
                {selectedIds.length} eleve(s) selectionne(s)
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={closeAssignModal}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleAssign}
                  disabled={assigning}
                  className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-xs uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-400/20 disabled:opacity-60"
                >
                  {assigning ? "Envoi..." : "Envoyer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <PremiumOfferModal
        open={premiumModalOpen}
        onClose={() => setPremiumModalOpen(false)}
        notice={{
          title: "Acces tests normalises bloque",
          description: "Ajoute l add-on Coaching dynamique pour debloquer cette section.",
          tags: ["Add-on Coaching dynamique"],
          status: [
            {
              label: "Add-on",
              value: addonEnabled ? "Actif" : "Inactif",
            },
          ],
        }}
      />
    </RoleGuard>
  );
}
