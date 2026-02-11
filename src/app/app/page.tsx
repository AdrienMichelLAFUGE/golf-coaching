"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useProfile } from "./_components/profile-context";
import PageHeader from "./_components/page-header";

type WorkspaceOption = {
  id: string;
  name: string;
  type: "personal" | "org";
  status: "active" | "invited" | "disabled";
  roleLabel: string;
};

type PendingInvite = {
  id: string;
  token: string;
  role: "admin" | "coach";
  organizations?: { name: string | null } | null;
};

const sanitizeName = (value: string) => value.trim().slice(0, 80);

export default function AppPage() {
  const { profile, loading, organization, memberships, personalWorkspace, currentMembership, refresh } =
    useProfile();
  const router = useRouter();
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [invitesOpen, setInvitesOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createdOrg, setCreatedOrg] = useState<{ id: string; name: string } | null>(null);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const isStudent = profile?.role === "student";

  useEffect(() => {
    if (!loading && isStudent) {
      router.replace("/app/eleve");
    }
  }, [isStudent, loading, router]);

  const loadInvites = useCallback(async () => {
    if (!profile || profile.role === "student") return;
    setInvitesLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setInvitesLoading(false);
      return;
    }
    const response = await fetch("/api/orgs/invitations/pending", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json()) as { invitations?: PendingInvite[] };
    if (response.ok) {
      setPendingInvites(payload.invitations ?? []);
    }
    setInvitesLoading(false);
  }, [profile]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled || loading || isStudent || !profile) return;
      void loadInvites();
    });
    return () => {
      cancelled = true;
    };
  }, [isStudent, loadInvites, loading, profile]);

  useEffect(() => {
    if (!createOpen && !invitesOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (creating || inviteActionId) return;
      setCreateOpen(false);
      setInvitesOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [createOpen, creating, inviteActionId, invitesOpen]);

  const personalOption = useMemo<WorkspaceOption | null>(() => {
    const personalMembership = memberships.find(
      (membership) =>
        membership.organization?.workspace_type === "personal" ||
        (personalWorkspace?.id && membership.org_id === personalWorkspace.id)
    );
    if (personalWorkspace?.id) {
      return {
        id: personalWorkspace.id,
        name: personalWorkspace.name ?? "Espace personnel",
        type: "personal",
        status: personalMembership?.status ?? "active",
        roleLabel: "Perso",
      };
    }
    if (personalMembership) {
      return {
        id: personalMembership.org_id,
        name: personalMembership.organization?.name ?? "Espace personnel",
        type: "personal",
        status: personalMembership.status,
        roleLabel: "Perso",
      };
    }
    if (organization?.workspace_type === "personal" && organization.id) {
      return {
        id: organization.id,
        name: organization.name ?? "Espace personnel",
        type: "personal",
        status: "active",
        roleLabel: "Perso",
      };
    }
    return null;
  }, [memberships, organization, personalWorkspace]);

  const orgOptions = useMemo<WorkspaceOption[]>(() => {
    const personalId = personalOption?.id;
    return memberships
      .filter((membership) => membership.org_id !== personalId)
      .filter((membership) => membership.organization?.workspace_type !== "personal")
      .map((membership) => ({
        id: membership.org_id,
        name: membership.organization?.name ?? "Organisation",
        type: "org",
        status: membership.status,
        roleLabel: membership.role === "admin" ? "Admin" : "Coach",
      }));
  }, [memberships, personalOption]);

  const activeWorkspaceId = organization?.id ?? null;

  const handleSwitch = async (workspaceId: string) => {
    if (workspaceId === activeWorkspaceId) return;
    setSwitchingId(workspaceId);
    setError(null);
    setMessage(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Session invalide.");
      setSwitchingId(null);
      return;
    }

    const response = await fetch("/api/workspaces/switch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ workspaceId }),
    });

    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Changement impossible.");
      setSwitchingId(null);
      return;
    }

    await refresh();
    if (typeof window !== "undefined") {
      window.location.reload();
    }
    setSwitchingId(null);
  };

  const handleCreateOrg = async () => {
    const name = sanitizeName(createName);
    if (!name) {
      setError("Ajoute un nom d organisation.");
      return;
    }

    setCreating(true);
    setError(null);
    setMessage(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Session invalide.");
      setCreating(false);
      return;
    }

    const response = await fetch("/api/orgs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name }),
    });

    const payload = (await response.json()) as { error?: string; orgId?: string };
    if (!response.ok) {
      setError(payload.error ?? "Creation impossible.");
      setCreating(false);
      return;
    }

    setCreateName("");
    await refresh();
    await loadInvites();
    setCreating(false);
    setCreatedOrg({ id: payload.orgId ?? "", name });
    setMessage(`Organisation ${name} creee.`);
  };

  const handleAcceptInvite = async (token: string, inviteId: string) => {
    setInviteActionId(inviteId);
    setError(null);
    setMessage(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setError("Session invalide.");
      setInviteActionId(null);
      return;
    }
    const response = await fetch("/api/orgs/invitations/accept", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ token }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Acceptation impossible.");
      setInviteActionId(null);
      return;
    }
    await refresh();
    await loadInvites();
    setInviteActionId(null);
    setMessage("Invitation acceptee.");
  };

  const handleDeclineInvite = async (token: string, inviteId: string) => {
    setInviteActionId(inviteId);
    setError(null);
    setMessage(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setError("Session invalide.");
      setInviteActionId(null);
      return;
    }
    const response = await fetch("/api/orgs/invitations/decline", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ token }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Refus impossible.");
      setInviteActionId(null);
      return;
    }
    await loadInvites();
    setInviteActionId(null);
    setMessage("Invitation refusee.");
  };

  if (!loading && isStudent) {
    return (
      <section className="panel rounded-2xl p-6">
        <p className="text-sm text-[var(--muted)]">Redirection vers ton dashboard...</p>
      </section>
    );
  }

  const pendingInvitesCount = pendingInvites.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workspaces"
        subtitle="Selectionne ton espace de travail."
        actions={
          !isStudent ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMessage(null);
                  setCreatedOrg(null);
                  setCreateOpen(true);
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)]"
                aria-label="Nouvelle organisation"
                title="Nouvelle organisation"
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
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMessage(null);
                  setInvitesOpen(true);
                }}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)]"
                aria-label="Invitations en attente"
                title="Invitations en attente"
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
                  <path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
                  <path d="M10 17a2 2 0 0 0 4 0" />
                </svg>
                {pendingInvitesCount > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-400 px-1 text-[0.65rem] font-semibold text-zinc-900">
                    {pendingInvitesCount > 9 ? "9+" : pendingInvitesCount}
                  </span>
                ) : null}
              </button>
            </div>
          ) : null
        }
      />

      {currentMembership?.status === "invited" ? (
        <p className="text-sm text-amber-300">Invitation en attente sur un workspace.</p>
      ) : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {message ? <p className="text-sm text-[var(--muted)]">{message}</p> : null}

      <section className="grid gap-6 md:grid-cols-2">
        <div className="panel rounded-2xl p-6" data-testid="workspace-personal-panel">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
            Workspace personnel
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
            {personalOption?.name ?? "Espace personnel"}
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Espace prive pour gerer tes eleves et tes rapports.
          </p>
          {personalOption ? (
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                disabled={
                  personalOption.id === activeWorkspaceId ||
                  personalOption.status !== "active" ||
                  switchingId === personalOption.id
                }
                onClick={() => handleSwitch(personalOption.id)}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--text)] transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {switchingId === personalOption.id
                  ? "Activation..."
                  : personalOption.id === activeWorkspaceId
                    ? "Workspace actif"
                    : "Selectionner ce workspace"}
              </button>
              {personalOption.status !== "active" ? (
                <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  {personalOption.status === "invited" ? "Invite" : "Desactive"}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--muted)]">
              Workspace personnel indisponible.
            </p>
          )}
        </div>

        <div className="panel-soft rounded-2xl p-6" data-testid="workspace-org-panel">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
            Workspace organisation
          </p>
          {orgOptions.length ? (
            <div className="mt-4 grid gap-3">
              {orgOptions.map((option) => {
                const isActive = option.id === activeWorkspaceId;
                const isDisabled = option.status !== "active";
                return (
                  <div
                    key={option.id}
                    className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="text-sm text-[var(--text)]">{option.name}</p>
                      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                        {option.roleLabel}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isDisabled || isActive || switchingId === option.id}
                        onClick={() => handleSwitch(option.id)}
                        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--text)] transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {switchingId === option.id
                          ? "Activation..."
                          : isActive
                            ? "Workspace actif"
                            : "Selectionner"}
                      </button>
                      {isDisabled ? (
                        <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
                          {option.status === "invited" ? "Invite" : "Desactive"}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--muted)]">
              Aucune organisation associee.
            </p>
          )}
        </div>
      </section>

      {loading ? (
        <section className="panel-soft rounded-2xl p-6 text-sm text-[var(--muted)]">
          Chargement du profil...
        </section>
      ) : null}

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="workspace-create-org-title"
        >
          <button
            type="button"
            aria-label="Fermer"
            className="absolute inset-0 bg-black/35 backdrop-blur-sm"
            onClick={() => {
              if (!creating) setCreateOpen(false);
            }}
          />
          <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg-elevated)] shadow-[var(--shadow-strong)]">
            <div className="relative border-b border-white/10 px-6 py-4">
              <h3
                id="workspace-create-org-title"
                className="text-center text-base font-semibold text-[var(--text)]"
              >
                Nouvelle organisation
              </h3>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
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
            <div className="space-y-4 px-6 py-5">
              <input
                type="text"
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder="Nom de l organisation"
                className="w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                autoFocus
              />
              <p className="text-xs text-[var(--muted)]">
                L IA active est requise pour creer une organisation.
              </p>
              {createdOrg?.id ? (
                <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 p-4">
                  <p className="text-sm text-[var(--text)]">Organisation {createdOrg.name} creee.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleSwitch(createdOrg.id)}
                      disabled={!createdOrg.id || switchingId === createdOrg.id}
                      className="rounded-full bg-emerald-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
                    >
                      Entrer dans l organisation
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateOpen(false)}
                      className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs uppercase tracking-wide text-[var(--text)] transition hover:border-white/30"
                    >
                      Rester en Perso
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-white/10 px-6 py-4">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-[var(--text)] transition hover:bg-white/10 disabled:opacity-60"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleCreateOrg}
                disabled={creating}
                className="rounded-xl bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-5 py-2 text-sm font-semibold text-zinc-900 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? "Creation..." : "Creer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {invitesOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="workspace-invites-title"
        >
          <button
            type="button"
            aria-label="Fermer"
            className="absolute inset-0 bg-black/35 backdrop-blur-sm"
            onClick={() => {
              if (!inviteActionId) setInvitesOpen(false);
            }}
          />
          <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg-elevated)] shadow-[var(--shadow-strong)]">
            <div className="relative border-b border-white/10 px-6 py-4">
              <h3
                id="workspace-invites-title"
                className="text-center text-base font-semibold text-[var(--text)]"
              >
                Invitations en attente
              </h3>
              <button
                type="button"
                onClick={() => setInvitesOpen(false)}
                disabled={Boolean(inviteActionId)}
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
            <div className="max-h-[70vh] space-y-3 overflow-auto px-6 py-5 text-sm text-[var(--muted)]">
              {invitesLoading ? (
                <div className="rounded-xl border border-white/5 bg-white/5 px-3 py-2">
                  Chargement...
                </div>
              ) : pendingInvites.length === 0 ? (
                <div className="rounded-xl border border-white/5 bg-white/5 px-3 py-2">
                  Aucune invitation.
                </div>
              ) : (
                pendingInvites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex flex-col gap-3 rounded-xl border border-white/5 bg-white/5 px-3 py-2 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="text-[var(--text)]">
                        {invite.organizations?.name ?? "Organisation"}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        Role propose: {invite.role === "admin" ? "Admin" : "Coach"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleAcceptInvite(invite.token, invite.id)}
                        disabled={inviteActionId === invite.id}
                        className="rounded-full bg-emerald-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
                      >
                        Accepter
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeclineInvite(invite.token, invite.id)}
                        disabled={inviteActionId === invite.id}
                        className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs uppercase tracking-wide text-[var(--text)] transition hover:border-white/30 disabled:opacity-60"
                      >
                        Refuser
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
