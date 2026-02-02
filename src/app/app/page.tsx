"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useProfile } from "./_components/profile-context";
import WorkspaceSelector from "./_components/workspace-selector";

type WorkspaceOption = {
  id: string;
  name: string;
  type: "personal" | "org";
  status: "active" | "invited" | "disabled";
  roleLabel: string;
};

export default function AppPage() {
  const { profile, loading, organization, memberships, personalWorkspace, refresh } =
    useProfile();
  const router = useRouter();
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isStudent = profile?.role === "student";

  useEffect(() => {
    if (!loading && isStudent) {
      router.replace("/app/eleve");
    }
  }, [isStudent, loading, router]);

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

  if (!loading && isStudent) {
    return (
      <section className="panel rounded-2xl p-6">
        <p className="text-sm text-[var(--muted)]">Redirection vers ton dashboard...</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <WorkspaceSelector />
      <section className="grid gap-6 md:grid-cols-2">
        <div className="panel rounded-2xl p-6">
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

        <div className="panel-soft rounded-2xl p-6">
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
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {loading ? (
        <section className="panel-soft rounded-2xl p-6 text-sm text-[var(--muted)]">
          Chargement du profil...
        </section>
      ) : null}
    </div>
  );
}
