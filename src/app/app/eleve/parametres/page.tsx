"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { supabase } from "@/lib/supabase/client";
import RoleGuard from "../../_components/role-guard";
import { useProfile } from "../../_components/profile-context";
import PageBack from "../../_components/page-back";
import PageHeader from "../../_components/page-header";
import MessagesPrivacyExportCard from "../../_components/messages-privacy-export-card";

type StudentProfile = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
  deleted_at: string | null;
  created_at?: string | null;
};

const STORAGE_BUCKET = "coach-assets";
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const passwordSchema = z.string().min(8);
const urlSchema = z.string().url();

export default function StudentSettingsPage() {
  const router = useRouter();
  const { profile, userEmail, refresh } = useProfile();
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const [avatarSuccess, setAvatarSuccess] = useState("");
  const [avatarDragging, setAvatarDragging] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadStudent = async () => {
      if (cancelled) return;
      setLoading(true);
      setError("");

      const userId = profile?.id ?? (await supabase.auth.getUser()).data.user?.id;
      if (!userId) {
        setError("Email introuvable.");
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
        setError("Profil eleve introuvable.");
        setLoading(false);
        return;
      }

      const { data, error: studentError } = await supabase
        .from("students")
        .select("id, first_name, last_name, email, avatar_url, deleted_at, created_at")
        .in("id", studentIds)
        .order("created_at", { ascending: false });

      if (studentError) {
        setError(studentError.message);
        setLoading(false);
        return;
      }

      const primaryStudent = (data ?? [])[0] as StudentProfile | undefined;
      if (!primaryStudent) {
        setError("Profil eleve introuvable.");
        setLoading(false);
        return;
      }

      setStudent(primaryStudent);
      setAvatarUrl(primaryStudent.avatar_url ?? profile?.avatar_url ?? "");
      setLoading(false);
    };

    void loadStudent();
    return () => {
      cancelled = true;
    };
  }, [profile?.id, profile?.avatar_url]);

  const handleAvatarUpload = async (file: File) => {
    if (!student || !profile) return;
    if (!file.type.startsWith("image/")) {
      setAvatarError("Selectionne un fichier image.");
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setAvatarError("Image trop lourde (2 Mo max).");
      return;
    }

    setAvatarError("");
    setAvatarSuccess("");
    setUploadingAvatar(true);

    const ext = file.name.split(".").pop() || "png";
    const filePath = `students/${student.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      setAvatarError(uploadError.message);
      setUploadingAvatar(false);
      return;
    }

    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    const parsedUrl = urlSchema.safeParse(data.publicUrl);
    if (!parsedUrl.success) {
      setAvatarError("URL invalide.");
      setUploadingAvatar(false);
      return;
    }

    const nextUrl = parsedUrl.data;
    const { error: studentError } = await supabase
      .from("students")
      .update({ avatar_url: nextUrl })
      .eq("id", student.id);

    if (studentError) {
      setAvatarError(studentError.message);
      setUploadingAvatar(false);
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ avatar_url: nextUrl })
      .eq("id", profile.id);

    if (profileError) {
      setAvatarError(profileError.message);
      setUploadingAvatar(false);
      return;
    }

    await refresh();
    setAvatarUrl(nextUrl);
    setAvatarSuccess("Photo mise a jour.");
    setUploadingAvatar(false);
  };

  const handleFileInput = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    void handleAvatarUpload(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setAvatarDragging(false);
    handleFileInput(event.dataTransfer.files);
  };

  const handleUpdatePassword = async () => {
    setPasswordError("");
    setPasswordSuccess("");

    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      setPasswordError("Minimum 8 caracteres.");
      return;
    }
    if (password !== passwordConfirm) {
      setPasswordError("Les mots de passe ne correspondent pas.");
      return;
    }

    setPasswordSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({
      password: parsed.data,
    });

    if (updateError) {
      setPasswordError(updateError.message);
      setPasswordSaving(false);
      return;
    }

    setPassword("");
    setPasswordConfirm("");
    setPasswordSuccess("Mot de passe mis a jour.");
    setPasswordSaving(false);
  };

  const handleDeleteAccount = async () => {
    setDeleteError("");
    const parsed = passwordSchema.safeParse(deletePassword);
    if (!parsed.success) {
      setDeleteError("Mot de passe invalide.");
      return;
    }
    if (!deleteConfirm) {
      setDeleteError("Confirme la suppression pour continuer.");
      return;
    }

    setDeleting(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setDeleteError("Session invalide.");
      setDeleting(false);
      return;
    }

    const response = await fetch("/api/student-settings/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ password: parsed.data }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setDeleteError(payload.error ?? "Suppression impossible.");
      setDeleting(false);
      return;
    }

    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      window.location.replace("/");
      return;
    }
    router.replace("/");
  };

  return (
    <RoleGuard
      allowedRoles={["student"]}
      fallback={
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-[var(--muted)]">Acces reserve aux eleves.</p>
        </section>
      }
    >
      {loading ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-[var(--muted)]">Chargement des parametres...</p>
        </section>
      ) : error ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-red-400">{error}</p>
        </section>
      ) : student?.deleted_at ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-[var(--muted)]">Ton compte est deja anonymise.</p>
        </section>
      ) : (
        <div className="space-y-6">
          <PageHeader
            overline={
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                Parametres eleve
              </p>
            }
            leading={<PageBack />}
            title="Reglages du compte"
            subtitle="Gere ta securite, ta photo et la suppression de ton compte."
          />

          <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <div className="panel rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-[var(--text)]">Profil</h3>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Email (lecture seule)
                  </label>
                  <input
                    type="email"
                    value={student?.email ?? userEmail ?? ""}
                    readOnly
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--muted)]"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Photo de profil
                  </label>
                  <div
                    onDragOver={(event) => event.preventDefault()}
                    onDragEnter={() => setAvatarDragging(true)}
                    onDragLeave={() => setAvatarDragging(false)}
                    onDrop={handleDrop}
                    className={`mt-2 rounded-2xl border border-dashed px-4 py-3 transition ${
                      avatarDragging
                        ? "border-[var(--accent)] bg-[var(--accent)]/10"
                        : "border-white/10 bg-white/5"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-4">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt="Photo de profil"
                          className="h-14 w-14 rounded-full border border-white/10 object-cover"
                        />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/10 text-xs text-[var(--muted)]">
                          Photo
                        </div>
                      )}
                      <div className="space-y-1 text-xs text-[var(--muted)]">
                        <p>Glisse une image ici.</p>
                        <button
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          disabled={uploadingAvatar}
                          className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20 disabled:opacity-60"
                        >
                          Parcourir
                        </button>
                        <p className="text-[0.65rem]">PNG ou JPG, 2 Mo max.</p>
                      </div>
                    </div>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        handleFileInput(event.target.files);
                        event.currentTarget.value = "";
                      }}
                      className="hidden"
                    />
                  </div>
                  {uploadingAvatar ? (
                    <p className="mt-2 text-xs text-[var(--muted)]">Upload en cours...</p>
                  ) : null}
                  {avatarError ? (
                    <p className="mt-2 text-sm text-red-400">{avatarError}</p>
                  ) : null}
                  {avatarSuccess ? (
                    <p className="mt-2 text-sm text-emerald-200">{avatarSuccess}</p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="panel rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-[var(--text)]">Mot de passe</h3>
              <p className="mt-2 text-xs text-[var(--muted)]">
                Mets a jour ton mot de passe pour te connecter en securite.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_auto]">
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Nouveau mot de passe
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="********"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Confirmation
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={passwordConfirm}
                    onChange={(event) => setPasswordConfirm(event.target.value)}
                    placeholder="********"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleUpdatePassword}
                  disabled={passwordSaving}
                  className="self-end rounded-full border border-white/10 bg-white/10 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20 disabled:opacity-60"
                >
                  {passwordSaving ? "Mise a jour..." : "Mettre a jour"}
                </button>
                <label className="flex items-center gap-2 text-xs text-[var(--muted)] md:col-span-3">
                  <input
                    type="checkbox"
                    checked={showPassword}
                    onChange={(event) => setShowPassword(event.target.checked)}
                    className="h-4 w-4 rounded border-white/10 bg-[var(--bg-elevated)]"
                  />
                  Afficher le mot de passe
                </label>
              </div>
              {passwordError ? (
                <p className="mt-3 text-sm text-red-400">{passwordError}</p>
              ) : null}
              {passwordSuccess ? (
                <p className="mt-3 text-sm text-emerald-200">{passwordSuccess}</p>
              ) : null}
            </div>
          </section>

          <MessagesPrivacyExportCard />

          <section className="panel rounded-2xl border border-rose-300/30 bg-rose-400/10 p-6">
            <h3 className="text-lg font-semibold text-[var(--text)]">
              Supprimer mon compte
            </h3>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Cette action est definitive. Ton compte sera anonymise immediatement. Tes
              contenus restent accessibles a ton coach.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
              <div>
                <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  Mot de passe
                </label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                  placeholder="********"
                  className="mt-2 w-full rounded-xl border border-rose-200/30 bg-rose-500/10 px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)]"
                />
                <label className="mt-3 flex items-center gap-2 text-xs text-[var(--muted)]">
                  <input
                    type="checkbox"
                    checked={deleteConfirm}
                    onChange={(event) => setDeleteConfirm(event.target.checked)}
                    className="h-4 w-4 rounded border-rose-200/40 bg-rose-500/20"
                  />
                  Je comprends que je ne pourrai plus acceder a mon compte.
                </label>
              </div>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="self-end rounded-full border border-rose-200/40 bg-rose-500/20 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-rose-500/30 disabled:opacity-60"
              >
                {deleting ? "Suppression..." : "Supprimer definitivement"}
              </button>
            </div>
            {deleteError ? (
              <p className="mt-3 text-sm text-red-400">{deleteError}</p>
            ) : null}
          </section>
        </div>
      )}
    </RoleGuard>
  );
}
