"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import AdminGuard from "../../_components/admin-guard";
import PageBack from "../../_components/page-back";

type WorkspaceRow = {
  id: string;
  name: string;
  workspace_type: "personal" | "org";
  ai_enabled: boolean;
  tpi_enabled: boolean;
  radar_enabled: boolean;
  coaching_dynamic_enabled: boolean;
  ai_model: string;
  membership_id: string | null;
  membership_role: "admin" | "coach" | null;
  membership_status: "invited" | "active" | "disabled" | null;
  coach: { id: string; full_name: string | null; email: string | null } | null;
};

type DisplayWorkspace = WorkspaceRow & { isPlaceholder?: boolean };

const MODEL_OPTIONS = ["gpt-5-mini", "gpt-5", "gpt-5.2"];

export default function AdminCoachesPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [showOrphaned, setShowOrphaned] = useState(false);

  const loadWorkspaces = async () => {
    setLoading(true);
    setError("");
    setMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setError("Session invalide. Reconnecte toi.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/admin/coaches", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json()) as {
      workspaces?: WorkspaceRow[];
      error?: string;
    };

    if (!response.ok) {
      setError(payload.error ?? "Chargement impossible.");
      setLoading(false);
      return;
    }

    setWorkspaces(payload.workspaces ?? []);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      void loadWorkspaces();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    const scoped = showOrphaned
      ? workspaces
      : workspaces.filter((workspace) => workspace.coach?.id);
    if (!search) return scoped;
    return scoped.filter((workspace) => {
      const coach = workspace.coach?.full_name ?? "";
      const coachEmail = workspace.coach?.email ?? "";
      return (
        workspace.name.toLowerCase().includes(search) ||
        coach.toLowerCase().includes(search) ||
        coachEmail.toLowerCase().includes(search)
      );
    });
  }, [workspaces, query, showOrphaned]);

  const grouped = useMemo(() => {
    const groups = new Map<
      string,
      { key: string; coach: WorkspaceRow["coach"]; items: DisplayWorkspace[] }
    >();

    for (const workspace of filtered) {
      const coachId = workspace.coach?.id;
      const key = coachId ? `coach-${coachId}` : `workspace-${workspace.id}`;
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(workspace);
      } else {
        groups.set(key, {
          key,
          coach: workspace.coach ?? null,
          items: [workspace],
        });
      }
    }

    return Array.from(groups.values())
      .map((group) => {
        const items = [...group.items];
        const hasOrg = items.some((item) => item.workspace_type === "org");
        if (group.coach?.id && !hasOrg) {
          items.push({
            id: `placeholder-org-${group.coach.id}`,
            name: "",
            workspace_type: "org",
            ai_enabled: false,
            tpi_enabled: false,
            radar_enabled: false,
            coaching_dynamic_enabled: false,
            ai_model: "gpt-5-mini",
            membership_id: null,
            membership_role: null,
            membership_status: null,
            coach: group.coach,
            isPlaceholder: true,
          });
        }
        return {
          ...group,
          items: items.sort((a, b) => {
            if (a.workspace_type !== b.workspace_type) {
              return a.workspace_type === "personal" ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
          }),
        };
      })
      .sort((a, b) => {
        const aCoach = a.coach?.full_name ?? a.coach?.email ?? "";
        const bCoach = b.coach?.full_name ?? b.coach?.email ?? "";
        return aCoach.localeCompare(bCoach);
      });
  }, [filtered]);

  const handleDeleteCoach = async (coachId: string) => {
    if (!coachId) return;
    const confirmed = window.confirm(
      "Supprimer ce compte coach ? Cette action est irreversible."
    );
    if (!confirmed) return;

    setDeletingId(coachId);
    setError("");
    setMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setError("Session invalide. Reconnecte toi.");
      setDeletingId(null);
      return;
    }

    const response = await fetch("/api/admin/coaches", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ coachId }),
    });

    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Suppression impossible.");
      setDeletingId(null);
      return;
    }

    setWorkspaces((prev) => prev.filter((row) => row.coach?.id !== coachId));
    setMessage("Coach supprime.");
    setDeletingId(null);
  };

  const handleUpdate = async (orgId: string, patch: Partial<WorkspaceRow>) => {
    setSavingId(orgId);
    setError("");
    setMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setError("Session invalide. Reconnecte toi.");
      setSavingId(null);
      return;
    }

    const response = await fetch("/api/admin/coaches", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        orgId,
        ai_enabled: patch.ai_enabled,
        tpi_enabled: patch.tpi_enabled,
        radar_enabled: patch.radar_enabled,
        coaching_dynamic_enabled: patch.coaching_dynamic_enabled,
        ai_model: patch.ai_model,
      }),
    });

    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Mise a jour impossible.");
      setSavingId(null);
      return;
    }

    setWorkspaces((prev) =>
      prev.map((workspace) =>
        workspace.id === orgId
          ? {
              ...workspace,
              ai_enabled: patch.ai_enabled ?? workspace.ai_enabled,
              tpi_enabled: patch.tpi_enabled ?? workspace.tpi_enabled,
              radar_enabled: patch.radar_enabled ?? workspace.radar_enabled,
              coaching_dynamic_enabled:
                patch.coaching_dynamic_enabled ??
                workspace.coaching_dynamic_enabled,
              ai_model: patch.ai_model ?? workspace.ai_model,
            }
          : workspace
      )
    );
    setMessage("Acces mis a jour.");
    setSavingId(null);
  };

  return (
    <AdminGuard>
      <div className="space-y-6">
        <section className="panel rounded-2xl p-6">
          <div className="flex items-center gap-2">
            <PageBack fallbackHref="/app/admin" />
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Coachs
            </p>
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
            Acces premium
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Active l IA et les add-ons pour chaque workspace.
          </p>
        </section>

        <section className="panel-soft rounded-2xl p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un workspace"
              className="w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-4 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500 md:max-w-sm"
            />
            <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showOrphaned}
                  onChange={(event) => setShowOrphaned(event.target.checked)}
                  className="h-4 w-4 rounded border border-white/10 bg-[var(--bg-elevated)]"
                />
                <span>Afficher les workspaces sans coach</span>
              </label>
              <span>{filtered.length} workspaces</span>
            </div>
          </div>
          {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
          {message ? <p className="mt-3 text-sm text-emerald-200">{message}</p> : null}
        </section>

        <section className="panel rounded-2xl p-6">
          <div className="grid gap-3 text-sm text-[var(--muted)]">
            <div className="hidden gap-3 uppercase tracking-wide text-[0.7rem] text-[var(--muted)] md:grid md:grid-cols-[1.3fr_1fr_1fr_1fr_0.6fr]">
              <span>Workspace info</span>
              <span>Coach</span>
              <span>Plan</span>
              <span>Modele</span>
              <span>Actions</span>
            </div>
            {loading ? (
              <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                Chargement des workspaces...
              </div>
            ) : grouped.length === 0 ? (
              <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                Aucun workspace disponible.
              </div>
            ) : (
              grouped.map((group) => (
                <div
                  key={group.key}
                  className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-[var(--text)]"
                >
                  {group.items.map((workspace, index) => {
                    const isPlaceholder = workspace.isPlaceholder === true;
                    return (
                      <div
                        key={workspace.id}
                        className={`grid gap-3 md:grid-cols-[1.3fr_1fr_1fr_1fr_0.6fr] ${
                          index > 0
                            ? "mt-3 border-t border-white/10 pt-3"
                            : ""
                        }`}
                      >
                        <div>
                          <p className="font-medium">
                            {isPlaceholder
                              ? "Aucune organisation"
                              : workspace.name || "Workspace"}
                          </p>
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            {workspace.workspace_type === "personal"
                              ? "Perso"
                              : "Organisation"}
                            {!isPlaceholder && workspace.membership_role
                              ? ` - ${workspace.membership_role === "admin" ? "Admin" : "Coach"}`
                              : ""}
                          </p>
                        </div>
                        <div className="text-sm text-[var(--muted)]">
                          {isPlaceholder ? (
                            <>
                              <p>-</p>
                              <p className="mt-1 text-xs text-[var(--muted)]">-</p>
                            </>
                          ) : (
                            <>
                              <p>{workspace.coach?.full_name ?? "Coach"}</p>
                              <p className="mt-1 text-xs text-[var(--muted)]">
                                {workspace.coach?.email ?? "Email indisponible"}
                              </p>
                            </>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {isPlaceholder ? (
                            <p className="text-xs text-[var(--muted)]">-</p>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={savingId === workspace.id}
                                onClick={() =>
                                  handleUpdate(workspace.id, {
                                    ai_enabled: !workspace.ai_enabled,
                                  })
                                }
                                className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition ${
                                  workspace.ai_enabled
                                    ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20"
                                    : "border-white/10 bg-white/5 text-[var(--muted)] hover:bg-white/10"
                                }`}
                              >
                                {workspace.ai_enabled ? "IA active" : "IA off"}
                              </button>
                              <button
                                type="button"
                                disabled={savingId === workspace.id}
                                onClick={() =>
                                  handleUpdate(workspace.id, {
                                    tpi_enabled: !workspace.tpi_enabled,
                                  })
                                }
                                className={`rounded-full border px-3 py-1 text-[0.6rem] uppercase tracking-wide transition ${
                                  workspace.tpi_enabled
                                    ? "border-rose-300/30 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20"
                                    : "border-white/10 bg-white/5 text-[var(--muted)] hover:bg-white/10"
                                }`}
                              >
                                {workspace.tpi_enabled ? "TPI on" : "TPI off"}
                              </button>
                              <button
                                type="button"
                                disabled={savingId === workspace.id}
                                onClick={() =>
                                  handleUpdate(workspace.id, {
                                    radar_enabled: !workspace.radar_enabled,
                                  })
                                }
                                className={`rounded-full border px-3 py-1 text-[0.6rem] uppercase tracking-wide transition ${
                                  workspace.radar_enabled
                                    ? "border-violet-300/30 bg-violet-400/10 text-violet-200 hover:bg-violet-400/20"
                                    : "border-white/10 bg-white/5 text-[var(--muted)] hover:bg-white/10"
                                }`}
                              >
                                {workspace.radar_enabled ? "Datas on" : "Datas off"}
                              </button>
                              <button
                                type="button"
                                disabled={savingId === workspace.id}
                                onClick={() =>
                                  handleUpdate(workspace.id, {
                                    coaching_dynamic_enabled:
                                      !workspace.coaching_dynamic_enabled,
                                  })
                                }
                                className={`rounded-full border px-3 py-1 text-[0.6rem] uppercase tracking-wide transition ${
                                  workspace.coaching_dynamic_enabled
                                    ? "border-cyan-300/30 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20"
                                    : "border-white/10 bg-white/5 text-[var(--muted)] hover:bg-white/10"
                                }`}
                              >
                                {workspace.coaching_dynamic_enabled
                                  ? "Coaching on"
                                  : "Coaching off"}
                              </button>
                            </>
                          )}
                        </div>
                        <div>
                          {isPlaceholder ? (
                            <p className="text-xs text-[var(--muted)]">-</p>
                          ) : (
                            <select
                              value={workspace.ai_model}
                              disabled={savingId === workspace.id}
                              onChange={(event) =>
                                handleUpdate(workspace.id, {
                                  ai_model: event.target.value,
                                })
                              }
                              className="w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                            >
                              {MODEL_OPTIONS.map((model) => (
                                <option key={model} value={model}>
                                  {model}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                        <div className="flex items-center">
                          {index === 0 && !isPlaceholder ? (
                            <button
                              type="button"
                              disabled={
                                !group.coach?.id ||
                                deletingId === group.coach?.id
                              }
                              onClick={() =>
                                handleDeleteCoach(group.coach?.id ?? "")
                              }
                              className="rounded-full border border-rose-300/30 bg-rose-400/10 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-rose-200 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deletingId === group.coach?.id
                                ? "Suppression..."
                                : "Supprimer"}
                            </button>
                          ) : (
                            <span />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </AdminGuard>
  );
}
