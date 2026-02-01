"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import RoleGuard from "../../_components/role-guard";
import PageBack from "../../_components/page-back";
import { useProfile } from "../../_components/profile-context";

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

export default function OrgMembersPage() {
  const { organization, profile } = useProfile();
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
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
    setError("");
    setMessage("");
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Ajoute un email.");
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Session invalide.");
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
      setError(payload.error ?? "Invitation impossible.");
      return;
    }
    setEmail("");
    setMessage("Invitation creee. Le coach la verra dans son compte.");
    await loadMembers();
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
    setMessage("");
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
    setMessage("Coach retire.");
    await loadMembers();
  };

  return (
    <RoleGuard allowedRoles={["owner", "coach", "staff"]}>
      <div className="space-y-6">
        <section className="panel rounded-2xl p-6">
          <div className="flex items-center gap-2">
            <PageBack fallbackHref="/app" />
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Organisation
            </p>
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
            Membres {organization?.name ? `- ${organization.name}` : ""}
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Gere les coachs et les acces.
          </p>
          <div
            className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.6rem] uppercase tracking-[0.25em] ${modeBadgeTone}`}
          >
            Vous travaillez dans {modeLabel}
          </div>
          <div className="mt-3 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-wide text-[var(--muted)]">
            {organization?.ai_enabled ? "IA active" : "Freemium"}
          </div>
        </section>

        <section className="panel-soft rounded-2xl p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Email coach
              </label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Role
              </label>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as "admin" | "coach")}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
              >
                <option value="coach">Coach</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button
              type="button"
              onClick={handleInvite}
              className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90"
            >
              Inviter
            </button>
          </div>
          {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
          {message ? <p className="mt-3 text-sm text-[var(--muted)]">{message}</p> : null}
        </section>

        <section className="panel rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-[var(--text)]">Membres actifs</h3>
          <div className="mt-4 space-y-3 text-sm text-[var(--muted)]">
            {loading ? (
              <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3">
                Chargement...
              </div>
            ) : members.length === 0 ? (
              <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3">
                Aucun membre.
              </div>
            ) : (
              members.map((member) => (
                <div
                  key={member.id}
                  className="flex flex-col gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3 md:flex-row md:items-center md:justify-between"
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
              ))
            )}
          </div>
        </section>

        <section className="panel rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-[var(--text)]">Invitations</h3>
          <div className="mt-4 space-y-3 text-sm text-[var(--muted)]">
            {invitations.length === 0 ? (
              <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3">
                Aucune invitation en cours.
              </div>
            ) : (
              invitations.map((invite) => {
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
              })
            )}
          </div>
        </section>
      </div>
    </RoleGuard>
  );
}
