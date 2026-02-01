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
import {
  PELZ_APPROCHES_TEST,
  PELZ_APPROCHES_SLUG,
} from "@/lib/normalized-tests/pelz-approches";
import {
  WEDGING_DRAPEAU_LONG_TEST,
  WEDGING_DRAPEAU_LONG_SLUG,
} from "@/lib/normalized-tests/wedging-drapeau-long";
import {
  WEDGING_DRAPEAU_COURT_TEST,
  WEDGING_DRAPEAU_COURT_SLUG,
} from "@/lib/normalized-tests/wedging-drapeau-court";

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
  test_slug:
    | typeof PELZ_PUTTING_SLUG
    | typeof PELZ_APPROCHES_SLUG
    | typeof WEDGING_DRAPEAU_LONG_SLUG
    | typeof WEDGING_DRAPEAU_COURT_SLUG;
  status: "assigned" | "in_progress" | "finalized";
  assigned_at: string;
  updated_at: string;
  archived_at?: string | null;
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
  const { organization, userEmail, workspaceType } = useProfile();
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState("");
  const [assignError, setAssignError] = useState("");
  const [assignmentError, setAssignmentError] = useState("");
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignTestSlug, setAssignTestSlug] = useState<
    | typeof PELZ_PUTTING_SLUG
    | typeof PELZ_APPROCHES_SLUG
    | typeof WEDGING_DRAPEAU_LONG_SLUG
    | typeof WEDGING_DRAPEAU_COURT_SLUG
  >(PELZ_PUTTING_SLUG);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [assignmentSort, setAssignmentSort] = useState<"assigned_desc" | "assigned_asc">(
    "assigned_desc"
  );
  const [assignmentFilter, setAssignmentFilter] = useState<
    | "all"
    | typeof PELZ_PUTTING_SLUG
    | typeof PELZ_APPROCHES_SLUG
    | typeof WEDGING_DRAPEAU_LONG_SLUG
    | typeof WEDGING_DRAPEAU_COURT_SLUG
  >("all");
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState<
    "all" | AssignmentRow["status"]
  >("all");
  const [showArchived, setShowArchived] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [premiumModalOpen, setPremiumModalOpen] = useState(false);
  const isAdmin = isAdminEmail(userEmail);
  const isOrgMode = workspaceType === "org";
  const modeLabel =
    (organization?.workspace_type ?? "personal") === "org"
      ? `Organisation : ${organization?.name ?? "Organisation"}`
      : "Espace personnel";
  const modeBadgeTone =
    (organization?.workspace_type ?? "personal") === "org"
      ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
      : "border-sky-300/30 bg-sky-400/10 text-sky-100";
  const addonEnabled = isAdmin || organization?.coaching_dynamic_enabled;
  const tests = useMemo(
    () => [
      PELZ_PUTTING_TEST,
      PELZ_APPROCHES_TEST,
      WEDGING_DRAPEAU_LONG_TEST,
      WEDGING_DRAPEAU_COURT_TEST,
    ],
    []
  );
  const testBySlug = useMemo(
    () => ({
      [PELZ_PUTTING_SLUG]: PELZ_PUTTING_TEST,
      [PELZ_APPROCHES_SLUG]: PELZ_APPROCHES_TEST,
      [WEDGING_DRAPEAU_LONG_SLUG]: WEDGING_DRAPEAU_LONG_TEST,
      [WEDGING_DRAPEAU_COURT_SLUG]: WEDGING_DRAPEAU_COURT_TEST,
    }),
    []
  );

  const filteredStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) => {
      const name = formatStudentName(student).toLowerCase();
      const email = (student.email ?? "").toLowerCase();
      return name.includes(query) || email.includes(query);
    });
  }, [studentSearch, students]);

  const filteredAssignments = useMemo(() => {
    const query = assignmentSearch.trim().toLowerCase();
    const byTest =
      assignmentFilter === "all"
        ? assignments
        : assignments.filter((assignment) => assignment.test_slug === assignmentFilter);

    const byStatus =
      assignmentStatusFilter === "all"
        ? byTest
        : byTest.filter((assignment) => assignment.status === assignmentStatusFilter);

    const searched = query
      ? byStatus.filter((assignment) => {
          const studentName = formatStudentName(assignment.students).toLowerCase();
          const testTitle = (testBySlug[assignment.test_slug]?.title ?? "").toLowerCase();
          return studentName.includes(query) || testTitle.includes(query);
        })
      : byStatus;

    const byArchive = showArchived
      ? searched
      : searched.filter((assignment) => !assignment.archived_at);

    const sorted = [...byArchive].sort((a, b) => {
      const aTime = new Date(a.assigned_at).getTime();
      const bTime = new Date(b.assigned_at).getTime();
      return assignmentSort === "assigned_desc" ? bTime - aTime : aTime - bTime;
    });

    return sorted;
  }, [
    assignmentFilter,
    assignmentSearch,
    assignmentSort,
    assignmentStatusFilter,
    assignments,
    showArchived,
    testBySlug,
  ]);

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
      .select(
        "id, test_slug, status, assigned_at, updated_at, archived_at, students(first_name, last_name, email)"
      )
      .in("test_slug", [
        PELZ_PUTTING_SLUG,
        PELZ_APPROCHES_SLUG,
        WEDGING_DRAPEAU_LONG_SLUG,
        WEDGING_DRAPEAU_COURT_SLUG,
      ])
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
      if (isOrgMode) {
        setLoading(false);
        return;
      }
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
  }, [addonEnabled, isOrgMode, loadAssignments, loadStudents]);

  const toggleSelected = (studentId: string) => {
    setSelectedIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  };

  const openAssignModal = (
    slug:
      | typeof PELZ_PUTTING_SLUG
      | typeof PELZ_APPROCHES_SLUG
      | typeof WEDGING_DRAPEAU_LONG_SLUG
      | typeof WEDGING_DRAPEAU_COURT_SLUG
  ) => {
    setAssignError("");
    setSelectedIds([]);
    setStudentSearch("");
    setAssignTestSlug(slug);
    setAssignModalOpen(true);
  };

  const closeAssignModal = () => {
    setAssignModalOpen(false);
    setAssignError("");
    setSelectedIds([]);
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    setAssignmentError("");
    const assignment = assignments.find((item) => item.id === assignmentId);
    if (!assignment) return;

    let confirmText: string | undefined;
    if (assignment.status === "finalized") {
      const promptText = window.prompt(
        "Ce test est finalise. Tape SUPPRIMER pour confirmer la suppression."
      );
      if (!promptText) return;
      confirmText = promptText;
    } else {
      const confirmRemove = window.confirm(
        "Supprimer cette assignation ? Les resultats lies seront aussi supprimes."
      );
      if (!confirmRemove) return;
    }

    setRemovingId(assignmentId);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setAssignmentError("Session invalide.");
      setRemovingId(null);
      return;
    }

    const response = await fetch("/api/normalized-tests/unassign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ assignmentId, confirmText }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setAssignmentError(payload.error ?? "Suppression impossible.");
      setRemovingId(null);
      return;
    }

    await loadAssignments();
    setRemovingId(null);
  };

  const handleArchiveAssignment = async (assignmentId: string, archived: boolean) => {
    setAssignmentError("");
    setArchivingId(assignmentId);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setAssignmentError("Session invalide.");
      setArchivingId(null);
      return;
    }

    const response = await fetch("/api/normalized-tests/archive", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ assignmentId, archived }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setAssignmentError(payload.error ?? "Archivage impossible.");
      setArchivingId(null);
      return;
    }

    await loadAssignments();
    setArchivingId(null);
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
        testSlug: assignTestSlug,
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

  const openWorkspaceSwitcher = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("gc:open-workspace-switcher"));
  };

  if (isOrgMode) {
    return (
      <RoleGuard allowedRoles={["owner", "coach", "staff"]}>
        <div className="space-y-6">
          <section className="panel rounded-2xl p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Tests normalises
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
              Tests perso
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Cette section est disponible uniquement en mode Perso.
            </p>
            <div
              className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.6rem] uppercase tracking-[0.25em] ${modeBadgeTone}`}
            >
              Vous travaillez dans {modeLabel}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openWorkspaceSwitcher}
                className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
              >
                Changer de mode
              </button>
            </div>
          </section>
        </div>
      </RoleGuard>
    );
  }

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
          <div
            className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.6rem] uppercase tracking-[0.25em] ${modeBadgeTone}`}
          >
            Vous travaillez dans {modeLabel}
          </div>
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
                {tests.map((test) => (
                  <div
                    key={test.slug}
                    className="rounded-2xl border border-white/10 bg-white/5 p-5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                          Test
                        </p>
                        <h4 className="mt-2 text-lg font-semibold text-[var(--text)]">
                          {test.title}
                        </h4>
                      </div>
                      <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-emerald-200">
                        Normalise
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-[var(--muted)]">{test.description}</p>
                    <div className="mt-4 flex items-center gap-3 text-xs text-[var(--muted)]">
                      <span>{test.subtests.length} sous-tests</span>
                      <span>-</span>
                      <span>{test.attemptsPerSubtest} tentatives</span>
                    </div>
                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      <Link
                        href={`/app/coach/tests-preview/${test.slug}`}
                        className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--text)] transition hover:bg-white/15"
                        aria-label={`Voir le test ${test.title}`}
                      >
                        Voir
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          if (!addonEnabled) {
                            setPremiumModalOpen(true);
                            return;
                          }
                          openAssignModal(test.slug);
                        }}
                        className={`rounded-full border px-4 py-2 text-xs uppercase tracking-wide transition ${
                          addonEnabled
                            ? "border-white/10 bg-white/10 text-[var(--text)] hover:bg-white/20"
                            : "border-white/10 bg-white/5 text-[var(--muted)] opacity-70"
                        }`}
                      >
                        Assigner a des eleves
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel rounded-2xl p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-[var(--text)]">
                  Assignations recentes
                </h3>
                <span className="text-xs text-[var(--muted)]">
                  {filteredAssignments.length} assignation(s)
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]">
                <input
                  type="text"
                  value={assignmentSearch}
                  onChange={(event) => setAssignmentSearch(event.target.value)}
                  placeholder="Rechercher un eleve ou un test"
                  className="w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-4 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                />
                <select
                  value={assignmentSort}
                  onChange={(event) =>
                    setAssignmentSort(event.target.value as "assigned_desc" | "assigned_asc")
                  }
                  className="rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-xs uppercase tracking-wide text-[var(--muted)]"
                >
                  <option value="assigned_desc">Date: recentes</option>
                  <option value="assigned_asc">Date: anciennes</option>
                </select>
                <select
                  value={assignmentFilter}
                  onChange={(event) =>
                    setAssignmentFilter(
                      event.target.value as
                        | "all"
                        | typeof PELZ_PUTTING_SLUG
                        | typeof PELZ_APPROCHES_SLUG
                        | typeof WEDGING_DRAPEAU_LONG_SLUG
                        | typeof WEDGING_DRAPEAU_COURT_SLUG
                    )
                  }
                  className="rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-xs uppercase tracking-wide text-[var(--muted)]"
                >
                  <option value="all">Tous les tests</option>
                  <option value={PELZ_PUTTING_SLUG}>Pelz - Putting</option>
                  <option value={PELZ_APPROCHES_SLUG}>Pelz - Approches</option>
                  <option value={WEDGING_DRAPEAU_LONG_SLUG}>
                    Wedging - Drapeau long
                  </option>
                  <option value={WEDGING_DRAPEAU_COURT_SLUG}>
                    Wedging - Drapeau court
                  </option>
                </select>
                <select
                  value={assignmentStatusFilter}
                  onChange={(event) =>
                    setAssignmentStatusFilter(
                      event.target.value as "all" | AssignmentRow["status"]
                    )
                  }
                  className="rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-xs uppercase tracking-wide text-[var(--muted)]"
                >
                  <option value="all">Tous les statuts</option>
                  <option value="assigned">Assigne</option>
                  <option value="in_progress">En cours</option>
                  <option value="finalized">Finalise</option>
                </select>
                <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-xs uppercase tracking-wide text-[var(--muted)]">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(event) => setShowArchived(event.target.checked)}
                    className="h-4 w-4 rounded border border-white/10 bg-[var(--bg-elevated)]"
                  />
                  Afficher archives
                </label>
              </div>
              {assignmentError ? (
                <p className="mt-3 text-sm text-red-400">{assignmentError}</p>
              ) : null}
              <div className="mt-4 space-y-3">
                {filteredAssignments.length === 0 ? (
                  <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                    Aucune assignation pour le moment.
                  </div>
                ) : (
                  filteredAssignments.map((assignment) => {
                    const test = testBySlug[assignment.test_slug] ?? PELZ_PUTTING_TEST;
                    const isArchived = Boolean(assignment.archived_at);
                    const isFinalized = assignment.status === "finalized";
                    const href =
                      assignment.test_slug === PELZ_PUTTING_SLUG
                        ? `/app/coach/tests/${assignment.id}`
                        : assignment.test_slug === PELZ_APPROCHES_SLUG
                          ? `/app/coach/tests-approches/${assignment.id}`
                          : assignment.test_slug === WEDGING_DRAPEAU_COURT_SLUG
                            ? `/app/coach/tests-wedging-drapeau-court/${assignment.id}`
                            : `/app/coach/tests-wedging-drapeau-long/${assignment.id}`;
                    return (
                      <div
                        key={assignment.id}
                        className="flex flex-col gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--text)] transition hover:border-white/20 md:flex-row md:items-center md:justify-between"
                      >
                        <Link href={href} className="flex-1">
                          <div>
                            <p className="font-medium">
                              {formatStudentName(assignment.students)}
                            </p>
                            <p className="mt-1 text-xs text-[var(--muted)]">
                              {test.title} - Assigne le {formatDate(assignment.assigned_at)}
                            </p>
                            <p className="mt-1 text-[0.65rem] uppercase tracking-[0.2em] text-[var(--muted)]">
                              Derniere maj {formatDate(assignment.updated_at)}
                            </p>
                          </div>
                        </Link>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                            {statusLabel[assignment.status]}
                          </span>
                          {isArchived ? (
                            <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-amber-200">
                              Archive
                            </span>
                          ) : null}
                          {isArchived ? (
                            <button
                              type="button"
                              onClick={() => handleArchiveAssignment(assignment.id, false)}
                              disabled={archivingId === assignment.id}
                              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-60"
                            >
                              {archivingId === assignment.id ? "Restauration..." : "Restaurer"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleArchiveAssignment(assignment.id, true)}
                              disabled={archivingId === assignment.id}
                              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-60"
                            >
                              {archivingId === assignment.id ? "Archivage..." : "Archiver"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveAssignment(assignment.id)}
                            disabled={removingId === assignment.id || archivingId === assignment.id}
                            title={
                              isFinalized
                                ? "Suppression requiert une confirmation"
                                : "Retirer l assignation"
                            }
                            className="rounded-full border border-red-300/30 bg-red-400/10 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-red-200 transition hover:bg-red-400/20 disabled:opacity-60"
                          >
                            {removingId === assignment.id
                              ? "Suppression..."
                              : isFinalized
                                ? "Supprimer"
                                : "Retirer"}
                          </button>
                        </div>
                      </div>
                    );
                  })
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
                  {testBySlug[assignTestSlug]?.title ?? PELZ_PUTTING_TEST.title}
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
                value={studentSearch}
                onChange={(event) => setStudentSearch(event.target.value)}
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
