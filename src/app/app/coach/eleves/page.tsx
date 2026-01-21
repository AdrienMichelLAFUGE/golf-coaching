"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import RoleGuard from "../../_components/role-guard";

type Student = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  created_at: string;
  invited_at: string | null;
};

type StudentForm = {
  first_name: string;
  last_name: string;
  email: string;
};

export default function CoachStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<StudentForm>({
    first_name: "",
    last_name: "",
    email: "",
  });
  const [creating, setCreating] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
      .select("id, first_name, last_name, email, created_at, invited_at")
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setStudents(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadProfile();
    loadStudents();
  }, []);

  const handleCreateStudent = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setCreating(true);
    setError("");

    const firstName = form.first_name.trim();
    const lastName = form.last_name.trim();
    const email = form.email.trim();

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

    const { error: insertError } = await supabase.from("students").insert([
      {
        org_id: orgId,
        first_name: firstName,
        last_name: lastName || null,
        email: email || null,
      },
    ]);

    if (insertError) {
      setError(insertError.message);
      setCreating(false);
      return;
    }

    setForm({ first_name: "", last_name: "", email: "" });
    await loadStudents();
    setCreating(false);
  };

  const handleInviteStudent = async (student: Student) => {
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

  return (
    <RoleGuard allowedRoles={["owner", "coach", "staff"]}>
      <div className="space-y-6">
        <section className="panel rounded-2xl p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                Eleves
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
                Annuaire eleves
              </h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Recherche rapide, suivi et historique des rapports.
              </p>
            </div>
          </div>
        </section>

        <section className="panel-soft rounded-2xl p-5">
          <form
            className="grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto]"
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
                className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="self-end rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
            >
              {creating ? "Ajout..." : "Ajouter"}
            </button>
          </form>
          {error ? (
            <p className="mt-3 text-sm text-red-400">{error}</p>
          ) : null}
          {inviteError ? (
            <p className="mt-3 text-sm text-red-400">{inviteError}</p>
          ) : null}
          {inviteMessage ? (
            <p className="mt-3 text-sm text-[var(--muted)]">
              {inviteMessage}
            </p>
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
            <div className="grid grid-cols-[1.5fr_1fr_1.2fr] gap-3 uppercase tracking-wide text-[0.7rem] text-[var(--muted)]">
              <span>Eleve</span>
              <span>Email</span>
              <span>Acces</span>
            </div>
            {loading ? (
              <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                Chargement des eleves...
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                Aucun eleve pour le moment.
              </div>
            ) : (
              filteredStudents.map((student) => (
                <div
                  key={student.id}
                  className="grid grid-cols-[1.5fr_1fr_1.2fr] gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-[var(--text)]"
                >
                  <div>
                    <p className="font-medium">
                      {student.first_name} {student.last_name ?? ""}
                    </p>
                    <Link
                      href={`/app/coach/eleves/${student.id}`}
                      className="mt-1 inline-flex text-xs uppercase tracking-wide text-[var(--muted)] hover:text-[var(--text)]"
                    >
                      Voir le dashboard -&gt;
                    </Link>
                  </div>
                  <span className="text-sm text-[var(--muted)]">
                    {student.email || "-"}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleInviteStudent(student)}
                      disabled={invitingId === student.id}
                      className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20 disabled:opacity-60"
                    >
                      {invitingId === student.id ? "Envoi..." : "Inviter"}
                    </button>
                    {student.invited_at ? (
                      <span className="text-[0.65rem] uppercase tracking-wide text-[var(--muted)]">
                        Invite
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleDeleteStudent(student)}
                      disabled={deletingId === student.id}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-red-300 transition hover:text-red-200 disabled:opacity-60"
                    >
                      {deletingId === student.id
                        ? "Suppression..."
                        : "Supprimer"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </RoleGuard>
  );
}
