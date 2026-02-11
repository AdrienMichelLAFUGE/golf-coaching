"use client";

/* eslint-disable @next/next/no-img-element */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import PageBack from "../../../_components/page-back";
import PageHeader from "../../../_components/page-header";
import RoleGuard from "../../../_components/role-guard";
import { useProfile } from "../../../_components/profile-context";
import Badge from "../../../_components/badge";

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
};

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  activated_at: string | null;
  has_tests: boolean;
  test_status: "assigned" | "in_progress" | "finalized" | null;
};

type CoachRow = {
  id: string;
  name: string;
  role: string;
  avatar_url: string | null;
};

type GroupPayload = {
  group: GroupRow;
  students: StudentRow[];
  coaches: CoachRow[];
  selectedStudentIds: string[];
  selectedCoachIds: string[];
};

type MemberRow = {
  id: string;
  fullName: string;
  email: string | null;
  isActive: boolean;
  hasTests: boolean;
  testStatus: "assigned" | "in_progress" | "finalized" | null;
};

type ActiveFilter = "all" | "active" | "inactive";
type TestFilter = "all" | "active" | "inactive";

const iconClass = "h-4 w-4";

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function CoachesIcon() {
  return (
    <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

function IconActionButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function ModalFrame({
  title,
  titleId,
  onClose,
  disableClose,
  children,
  footer,
  maxWidth = "max-w-xl",
}: {
  title: string;
  titleId: string;
  onClose: () => void;
  disableClose?: boolean;
  children: ReactNode;
  footer: ReactNode;
  maxWidth?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 bg-black/35 backdrop-blur-sm"
        onClick={() => {
          if (!disableClose) onClose();
        }}
      />
      <div className={`relative w-full ${maxWidth} overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg-elevated)] shadow-[var(--shadow-strong)]`}>
        <div className="relative border-b border-white/10 px-6 py-4">
          <h3 id={titleId} className="text-center text-base font-semibold text-[var(--text)]">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={disableClose}
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-60"
            aria-label="Fermer"
          >
            <CloseIcon />
          </button>
        </div>
        {children}
        <div className="flex items-center justify-end gap-3 border-t border-white/10 px-6 py-4">
          {footer}
        </div>
      </div>
    </div>
  );
}

export default function OrgGroupDetailPage() {
  const params = useParams();
  const groupId = typeof params?.id === "string" ? params.id : params?.id?.[0] ?? "";
  const { workspaceType, isWorkspaceAdmin, isWorkspacePremium, organization } = useProfile();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [group, setGroup] = useState<GroupRow | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedCoachIds, setSelectedCoachIds] = useState<string[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [studentsOpen, setStudentsOpen] = useState(false);
  const [coachesOpen, setCoachesOpen] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [testFilter, setTestFilter] = useState<TestFilter>("all");
  const [studentQuery, setStudentQuery] = useState("");
  const [coachQuery, setCoachQuery] = useState("");
  const [groupDraftName, setGroupDraftName] = useState("");
  const [groupDraftDescription, setGroupDraftDescription] = useState("");
  const [studentDraftIds, setStudentDraftIds] = useState<string[]>([]);
  const [coachDraftIds, setCoachDraftIds] = useState<string[]>([]);
  const [savingGroup, setSavingGroup] = useState(false);
  const [savingStudents, setSavingStudents] = useState(false);
  const [savingCoaches, setSavingCoaches] = useState(false);
  const [propagating, setPropagating] = useState(false);

  const canEdit = isWorkspaceAdmin || isWorkspacePremium;
  const isOrgReadOnly = workspaceType === "org" && !canEdit;
  const modeLabel =
    (organization?.workspace_type ?? "personal") === "org"
      ? `Organisation : ${organization?.name ?? "Organisation"}`
      : "Espace personnel";
  const modeBadgeTone =
    (organization?.workspace_type ?? "personal") === "org"
      ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
      : "border-sky-300/30 bg-sky-400/10 text-sky-100";

  const loadGroup = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    setError("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Session invalide.");
      setLoading(false);
      return;
    }
    const response = await fetch(`/api/orgs/groups/${groupId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json()) as GroupPayload & { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Chargement impossible.");
      setLoading(false);
      return;
    }
    setGroup(payload.group);
    setStudents(payload.students ?? []);
    setCoaches(payload.coaches ?? []);
    setSelectedStudentIds(payload.selectedStudentIds ?? []);
    setSelectedCoachIds(payload.selectedCoachIds ?? []);
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) void loadGroup();
    });
    return () => {
      cancelled = true;
    };
  }, [loadGroup]);

  useEffect(() => {
    if (!editOpen && !studentsOpen && !coachesOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (savingGroup || savingStudents || savingCoaches || propagating) return;
      setEditOpen(false);
      setStudentsOpen(false);
      setCoachesOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [coachesOpen, editOpen, propagating, savingCoaches, savingGroup, savingStudents, studentsOpen]);

  const filteredStudents = useMemo(() => {
    const query = studentQuery.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) =>
      `${student.first_name} ${student.last_name ?? ""}`.toLowerCase().includes(query)
    );
  }, [studentQuery, students]);

  const filteredCoaches = useMemo(() => {
    const query = coachQuery.trim().toLowerCase();
    if (!query) return coaches;
    return coaches.filter((coach) => coach.name.toLowerCase().includes(query));
  }, [coachQuery, coaches]);

  const selectedStudentSet = useMemo(() => new Set(selectedStudentIds), [selectedStudentIds]);
  const selectedCoachSet = useMemo(() => new Set(selectedCoachIds), [selectedCoachIds]);

  const memberRows = useMemo<MemberRow[]>(() => {
    return students
      .filter((student) => selectedStudentSet.has(student.id))
      .map((student) => ({
        id: student.id,
        fullName: `${student.first_name} ${student.last_name ?? ""}`.trim(),
        email: student.email ?? null,
        isActive: Boolean(student.activated_at),
        hasTests: Boolean(student.has_tests),
        testStatus: student.test_status,
      }))
      .sort((left, right) =>
        left.fullName.localeCompare(right.fullName, "fr", { sensitivity: "base" })
      );
  }, [selectedStudentSet, students]);

  const selectedCoaches = useMemo(
    () =>
      coaches
        .filter((coach) => selectedCoachSet.has(coach.id))
        .sort((left, right) => left.name.localeCompare(right.name, "fr", { sensitivity: "base" })),
    [coaches, selectedCoachSet]
  );

  const filteredMembers = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    return memberRows.filter((member) => {
      const matchesQuery =
        !query ||
        member.fullName.toLowerCase().includes(query) ||
        (member.email ?? "").toLowerCase().includes(query);

      const matchesActive =
        activeFilter === "all" ||
        (activeFilter === "active" ? member.isActive : !member.isActive);

      const matchesTest =
        testFilter === "all" ||
        (testFilter === "active" ? member.hasTests : !member.hasTests);

      return matchesQuery && matchesActive && matchesTest;
    });
  }, [activeFilter, memberQuery, memberRows, testFilter]);

  const getCoachInitials = (coachName: string) => {
    const parts = coachName
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "C";
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  };

  const getTestStatusBadge = (status: MemberRow["testStatus"]) => {
    if (status === "in_progress") return { label: "En cours", tone: "sky" as const };
    if (status === "assigned") return { label: "A faire", tone: "amber" as const };
    if (status === "finalized") return { label: "Finis", tone: "emerald" as const };
    return null;
  };

  const openEditModal = () => {
    if (!group) return;
    setError("");
    setGroupDraftName(group.name);
    setGroupDraftDescription(group.description ?? "");
    setEditOpen(true);
  };

  const openStudentsModal = () => {
    if (!group) return;
    setError("");
    setStudentQuery("");
    setStudentDraftIds(selectedStudentIds);
    setStudentsOpen(true);
  };

  const openCoachesModal = () => {
    if (!group) return;
    setError("");
    setCoachQuery("");
    setCoachDraftIds(selectedCoachIds);
    setCoachesOpen(true);
  };

  const toggleStudentDraft = (studentId: string) => {
    setStudentDraftIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const toggleCoachDraft = (coachId: string) => {
    setCoachDraftIds((prev) =>
      prev.includes(coachId) ? prev.filter((id) => id !== coachId) : [...prev, coachId]
    );
  };

  const saveGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!group) return;
    const trimmedName = groupDraftName.trim();
    if (!trimmedName) {
      setError("Le nom du groupe est obligatoire.");
      return;
    }
    setSavingGroup(true);
    setError("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Session invalide.");
      setSavingGroup(false);
      return;
    }
    const response = await fetch(`/api/orgs/groups/${groupId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: trimmedName, description: groupDraftDescription }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Mise a jour impossible.");
      setSavingGroup(false);
      return;
    }
    setEditOpen(false);
    await loadGroup();
    setSavingGroup(false);
  };

  const saveStudents = async () => {
    setSavingStudents(true);
    setError("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Session invalide.");
      setSavingStudents(false);
      return;
    }
    const response = await fetch(`/api/orgs/groups/${groupId}/students`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ studentIds: Array.from(new Set(studentDraftIds)) }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Mise a jour impossible.");
      setSavingStudents(false);
      return;
    }
    setStudentsOpen(false);
    await loadGroup();
    setSavingStudents(false);
  };

  const saveCoaches = async () => {
    setSavingCoaches(true);
    setError("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Session invalide.");
      setSavingCoaches(false);
      return;
    }
    const response = await fetch(`/api/orgs/groups/${groupId}/coaches`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ coachIds: Array.from(new Set(coachDraftIds)) }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Mise a jour impossible.");
      setSavingCoaches(false);
      return;
    }
    setCoachesOpen(false);
    await loadGroup();
    setSavingCoaches(false);
  };

  const propagateAssignments = async () => {
    if (!window.confirm("Assigner tous les eleves aux coachs de ce groupe ?")) return;
    setPropagating(true);
    setError("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Session invalide.");
      setPropagating(false);
      return;
    }
    const response = await fetch(`/api/orgs/groups/${groupId}/propagate-assignments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Propagation impossible.");
      setPropagating(false);
      return;
    }
    setPropagating(false);
  };

  return (
    <RoleGuard allowedRoles={["owner", "coach", "staff"]}>
      <div className="space-y-6">
        <PageHeader
          overline={
            <div className="flex items-center gap-2">
              <PageBack fallbackHref="/app/org" />
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Organisation</p>
            </div>
          }
          title={group?.name ?? "Gestion du groupe"}
          subtitle="Gere les informations du groupe, ses eleves et ses coachs."
          meta={
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={modeBadgeTone}>{modeLabel}</Badge>
              <Badge tone="muted">{selectedStudentIds.length} eleves</Badge>
              <Badge tone="muted">{selectedCoachIds.length} coachs</Badge>
            </div>
          }
          actions={
            <div className="flex w-full items-center justify-end gap-2 md:w-auto">
              <IconActionButton label="Informations" onClick={openEditModal} disabled={!group}>
                <PencilIcon />
              </IconActionButton>
              <IconActionButton label="Eleves" onClick={openStudentsModal} disabled={!group}>
                <PlusIcon />
              </IconActionButton>
              <IconActionButton label="Coachs" onClick={openCoachesModal} disabled={!group}>
                <CoachesIcon />
              </IconActionButton>
            </div>
          }
        />

        {isOrgReadOnly ? (
          <p className="text-sm text-amber-300">Plan Pro requis pour modifier les groupes.</p>
        ) : null}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        {loading ? (
          <div className="panel rounded-2xl p-6 text-sm text-[var(--muted)]">Chargement...</div>
        ) : !group ? (
          <div className="panel rounded-2xl p-6 text-sm text-[var(--muted)]">Groupe introuvable.</div>
        ) : (
          <section className="panel overflow-hidden rounded-2xl border border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-3 border-white/10 px-6 py-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text)]">Membres du groupe</h3>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Liste des eleves assignes au groupe.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1.5 text-xs">
                <div className="flex items-center gap-1.5 rounded-full border-white/10 bg-white/5 px-2 py-1">
                  <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--muted)]">
                    Coach :
                  </span>
                  {selectedCoaches.length === 0 ? (
                    <span className="text-[0.65rem] text-[var(--muted)]">Aucun coach</span>
                  ) : (
                    selectedCoaches.map((coach) =>
                      coach.avatar_url ? (
                        <img
                          key={coach.id}
                          src={coach.avatar_url}
                          alt={`Photo de profil de ${coach.name}`}
                          title={coach.name}
                          className="h-7 w-7 rounded-full border border-white/10 object-cover"
                        />
                      ) : (
                        <div
                          key={coach.id}
                          title={coach.name}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/90 text-[0.55rem] text-[var(--muted)]"
                        >
                          {getCoachInitials(coach.name)}
                        </div>
                      )
                    )
                  )}
                </div>
              </div>
            </div>
            <div className="border-b border-white/10 px-6 py-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="relative w-full sm:w-[min(360px,50vw)]">
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
                      value={memberQuery}
                      onChange={(event) => setMemberQuery(event.target.value)}
                      placeholder="Rechercher un eleve"
                      className="w-full rounded-full border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/40"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={activeFilter}
                      onChange={(event) => setActiveFilter(event.target.value as ActiveFilter)}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-[var(--text)]"
                      aria-label="Filtre actif"
                    >
                      <option value="all">Actif: Tous</option>
                      <option value="active">Actif: Oui</option>
                      <option value="inactive">Actif: Non</option>
                    </select>
                    <select
                      value={testFilter}
                      onChange={(event) => setTestFilter(event.target.value as TestFilter)}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-[var(--text)]"
                      aria-label="Filtre test en cours"
                    >
                      <option value="all">Test: Tous</option>
                      <option value="active">Test: Oui</option>
                      <option value="inactive">Test: Non</option>
                    </select>
                  </div>
                </div>
                <p className="text-xs text-[var(--muted)]">
                  <span className="font-semibold text-[var(--text)]">{filteredMembers.length}</span>{" "}
                  eleves
                </p>
              </div>
            </div>
            <div className="hidden border-b border-white/10 bg-white/[0.02] px-6 py-3 text-[0.7rem] font-semibold uppercase tracking-wide text-[var(--muted)] md:grid md:grid-cols-[32px_minmax(0,1fr)_120px_150px] md:items-center md:gap-6">
              <span aria-hidden="true" />
              <span>Eleves</span>
              <span className="text-center">Actif</span>
              <span className="text-center">Test</span>
            </div>
            <div className="divide-y divide-white/10">
              {filteredMembers.length === 0 ? (
                <div className="px-6 py-6 text-sm text-[var(--muted)]">
                  {memberRows.length === 0
                    ? "Aucun eleve assigne a ce groupe."
                    : "Aucun eleve ne correspond aux filtres."}
                </div>
              ) : (
                filteredMembers.map((member) => (
                  <div
                    key={member.id}
                    className="grid grid-cols-[32px_minmax(0,1fr)] gap-x-3 gap-y-2 px-6 py-4 md:grid-cols-[32px_minmax(0,1fr)_120px_150px] md:items-center md:gap-6"
                  >
                    <div className="flex items-center justify-center self-center md:justify-self-center">
                      <Link
                        href={`/app/coach/eleves/${member.id}`}
                        aria-label={`Ouvrir la fiche de ${member.fullName}`}
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
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--text)]">{member.fullName}</p>
                      <p className="mt-1 truncate text-xs text-[var(--muted)]">
                        {member.email ?? "Aucun email"}
                      </p>
                    </div>
                    <div className="col-span-2 flex items-center justify-start gap-2 md:col-span-1 md:justify-self-center">
                      <span className="text-xs text-[var(--muted)] md:hidden">Actif :</span>
                      <Badge tone={member.isActive ? "emerald" : "muted"} size="sm">
                        {member.isActive ? "Oui" : "Non"}
                      </Badge>
                    </div>
                    <div className="col-span-2 flex items-center justify-start gap-2 md:col-span-1 md:justify-self-center">
                      <span className="text-xs text-[var(--muted)] md:hidden">Test :</span>
                      {member.hasTests ? (
                        (() => {
                          const testStatusBadge = getTestStatusBadge(member.testStatus);
                          if (!testStatusBadge) return null;
                          return (
                            <Badge tone={testStatusBadge.tone} size="sm">
                              {testStatusBadge.label}
                            </Badge>
                          );
                        })()
                      ) : (
                        <Badge tone="muted" size="sm">
                          Aucun
                        </Badge>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {editOpen ? (
          <ModalFrame
            title="Informations du groupe"
            titleId="group-info-title"
            onClose={() => setEditOpen(false)}
            disableClose={savingGroup}
            footer={
              <>
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  disabled={savingGroup}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-[var(--text)] transition hover:bg-white/10 disabled:opacity-60"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  form="group-info-form"
                  disabled={!canEdit || savingGroup}
                  className="rounded-xl bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-5 py-2 text-sm font-semibold text-zinc-900 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingGroup ? "Sauvegarde..." : "Sauvegarder"}
                </button>
              </>
            }
          >
            <form id="group-info-form" onSubmit={saveGroup} className="space-y-4 px-6 py-5">
              <div>
                <label className="text-xs uppercase tracking-wide text-[var(--muted)]">Nom du groupe</label>
                <input
                  value={groupDraftName}
                  onChange={(event) => setGroupDraftName(event.target.value)}
                  disabled={!canEdit || savingGroup}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500 focus:border-[var(--accent)] focus:outline-none disabled:opacity-60"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-[var(--muted)]">Description</label>
                <input
                  value={groupDraftDescription}
                  onChange={(event) => setGroupDraftDescription(event.target.value)}
                  disabled={!canEdit || savingGroup}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500 focus:border-[var(--accent)] focus:outline-none disabled:opacity-60"
                  placeholder="Optionnel"
                />
              </div>
              {isOrgReadOnly ? (
                <p className="text-sm text-amber-300">Freemium: lecture seule en organisation.</p>
              ) : null}
              {error ? <p className="text-sm text-red-400">{error}</p> : null}
            </form>
          </ModalFrame>
        ) : null}

        {studentsOpen ? (
          <ModalFrame
            title="Ajouter des eleves"
            titleId="group-students-title"
            onClose={() => setStudentsOpen(false)}
            disableClose={savingStudents}
            maxWidth="max-w-2xl"
            footer={
              <>
                <button
                  type="button"
                  onClick={() => setStudentsOpen(false)}
                  disabled={savingStudents}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-[var(--text)] transition hover:bg-white/10 disabled:opacity-60"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={saveStudents}
                  disabled={!canEdit || savingStudents}
                  className="rounded-xl bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-5 py-2 text-sm font-semibold text-zinc-900 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingStudents ? "Enregistrement..." : "Enregistrer"}
                </button>
              </>
            }
          >
            <div className="max-h-[70vh] overflow-auto px-6 py-5">
              <p className="text-xs text-[var(--muted)]">
                Selection batch possible - {studentDraftIds.length} selectionnes
              </p>
              <input
                value={studentQuery}
                onChange={(event) => setStudentQuery(event.target.value)}
                placeholder="Rechercher un eleve"
                className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500 focus:border-[var(--accent)] focus:outline-none"
              />
              <div className="mt-4 space-y-2">
                {filteredStudents.length === 0 ? (
                  <p className="text-xs text-[var(--muted)]">Aucun eleve.</p>
                ) : (
                  filteredStudents.map((student) => {
                    const checked = studentDraftIds.includes(student.id);
                    return (
                      <label
                        key={student.id}
                        className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${
                          checked
                            ? "border-emerald-400/40 bg-emerald-400/10"
                            : "border-white/10 bg-white/5"
                        } ${!canEdit ? "opacity-70" : "cursor-pointer"}`}
                      >
                        <span>
                          {student.first_name} {student.last_name ?? ""}
                        </span>
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          disabled={!canEdit}
                          checked={checked}
                          onChange={() => toggleStudentDraft(student.id)}
                        />
                      </label>
                    );
                  })
                )}
              </div>
              {isOrgReadOnly ? (
                <p className="mt-5 text-sm text-amber-300">Freemium: lecture seule en organisation.</p>
              ) : null}
              {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
            </div>
          </ModalFrame>
        ) : null}

        {coachesOpen ? (
          <ModalFrame
            title="Gerer les coachs"
            titleId="group-coaches-title"
            onClose={() => setCoachesOpen(false)}
            disableClose={savingCoaches || propagating}
            maxWidth="max-w-2xl"
            footer={
              <>
                <button
                  type="button"
                  onClick={() => setCoachesOpen(false)}
                  disabled={savingCoaches || propagating}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-[var(--text)] transition hover:bg-white/10 disabled:opacity-60"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={saveCoaches}
                  disabled={!canEdit || savingCoaches}
                  className="rounded-xl bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-5 py-2 text-sm font-semibold text-zinc-900 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingCoaches ? "Enregistrement..." : "Enregistrer"}
                </button>
              </>
            }
          >
            <div className="max-h-[70vh] overflow-auto px-6 py-5">
              <p className="text-xs text-[var(--muted)]">
                Selection batch possible - {coachDraftIds.length} selectionnes
              </p>
              <input
                value={coachQuery}
                onChange={(event) => setCoachQuery(event.target.value)}
                placeholder="Rechercher un coach"
                className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500 focus:border-[var(--accent)] focus:outline-none"
              />
              <div className="mt-4 space-y-2">
                {filteredCoaches.length === 0 ? (
                  <p className="text-xs text-[var(--muted)]">Aucun coach.</p>
                ) : (
                  filteredCoaches.map((coach) => {
                    const checked = coachDraftIds.includes(coach.id);
                    return (
                      <label
                        key={coach.id}
                        className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${
                          checked
                            ? "border-emerald-400/40 bg-emerald-400/10"
                            : "border-white/10 bg-white/5"
                        } ${!canEdit ? "opacity-70" : "cursor-pointer"}`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[var(--text)]">{coach.name}</span>
                          <span className="block text-xs text-[var(--muted)]">
                            {coach.role === "admin" ? "Admin" : "Coach"}
                          </span>
                        </span>
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          disabled={!canEdit}
                          checked={checked}
                          onChange={() => toggleCoachDraft(coach.id)}
                        />
                      </label>
                    );
                  })
                )}
              </div>
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                <h4 className="text-sm font-semibold text-[var(--text)]">Propagation d assignations</h4>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Assigne automatiquement les eleves du groupe a tous les coachs selectionnes.
                </p>
                <button
                  type="button"
                  onClick={propagateAssignments}
                  disabled={!canEdit || propagating}
                  className="mt-3 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20 disabled:opacity-60"
                >
                  {propagating ? "Propagation..." : "Lancer la propagation"}
                </button>
              </div>
              {isOrgReadOnly ? (
                <p className="mt-5 text-sm text-amber-300">Freemium: lecture seule en organisation.</p>
              ) : null}
              {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
            </div>
          </ModalFrame>
        ) : null}
      </div>
    </RoleGuard>
  );
}
