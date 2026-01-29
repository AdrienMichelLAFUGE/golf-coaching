"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import AdminGuard from "../../_components/admin-guard";
import PageBack from "../../_components/page-back";

type OrganizationRow = {
  id: string;
  name: string;
  ai_enabled: boolean;
  tpi_enabled: boolean;
  radar_enabled: boolean;
  ai_model: string;
  owner: { id: string; full_name: string | null; email: string | null } | null;
};

const MODEL_OPTIONS = ["gpt-5-mini", "gpt-5", "gpt-5.2"];

export default function AdminCoachesPage() {
  const [organizations, setOrganizations] = useState<OrganizationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  const loadOrganizations = async () => {
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
      organizations?: OrganizationRow[];
      error?: string;
    };

    if (!response.ok) {
      setError(payload.error ?? "Chargement impossible.");
      setLoading(false);
      return;
    }

    setOrganizations(payload.organizations ?? []);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      void loadOrganizations();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return organizations;
    return organizations.filter((org) => {
      const owner = org.owner?.full_name ?? "";
      const ownerEmail = org.owner?.email ?? "";
      return (
        org.name.toLowerCase().includes(search) ||
        owner.toLowerCase().includes(search) ||
        ownerEmail.toLowerCase().includes(search)
      );
    });
  }, [organizations, query]);

  const handleDeleteCoach = async (coachId: string, orgId: string) => {
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

    setOrganizations((prev) =>
      prev.map((org) => (org.id === orgId ? { ...org, owner: null } : org))
    );
    setMessage("Coach supprime.");
    setDeletingId(null);
  };

  const handleUpdate = async (orgId: string, patch: Partial<OrganizationRow>) => {
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
        ai_model: patch.ai_model,
      }),
    });

    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Mise a jour impossible.");
      setSavingId(null);
      return;
    }

    setOrganizations((prev) =>
      prev.map((org) =>
        org.id === orgId
          ? {
              ...org,
              ai_enabled: patch.ai_enabled ?? org.ai_enabled,
              tpi_enabled: patch.tpi_enabled ?? org.tpi_enabled,
              radar_enabled: patch.radar_enabled ?? org.radar_enabled,
              ai_model: patch.ai_model ?? org.ai_model,
            }
          : org
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
            Active l IA et les add-ons pour chaque organisation.
          </p>
        </section>

        <section className="panel-soft rounded-2xl p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher une organisation"
              className="w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-4 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500 md:max-w-sm"
            />
            <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <span>{filtered.length} organisations</span>
            </div>
          </div>
          {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
          {message ? <p className="mt-3 text-sm text-emerald-200">{message}</p> : null}
        </section>

        <section className="panel rounded-2xl p-6">
          <div className="grid gap-3 text-sm text-[var(--muted)]">
            <div className="hidden gap-3 uppercase tracking-wide text-[0.7rem] text-[var(--muted)] md:grid md:grid-cols-[1.3fr_1fr_1fr_1fr_0.6fr]">
              <span>Organisation</span>
              <span>Coach</span>
              <span>Plan</span>
              <span>Modele</span>
              <span>Actions</span>
            </div>
            {loading ? (
              <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                Chargement des organisations...
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                Aucune organisation disponible.
              </div>
            ) : (
              filtered.map((org) => (
                <div
                  key={org.id}
                  className="grid gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-[var(--text)] md:grid-cols-[1.3fr_1fr_1fr_1fr_0.6fr]"
                >
                  <div>
                    <p className="font-medium">{org.name || "Organisation"}</p>
                  </div>
                  <div className="text-sm text-[var(--muted)]">
                    <p>{org.owner?.full_name ?? "Coach"}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {org.owner?.email ?? "Email indisponible"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={savingId === org.id}
                      onClick={() =>
                        handleUpdate(org.id, {
                          ai_enabled: !org.ai_enabled,
                        })
                      }
                      className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition ${
                        org.ai_enabled
                          ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20"
                          : "border-white/10 bg-white/5 text-[var(--muted)] hover:bg-white/10"
                      }`}
                    >
                      {org.ai_enabled ? "IA active" : "IA off"}
                    </button>
                    <button
                      type="button"
                      disabled={savingId === org.id}
                      onClick={() =>
                        handleUpdate(org.id, {
                          tpi_enabled: !org.tpi_enabled,
                        })
                      }
                      className={`rounded-full border px-3 py-1 text-[0.6rem] uppercase tracking-wide transition ${
                        org.tpi_enabled
                          ? "border-rose-300/30 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20"
                          : "border-white/10 bg-white/5 text-[var(--muted)] hover:bg-white/10"
                      }`}
                    >
                      {org.tpi_enabled ? "TPI on" : "TPI off"}
                    </button>
                    <button
                      type="button"
                      disabled={savingId === org.id}
                      onClick={() =>
                        handleUpdate(org.id, {
                          radar_enabled: !org.radar_enabled,
                        })
                      }
                      className={`rounded-full border px-3 py-1 text-[0.6rem] uppercase tracking-wide transition ${
                        org.radar_enabled
                          ? "border-violet-300/30 bg-violet-400/10 text-violet-200 hover:bg-violet-400/20"
                          : "border-white/10 bg-white/5 text-[var(--muted)] hover:bg-white/10"
                      }`}
                    >
                      {org.radar_enabled ? "Datas on" : "Datas off"}
                    </button>
                  </div>
                  <div>
                    <select
                      value={org.ai_model}
                      disabled={savingId === org.id}
                      onChange={(event) =>
                        handleUpdate(org.id, {
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
                  </div>
                  <div className="flex items-center">
                    <button
                      type="button"
                      disabled={!org.owner?.id || deletingId === org.owner?.id}
                      onClick={() => handleDeleteCoach(org.owner?.id ?? "", org.id)}
                      className="rounded-full border border-rose-300/30 bg-rose-400/10 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-rose-200 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deletingId === org.owner?.id ? "Suppression..." : "Supprimer"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </AdminGuard>
  );
}
