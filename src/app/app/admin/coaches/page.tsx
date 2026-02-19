"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { PLAN_ENTITLEMENTS, resolvePlanTier } from "@/lib/plans";
import AdminGuard from "../../_components/admin-guard";
import PageBack from "../../_components/page-back";

type WorkspaceRow = {
  id: string;
  name: string;
  workspace_type: "personal" | "org";
  plan_tier: "free" | "pro" | "enterprise";
  plan_tier_override?: "free" | "pro" | "enterprise" | null;
  plan_tier_override_expires_at?: string | null;
  ai_enabled: boolean;
  tpi_enabled: boolean;
  radar_enabled: boolean;
  coaching_dynamic_enabled: boolean;
  ai_model: string;
  membership_id: string | null;
  membership_role: "admin" | "coach" | null;
  membership_status: "invited" | "active" | "disabled" | null;
  coach: {
    id: string;
    full_name: string | null;
    email: string | null;
    ai_budget_enabled: boolean;
    ai_budget_monthly_cents: number | null;
    ai_budget_spent_cents_current_month: number;
    ai_budget_topup_cents_current_month: number;
    ai_budget_remaining_cents_current_month: number | null;
  } | null;
};

type DisplayWorkspace = WorkspaceRow & { isPlaceholder?: boolean };

const MODEL_OPTIONS = ["gpt-5-mini", "gpt-5", "gpt-5.2"];
const PLAN_TIER_OPTIONS = [
  { value: "free", label: "Free" },
  { value: "pro", label: "Pro" },
  { value: "enterprise", label: "Entreprise" },
] as const;

const PLAN_OVERRIDE_OPTIONS = [
  { value: "", label: "Aucun override" },
  { value: "free", label: "Free" },
  { value: "pro", label: "Pro" },
  { value: "enterprise", label: "Entreprise" },
] as const;

export default function AdminCoachesPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingCoachId, setSavingCoachId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [showOrphaned, setShowOrphaned] = useState(false);
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, string>>({});

  const formatEuro = (cents: number) =>
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);

  const centsToInput = (cents: number | null | undefined) =>
    cents && cents > 0 ? (cents / 100).toFixed(2) : "";

  const parseEuroInputToCents = (raw: string) => {
    const normalized = raw.trim().replace(",", ".");
    if (!normalized) return null;
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.round(parsed * 100);
  };

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
      if (response.status === 423) {
        setLoading(false);
        return;
      }
      setError(payload.error ?? "Chargement impossible.");
      setLoading(false);
      return;
    }

    setWorkspaces(payload.workspaces ?? []);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      Promise.resolve().then(() => {
        if (cancelled) return;
        void loadWorkspaces();
      });

    load();

    const handleBackofficeUnlocked = () => {
      if (cancelled) return;
      void loadWorkspaces();
    };
    window.addEventListener("backoffice:unlocked", handleBackofficeUnlocked);

    return () => {
      cancelled = true;
      window.removeEventListener("backoffice:unlocked", handleBackofficeUnlocked);
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
            plan_tier: "free",
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
        plan_tier: patch.plan_tier,
        plan_tier_override: patch.plan_tier_override,
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

    const resolvedPlan =
      typeof patch.plan_tier === "string" ? resolvePlanTier(patch.plan_tier) : null;
    const planEntitlements = resolvedPlan ? PLAN_ENTITLEMENTS[resolvedPlan] : null;

    setWorkspaces((prev) =>
      prev.map((workspace) => {
        if (workspace.id !== orgId) return workspace;
        const hasOverride = Object.prototype.hasOwnProperty.call(
          patch,
          "plan_tier_override"
        );
        return {
          ...workspace,
          plan_tier: patch.plan_tier ?? workspace.plan_tier,
          plan_tier_override: hasOverride
            ? (patch.plan_tier_override ?? null)
            : workspace.plan_tier_override ?? null,
          ai_enabled:
            patch.ai_enabled ?? planEntitlements?.aiEnabled ?? workspace.ai_enabled,
          tpi_enabled:
            patch.tpi_enabled ?? planEntitlements?.tpiEnabled ?? workspace.tpi_enabled,
          radar_enabled:
            patch.radar_enabled ??
            planEntitlements?.dataExtractEnabled ??
            workspace.radar_enabled,
          coaching_dynamic_enabled:
            patch.coaching_dynamic_enabled ??
            (planEntitlements
              ? planEntitlements.tests.scope === "catalog"
              : workspace.coaching_dynamic_enabled),
          ai_model: patch.ai_model ?? workspace.ai_model,
        };
      })
    );
    setMessage("Plan mis a jour.");
    setSavingId(null);
  };

  const handleCoachBudgetUpdate = async (
    orgId: string,
    coachId: string,
    patch: { ai_budget_enabled?: boolean; ai_budget_monthly_cents?: number | null }
  ) => {
    setSavingCoachId(coachId);
    setError("");
    setMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setError("Session invalide. Reconnecte toi.");
      setSavingCoachId(null);
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
        coachId,
        ai_budget_enabled: patch.ai_budget_enabled,
        ai_budget_monthly_cents: patch.ai_budget_monthly_cents,
      }),
    });

    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Mise a jour budget IA impossible.");
      setSavingCoachId(null);
      return;
    }

    const hasEnabledPatch = typeof patch.ai_budget_enabled === "boolean";
    const hasBudgetPatch = Object.prototype.hasOwnProperty.call(
      patch,
      "ai_budget_monthly_cents"
    );
    setWorkspaces((prev) =>
      prev.map((workspace) => {
        if (workspace.coach?.id !== coachId || !workspace.coach) return workspace;
        const nextBudgetEnabled = hasEnabledPatch
          ? Boolean(patch.ai_budget_enabled)
          : workspace.coach.ai_budget_enabled;
        const nextBudgetCents = hasBudgetPatch
          ? (patch.ai_budget_monthly_cents ?? null)
          : workspace.coach.ai_budget_monthly_cents;
        const availableCents = nextBudgetEnabled
          ? Math.max(
              0,
              (nextBudgetCents ?? 0) + workspace.coach.ai_budget_topup_cents_current_month
            )
          : null;
        const remainingCents =
          availableCents === null
            ? null
            : availableCents - workspace.coach.ai_budget_spent_cents_current_month;
        return {
          ...workspace,
          coach: {
            ...workspace.coach,
            ai_budget_enabled: nextBudgetEnabled,
            ai_budget_monthly_cents: nextBudgetCents,
            ai_budget_remaining_cents_current_month: remainingCents,
          },
        };
      })
    );

    if (hasBudgetPatch) {
      setBudgetDrafts((prev) => ({
        ...prev,
        [coachId]: patch.ai_budget_monthly_cents
          ? centsToInput(patch.ai_budget_monthly_cents)
          : "",
      }));
    }

    setMessage("Budget IA mis a jour.");
    setSavingCoachId(null);
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
            Plans et acces
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Definis le plan de chaque workspace.
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
                    const coach = workspace.coach;
                    return (
                      <div
                        key={workspace.id}
                        className={`grid gap-3 md:grid-cols-[1.3fr_1fr_1fr_1fr_0.6fr] ${
                          index > 0 ? "mt-3 border-t border-white/10 pt-3" : ""
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
                              <p>{coach?.full_name ?? "Coach"}</p>
                              <p className="mt-1 text-xs text-[var(--muted)]">
                                {coach?.email ?? "Email indisponible"}
                              </p>
                              {index === 0 && coach ? (
                                <div className="mt-3 rounded-xl border border-white/10 bg-[var(--bg-elevated)] p-3">
                                  <p className="text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                                    Budget IA (compte)
                                  </p>
                                  <label className="mt-2 flex items-center gap-2 text-xs text-[var(--text)]">
                                    <input
                                      type="checkbox"
                                      checked={coach.ai_budget_enabled}
                                      disabled={savingCoachId === coach.id}
                                      onChange={async (event) => {
                                        const enabled = event.target.checked;
                                        if (enabled) {
                                          const fromDraft = parseEuroInputToCents(
                                            budgetDrafts[coach.id] ?? ""
                                          );
                                          const defaultBudget = fromDraft ?? 2500;
                                          setBudgetDrafts((prev) => ({
                                            ...prev,
                                            [coach.id]: centsToInput(defaultBudget),
                                          }));
                                          await handleCoachBudgetUpdate(
                                            workspace.id,
                                            coach.id,
                                            {
                                              ai_budget_enabled: true,
                                              ai_budget_monthly_cents: defaultBudget,
                                            }
                                          );
                                          return;
                                        }
                                        await handleCoachBudgetUpdate(
                                          workspace.id,
                                          coach.id,
                                          { ai_budget_enabled: false }
                                        );
                                      }}
                                      className="h-4 w-4 rounded border border-white/10 bg-[var(--bg-elevated)]"
                                    />
                                    <span>Activer le budget IA</span>
                                  </label>
                                  <div className="mt-2">
                                    <label className="text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                                      Budget mensuel (EUR)
                                    </label>
                                    <input
                                      type="text"
                                      value={
                                        budgetDrafts[coach.id] ??
                                        centsToInput(coach.ai_budget_monthly_cents)
                                      }
                                      disabled={
                                        savingCoachId === coach.id ||
                                        !coach.ai_budget_enabled
                                      }
                                      onChange={(event) =>
                                        setBudgetDrafts((prev) => ({
                                          ...prev,
                                          [coach.id]: event.target.value,
                                        }))
                                      }
                                      onBlur={async () => {
                                        const cents = parseEuroInputToCents(
                                          budgetDrafts[coach.id] ?? ""
                                        );

                                        if (!cents) {
                                          setError(
                                            "Le budget IA doit etre un montant strictement positif."
                                          );
                                          setBudgetDrafts((prev) => ({
                                            ...prev,
                                            [coach.id]: centsToInput(
                                              coach.ai_budget_monthly_cents
                                            ),
                                          }));
                                          return;
                                        }

                                        await handleCoachBudgetUpdate(
                                          workspace.id,
                                          coach.id,
                                          { ai_budget_monthly_cents: cents }
                                        );
                                      }}
                                      className="mt-1 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text)]"
                                      placeholder="Ex: 25.00"
                                    />
                                  </div>
                                  <p className="mt-2 text-[11px] text-[var(--muted)]">
                                    Consomme (periode active):{" "}
                                    <span className="text-[var(--text)]">
                                      {formatEuro(coach.ai_budget_spent_cents_current_month)}
                                    </span>
                                  </p>
                                  <p className="mt-1 text-[11px] text-[var(--muted)]">
                                    Recharges (periode active):{" "}
                                    <span className="text-[var(--text)]">
                                      {formatEuro(coach.ai_budget_topup_cents_current_month)}
                                    </span>
                                  </p>
                                  <p className="mt-1 text-[11px] text-[var(--muted)]">
                                    Reste (periode active):{" "}
                                    <span
                                      className={
                                        coach.ai_budget_remaining_cents_current_month !== null &&
                                        coach.ai_budget_remaining_cents_current_month <= 0
                                          ? "text-rose-300"
                                          : "text-[var(--text)]"
                                      }
                                    >
                                      {coach.ai_budget_remaining_cents_current_month === null
                                        ? "Illimite"
                                        : formatEuro(
                                            Math.max(
                                              0,
                                              coach.ai_budget_remaining_cents_current_month
                                            )
                                          )}
                                    </span>
                                  </p>
                                </div>
                              ) : null}
                            </>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {isPlaceholder ? (
                            <p className="text-xs text-[var(--muted)]">-</p>
                          ) : (
                            <div className="flex flex-col gap-2">
                              <div>
                                <p className="text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                                  Plan Stripe
                                </p>
                                <p className="text-xs text-[var(--text)]">
                                  {PLAN_TIER_OPTIONS.find(
                                    (option) => option.value === workspace.plan_tier
                                  )?.label ?? workspace.plan_tier}
                                </p>
                              </div>
                              {workspace.workspace_type === "personal" ? (
                                <div>
                                  <label className="text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                                    Override admin
                                  </label>
                                  <select
                                    value={workspace.plan_tier_override ?? ""}
                                    disabled={savingId === workspace.id}
                                    onChange={(event) =>
                                      handleUpdate(workspace.id, {
                                        plan_tier_override:
                                          event.target.value === ""
                                            ? null
                                            : (event.target
                                                .value as WorkspaceRow["plan_tier_override"]),
                                      })
                                    }
                                    className="w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-xs uppercase tracking-wide text-[var(--text)]"
                                  >
                                    {PLAN_OVERRIDE_OPTIONS.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ) : (
                                <p className="text-xs text-[var(--muted)]">
                                  Override indisponible
                                </p>
                              )}
                            </div>
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
                                !group.coach?.id || deletingId === group.coach?.id
                              }
                              onClick={() => handleDeleteCoach(group.coach?.id ?? "")}
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
