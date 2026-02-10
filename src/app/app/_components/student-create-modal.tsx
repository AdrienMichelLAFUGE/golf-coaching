"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/lib/supabase/client";
import { useProfile } from "./profile-context";

type StudentForm = {
  first_name: string;
  last_name: string;
  email: string;
  playing_hand: "" | "right" | "left";
};

type OrgCoachOption = {
  user_id: string;
  role: "admin" | "coach";
  status: "active" | "invited" | "disabled";
  profiles?: { full_name: string | null } | null;
};

const StudentCreateSchema = z.object({
  first_name: z.string().trim().min(1, "Le prenom est obligatoire."),
  last_name: z.string().trim(),
  email: z.union([z.string().trim().email("Email invalide."), z.literal("")]),
  playing_hand: z.union([z.literal(""), z.literal("right"), z.literal("left")]),
});

const OrgCoachOptionSchema = z.object({
  user_id: z.string().min(1),
  role: z.union([z.literal("admin"), z.literal("coach")]),
  status: z.union([z.literal("active"), z.literal("invited"), z.literal("disabled")]),
  profiles: z.unknown().optional(),
});

const CoachesResponseSchema = z.object({
  members: z.array(OrgCoachOptionSchema).optional(),
  error: z.string().optional(),
});

const CreateStudentResponseSchema = z.object({
  error: z.string().optional(),
});

export function StudentCreateButton({
  onClick,
  disabled,
  label = "Nouveau",
  className,
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        className ??
        "inline-flex items-center gap-2 rounded-full border-2 border-teal-500 px-4 py-3 text-xs tracking-wide text-[var(--muted)] transition hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-60"
      }
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
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
      {label}
    </button>
  );
}

type StudentCreateModalProps = {
  onClose: () => void;
  afterCreate?: () => void | Promise<void>;
};

export default function StudentCreateModal({
  onClose,
  afterCreate,
}: StudentCreateModalProps) {
  const titleId = useId();
  const formId = useId();
  const {
    organization,
    currentMembership,
    isWorkspacePremium,
    workspaceType,
    profile,
    loading: profileLoading,
  } = useProfile();

  const [form, setForm] = useState<StudentForm>({
    first_name: "",
    last_name: "",
    email: "",
    playing_hand: "",
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>("");
  const [coachOptions, setCoachOptions] = useState<OrgCoachOption[]>([]);
  const [coachOptionsLoading, setCoachOptionsLoading] = useState(false);
  const [coachOptionsError, setCoachOptionsError] = useState("");
  const [selectedCoachIds, setSelectedCoachIds] = useState<string[]>([]);

  const isOrgWorkspace =
    organization?.workspace_type === "org" ||
    currentMembership?.organization?.workspace_type === "org";
  const currentWorkspaceType = workspaceType ?? "personal";
  const canAssignCoaches = currentWorkspaceType === "org" && isWorkspacePremium;
  const isOrgReadOnly = organization?.workspace_type === "org" && !isWorkspacePremium;
  const modeLabel = useMemo(() => {
    const workspaceName = organization?.name ?? "Organisation";
    return currentWorkspaceType === "org"
      ? `Organisation : ${workspaceName}`
      : "Espace personnel";
  }, [currentWorkspaceType, organization?.name]);

  const toggleCoachSelection = (coachId: string) => {
    if (coachId === profile?.id) return;
    setSelectedCoachIds((prev) =>
      prev.includes(coachId) ? prev.filter((id) => id !== coachId) : [...prev, coachId]
    );
  };

  useEffect(() => {
    if (!canAssignCoaches) return;

    let cancelled = false;
    const loadCoaches = async () => {
      setCoachOptionsLoading(true);
      setCoachOptionsError("");

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setCoachOptionsError("Session invalide.");
        setCoachOptionsLoading(false);
        return;
      }

      const response = await fetch("/api/orgs/coaches", {
        headers: { Authorization: `Bearer ${token}` },
      });

      let json: unknown = null;
      try {
        json = await response.json();
      } catch {
        json = null;
      }
      const parsed = CoachesResponseSchema.safeParse(json ?? {});
      const payload = parsed.success ? parsed.data : { members: [], error: "Chargement impossible." };

      if (!response.ok) {
        setCoachOptionsError(payload.error ?? "Chargement impossible.");
        setCoachOptionsLoading(false);
        return;
      }

      const options = (payload.members ?? []).map((entry): OrgCoachOption => {
        const rawProfiles = entry.profiles;
        const profiles = Array.isArray(rawProfiles)
          ? (rawProfiles[0] ?? null)
          : (rawProfiles as { full_name: string | null } | null | undefined) ?? null;
        return {
          user_id: entry.user_id,
          role: entry.role,
          status: entry.status,
          profiles,
        };
      });

      if (!cancelled) {
        setCoachOptions(options);
      }
      setCoachOptionsLoading(false);
    };

    loadCoaches();
    return () => {
      cancelled = true;
    };
  }, [canAssignCoaches]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (creating) return;
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [creating, onClose]);

  const handleCreateStudent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setCreating(true);
    setError("");

    if (profileLoading) {
      setError("Profil en cours de chargement. Reessaie dans un instant.");
      setCreating(false);
      return;
    }

    if (!profile) {
      setError("Profil introuvable. Reconnecte-toi.");
      setCreating(false);
      return;
    }

    if (isOrgReadOnly) {
      setError("Lecture seule: plan Free en organisation.");
      setCreating(false);
      return;
    }

    const parsed = StudentCreateSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Formulaire invalide.");
      setCreating(false);
      return;
    }

    const firstName = parsed.data.first_name;
    const lastName = parsed.data.last_name;
    const email = parsed.data.email;
    const playingHand = parsed.data.playing_hand || null;

    if (isOrgWorkspace) {
      const coachIds = canAssignCoaches
        ? Array.from(
            new Set(
              [profile.id, ...selectedCoachIds].filter((id): id is string => Boolean(id))
            )
          )
        : [];

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
          ...(canAssignCoaches && coachIds.length ? { coach_ids: coachIds } : null),
        }),
      });

      let json: unknown = null;
      try {
        json = await response.json();
      } catch {
        json = null;
      }
      const parsedPayload = CreateStudentResponseSchema.safeParse(json ?? {});
      const payload = parsedPayload.success ? parsedPayload.data : { error: "Creation impossible." };

      if (!response.ok) {
        setError(payload.error ?? "Creation impossible.");
        setCreating(false);
        return;
      }
    } else {
      const personalOrgId = organization?.id ?? profile.active_workspace_id ?? profile.org_id ?? null;
      if (!personalOrgId) {
        setError("Organisation introuvable.");
        setCreating(false);
        return;
      }

      const { error: insertError } = await supabase.from("students").insert([
        {
          org_id: personalOrgId,
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

    try {
      window.dispatchEvent(new CustomEvent("gc:students-changed"));
    } catch {
      // ignore
    }

    try {
      await afterCreate?.();
    } catch {
      // If refresh fails, creation still succeeded. Keep modal closed and let the page recover.
    }

    setCreating(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 bg-black/35 backdrop-blur-sm"
        onClick={() => {
          if (!creating) onClose();
        }}
      />

      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg-elevated)] shadow-[var(--shadow-strong)]">
        <div className="relative border-b border-white/10 px-6 py-4">
          <h3 id={titleId} className="text-center text-base font-semibold text-[var(--text)]">
            Ajouter un eleve
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={creating}
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-60"
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
              aria-hidden="true"
            >
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form id={formId} onSubmit={handleCreateStudent}>
          <div className="max-h-[70vh] overflow-auto px-6 py-5">
            <p className="text-xs text-[var(--muted)]">
              Cet eleve sera cree dans :{" "}
              <span className="text-[var(--text)]">{modeLabel}</span>
            </p>

            <div className="mt-5 grid gap-4">
              <div>
                <label className="text-xs font-medium text-[var(--text)]">Prenom</label>
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
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--text)]">Nom</label>
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
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--text)]">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="camille@email.com"
                  disabled={creating || isOrgReadOnly}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--text)]">Sens de jeu</label>
                <select
                  value={form.playing_hand}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      playing_hand: event.target.value as "" | "left" | "right",
                    }))
                  }
                  disabled={creating || isOrgReadOnly}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)]"
                >
                  <option value="">Non precise</option>
                  <option value="right">Droitier</option>
                  <option value="left">Gaucher</option>
                </select>
              </div>
            </div>

            {currentWorkspaceType === "org" ? (
              <div className="mt-6 border-t border-white/10 pt-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">Permission</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Tu es toujours assigne automatiquement. Ajoute d autres coachs si besoin.
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-1 text-[0.6rem] uppercase tracking-wide ${
                      canAssignCoaches
                        ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200"
                        : "border-amber-300/30 bg-amber-400/10 text-amber-200"
                    }`}
                  >
                    {canAssignCoaches ? "Actif" : "Plan requis"}
                  </span>
                </div>

                {!canAssignCoaches ? (
                  <p className="mt-3 text-sm text-amber-300">
                    Plan Pro/Entreprise requis pour gerer les assignations.
                  </p>
                ) : coachOptionsLoading ? (
                  <p className="mt-3 text-sm text-[var(--muted)]">Chargement des coachs...</p>
                ) : coachOptionsError ? (
                  <p className="mt-3 text-sm text-red-400">{coachOptionsError}</p>
                ) : coachOptions.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--muted)]">Aucun coach actif disponible.</p>
                ) : (
                  <div className="mt-4 divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/5">
                    {coachOptions.map((coach) => {
                      const fullName = coach.profiles?.full_name?.trim();
                      const isSelf = coach.user_id === profile?.id;
                      const checked = selectedCoachIds.includes(coach.user_id) || isSelf;
                      const label = fullName ? fullName : `Coach ${coach.user_id.slice(0, 6)}`;
                      const roleLabel = coach.role === "admin" ? "Admin" : "Coach";
                      return (
                        <label
                          key={coach.user_id}
                          className="flex items-center justify-between gap-4 px-4 py-3"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-[var(--text)]">
                              {label}
                              {isSelf ? (
                                <span className="ml-2 text-[0.65rem] font-semibold uppercase tracking-wide text-emerald-200">
                                  Toi
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-0.5 block text-xs text-[var(--muted)]">
                              {roleLabel}
                            </span>
                          </span>

                          <span className="shrink-0">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={isSelf || isOrgReadOnly}
                              onChange={() => toggleCoachSelection(coach.user_id)}
                              className="peer sr-only"
                            />
                            <span
                              aria-hidden="true"
                              className={`relative inline-flex h-6 w-11 items-center rounded-full border transition ${
                                checked
                                  ? "border-emerald-300/40 bg-emerald-400/15"
                                  : "border-white/10 bg-white/10"
                              } peer-disabled:opacity-60`}
                            >
                              <span
                                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full border border-white/10 bg-white shadow-sm transition-transform ${
                                  checked ? "translate-x-5" : "translate-x-0"
                                }`}
                              />
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            {isOrgReadOnly ? (
              <p className="mt-6 text-sm text-amber-300">
                Freemium: lecture seule en organisation.
              </p>
            ) : null}
            {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-white/10 bg-[var(--bg-elevated)] px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={creating}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-[var(--text)] transition hover:bg-white/10 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              form={formId}
              disabled={creating || isOrgReadOnly}
              className="rounded-xl bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-5 py-2 text-sm font-semibold text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
            >
              {creating ? "Ajout..." : "Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
