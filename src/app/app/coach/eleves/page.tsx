"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import RoleGuard from "../../_components/role-guard";
import PageBack from "../../_components/page-back";
import { useProfile } from "../../_components/profile-context";

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

type StudentForm = {
  first_name: string;
  last_name: string;
  email: string;
  playing_hand: "" | "right" | "left";
};

export default function CoachStudentsPage() {
  const { userEmail, organization, isWorkspacePremium, workspaceType } = useProfile();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<StudentForm>({
    first_name: "",
    last_name: "",
    email: "",
    playing_hand: "",
  });
  const [creating, setCreating] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState<StudentForm>({
    first_name: "",
    last_name: "",
    email: "",
    playing_hand: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [sharedStudentIds, setSharedStudentIds] = useState<string[]>([]);
  const isOrgReadOnly = organization?.workspace_type === "org" && !isWorkspacePremium;
  const currentWorkspaceType = workspaceType ?? "personal";
  const workspaceName = organization?.name ?? "Organisation";
  const modeLabel =
    currentWorkspaceType === "org" ? `Organisation : ${workspaceName}` : "Espace personnel";
  const modeBadgeTone =
    currentWorkspaceType === "org"
      ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
      : "border-sky-300/30 bg-sky-400/10 text-sky-100";

  const openWorkspaceSwitcher = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("gc:open-workspace-switcher"));
  };

  const scrollToForm = () => {
    if (typeof window === "undefined") return;
    document.getElementById("student-create-form")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const sharedStudentSet = useMemo(() => new Set(sharedStudentIds), [sharedStudentIds]);

  const filteredStudents = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return students;
    return students.filter((student) => {
      const name = `${student.first_name} ${student.last_name ?? ""}`.trim();
      return (
        name.toLowerCase().includes(search) ||
        (student.email ?? "").toLowerCase().includes(search)
      );
    });
  }, [query, students]);

  const loadProfile = async () => {
    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("org_id")
      .single();

    if (profileError) {
      setError(profileError.message);
      return;
    }

    setOrgId(data.org_id);
  };

  const loadStudents = async () => {
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
    } else {
      setStudents(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (cancelled) return;
      await loadProfile();
      if (cancelled) return;
      await loadStudents();
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const handleCreateStudent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setError("");

    if (isOrgReadOnly) {
      setError("Lecture seule: premium requis pour ajouter un eleve.");
      setCreating(false);
      return;
    }

    const firstName = form.first_name.trim();
    const lastName = form.last_name.trim();
    const email = form.email.trim();
    const playingHand = form.playing_hand || null;

    if (!firstName) {
      setError("Le prenom est obligatoire.");
      setCreating(false);
      return;
    }

    if (!orgId) {
      setError("Profil en cours de chargement. Reessaie dans un instant.");
      setCreating(false);
      return;
    }

    if (organization?.workspace_type === "org") {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setError("Session invalide.");
        setCreating(false);
        return;
      }
      const response = await fetch("/api/orgs/students", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName || null,
          email: email || null,
          playing_hand: playingHand || null,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Creation impossible.");
        setCreating(false);
        return;
      }
    } else {
      const { error: insertError } = await supabase.from("students").insert([
        {
          org_id: orgId,
          first_name: firstName,
          last_name: lastName || null,
          email: email || null,
          playing_hand: playingHand,
        },
      ]);

      if (insertError) {
        setError(insertError.message);
        setCreating(false);
        return;
      }
    }

    setForm({ first_name: "", last_name: "", email: "", playing_hand: "" });
    await loadStudents();
    setCreating(false);
  };

  const handleInviteStudent = async (student: Student) => {
    if (isOrgReadOnly) {
      setInviteError("Lecture seule: premium requis pour inviter un eleve.");
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
      setInviteError("Lecture seule: premium requis pour supprimer un eleve.");
      return;
    }
    const confirmed = window.confirm(
      `Supprimer ${student.first_name} ${student.last_name ?? ""} ?`
    );
    if (!confirmed) return;

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
    if (student.activated_at) return;
    setMenuOpenId(null);
    await handleInviteStudent(student);
  };

  const handleMenuDelete = async (student: Student) => {
    setMenuOpenId(null);
    await handleDeleteStudent(student);
  };

  const handleMenuEdit = (student: Student) => {
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

  const handleCloseEdit = () => {
    if (editSaving) return;
    setEditingStudent(null);
    setEditError("");
  };

  const handleUpdateStudent = async () => {
    if (!editingStudent) return;
    if (isOrgReadOnly) {
      setEditError("Lecture seule: premium requis pour modifier un eleve.");
      return;
    }
    const firstName = editForm.first_name.trim();
    const lastName = editForm.last_name.trim();
    const email = editForm.email.trim();
    const playingHand = editForm.playing_hand || null;

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
        <section className="panel rounded-2xl p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <PageBack />
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                  Eleves
                </p>
              </div>
              <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
                Annuaire eleves
              </h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Recherche rapide, suivi et historique des rapports.
              </p>
              <div
                className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.6rem] uppercase tracking-[0.25em] ${modeBadgeTone}`}
              >
                Vous travaillez dans {modeLabel}
              </div>
            </div>
          </div>
        </section>

        <section className="panel-soft rounded-2xl p-5">
          <form
            id="student-create-form"
            className="grid gap-4 md:grid-cols-[1fr_1fr_1fr_0.8fr_auto]"
            onSubmit={handleCreateStudent}
          >
            <div>
              <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Prenom
              </label>
              <input
                type="text"
                value={form.first_name}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    first_name: event.target.value,
                  }))
                }
                placeholder="Camille"
                disabled={creating || isOrgReadOnly}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Nom
              </label>
              <input
                type="text"
                value={form.last_name}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    last_name: event.target.value,
                  }))
                }
                placeholder="Dupont"
                disabled={creating || isOrgReadOnly}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, email: event.target.value }))
                }
                placeholder="camille@email.com"
                disabled={creating || isOrgReadOnly}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Sens de jeu
              </label>
              <select
                value={form.playing_hand}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    playing_hand: event.target.value as "" | "left" | "right",
                  }))
                }
                disabled={creating || isOrgReadOnly}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
              >
                <option value="">Non precise</option>
                <option value="right">Droitier</option>
                <option value="left">Gaucher</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={creating || isOrgReadOnly}
              className="self-end rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
            >
              {creating ? "Ajout..." : "Ajouter"}
            </button>
          </form>
          <p className="mt-3 text-xs text-[var(--muted)]">
            Cet eleve sera cree dans :{" "}
            <span className="text-[var(--text)]">{modeLabel}</span>
          </p>
          {isOrgReadOnly ? (
            <p className="mt-3 text-sm text-amber-300">
              Freemium: lecture seule en organisation.
            </p>
          ) : null}
          {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
          {inviteError ? (
            <p className="mt-3 text-sm text-red-400">{inviteError}</p>
          ) : null}
          {inviteMessage ? (
            <p className="mt-3 text-sm text-[var(--muted)]">{inviteMessage}</p>
          ) : null}
        </section>

        <section className="panel-soft rounded-2xl p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un eleve"
              className="w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-4 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500 md:max-w-sm"
            />
            <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <span>{filteredStudents.length} eleves</span>
              <span>-</span>
              <span>Donnees en temps reel</span>
            </div>
          </div>
        </section>

        <section className="panel rounded-2xl p-6">
          <div className="grid gap-3 text-sm text-[var(--muted)]">
            <div className="hidden gap-3 uppercase tracking-wide text-[0.7rem] text-[var(--muted)] md:grid md:grid-cols-[1.5fr_1fr_0.9fr_0.9fr]">
              <span>Eleve</span>
              <span>Email</span>
              <span>Acces</span>
              <span>Features</span>
            </div>
            {loading ? (
              <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                Chargement des eleves...
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-4 text-sm">
                <p className="text-[var(--text)]">
                  {currentWorkspaceType === "org"
                    ? "Aucun eleve dans cette organisation."
                    : "Vous n avez aucun eleve personnel."}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Vous etes en {currentWorkspaceType === "org" ? "MODE ORGANISATION" : "MODE PERSO"}
                  .
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={scrollToForm}
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
              filteredStudents.map((student) => {
                const inviteDisabled = Boolean(student.activated_at);
                const isShared = sharedStudentSet.has(student.id);
                const isReadOnlyAction = isShared || isOrgReadOnly;
                const inviteLabel = inviteDisabled
                  ? "Inviter"
                  : invitingId === student.id
                    ? "Envoi..."
                    : "Inviter";
                return (
                  <div
                    key={student.id}
                    className="relative grid gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-[var(--text)] md:grid-cols-[1.5fr_1fr_0.9fr_0.9fr]"
                  >
                    <div>
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/app/coach/eleves/${student.id}`}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)]"
                          aria-label="Voir le dashboard eleve"
                          title="Voir le dashboard eleve"
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
                            <path d="M3 12h18" />
                            <path d="M15 6l6 6-6 6" />
                          </svg>
                        </Link>
                        <p className="font-medium">
                          {student.first_name} {student.last_name ?? ""}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm text-[var(--muted)]">
                      {student.email || "-"}
                    </span>
                    <div className="flex flex-col gap-2">
                      {student.activated_at ? (
                        <span className="inline-flex self-start rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[0.65rem] uppercase tracking-wide text-emerald-200">
                          Actif
                        </span>
                      ) : student.invited_at ? (
                        <span className="inline-flex self-start rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-1 text-[0.65rem] uppercase tracking-wide text-amber-200">
                          Invite
                        </span>
                      ) : (
                        <span className="inline-flex self-start rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)]">
                          A inviter
                        </span>
                      )}
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      {sharedStudentSet.has(student.id) ? (
                        <span className="inline-flex self-start rounded-full border border-sky-300/30 bg-sky-400/10 px-2 py-1 text-[0.65rem] uppercase tracking-wide text-sky-100">
                          Partage
                        </span>
                      ) : null}
                      {student.tpi_report_id ? (
                        <span className="inline-flex self-start rounded-full border border-rose-300/30 bg-rose-400/10 px-2 py-1 text-[0.65rem] uppercase tracking-wide text-rose-200">
                          TPI actif
                        </span>
                      ) : (
                        <span className="inline-flex self-start rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)]">
                          TPI inactif
                        </span>
                      )}
                      <div className="relative" data-student-menu>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setMenuOpenId((prev) =>
                              prev === student.id ? null : student.id
                            );
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)]"
                          aria-label="Actions eleve"
                          aria-expanded={menuOpenId === student.id}
                          aria-haspopup="menu"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-4 w-4"
                            fill="currentColor"
                          >
                            <circle cx="12" cy="5" r="2" />
                            <circle cx="12" cy="12" r="2" />
                            <circle cx="12" cy="19" r="2" />
                          </svg>
                        </button>
                        {menuOpenId === student.id ? (
                          <div
                            role="menu"
                            onClick={(event) => event.stopPropagation()}
                            className="absolute right-0 z-50 mt-2 w-40 rounded-xl border border-white/10 bg-[var(--bg-elevated)] p-1 text-xs shadow-[0_12px_30px_rgba(0,0,0,0.35)]"
                          >
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
                              onClick={() => setMenuOpenId(null)}
                              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[0.65rem] uppercase tracking-wide text-[var(--text)] transition hover:bg-white/10"
                            >
                              Profil TPI
                            </Link>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => handleMenuInvite(student)}
                              disabled={
                                isReadOnlyAction ||
                                inviteDisabled ||
                                invitingId === student.id
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
                              onClick={() => handleMenuDelete(student)}
                              disabled={isReadOnlyAction || deletingId === student.id}
                              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[0.65rem] uppercase tracking-wide text-red-300 transition hover:bg-white/10 hover:text-red-200 disabled:opacity-60"
                            >
                              {deletingId === student.id ? "Suppression..." : "Supprimer"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
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
