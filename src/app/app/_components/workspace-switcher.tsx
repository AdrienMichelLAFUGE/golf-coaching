"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { resolvePlanTier } from "@/lib/plans";
import { useProfile } from "./profile-context";

type WorkspaceOption = {
  id: string;
  name: string;
  type: "personal" | "org";
  status: "active" | "invited" | "disabled";
  roleLabel: string;
};

const iconClass = "h-4 w-4";

const UserIcon = () => (
  <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
  </svg>
);

const BuildingIcon = () => (
  <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 21h18" />
    <path d="M6 21V7l6-4 6 4v14" />
    <path d="M9 9h2" />
    <path d="M13 9h2" />
    <path d="M9 13h2" />
    <path d="M13 13h2" />
    <path d="M9 17h2" />
    <path d="M13 17h2" />
  </svg>
);

export default function WorkspaceSwitcher() {
  const { profile, organization, memberships, personalWorkspace, refresh } =
    useProfile();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (!dropdownRef.current) return;
      if (dropdownRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener("gc:open-workspace-switcher", handleOpen);
    return () => window.removeEventListener("gc:open-workspace-switcher", handleOpen);
  }, []);

  if (!profile || profile.role === "student") return null;

  const workspaceType = organization?.workspace_type ?? "personal";
  const modeLabel = workspaceType === "org" ? "MODE ORGANISATION" : "MODE PERSO";
  const modeClass =
    workspaceType === "org"
      ? "border-emerald-400/30 bg-emerald-400/15 text-emerald-200"
      : "border-sky-400/30 bg-sky-400/15 text-sky-200";
  const activeWorkspaceId = organization?.id ?? null;
  const activeName =
    workspaceType === "org" ? organization?.name ?? "Organisation" : "Perso";
  const isCoach = profile.role === "coach" || profile.role === "owner";
  const personalPlanTier = resolvePlanTier(personalWorkspace?.plan_tier);
  const canCreateOrg = isCoach && personalPlanTier !== "free";

  const shouldConfirmSwitch = () => {
    const active = document.activeElement;
    if (!active) return false;
    const tag = active.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select";
  };

  const handleSwitch = async (workspaceId: string) => {
    if (workspaceId === activeWorkspaceId) {
      setOpen(false);
      return;
    }
    if (shouldConfirmSwitch()) {
      const confirmed = window.confirm(
        "Changer de mode annulera les actions en cours. Continuer ?"
      );
      if (!confirmed) return;
    }
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
    router.refresh();
    if (typeof window !== "undefined") {
      window.location.reload();
    }
    setSwitchingId(null);
    setOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="workspace-switcher-button"
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-wide text-[var(--text)] transition hover:border-white/30"
      >
        <span className={`inline-flex items-center gap-2 rounded-full border px-2 py-1 ${modeClass}`}>
          {workspaceType === "org" ? <BuildingIcon /> : <UserIcon />}
          {modeLabel}
        </span>
        <span className="hidden max-w-[200px] truncate text-[0.65rem] text-[var(--muted)] md:inline">
          {activeName}
        </span>
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 text-[var(--muted)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-[260px] rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-2 text-xs shadow-[0_18px_40px_rgba(0,0,0,0.4)]"
        >
          <p className="px-3 pb-2 text-[0.6rem] uppercase tracking-[0.25em] text-[var(--muted)]">
            Choisir un mode
          </p>
          <div className="space-y-2">
            {personalOption ? (
              <div className="space-y-1">
                <p className="px-3 text-[0.55rem] uppercase tracking-[0.2em] text-[var(--muted)]">
                  Perso
                </p>
                {(() => {
                  const isActive = personalOption.id === activeWorkspaceId;
                  const isDisabled = personalOption.status !== "active";
                  return (
                    <button
                      type="button"
                      role="menuitem"
                      data-testid="workspace-switcher-personal"
                      disabled={isDisabled || switchingId === personalOption.id}
                      onClick={() => handleSwitch(personalOption.id)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition ${
                        isActive
                          ? "border border-sky-300/40 bg-sky-400/10 text-sky-100"
                          : "border border-transparent text-[var(--text)] hover:border-white/20 hover:bg-white/5"
                      } ${isDisabled ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      <span className="flex items-center gap-2">
                        <UserIcon />
                        <span className="flex flex-col">
                          <span className="text-[0.7rem] uppercase tracking-wide text-[var(--muted)]">
                            Perso
                          </span>
                          <span className="max-w-[170px] truncate text-[0.75rem] text-[var(--text)]">
                            {personalOption.name}
                          </span>
                        </span>
                      </span>
                      <span className="text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                        {isActive ? "Actif" : "Perso"}
                      </span>
                    </button>
                  );
                })()}
              </div>
            ) : null}
            <div className="space-y-1">
              <p className="px-3 text-[0.55rem] uppercase tracking-[0.2em] text-[var(--muted)]">
                Organisations
              </p>
              {orgOptions.length ? (
                orgOptions.map((option) => {
                  const isActive = option.id === activeWorkspaceId;
                  const isDisabled = option.status !== "active";
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="menuitem"
                      disabled={isDisabled || switchingId === option.id}
                      onClick={() => handleSwitch(option.id)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition ${
                        isActive
                          ? "border border-emerald-300/40 bg-emerald-400/10 text-emerald-100"
                          : "border border-transparent text-[var(--text)] hover:border-white/20 hover:bg-white/5"
                      } ${isDisabled ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      <span className="flex items-center gap-2">
                        <BuildingIcon />
                        <span className="flex flex-col">
                          <span className="text-[0.7rem] uppercase tracking-wide text-[var(--muted)]">
                            Organisation
                          </span>
                          <span className="max-w-[170px] truncate text-[0.75rem] text-[var(--text)]">
                            {option.name}
                          </span>
                        </span>
                      </span>
                      <span className="text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                        {isActive ? "Actif" : option.roleLabel}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-2 text-[0.7rem] text-[var(--muted)]">
                  Aucune organisation.
                </div>
              )}
            </div>
          </div>
          {isCoach ? (
            <div className="mt-2 border-t border-white/5 pt-2">
              <button
                type="button"
                role="menuitem"
                disabled={!canCreateOrg}
                onClick={() => {
                  if (!canCreateOrg) return;
                  setOpen(false);
                  router.push("/app#workspace-create-org");
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition ${
                  canCreateOrg
                    ? "border border-emerald-300/40 bg-emerald-400/10 text-emerald-100 hover:border-emerald-300/70"
                    : "border border-white/10 text-[var(--muted)] opacity-60"
                }`}
              >
                <span className="text-[0.7rem] uppercase tracking-wide">
                  Creer une organisation
                </span>
                <span className="text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                  {canCreateOrg ? "Disponible" : "IA requise"}
                </span>
              </button>
            </div>
          ) : null}
          {error ? <p className="mt-2 px-3 text-[0.7rem] text-red-300">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
