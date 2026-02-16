"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import RoleGuard from "../../_components/role-guard";
import { useProfile } from "../../_components/profile-context";
import PageHeader from "../../_components/page-header";
import Badge from "../../_components/badge";
import StudentCreateModal, {
  StudentCreateButton,
} from "../../_components/student-create-modal";

type Student = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  created_at: string;
  invited_at: string | null;
  activated_at: string | null;
  tpi_report_id: string | null;
  playing_hand: "right" | "left" | null;
};

type PendingStudentRequest = {
  proposal_id: string;
  created_at: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  playing_hand: "right" | "left" | null;
};

type StudentListItem =
  | ({ kind: "student" } & Student)
  | {
      kind: "pending";
      id: string;
      proposal_id: string;
      created_at: string;
      first_name: string;
      last_name: string | null;
      email: string | null;
      playing_hand: "right" | "left" | null;
      invited_at: null;
      activated_at: null;
      tpi_report_id: null;
    };

type StatusFilter =
  | "all"
  | "active"
  | "invited"
  | "to_invite"
  | "shared"
  | "pending";
type TpiFilter = "all" | "active" | "inactive";

export default function CoachStudentsPage() {
  const router = useRouter();
  const {
    profile,
    userEmail,
    organization,
    isWorkspacePremium,
    workspaceType,
  } = useProfile();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [tpiFilter, setTpiFilter] = useState<TpiFilter>("all");
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [messageError, setMessageError] = useState("");
  const [messageOpeningId, setMessageOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [pendingDeleteStudent, setPendingDeleteStudent] = useState<Student | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    playing_hand: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [sharedStudentIds, setSharedStudentIds] = useState<string[]>([]);
  const [tpiActiveById, setTpiActiveById] = useState<Record<string, boolean>>({});
  const [pendingStudentRequests, setPendingStudentRequests] = useState<
    PendingStudentRequest[]
  >([]);
  const isOrgReadOnly = organization?.workspace_type === "org" && !isWorkspacePremium;
  const currentWorkspaceType = workspaceType ?? "personal";
  const workspaceName = organization?.name ?? "Organisation";
  const modeLabel =
    currentWorkspaceType === "org"
      ? `Organisation : ${workspaceName}`
      : "Espace personnel";
  const modeBadgeTone =
    currentWorkspaceType === "org"
      ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
      : "border-sky-300/30 bg-sky-400/10 text-sky-100";

  const openWorkspaceSwitcher = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("gc:open-workspace-switcher"));
  };

  const sharedStudentSet = useMemo(() => new Set(sharedStudentIds), [sharedStudentIds]);

  const getStudentAccessBadge = (student: StudentListItem) => {
    if (student.kind === "pending") {
      return { label: "En attente", tone: "amber" } as const;
    }
    if (student.activated_at) {
      return { label: "Actif", tone: "emerald" } as const;
    }
    if (student.invited_at) {
      return { label: "Invite", tone: "amber" } as const;
    }
    return { label: "A inviter", tone: "muted" } as const;
  };

  const getStudentTpiActive = (student: Student) =>
    tpiActiveById[student.id] ?? Boolean(student.tpi_report_id);

  const studentsWithPending = useMemo<StudentListItem[]>(() => {
    const pendingRows: StudentListItem[] = pendingStudentRequests.map((request) => ({
      kind: "pending",
      id: `pending-${request.proposal_id}`,
      proposal_id: request.proposal_id,
      created_at: request.created_at,
      first_name: request.first_name,
      last_name: request.last_name,
      email: request.email,
      playing_hand: request.playing_hand,
      invited_at: null,
      activated_at: null,
      tpi_report_id: null,
    }));
    const studentRows: StudentListItem[] = students.map((student) => ({
      kind: "student",
      ...student,
    }));
    return [...pendingRows, ...studentRows].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [pendingStudentRequests, students]);

  const filteredStudents = useMemo(() => {
    const search = query.trim().toLowerCase();
    const searched = studentsWithPending.filter((student) => {
      if (!search) return true;
      const name = `${student.first_name} ${student.last_name ?? ""}`.trim();
      return (
        name.toLowerCase().includes(search) ||
        (student.email ?? "").toLowerCase().includes(search)
      );
    });

    const filteredByStatus = searched.filter((student) => {
      if (statusFilter === "all") return true;
      if (student.kind === "pending") return statusFilter === "pending";
      if (statusFilter === "shared") return sharedStudentSet.has(student.id);
      if (statusFilter === "pending") return false;
      if (statusFilter === "active") return Boolean(student.activated_at);
      if (statusFilter === "invited") return Boolean(student.invited_at) && !student.activated_at;
      if (statusFilter === "to_invite") return !student.invited_at && !student.activated_at;
      return true;
    });

    return filteredByStatus.filter((student) => {
      if (student.kind === "pending") return tpiFilter === "all";
      const tpiActive = tpiActiveById[student.id] ?? Boolean(student.tpi_report_id);
      if (tpiFilter === "all") return true;
      if (tpiFilter === "active") return tpiActive;
      if (tpiFilter === "inactive") return !tpiActive;
      return true;
    });
  }, [query, studentsWithPending, statusFilter, tpiFilter, sharedStudentSet, tpiActiveById]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rangeStart = filteredStudents.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(filteredStudents.length, currentPage * pageSize);
  const pagedStudents = filteredStudents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const loadTpiStatus = useCallback(async (studentIds: string[]) => {
    if (!studentIds.length) {
      setTpiActiveById({});
      return;
    }
    const { data, error } = await supabase.rpc("get_students_tpi_status", {
      _student_ids: studentIds,
    });
    if (error) {
      setTpiActiveById({});
      return;
    }
    const map: Record<string, boolean> = {};
    const rows = (data ?? []) as Array<{
      student_id: string | null;
      tpi_active: boolean | null;
    }>;
    rows.forEach((row) => {
      const studentId = row?.student_id as string | undefined;
      if (studentId) {
        map[studentId] = Boolean(row?.tpi_active);
      }
    });
    setTpiActiveById(map);
  }, []);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: fetchError } = await supabase
      .from("students")
      .select(
        "id, first_name, last_name, email, created_at, invited_at, activated_at, tpi_report_id, playing_hand"
      )
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      setStudents([]);
      setTpiActiveById({});
    } else {
      const rows = (data ?? []) as Student[];
      setStudents(rows);
      await loadTpiStatus(rows.map((student) => student.id));
    }
    setLoading(false);
  }, [loadTpiStatus]);

  const loadPendingStudentRequests = useCallback(async () => {
    if (currentWorkspaceType !== "org") {
      setPendingStudentRequests([]);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setPendingStudentRequests([]);
      return;
    }

    const response = await fetch("/api/orgs/students/pending-links", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json().catch(() => ({}))) as {
      requests?: PendingStudentRequest[];
      error?: string;
    };

    if (!response.ok) {
      setPendingStudentRequests([]);
      if (payload.error) setError(payload.error);
      return;
    }

    setPendingStudentRequests(payload.requests ?? []);
  }, [currentWorkspaceType]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (cancelled) return;
      await loadStudents();
    });
    return () => {
      cancelled = true;
    };
  }, [loadStudents]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (cancelled) return;
      await loadPendingStudentRequests();
    });
    return () => {
      cancelled = true;
    };
  }, [loadPendingStudentRequests]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (cancelled) return;
      if (!userEmail) {
        setSharedStudentIds([]);
        return;
      }
      const { data, error: sharedError } = await supabase
        .from("student_shares")
        .select("student_id")
        .eq("status", "active")
        .ilike("viewer_email", userEmail);
      if (cancelled) return;

      if (sharedError) {
        setSharedStudentIds([]);
        return;
      }

      const ids = (data ?? [])
        .map((row) => (row as { student_id?: string }).student_id)
        .filter((id): id is string => Boolean(id));
      setSharedStudentIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [userEmail]);

  useEffect(() => {
    if (!menuOpenId) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-student-menu]")) return;
      setMenuOpenId(null);
    };
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [menuOpenId]);

  useEffect(() => {
    const handleLinkRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setInviteError("");
      setInviteMessage(
        detail?.message ??
          "Demande envoyee a l admin de l organisation proprietaire."
      );
      void loadPendingStudentRequests();
    };
    window.addEventListener("gc:students-link-requested", handleLinkRequest);
    return () =>
      window.removeEventListener("gc:students-link-requested", handleLinkRequest);
  }, [loadPendingStudentRequests]);

  useEffect(() => {
    const handleFocus = () => {
      void loadPendingStudentRequests();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [loadPendingStudentRequests]);

  const handleInviteStudent = async (student: Student) => {
    if (isOrgReadOnly) {
      setInviteError("Lecture seule: plan Free en organisation.");
      return;
    }
    if (!student.email) {
      setInviteError("Ajoute un email pour envoyer une invitation.");
      return;
    }

    setInviteMessage("");
    setInviteError("");
    setInvitingId(student.id);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setInviteError("Session invalide. Reconnecte toi.");
      setInvitingId(null);
      return;
    }

    const response = await fetch("/api/invitations/students", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ studentId: student.id }),
    });

    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setInviteError(payload.error ?? "Invitation impossible.");
      setInvitingId(null);
      return;
    }

    setInviteMessage("Invitation envoyee.");
    await loadStudents();
    setInvitingId(null);
  };

  const handleDeleteStudent = async (student: Student) => {
    if (isOrgReadOnly) {
      setInviteError("Lecture seule: plan Free en organisation.");
      return;
    }

    setInviteMessage("");
    setInviteError("");
    setDeletingId(student.id);

    const { error: deleteError } = await supabase
      .from("students")
      .delete()
      .eq("id", student.id);

    if (deleteError) {
      setInviteError(deleteError.message);
      setDeletingId(null);
      return;
    }

    await loadStudents();
    setDeletingId(null);
  };

  const handleMenuInvite = async (student: Student) => {
    setPendingDeleteStudent(null);
    setMenuOpenId(null);
    await handleInviteStudent(student);
  };

  const handleMenuDelete = async (student: Student) => {
    setPendingDeleteStudent(null);
    setMenuOpenId(null);
    await handleDeleteStudent(student);
  };

  const handleMenuAskDelete = (student: Student) => {
    setMenuOpenId(null);
    setPendingDeleteStudent(student);
  };

  const handleMenuEdit = (student: Student) => {
    setPendingDeleteStudent(null);
    setMenuOpenId(null);
    setEditError("");
    setEditingStudent(student);
    setEditForm({
      first_name: student.first_name ?? "",
      last_name: student.last_name ?? "",
      email: student.email ?? "",
      playing_hand: student.playing_hand ?? "",
    });
  };

  const handleOpenStudentMessages = async (student: Student) => {
    if (!profile?.id) {
      setMessageError("Profil indisponible.");
      return;
    }
    setMessageError("");
    setInviteError("");
    setInviteMessage("");
    setMenuOpenId(null);
    setMessageOpeningId(student.id);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setMessageError("Session invalide. Reconnecte toi.");
      setMessageOpeningId(null);
      return;
    }

    const response = await fetch("/api/messages/threads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        kind: "student_coach",
        studentId: student.id,
        coachId: profile.id,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      threadId?: string;
    };

    if (!response.ok || !payload.threadId) {
      setMessageError(payload.error ?? "Ouverture de la conversation impossible.");
      setMessageOpeningId(null);
      return;
    }

    setMessageOpeningId(null);
    router.push(`/app/coach/messages?threadId=${payload.threadId}`);
  };

  const handleCloseEdit = () => {
    if (editSaving) return;
    setEditingStudent(null);
    setEditError("");
  };

  const handleUpdateStudent = async () => {
    if (!editingStudent) return;
    if (isOrgReadOnly) {
      setEditError("Lecture seule: plan Free en organisation.");
      return;
    }
    const firstName = editForm.first_name.trim();
    const lastName = editForm.last_name.trim();
    const email = editForm.email.trim();
    const playingHand = editForm.playing_hand || null;
    const previousEmail = (editingStudent.email ?? "").trim().toLowerCase();
    const nextEmail = email.toLowerCase();
    const emailChanged = previousEmail !== nextEmail;

    if (!firstName) {
      setEditError("Le prenom est obligatoire.");
      return;
    }

    setEditSaving(true);
    setEditError("");

    const { error: updateError } = await supabase
      .from("students")
      .update({
        first_name: firstName,
        last_name: lastName || null,
        email: email || null,
        playing_hand: playingHand,
        ...(emailChanged ? { invited_at: null, activated_at: null } : {}),
      })
      .eq("id", editingStudent.id);

    if (updateError) {
      setEditError(updateError.message);
      setEditSaving(false);
      return;
    }

    setEditSaving(false);
    setEditingStudent(null);
    await loadStudents();
  };

  return (
    <RoleGuard allowedRoles={["owner", "coach", "staff"]}>
      <div className="space-y-6">
        <PageHeader
          title="Elèves"
          subtitle="Gerez vos élèves."
          meta={
            <Badge className={modeBadgeTone}>
              <span className="min-w-0 break-words">{modeLabel}</span>
            </Badge>
          }
        />

        <section className="rounded-2xl">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <StudentCreateButton
                onClick={() => setCreateOpen(true)}
                disabled={isOrgReadOnly && currentWorkspaceType === "org"}
                label="NEW"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              />

              <div className="relative w-full sm:w-[min(420px,45vw)]">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="M21 21l-4.3-4.3" />
                  </svg>
                </span>
                <input
                  type="text"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Rechercher un eleve"
                  className="w-full rounded-full border border-white/10 py-2.5 pl-10 pr-4 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/40"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value as StatusFilter);
                    setPage(1);
                  }}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-[var(--text)]"
                  aria-label="Filtre acces"
                >
                  <option value="all">Statut: Tous</option>
                  <option value="active">Statut: Actifs</option>
                  <option value="invited">Statut: Invites</option>
                  <option value="to_invite">Statut: A inviter</option>
                  <option value="shared">Statut: Partages</option>
                  <option value="pending">Statut: En attente d approbation</option>
                </select>

                <select
                  value={tpiFilter}
                  onChange={(event) => {
                    setTpiFilter(event.target.value as TpiFilter);
                    setPage(1);
                  }}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-[var(--text)]"
                  aria-label="Filtre TPI"
                >
                  <option value="all">TPI: Tous</option>
                  <option value="active">TPI: Actif</option>
                  <option value="inactive">TPI: Inactif</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                <span>
                  <span className="font-semibold text-[var(--text)]">
                    {filteredStudents.length}
                  </span>{" "}
                  eleves
                </span>
                <span>-</span>
                <span>Donnees en temps reel</span>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value) as 25 | 50 | 100);
                    setPage(1);
                  }}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-[var(--text)]"
                  aria-label="Taille de page"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span className="text-xs text-[var(--muted)]">
                  {rangeStart}-{rangeEnd} of {filteredStudents.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage <= 1}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Page precedente"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage >= totalPages}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Page suivante"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="panel overflow-visible rounded-2xl">
          <div className="grid gap-3 px-6 py-1 text-sm text-[var(--muted)]">
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            {inviteError ? (
              <p className="text-sm text-red-400">{inviteError}</p>
            ) : null}
            {messageError ? (
              <p className="text-sm text-red-400">{messageError}</p>
            ) : null}
            {inviteMessage ? (
              <p className="text-sm text-[var(--muted)]">{inviteMessage}</p>
            ) : null}
          </div>

          <div className="hidden border-b border-white/10 bg-white/[0.02] px-6 py-3 text-[0.7rem] font-semibold uppercase tracking-wide text-[var(--muted)] md:grid md:grid-cols-[32px_1fr_0.3fr_1fr_56px]">
            <span aria-hidden="true" />
            <span>Nom</span>
            <span>Acces</span>
            <span>Features</span>
            <span className="text-right">Actions</span>
          </div>

          <div className="divide-y divide-white/10">
            {loading ? (
              <div className="px-6 py-6 text-sm text-[var(--muted)]">
                Chargement des eleves...
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="px-6 py-8 text-sm">
                <p className="text-[var(--text)]">
                  {currentWorkspaceType === "org"
                    ? "Aucun eleve dans cette organisation."
                    : "Vous n avez aucun eleve personnel."}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Vous etes en{" "}
                  {currentWorkspaceType === "org" ? "MODE ORGANISATION" : "MODE PERSO"}.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    disabled={isOrgReadOnly && currentWorkspaceType === "org"}
                    className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20 disabled:opacity-60"
                  >
                    {currentWorkspaceType === "org"
                      ? "Creer un eleve pour l ecole"
                      : "Ajouter un eleve personnel"}
                  </button>
                  <button
                    type="button"
                    onClick={openWorkspaceSwitcher}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                  >
                    Changer de mode
                  </button>
                </div>
              </div>
            ) : (
              pagedStudents.map((student) => {
                const isPendingApproval = student.kind === "pending";
                const inviteDisabled = isPendingApproval || !student.email;
                const isShared =
                  student.kind === "student" ? sharedStudentSet.has(student.id) : false;
                const isReadOnlyAction = isPendingApproval || isShared || isOrgReadOnly;
                const tpiActive =
                  student.kind === "student" ? getStudentTpiActive(student) : false;
                const canMessageStudent =
                  student.kind === "student" &&
                  Boolean(student.activated_at) &&
                  !isReadOnlyAction;
                const isMessageOpening = messageOpeningId === student.id;
                const access = getStudentAccessBadge(student);
                const inviteLabel = invitingId === student.id
                  ? "Envoi..."
                  : student.invited_at
                    ? "Renvoyer"
                    : "Inviter";
                return (
                  <div
                    key={student.id}
                    className={`relative grid grid-cols-[32px_minmax(0,1fr)] gap-x-3 gap-y-3 px-6 py-4 text-[var(--text)] transition md:grid-cols-[32px_1fr_0.3fr_1fr_56px] md:items-center ${
                      isPendingApproval ? "bg-white/[0.015] opacity-65" : "hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center justify-center self-center md:justify-self-center">
                      {isPendingApproval ? (
                        <span
                          aria-hidden="true"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)]"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="12" cy="12" r="9" />
                            <path d="M12 7v5l3 2" />
                          </svg>
                        </span>
                      ) : (
                        <Link
                          href={`/app/coach/eleves/${student.id}`}
                          aria-label={`Ouvrir la fiche de ${student.first_name} ${student.last_name ?? ""}`.trim()}
                          title="Ouvrir la fiche eleve"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)]"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                        </Link>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="truncate text-sm font-semibold text-[var(--text)]">
                            {student.first_name} {student.last_name ?? ""}
                          </p>
                          {student.playing_hand ? (
                            <Badge tone="muted" size="sm" className="shrink-0">
                              {student.playing_hand === "right" ? "Droitier" : "Gaucher"}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                          {student.email || "Aucun email"}
                        </p>
                        {isPendingApproval ? (
                          <p className="mt-1 text-[0.7rem] text-amber-100">
                            En attente d approbation par le coach proprietaire.
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="col-span-2 flex items-center justify-start gap-2 md:col-span-1 md:items-start md:justify-start">
                      <span className="text-xs text-[var(--muted)] md:hidden">Acces :</span>
                      <Badge tone={access.tone} size="sm">
                        {access.label}
                      </Badge>
                    </div>

                    <div className="col-span-2 flex flex-wrap items-center justify-start gap-2 md:col-span-1 md:items-start md:justify-start">
                      <span className="text-xs text-[var(--muted)] md:hidden">Features :</span>
                      {isPendingApproval ? (
                        <Badge tone="amber" size="sm" className="self-start">
                          Demande envoyee
                        </Badge>
                      ) : null}
                      {isShared ? (
                        <Badge tone="sky" size="sm" className="self-start">
                          Partage
                        </Badge>
                      ) : null}
                      {isPendingApproval ? null : tpiActive ? (
                        <Badge tone="rose" size="sm" className="self-start">
                          TPI actif
                        </Badge>
                      ) : (
                        <Badge tone="muted" size="sm" className="self-start">
                          TPI inactif
                        </Badge>
                      )}
                    </div>

                    <div className="col-span-2 flex items-start justify-end md:col-span-1">
                      {isPendingApproval ? (
                        <Badge tone="amber" size="sm" className="text-right">
                          En attente
                        </Badge>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleOpenStudentMessages(student)}
                            disabled={!canMessageStudent || isMessageOpening}
                            className={`flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 transition ${
                              !canMessageStudent
                                ? "cursor-not-allowed text-[var(--muted)] opacity-50"
                                : "text-[var(--muted)] hover:text-[var(--text)]"
                            }`}
                            title={
                              !canMessageStudent
                                ? "Messagerie indisponible pour cet eleve"
                                : "Ouvrir la conversation"
                            }
                            aria-label={`Ouvrir la conversation avec ${student.first_name}`}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                            </svg>
                          </button>
                          <div className="relative" data-student-menu>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setMenuOpenId((prev) => {
                                  const next = prev === student.id ? null : student.id;
                                  return next;
                                });
                              }}
                              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)]"
                              aria-label="Actions eleve"
                              aria-expanded={menuOpenId === student.id}
                              aria-haspopup="menu"
                            >
                              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                                <circle cx="12" cy="5" r="2" />
                                <circle cx="12" cy="12" r="2" />
                                <circle cx="12" cy="19" r="2" />
                              </svg>
                            </button>
                            {menuOpenId === student.id ? (
                              <div
                                role="menu"
                                onClick={(event) => event.stopPropagation()}
                                className="absolute bottom-full right-0 z-50 mb-2 w-40 rounded-xl border border-white/10 bg-[var(--bg-elevated)] p-1 text-xs shadow-[0_12px_30px_rgba(0,0,0,0.35)]"
                              >
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => void handleOpenStudentMessages(student)}
                                  disabled={!canMessageStudent || isMessageOpening}
                                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-[0.65rem] uppercase tracking-wide transition ${
                                    !canMessageStudent
                                      ? "cursor-not-allowed text-[var(--muted)]"
                                      : "text-[var(--text)] hover:bg-white/10"
                                  }`}
                                >
                                  {isMessageOpening ? "Ouverture..." : "Message"}
                                </button>
                                <Link
                                  href={`/app/coach/rapports/nouveau?studentId=${student.id}`}
                                  onClick={(event) => {
                                    if (isReadOnlyAction) event.preventDefault();
                                    setMenuOpenId(null);
                                  }}
                                  aria-disabled={isReadOnlyAction}
                                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-[0.65rem] uppercase tracking-wide transition ${
                                    isReadOnlyAction
                                      ? "cursor-not-allowed text-[var(--muted)]"
                                      : "text-[var(--text)] hover:bg-white/10"
                                  }`}
                                >
                                  Nouveau rapport
                                </Link>
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => handleMenuEdit(student)}
                                  disabled={isReadOnlyAction}
                                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-[0.65rem] uppercase tracking-wide transition ${
                                    isReadOnlyAction
                                      ? "cursor-not-allowed text-[var(--muted)]"
                                      : "text-[var(--text)] hover:bg-white/10"
                                  }`}
                                >
                                  Editer
                                </button>
                                <Link
                                  href={`/app/coach/eleves/${student.id}`}
                                  onClick={() => {
                                    setMenuOpenId(null);
                                  }}
                                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[0.65rem] uppercase tracking-wide text-[var(--text)] transition hover:bg-white/10"
                                >
                                  Profil TPI
                                </Link>
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => handleMenuInvite(student)}
                                  disabled={
                                    isReadOnlyAction || inviteDisabled || invitingId === student.id
                                  }
                                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-[0.65rem] uppercase tracking-wide transition ${
                                    inviteDisabled || isReadOnlyAction
                                      ? "cursor-not-allowed text-[var(--muted)]"
                                      : "text-[var(--text)] hover:bg-white/10"
                                  }`}
                                >
                                  {inviteLabel}
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => handleMenuAskDelete(student)}
                                  disabled={isReadOnlyAction || deletingId === student.id}
                                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[0.65rem] uppercase tracking-wide text-red-300 transition hover:bg-white/10 hover:text-red-200 disabled:opacity-60"
                                >
                                  Supprimer
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
        {createOpen ? (
          <StudentCreateModal
            onClose={() => setCreateOpen(false)}
            afterCreate={loadStudents}
          />
        ) : null}
        {pendingDeleteStudent ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                    Confirmation
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-[var(--text)]">
                    Supprimer cet eleve ?
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingDeleteStudent(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)]"
                  aria-label="Fermer"
                  disabled={deletingId === pendingDeleteStudent.id}
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
              <p className="mt-4 text-sm text-[var(--muted)]">
                Cette action est irreversible.{" "}
                <span className="text-[var(--text)]">
                  {pendingDeleteStudent.first_name} {pendingDeleteStudent.last_name ?? ""}
                </span>{" "}
                sera retire de la liste des eleves.
              </p>
              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPendingDeleteStudent(null)}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                  disabled={deletingId === pendingDeleteStudent.id}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => handleMenuDelete(pendingDeleteStudent)}
                  disabled={deletingId === pendingDeleteStudent.id}
                  className="rounded-full border border-red-500/60 bg-red-300/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-red-950 transition hover:bg-red-300/80 disabled:opacity-60"
                >
                  {deletingId === pendingDeleteStudent.id ? "Suppression..." : "Supprimer"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {editingStudent ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
            <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                    Eleve
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-[var(--text)]">
                    Modifier les informations
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleCloseEdit}
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
              <div className="mt-5 grid gap-4">
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Prenom
                  </label>
                  <input
                    type="text"
                    value={editForm.first_name}
                    onChange={(event) =>
                      setEditForm((prev) => ({
                        ...prev,
                        first_name: event.target.value,
                      }))
                    }
                    disabled={editSaving || isOrgReadOnly}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Nom
                  </label>
                  <input
                    type="text"
                    value={editForm.last_name}
                    onChange={(event) =>
                      setEditForm((prev) => ({
                        ...prev,
                        last_name: event.target.value,
                      }))
                    }
                    disabled={editSaving || isOrgReadOnly}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Email
                  </label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(event) =>
                      setEditForm((prev) => ({
                        ...prev,
                        email: event.target.value,
                      }))
                    }
                    disabled={editSaving || isOrgReadOnly}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Sens de jeu
                  </label>
                  <select
                    value={editForm.playing_hand}
                    onChange={(event) =>
                      setEditForm((prev) => ({
                        ...prev,
                        playing_hand: event.target.value as "" | "left" | "right",
                      }))
                    }
                    disabled={editSaving || isOrgReadOnly}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                  >
                    <option value="">Non precise</option>
                    <option value="right">Droitier</option>
                    <option value="left">Gaucher</option>
                  </select>
                </div>
              </div>
              {editError ? (
                <p className="mt-4 text-sm text-red-400">{editError}</p>
              ) : null}
              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseEdit}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                  disabled={editSaving}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleUpdateStudent}
                  disabled={editSaving || isOrgReadOnly}
                  className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
                >
                  {editSaving ? "Enregistrement..." : "Enregistrer"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </RoleGuard>
  );
}
