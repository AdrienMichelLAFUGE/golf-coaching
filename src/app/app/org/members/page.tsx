"use client";

import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase/client";
import { PLAN_LABELS } from "@/lib/plans";
import RoleGuard from "../../_components/role-guard";
import PageBack from "../../_components/page-back";
import PageHeader from "../../_components/page-header";
import { useProfile } from "../../_components/profile-context";
import Badge from "../../_components/badge";
import ToastStack from "../../_components/toast-stack";
import useToastStack from "../../_components/use-toast-stack";

type MemberRow = {
  id: string;
  user_id: string;
  role: "admin" | "coach";
  status: "invited" | "active" | "disabled";
  premium_active: boolean;
  profiles?: { full_name: string | null } | null;
};

type InvitationRow = {
  id: string;
  email: string;
  role: "admin" | "coach";
  status: string;
  created_at: string;
  expires_at: string | null;
  token?: string | null;
};

function UserPlusIcon() {
  return (
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
      <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <path d="M20 8v6" />
      <path d="M17 11h6" />
    </svg>
  );
}

function CloseIcon() {
  return (
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
  );
}

function IconActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)]"
    >
      {children}
    </button>
  );
}

export default function OrgMembersPage() {
  const { organization, profile, planTier } = useProfile();
  const modeLabel =
    (organization?.workspace_type ?? "personal") === "org"
      ? `Organisation : ${organization?.name ?? "Organisation"}`
      : "Espace personnel";
  const modeBadgeTone =
    (organization?.workspace_type ?? "personal") === "org"
      ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
      : "border-sky-300/30 bg-sky-400/10 text-sky-100";
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "coach">("coach");
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { toasts, pushToast, dismissToast } = useToastStack();
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadMembers = async () => {
    setLoading(true);
    setError("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Session invalide.");
      setLoading(false);
      return;
    }
    const response = await fetch("/api/orgs/members", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json()) as {
      members?: MemberRow[];
      invitations?: InvitationRow[];
      error?: string;
    };
    if (!response.ok) {
      setError(payload.error ?? "Chargement impossible.");
      setLoading(false);
      return;
    }
    setMembers(payload.members ?? []);
    setInvitations(payload.invitations ?? []);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      void loadMembers();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleInvite = async () => {
    setInviteError("");
    const trimmed = email.trim();
    if (!trimmed) {
      setInviteError("Ajoute un email.");
      return;
    }
    setInviteSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setInviteError("Session invalide.");
        return;
      }
      const response = await fetch("/api/orgs/invitations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: trimmed, role }),
      });
      const payload = (await response.json()) as {
        error?: string;
        acceptUrl?: string;
        emailSent?: boolean;
      };
      if (!response.ok) {
        setInviteError(payload.error ?? "Invitation impossible.");
        return;
      }
      setEmail("");
      setRole("coach");
      setInviteModalOpen(false);
      pushToast("Invitation creee. Le coach la verra dans son compte.", "success");
      await loadMembers();
    } catch {
      setInviteError("Invitation impossible.");
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleRemoveMember = async (member: MemberRow) => {
    if (member.role === "admin") {
      setError("Impossible de retirer un admin.");
      return;
    }
    if (profile?.id && member.user_id === profile.id) {
      setError("Impossible de vous retirer.");
      return;
    }
    const confirmed = window.confirm("Retirer ce coach de l organisation ?");
    if (!confirmed) return;
    setError("");
    setRemovingId(member.id);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Session invalide.");
      setRemovingId(null);
      return;
    }
    const response = await fetch("/api/orgs/members", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ memberId: member.id }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Suppression impossible.");
      setRemovingId(null);
      return;
    }
    setRemovingId(null);
    pushToast("Coach retire.", "success");
    await loadMembers();
  };

  return (
    <RoleGuard allowedRoles={["owner", "coach", "staff"]}>
      <div className="space-y-6">
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
        <PageHeader
          overline={
            <div className="flex items-center gap-2">
              <PageBack fallbackHref="/app" />
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Organisation</p>
            </div>
          }
          title={`Membres${organization?.name ? ` - ${organization.name}` : ""}`}
          subtitle="Gere les coachs et les acces."
          meta={
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={modeBadgeTone}>
                <span className="min-w-0 break-words">Vous travaillez dans {modeLabel}</span>
              </Badge>
              <Badge tone="muted">Plan {PLAN_LABELS[planTier]}</Badge>
            </div>
          }
          actions={
            <IconActionButton
              label="Inviter un coach"
              onClick={() => {
                setInviteError("");
                setEmail("");
                setRole("coach");
                setInviteModalOpen(true);
              }}
            >
              <UserPlusIcon />
            </IconActionButton>
          }
        />

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <section className="panel rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-[var(--text)]">Membres actifs</h3>
          <div className="mt-4 text-sm text-[var(--muted)]">
            {loading ? (
              <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3">
                Chargement...
              </div>
            ) : members.length === 0 ? (
              <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3">
                Aucun membre.
              </div>
            ) : (
              <div className="rounded-xl border border-white/5 bg-white/5">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex flex-col gap-3 border-b border-white/10 px-4 py-3 last:border-b-0 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="font-medium text-[var(--text)]">
                        {member.profiles?.full_name ?? "Coach"}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {member.role === "admin" ? "Admin" : "Coach"} - {member.status}
                      </p>
                    </div>
                    {member.role !== "admin" ? (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(member)}
                        disabled={removingId === member.id}
                        className="rounded-full border border-rose-300/30 bg-rose-400/10 px-3 py-1 text-xs uppercase tracking-wide text-rose-100 transition hover:border-rose-300/60 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {removingId === member.id ? "Suppression..." : "Retirer"}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {invitations.length > 0 ? (
          <section className="panel rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-[var(--text)]">Invitations</h3>
            <div className="mt-4 space-y-3 text-sm text-[var(--muted)]">
              {invitations.map((invite) => {
                return (
                  <div
                    key={invite.id}
                    className="rounded-xl border border-white/5 bg-white/5 px-4 py-3"
                  >
                    <p className="font-medium text-[var(--text)]">{invite.email}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {invite.role} - {invite.status}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {inviteModalOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-coach-title"
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/35 backdrop-blur-sm"
              aria-label="Fermer"
              onClick={() => {
                if (!inviteSubmitting) setInviteModalOpen(false);
              }}
            />
            <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg-elevated)] shadow-[var(--shadow-strong)]">
              <div className="relative border-b border-white/10 px-6 py-4">
                <h3 id="invite-coach-title" className="text-center text-base font-semibold text-[var(--text)]">
                  Inviter un coach
                </h3>
                <button
                  type="button"
                  onClick={() => setInviteModalOpen(false)}
                  disabled={inviteSubmitting}
                  className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-60"
                  aria-label="Fermer"
                >
                  <CloseIcon />
                </button>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleInvite();
                }}
                className="space-y-4 px-6 py-5"
              >
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                    Email coach
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)]"
                    placeholder="coach@exemple.com"
                    autoFocus
                    disabled={inviteSubmitting}
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Role</label>
                  <select
                    value={role}
                    onChange={(event) => setRole(event.target.value as "admin" | "coach")}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)]"
                    disabled={inviteSubmitting}
                  >
                    <option value="coach">Coach</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                {inviteError ? <p className="text-sm text-red-400">{inviteError}</p> : null}
                <div className="flex items-center justify-end gap-2 border-t border-white/10 pt-4">
                  <button
                    type="button"
                    onClick={() => setInviteModalOpen(false)}
                    disabled={inviteSubmitting}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-60"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={inviteSubmitting}
                    className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {inviteSubmitting ? "Invitation..." : "Inviter"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </RoleGuard>
  );
}
