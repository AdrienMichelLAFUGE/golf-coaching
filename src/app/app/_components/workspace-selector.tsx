"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useProfile } from "./profile-context";
import ToastStack from "./toast-stack";
import useToastStack from "./use-toast-stack";

const sanitizeName = (value: string) => value.trim().slice(0, 80);

export default function WorkspaceSelector() {
  const { profile, organization, currentMembership, isWorkspaceAdmin, refresh } =
    useProfile();
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const { toasts, pushToast, dismissToast } = useToastStack();
  const [error, setError] = useState<string | null>(null);
  const [createdOrg, setCreatedOrg] = useState<{ id: string; name: string } | null>(null);
  const [pendingInvites, setPendingInvites] = useState<
    Array<{
      id: string;
      token: string;
      role: "admin" | "coach";
      organizations?: { name: string | null } | null;
    }>
  >([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);

  const loadInvites = async () => {
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
    const payload = (await response.json()) as {
      invitations?: Array<{
        id: string;
        token: string;
        role: "admin" | "coach";
        organizations?: { name: string | null } | null;
      }>;
    };
    if (response.ok) {
      setPendingInvites(payload.invitations ?? []);
    }
    setInvitesLoading(false);
  };

  useEffect(() => {
    if (!profile || profile.role === "student") return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      void loadInvites();
    });
    return () => {
      cancelled = true;
    };
  }, [profile]);

  const handleSwitch = async (workspaceId: string) => {
    setSwitchingId(workspaceId);
    setError(null);
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

    const payload = (await response.json()) as { error?: string; orgId?: string };
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
    pushToast("Espace mis a jour.", "success");
  };

  const handleCreateOrg = async () => {
    const name = sanitizeName(createName);
    if (!name) {
      setError("Ajoute un nom d organisation.");
      return;
    }
    setCreating(true);
    setError(null);
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
    setCreating(false);
    setCreatedOrg({ id: payload.orgId ?? "", name });
    pushToast(`Organisation ${name} creee.`, "success");
  };

  const handleAcceptInvite = async (token: string, inviteId: string) => {
    setInviteActionId(inviteId);
    setError(null);
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
    pushToast("Invitation acceptee.", "success");
  };

  const handleDeclineInvite = async (token: string, inviteId: string) => {
    setInviteActionId(inviteId);
    setError(null);
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
    pushToast("Invitation refusee.", "info");
  };

  if (!profile || profile.role === "student") return null;

  return (
    <section className="panel rounded-2xl p-6">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
            Workspaces
          </p>
          <h3 className="mt-2 text-xl font-semibold text-[var(--text)]">
            Espace courant : {organization?.name ?? "Workspace"}
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Type :{" "}
            {organization?.workspace_type === "personal" ? "Personnel" : "Organisation"}
          </p>
        </div>
        {isWorkspaceAdmin ? (
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-wide text-[var(--muted)]">
            Admin org
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
        Selectionne un workspace ci-dessous pour changer de mode.
      </div>

      <div
        id="workspace-create-org"
        className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4"
      >
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
          Nouvelle organisation
        </p>
        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
          <input
            type="text"
            value={createName}
            onChange={(event) => setCreateName(event.target.value)}
            placeholder="Nom de l organisation"
            className="w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
          />
          <button
            type="button"
            onClick={handleCreateOrg}
            disabled={creating}
            className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
          >
            {creating ? "Creation..." : "Creer"}
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          L IA active est requise pour creer une organisation.
        </p>
      </div>

      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      {createdOrg?.id ? (
        <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm">
          <p className="text-[var(--text)]">Organisation {createdOrg.name} creee.</p>
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
              onClick={() => setCreatedOrg(null)}
              className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs uppercase tracking-wide text-[var(--text)] transition hover:border-white/30"
            >
              Rester en Perso
            </button>
          </div>
        </div>
      ) : null}
      {currentMembership?.status === "invited" ? (
        <p className="mt-3 text-sm text-amber-300">
          Invitation en attente sur un workspace.
        </p>
      ) : null}
      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
          Invitations en attente
        </p>
        <div className="mt-3 space-y-3 text-sm text-[var(--muted)]">
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
    </section>
  );
}
