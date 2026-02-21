"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { supabase } from "@/lib/supabase/client";
import RoleGuard from "../../_components/role-guard";
import { useProfile } from "../../_components/profile-context";
import PageBack from "../../_components/page-back";
import PageHeader from "../../_components/page-header";
import MessagesPrivacyExportCard from "../../_components/messages-privacy-export-card";

type StudentProfile = {
  id: string;
  org_id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
  deleted_at: string | null;
  created_at?: string | null;
};

type PendingEmailChange = {
  oldEmail: string;
  nextEmail: string;
};

const STORAGE_BUCKET = "coach-assets";
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const EMAIL_CHANGE_STORAGE_PREFIX = "student-email-change-pending:";
const EMAIL_CHANGE_GLOBAL_STORAGE_KEY = "student-email-change-last";
const getPendingEmailChangeStorageKey = (studentId: string) =>
  `${EMAIL_CHANGE_STORAGE_PREFIX}${studentId}`;
const passwordSchema = z.string().min(8);
const emailSchema = z.string().trim().email().max(320);
const urlSchema = z.string().url();
const dateTimeSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)));
const parentInvitationStatusSchema = z.enum(["pending", "accepted", "revoked"]);

const parentInvitationSchema = z.object({
  id: z.string().uuid(),
  parentEmail: z.string().email().nullable(),
  createdByRole: z.enum(["owner", "coach", "staff", "student"]),
  status: parentInvitationStatusSchema,
  createdAt: dateTimeSchema,
  expiresAt: dateTimeSchema,
  acceptedAt: dateTimeSchema.nullable(),
  revokedAt: dateTimeSchema.nullable(),
});

const parentInvitationListSchema = z.object({
  invitations: z.array(parentInvitationSchema),
});

const createParentInvitationResponseSchema = z.object({
  ok: z.literal(true),
  invitationId: z.string().uuid(),
  expiresAt: dateTimeSchema,
  emailSent: z.boolean(),
});

const parentSecretCodeMetadataSchema = z.object({
  hasSecretCode: z.boolean(),
  rotatedAt: dateTimeSchema.nullable(),
});

const regenerateParentSecretCodeResponseSchema = z.object({
  ok: z.literal(true),
  oneShot: z.literal(true),
  secretCode: z.string().regex(/^[A-Z0-9]{8}$/),
  rotatedAt: dateTimeSchema.nullable(),
});

const updateStudentEmailResponseSchema = z.object({
  ok: z.literal(true),
  email: z.string().email(),
  syncedStudentCount: z.number().int().positive(),
  requiresEmailConfirmation: z.boolean(),
});

const parentInvitationErrorSchema = z.object({
  error: z.string().min(1),
});

type ParentInvitation = z.infer<typeof parentInvitationSchema>;

const StepOneStatusIcon = ({ done }: { done: boolean }) => (
  <span
    className="relative inline-flex h-16 w-16 shrink-0 items-center justify-center"
    aria-hidden="true"
  >
    <span
      className={`absolute h-[4px] rounded-full transition-all duration-500 ${
        done
          ? "left-[18px] top-[37px] w-[16px] rotate-45 bg-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.55)]"
          : "left-[14px] top-[30px] w-[34px] rotate-45 bg-rose-300"
      }`}
    />
    <span
      className={`absolute h-[4px] rounded-full transition-all duration-500 ${
        done
          ? "left-[26px] top-[29px] w-[30px] -rotate-45 bg-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.55)]"
          : "left-[14px] top-[30px] w-[34px] -rotate-45 bg-rose-300"
      }`}
    />
  </span>
);

const StepTwoStatusIcon = ({
  status,
}: {
  status: "locked" | "ready" | "done";
}) => (
  <span
    className="relative inline-flex h-16 w-16 shrink-0 items-center justify-center"
    aria-hidden="true"
  >
    <span
      className={`absolute transition-all duration-500 ${
        status === "done"
          ? "left-[18px] top-[37px] h-[4px] w-[16px] rotate-45 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.55)]"
          : status === "ready"
            ? "left-[30px] top-[13px] h-[28px] w-[4px] rounded-full bg-amber-300 motion-safe:animate-bounce [animation-duration:1.4s]"
            : "left-[14px] top-[30px] h-[4px] w-[34px] rotate-45 rounded-full bg-rose-300"
      }`}
    />
    <span
      className={`absolute transition-all duration-500 ${
        status === "done"
          ? "left-[26px] top-[29px] h-[4px] w-[30px] -rotate-45 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.55)]"
          : status === "ready"
            ? "left-[30px] top-[45px] h-[6px] w-[6px] rounded-full bg-amber-300 motion-safe:animate-bounce [animation-duration:1.4s]"
            : "left-[14px] top-[30px] h-[4px] w-[34px] -rotate-45 rounded-full bg-rose-300"
      }`}
    />
  </span>
);

export default function StudentSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, userEmail, organization, refresh } = useProfile();
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
  const [studentEmailInput, setStudentEmailInput] = useState("");
  const [studentEmailSaving, setStudentEmailSaving] = useState(false);
  const [studentEmailError, setStudentEmailError] = useState("");
  const [studentEmailMessage, setStudentEmailMessage] = useState("");

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [parentInviteEmail, setParentInviteEmail] = useState("");
  const [parentInviteLoading, setParentInviteLoading] = useState(false);
  const [parentInviteError, setParentInviteError] = useState("");
  const [parentInviteMessage, setParentInviteMessage] = useState("");
  const [parentInvitations, setParentInvitations] = useState<ParentInvitation[]>([]);
  const [parentInvitationsLoading, setParentInvitationsLoading] = useState(false);
  const [parentInvitationsError, setParentInvitationsError] = useState("");
  const [parentInvitationsExpanded, setParentInvitationsExpanded] = useState(false);
  const [parentInvitationRevokingId, setParentInvitationRevokingId] = useState<string | null>(
    null
  );
  const [parentSecretCode, setParentSecretCode] = useState<string | null>(null);
  const [parentSecretCodeRotatedAt, setParentSecretCodeRotatedAt] = useState<string | null>(
    null
  );
  const [hasParentSecretCode, setHasParentSecretCode] = useState(false);
  const [parentSecretCodeLoading, setParentSecretCodeLoading] = useState(false);
  const [parentSecretCodeRegenerating, setParentSecretCodeRegenerating] = useState(false);
  const [parentSecretCodeError, setParentSecretCodeError] = useState("");
  const [parentSecretCodeMessage, setParentSecretCodeMessage] = useState("");
  const emailChangeConfirmed = searchParams.get("emailChange") === "confirmed";

  const loadParentInvitations = async (studentId: string) => {
    setParentInvitationsLoading(true);
    setParentInvitationsError("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setParentInvitations([]);
      setParentInvitationsError("Session invalide.");
      setParentInvitationsLoading(false);
      return;
    }

    const response = await fetch(`/api/students/${studentId}/parent-invitations`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const payload = (await response.json().catch(() => ({}))) as unknown;
    if (!response.ok) {
      const parsedError = parentInvitationErrorSchema.safeParse(payload);
      setParentInvitations([]);
      setParentInvitationsError(
        parsedError.success
          ? parsedError.data.error
          : "Chargement des invitations impossible."
      );
      setParentInvitationsLoading(false);
      return;
    }

    const parsed = parentInvitationListSchema.safeParse(payload);
    if (!parsed.success) {
      setParentInvitations([]);
      setParentInvitationsError("Reponse invitations invalide.");
      setParentInvitationsLoading(false);
      return;
    }

    setParentInvitations(parsed.data.invitations);
    setParentInvitationsLoading(false);
  };

  const loadParentSecretCodeMetadata = async (studentId: string) => {
    setParentSecretCodeLoading(true);
    setParentSecretCodeError("");
    setParentSecretCodeMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setParentSecretCode(null);
      setParentSecretCodeRotatedAt(null);
      setHasParentSecretCode(false);
      setParentSecretCodeError("Session invalide.");
      setParentSecretCodeLoading(false);
      return;
    }

    const response = await fetch(`/api/students/${studentId}/secret-code`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const payload = (await response.json().catch(() => ({}))) as unknown;
    if (!response.ok) {
      const parsedError = parentInvitationErrorSchema.safeParse(payload);
      setParentSecretCode(null);
      setParentSecretCodeRotatedAt(null);
      setHasParentSecretCode(false);
      setParentSecretCodeError(
        parsedError.success
          ? parsedError.data.error
          : "Chargement du code secret impossible."
      );
      setParentSecretCodeLoading(false);
      return;
    }

    const parsed = parentSecretCodeMetadataSchema.safeParse(payload);
    if (!parsed.success) {
      setParentSecretCode(null);
      setParentSecretCodeRotatedAt(null);
      setHasParentSecretCode(false);
      setParentSecretCodeError("Reponse code secret invalide.");
      setParentSecretCodeLoading(false);
      return;
    }

    setParentSecretCode(null);
    setHasParentSecretCode(parsed.data.hasSecretCode);
    setParentSecretCodeRotatedAt(parsed.data.rotatedAt);
    if (!parsed.data.hasSecretCode) {
      setParentSecretCodeMessage(
        "Aucun code actif. Regenerer pour obtenir un code one-shot."
      );
    }
    setParentSecretCodeLoading(false);
  };

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
        .select("id, org_id, first_name, last_name, email, avatar_url, deleted_at, created_at")
        .in("id", studentIds)
        .order("created_at", { ascending: false });

      if (studentError) {
        setError(studentError.message);
        setLoading(false);
        return;
      }

      const studentRows = (data ?? []) as StudentProfile[];
      const workspaceStudent =
        organization?.id
          ? studentRows.find((row) => row.org_id === organization.id) ?? null
          : null;
      if (organization?.id && !workspaceStudent) {
        setError("Profil eleve introuvable pour le workspace actif.");
        setLoading(false);
        return;
      }

      const primaryStudent = workspaceStudent ?? studentRows[0];
      if (!primaryStudent) {
        setError("Profil eleve introuvable.");
        setLoading(false);
        return;
      }

      setStudent(primaryStudent);
      setStudentEmailInput(primaryStudent.email ?? userEmail ?? "");
      setAvatarUrl(primaryStudent.avatar_url ?? profile?.avatar_url ?? "");
      await Promise.all([
        loadParentInvitations(primaryStudent.id),
        loadParentSecretCodeMetadata(primaryStudent.id),
      ]);
      setLoading(false);
    };

    void loadStudent();
    return () => {
      cancelled = true;
    };
  }, [profile?.id, profile?.avatar_url, organization?.id, userEmail]);

  useEffect(() => {
    if (!emailChangeConfirmed || !student?.id || typeof window === "undefined") {
      return;
    }

    window.localStorage.removeItem(getPendingEmailChangeStorageKey(student.id));
    window.localStorage.removeItem(EMAIL_CHANGE_GLOBAL_STORAGE_KEY);
  }, [emailChangeConfirmed, student?.id]);

  useEffect(() => {
    if (emailChangeConfirmed || !student?.id || typeof window === "undefined") {
      return;
    }

    const currentSessionEmail = (userEmail ?? "").trim().toLowerCase();
    if (!currentSessionEmail) {
      return;
    }

    const storageKey = getPendingEmailChangeStorageKey(student.id);
    const rawPending = window.localStorage.getItem(storageKey);
    if (!rawPending) {
      return;
    }

    try {
      const parsed = JSON.parse(rawPending) as PendingEmailChange;
      const pendingNextEmail = parsed.nextEmail.trim().toLowerCase();
      if (!pendingNextEmail || pendingNextEmail !== currentSessionEmail) {
        return;
      }
    } catch {
      return;
    }

    const timer = window.setTimeout(() => {
      window.localStorage.removeItem(storageKey);
      window.localStorage.removeItem(EMAIL_CHANGE_GLOBAL_STORAGE_KEY);
      setStudentEmailMessage(
        `Email confirme. Tu peux desormais te connecter avec ${currentSessionEmail}.`
      );
    }, 0);

    return () => window.clearTimeout(timer);
  }, [emailChangeConfirmed, student?.id, userEmail]);

  const pendingEmailChange: PendingEmailChange | null =
    emailChangeConfirmed || !student?.id || typeof window === "undefined"
      ? null
      : (() => {
          const rawPending = window.localStorage.getItem(
            getPendingEmailChangeStorageKey(student.id)
          );
          if (!rawPending) {
            return null;
          }

          try {
            const parsed = JSON.parse(rawPending) as PendingEmailChange;
            if (
              typeof parsed.oldEmail === "string" &&
              parsed.oldEmail.length > 0 &&
              typeof parsed.nextEmail === "string" &&
              parsed.nextEmail.length > 0
            ) {
              return parsed;
            }
          } catch {
            return null;
          }

          return null;
        })();

  const handleCreateParentInvitation = async () => {
    if (!student?.id) return;
    if (!hasParentSecretCode) {
      setParentInviteError("Genere d abord un code secret eleve.");
      setParentInviteMessage("");
      return;
    }
    const normalizedParentEmail = parentInviteEmail.trim();
    if (!normalizedParentEmail) {
      setParentInviteError("Renseigne l email du parent.");
      setParentInviteMessage("");
      return;
    }

    setParentInviteLoading(true);
    setParentInviteError("");
    setParentInviteMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setParentInviteError("Session invalide.");
      setParentInviteLoading(false);
      return;
    }

    const response = await fetch(`/api/students/${student.id}/parent-invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        parentEmail: normalizedParentEmail,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as unknown;
    if (!response.ok) {
      const parsedError = parentInvitationErrorSchema.safeParse(payload);
      setParentInviteError(
        parsedError.success ? parsedError.data.error : "Creation invitation impossible."
      );
      setParentInviteLoading(false);
      return;
    }

    const parsed = createParentInvitationResponseSchema.safeParse(payload);
    if (!parsed.success) {
      setParentInviteError("Reponse invitation invalide.");
      setParentInviteLoading(false);
      return;
    }

    setParentInviteMessage("Invitation parent envoyee par email.");
    setParentInviteEmail("");
    setParentInvitations((prev) => [
      {
        id: parsed.data.invitationId,
        parentEmail: normalizedParentEmail.toLowerCase(),
        createdByRole: "student",
        status: "pending",
        createdAt: new Date().toISOString(),
        expiresAt: parsed.data.expiresAt,
        acceptedAt: null,
        revokedAt: null,
      },
      ...prev.filter((item) => item.id !== parsed.data.invitationId),
    ]);
    setParentInviteLoading(false);
    await loadParentInvitations(student.id);
  };

  const handleCopyParentSecretCode = async () => {
    if (!parentSecretCode) return;

    try {
      await navigator.clipboard.writeText(parentSecretCode);
      setParentSecretCodeError("");
      setParentSecretCodeMessage("Code secret copie.");
    } catch {
      setParentSecretCodeMessage("");
      setParentSecretCodeError("Copie impossible.");
    }
  };

  const handleRegenerateParentSecretCode = async () => {
    if (!student?.id) return;

    const confirmed = window.confirm(
      "Regenerer le code secret ? L ancien code ne fonctionnera plus."
    );
    if (!confirmed) return;

    setParentSecretCodeRegenerating(true);
    setParentSecretCodeError("");
    setParentSecretCodeMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setParentSecretCodeError("Session invalide.");
      setParentSecretCodeRegenerating(false);
      return;
    }

    const response = await fetch(`/api/students/${student.id}/secret-code/regenerate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const payload = (await response.json().catch(() => ({}))) as unknown;
    if (!response.ok) {
      const parsedError = parentInvitationErrorSchema.safeParse(payload);
      setParentSecretCodeError(
        parsedError.success ? parsedError.data.error : "Regeneration impossible."
      );
      setParentSecretCodeRegenerating(false);
      return;
    }

    const parsed = regenerateParentSecretCodeResponseSchema.safeParse(payload);
    if (!parsed.success) {
      setParentSecretCodeError("Reponse regeneration invalide.");
      setParentSecretCodeRegenerating(false);
      return;
    }

    setParentSecretCode(parsed.data.secretCode);
    setHasParentSecretCode(true);
    setParentSecretCodeRotatedAt(parsed.data.rotatedAt);
    setParentSecretCodeMessage(
      "Code secret regenere (one-shot). Copie-le puis partage-le hors email."
    );
    setParentSecretCodeRegenerating(false);
  };

  const handleRevokeParentInvitation = async (invitationId: string) => {
    if (!student?.id) return;

    const confirmed = window.confirm("Revoquer cette invitation parent ?");
    if (!confirmed) return;

    setParentInvitationRevokingId(invitationId);
    setParentInvitationsError("");
    setParentInviteError("");
    setParentInviteMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setParentInvitationsError("Session invalide.");
      setParentInvitationRevokingId(null);
      return;
    }

    const response = await fetch(
      `/api/students/${student.id}/parent-invitations/${invitationId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    const payload = (await response.json().catch(() => ({}))) as unknown;
    if (!response.ok) {
      const parsedError = parentInvitationErrorSchema.safeParse(payload);
      setParentInvitationsError(
        parsedError.success ? parsedError.data.error : "Revocation invitation impossible."
      );
      setParentInvitationRevokingId(null);
      return;
    }

    setParentInvitations((prev) => prev.filter((item) => item.id !== invitationId));
    setParentInviteMessage("Invitation revoquee.");
    setParentInvitationRevokingId(null);
  };

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

  const handleUpdateStudentEmail = async () => {
    if (!student?.id) return;

    setStudentEmailError("");
    setStudentEmailMessage("");

    const parsedEmail = emailSchema.safeParse(studentEmailInput);
    if (!parsedEmail.success) {
      setStudentEmailError("Email invalide.");
      return;
    }

    const normalizedEmail = parsedEmail.data.toLowerCase();
    const previousEmail = (student.email ?? userEmail ?? "").trim().toLowerCase();

    setStudentEmailSaving(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setStudentEmailError("Session invalide.");
      setStudentEmailSaving(false);
      return;
    }

    const response = await fetch("/api/student-settings/email", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        email: normalizedEmail,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as unknown;
    if (!response.ok) {
      const parsedError = parentInvitationErrorSchema.safeParse(payload);
      setStudentEmailError(
        parsedError.success ? parsedError.data.error : "Mise a jour email impossible."
      );
      setStudentEmailSaving(false);
      return;
    }

    const parsedResponse = updateStudentEmailResponseSchema.safeParse(payload);
    if (!parsedResponse.success) {
      setStudentEmailError("Reponse mise a jour email invalide.");
      setStudentEmailSaving(false);
      return;
    }

    setStudent((prev) =>
      prev ? { ...prev, email: parsedResponse.data.email } : prev
    );
    setStudentEmailInput(parsedResponse.data.email);
    if (parsedResponse.data.requiresEmailConfirmation) {
      const pendingChange: PendingEmailChange = {
        oldEmail: previousEmail || "ton email actuel",
        nextEmail: normalizedEmail,
      };
      if (typeof window !== "undefined" && student.id) {
        window.localStorage.setItem(
          getPendingEmailChangeStorageKey(student.id),
          JSON.stringify(pendingChange)
        );
        window.localStorage.setItem(
          EMAIL_CHANGE_GLOBAL_STORAGE_KEY,
          JSON.stringify({
            oldEmail: pendingChange.oldEmail,
            newEmail: pendingChange.nextEmail,
          })
        );
      }
      setStudentEmailMessage("Demande envoyee. Verification email requise.");
    } else {
      if (typeof window !== "undefined" && student.id) {
        window.localStorage.removeItem(getPendingEmailChangeStorageKey(student.id));
        window.localStorage.removeItem(EMAIL_CHANGE_GLOBAL_STORAGE_KEY);
      }
      setStudentEmailMessage("Email synchronise sur tous tes workspaces lies.");
    }
    setStudentEmailSaving(false);
    void refresh();
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

  const hasSentParentInvitation = parentInvitations.some(
    (invitation) => invitation.status === "pending" || invitation.status === "accepted"
  );
  const stepTwoStatus: "locked" | "ready" | "done" = !hasParentSecretCode
    ? "locked"
    : hasSentParentInvitation
      ? "done"
      : "ready";

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
                    Email
                  </label>
                  <div className="mt-2 grid gap-3 md:grid-cols-[1fr_auto]">
                    <input
                      type="email"
                      value={studentEmailInput}
                      onChange={(event) => setStudentEmailInput(event.target.value)}
                      disabled={studentEmailSaving}
                      className="w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500 disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => void handleUpdateStudentEmail()}
                      disabled={studentEmailSaving || studentEmailInput.trim().length === 0}
                      className="self-end rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20 disabled:opacity-60"
                    >
                      {studentEmailSaving ? "Mise a jour..." : "Mettre a jour"}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    Cet email est synchronise sur tous tes workspaces lies.
                  </p>
                  {studentEmailError ? (
                    <p className="mt-2 text-sm text-red-400">{studentEmailError}</p>
                  ) : null}
                  {studentEmailMessage ? (
                    <p className="mt-2 text-sm text-emerald-200">{studentEmailMessage}</p>
                  ) : null}
                  {pendingEmailChange && !emailChangeConfirmed ? (
                    <div className="mt-3 rounded-2xl border border-amber-300/30 bg-amber-500/10 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-500">
                        Action requise
                      </p>
                      <ol className="mt-2 space-y-1 text-xs text-[var(--text)]">
                        <li>
                          1. Ouvre le mail envoye sur{" "}
                          <span className="font-semibold text-[var(--text)]">
                            {pendingEmailChange.oldEmail}
                          </span>{" "}
                          puis clique sur le lien.
                        </li>
                        <li>
                          2. Un second mail est envoye sur{" "}
                          <span className="font-semibold text-[var(--text)]">
                            {pendingEmailChange.nextEmail}
                          </span>
                          , valide-le aussi.
                        </li>
                        <li>
                          3. Tant que la confirmation n est pas terminee, connecte-toi avec{" "}
                          <span className="font-semibold text-[var(--text)]">
                            {pendingEmailChange.oldEmail}
                          </span>
                          .
                        </li>
                      </ol>
                    </div>
                  ) : null}
                  {emailChangeConfirmed ? (
                    <p className="mt-2 text-sm text-emerald-200">
                      Email confirme. Tu peux desormais te connecter avec{" "}
                      <span className="font-semibold">
                        {(student?.email ?? studentEmailInput).trim().toLowerCase()}
                      </span>
                      .
                    </p>
                  ) : null}
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

          <section className="panel rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-[var(--text)]">Acces parent</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Parcours en 2 etapes: 1) genere un code secret, 2) envoie l invitation par
              email.
            </p>

            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                    Etape 1 - Code secret eleve
                  </p>
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    Obligatoire pour valider le rattachement parent.
                  </p>
                </div>
                <StepOneStatusIcon done={hasParentSecretCode} />
              </div>
              {parentSecretCodeRotatedAt ? (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Mis a jour le {new Date(parentSecretCodeRotatedAt).toLocaleString("fr-FR")}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="rounded-lg border border-white/10 bg-[var(--bg-elevated)] px-3 py-1.5 text-sm font-semibold tracking-[0.22em] text-[var(--text)]">
                  {parentSecretCodeLoading ? "Chargement..." : parentSecretCode ?? "--------"}
                </code>
                <button
                  type="button"
                  onClick={() => void handleCopyParentSecretCode()}
                  disabled={parentSecretCodeLoading || !parentSecretCode}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.14em] text-[var(--text)] transition hover:border-white/25 disabled:opacity-60"
                >
                  Copier
                </button>
                <button
                  type="button"
                  onClick={() => void handleRegenerateParentSecretCode()}
                  disabled={parentSecretCodeLoading || parentSecretCodeRegenerating || !student?.id}
                  className="rounded-full border border-amber-300/35 bg-amber-400/10 px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.14em] text-amber-500 transition hover:text-amber-800 disabled:opacity-60"
                >
                  {parentSecretCodeRegenerating
                    ? "Generation..."
                    : hasParentSecretCode
                      ? "Regenerer le code"
                      : "Generer le code"}
                </button>
              </div>
              {hasParentSecretCode ? (
                <p className="mt-2 text-xs text-emerald-200">
                  Code secret actif. Passe a l etape 2.
                </p>
              ) : (
                <p className="mt-2 text-xs text-amber-200">
                  Genere ce code pour debloquer l invitation email.
                </p>
              )}
              {parentSecretCodeMessage ? (
                <p className="mt-2 text-sm text-emerald-200">{parentSecretCodeMessage}</p>
              ) : null}
              {parentSecretCodeError ? (
                <p className="mt-2 text-sm text-red-400">{parentSecretCodeError}</p>
              ) : null}
            </div>

            <div
              className={`mt-4 rounded-xl border p-4 ${
                hasParentSecretCode ? "border-white/10 bg-white/5" : "border-amber-300/30 bg-amber-400/10"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                    Etape 2 - Invitation parent par email
                  </p>
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    Renseigne l email du parent puis envoie l invitation.
                  </p>
                </div>
                <StepTwoStatusIcon status={stepTwoStatus} />
              </div>

              <div className="mt-3 grid gap-4 md:grid-cols-[1fr_auto]">
              <div>
                <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  Email parent
                </label>
                <input
                  type="email"
                  value={parentInviteEmail}
                  onChange={(event) => setParentInviteEmail(event.target.value)}
                  disabled={!hasParentSecretCode || parentSecretCodeLoading || parentInviteLoading}
                  placeholder={
                    hasParentSecretCode ? "parent@email.com" : "Genere d abord le code secret"
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Le parent recevra un email et devra utiliser cette meme adresse pour
                  accepter.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleCreateParentInvitation()}
                disabled={
                  parentInviteLoading ||
                  parentSecretCodeLoading ||
                  !hasParentSecretCode ||
                  !student?.id ||
                  parentInviteEmail.trim().length === 0
                }
                className="self-end rounded-full border border-emerald-300/30 bg-emerald-400/10 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-400/20 disabled:opacity-60"
              >
                {parentInviteLoading ? "Envoi..." : "Envoyer l invitation"}
              </button>
            </div>
            </div>

            {parentInviteMessage ? (
              <p className="mt-3 text-sm text-emerald-200">{parentInviteMessage}</p>
            ) : null}
            {parentInviteError ? (
              <p className="mt-3 text-sm text-red-400">{parentInviteError}</p>
            ) : null}

            <div className="mt-6 rounded-xl border border-white/10 bg-white/5">
              <button
                type="button"
                onClick={() => setParentInvitationsExpanded((prev) => !prev)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                aria-expanded={parentInvitationsExpanded}
              >
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                    Invitations recentes
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {parentInvitations.length} invitation
                    {parentInvitations.length > 1 ? "s" : ""}
                  </p>
                </div>
                <svg
                  viewBox="0 0 24 24"
                  className={`h-4 w-4 text-[var(--muted)] transition-transform duration-300 ${
                    parentInvitationsExpanded ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {parentInvitationsExpanded ? (
                <div className="border-t border-white/10 px-4 pb-4 pt-3">
                  {parentInvitationsLoading ? (
                    <p className="text-sm text-[var(--muted)]">Chargement...</p>
                  ) : parentInvitationsError ? (
                    <p className="text-sm text-red-400">{parentInvitationsError}</p>
                  ) : parentInvitations.length === 0 ? (
                    <p className="text-sm text-[var(--muted)]">Aucune invitation recente.</p>
                  ) : (
                    <div className="space-y-2">
                      {parentInvitations.map((invitation) => (
                        <article
                          key={invitation.id}
                          className="rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--text)]">
                                {invitation.parentEmail ?? "Email libre"}
                              </p>
                              <p className="mt-1 text-xs text-[var(--muted)]">
                                Cree le {new Date(invitation.createdAt).toLocaleString("fr-FR")} -
                                expire le {new Date(invitation.expiresAt).toLocaleString("fr-FR")}
                              </p>
                              <p className="mt-1 text-xs text-[var(--muted)]">
                                Statut: {invitation.status}
                              </p>
                            </div>
                            {invitation.status === "pending" ? (
                              <button
                                type="button"
                                onClick={() => void handleRevokeParentInvitation(invitation.id)}
                                disabled={parentInvitationRevokingId === invitation.id}
                                className="rounded-full border border-rose-300/35 bg-rose-400/10 px-3 py-1 text-[0.62rem] uppercase tracking-[0.14em] text-rose-100 transition hover:bg-rose-400/20 disabled:opacity-60"
                              >
                                {parentInvitationRevokingId === invitation.id
                                  ? "..."
                                  : "Revoquer"}
                              </button>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </section>

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
