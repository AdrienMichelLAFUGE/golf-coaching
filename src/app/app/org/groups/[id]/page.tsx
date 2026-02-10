"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import PageBack from "../../../_components/page-back";
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
};

type CoachRow = {
  id: string;
  name: string;
  role: string;
};

type GroupPayload = {
  group: GroupRow;
  students: StudentRow[];
  coaches: CoachRow[];
  selectedStudentIds: string[];
  selectedCoachIds: string[];
};

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
  const [studentQuery, setStudentQuery] = useState("");
  const [coachQuery, setCoachQuery] = useState("");
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
      if (cancelled) return;
      void loadGroup();
    });
    return () => {
      cancelled = true;
    };
  }, [loadGroup]);

  const filteredStudents = useMemo(() => {
    const query = studentQuery.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) => {
      const name = `${student.first_name} ${student.last_name ?? ""}`.toLowerCase();
      return name.includes(query);
    });
  }, [studentQuery, students]);

  const filteredCoaches = useMemo(() => {
    const query = coachQuery.trim().toLowerCase();
    if (!query) return coaches;
    return coaches.filter((coach) => coach.name.toLowerCase().includes(query));
  }, [coachQuery, coaches]);

  const toggleStudent = (studentId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const toggleCoach = (coachId: string) => {
    setSelectedCoachIds((prev) =>
      prev.includes(coachId) ? prev.filter((id) => id !== coachId) : [...prev, coachId]
    );
  };

  const saveGroup = async () => {
    if (!group) return;
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
      body: JSON.stringify({ name: group.name, description: group.description ?? "" }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Mise a jour impossible.");
      setSavingGroup(false);
      return;
    }
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
      body: JSON.stringify({ studentIds: selectedStudentIds }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Mise a jour impossible.");
      setSavingStudents(false);
      return;
    }
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
      body: JSON.stringify({ coachIds: selectedCoachIds }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Mise a jour impossible.");
      setSavingCoaches(false);
      return;
    }
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
        <section className="panel rounded-2xl p-6">
          <div className="flex items-center gap-2">
            <PageBack fallbackHref="/app/org" />
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Organisation
            </p>
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
            Gestion du groupe
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Assignez les eleves et les coachs pour organiser le travail en structure.
          </p>
          <Badge as="div" className={`mt-3 ${modeBadgeTone}`}>
            <span className="min-w-0 break-words">Vous travaillez dans {modeLabel}</span>
          </Badge>
          {isOrgReadOnly ? (
            <p className="mt-3 text-sm text-amber-300">
              Plan Pro requis pour modifier les groupes.
            </p>
          ) : null}
        </section>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        {loading ? (
          <div className="panel rounded-2xl p-6 text-sm text-[var(--muted)]">
            Chargement...
          </div>
        ) : !group ? (
          <div className="panel rounded-2xl p-6 text-sm text-[var(--muted)]">
            Groupe introuvable.
          </div>
        ) : (
          <>
            <section className="panel rounded-2xl border border-white/10 p-6">
              <h3 className="text-sm font-semibold text-[var(--text)]">Informations</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Nom du groupe
                  </label>
                  <input
                    value={group.name}
                    onChange={(event) =>
                      setGroup((prev) => (prev ? { ...prev, name: event.target.value } : prev))
                    }
                    disabled={!canEdit}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500 focus:border-[var(--accent)] focus:outline-none disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Description
                  </label>
                  <input
                    value={group.description ?? ""}
                    onChange={(event) =>
                      setGroup((prev) =>
                        prev ? { ...prev, description: event.target.value } : prev
                      )
                    }
                    disabled={!canEdit}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500 focus:border-[var(--accent)] focus:outline-none disabled:opacity-60"
                  />
                </div>
                <button
                  type="button"
                  onClick={saveGroup}
                  disabled={!canEdit || savingGroup}
                  className="rounded-xl bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingGroup ? "Sauvegarde..." : "Sauvegarder"}
                </button>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="panel rounded-2xl border border-white/10 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-[var(--text)]">Eleves</h3>
                  <button
                    type="button"
                    onClick={saveStudents}
                    disabled={!canEdit || savingStudents}
                    className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20 disabled:opacity-60"
                  >
                    {savingStudents ? "En cours..." : "Enregistrer"}
                  </button>
                </div>
                <input
                  value={studentQuery}
                  onChange={(event) => setStudentQuery(event.target.value)}
                  placeholder="Rechercher un eleve"
                  className="mt-4 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500 focus:border-[var(--accent)] focus:outline-none"
                />
                <div className="mt-4 space-y-2">
                  {filteredStudents.length === 0 ? (
                    <p className="text-xs text-[var(--muted)]">Aucun eleve.</p>
                  ) : (
                    filteredStudents.map((student) => {
                      const checked = selectedStudentIds.includes(student.id);
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
                            onChange={() => toggleStudent(student.id)}
                          />
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="panel rounded-2xl border border-white/10 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-[var(--text)]">Coachs</h3>
                  <button
                    type="button"
                    onClick={saveCoaches}
                    disabled={!canEdit || savingCoaches}
                    className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20 disabled:opacity-60"
                  >
                    {savingCoaches ? "En cours..." : "Enregistrer"}
                  </button>
                </div>
                <input
                  value={coachQuery}
                  onChange={(event) => setCoachQuery(event.target.value)}
                  placeholder="Rechercher un coach"
                  className="mt-4 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500 focus:border-[var(--accent)] focus:outline-none"
                />
                <div className="mt-4 space-y-2">
                  {filteredCoaches.length === 0 ? (
                    <p className="text-xs text-[var(--muted)]">Aucun coach.</p>
                  ) : (
                    filteredCoaches.map((coach) => {
                      const checked = selectedCoachIds.includes(coach.id);
                      return (
                        <label
                          key={coach.id}
                          className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${
                            checked
                              ? "border-emerald-400/40 bg-emerald-400/10"
                              : "border-white/10 bg-white/5"
                          } ${!canEdit ? "opacity-70" : "cursor-pointer"}`}
                        >
                          <span>{coach.name}</span>
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            disabled={!canEdit}
                            checked={checked}
                            onChange={() => toggleCoach(coach.id)}
                          />
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </section>

            <section className="panel rounded-2xl border border-white/10 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text)]">
                    Propagation d assignations
                  </h3>
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    Assigne automatiquement les eleves de ce groupe a tous les coachs
                    selectionnes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={propagateAssignments}
                  disabled={!canEdit || propagating}
                  className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20 disabled:opacity-60"
                >
                  {propagating ? "Propagation..." : "Assigner"}
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </RoleGuard>
  );
}
