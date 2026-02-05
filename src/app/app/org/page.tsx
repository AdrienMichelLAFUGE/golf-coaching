"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import PageBack from "../_components/page-back";
import RoleGuard from "../_components/role-guard";
import { useProfile } from "../_components/profile-context";

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  studentCount: number;
  coachCount: number;
};

export default function OrgOverviewPage() {
  const { organization, workspaceType, isWorkspaceAdmin, isWorkspacePremium } =
    useProfile();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const canEdit = isWorkspaceAdmin || isWorkspacePremium;
  const isOrgReadOnly = workspaceType === "org" && !canEdit;
  const modeLabel =
    (organization?.workspace_type ?? "personal") === "org"
      ? `Organisation : ${organization?.name ?? "Organisation"}`
      : "Espace personnel";
  const modeBadgeTone =
    (organization?.workspace_type ?? "personal") === "org"
      ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
      : "border-sky-300/30 bg-sky-400/10 text-sky-100";

  const loadGroups = async () => {
    setLoading(true);
    setError("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Session invalide.");
      setLoading(false);
      return;
    }
    const response = await fetch("/api/orgs/groups", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json()) as { groups?: GroupRow[]; error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Chargement impossible.");
      setLoading(false);
      return;
    }
    setGroups(payload.groups ?? []);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      void loadGroups();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setError("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Session invalide.");
      setCreating(false);
      return;
    }
    const response = await fetch("/api/orgs/groups", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, description }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Creation impossible.");
      setCreating(false);
      return;
    }
    setName("");
    setDescription("");
    await loadGroups();
    setCreating(false);
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
            Groupes / ecole
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Repartissez vos eleves dans des groupes et assignez les coachs.
          </p>
          <div
            className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.6rem] uppercase tracking-[0.25em] ${modeBadgeTone}`}
          >
            Vous travaillez dans {modeLabel}
          </div>
          {isOrgReadOnly ? (
            <p className="mt-3 text-sm text-amber-300">
              Plan Pro requis pour creer ou modifier des groupes.
            </p>
          ) : null}
        </section>

        <section className="panel rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-semibold text-[var(--text)]">Creer un groupe</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div>
              <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Nom du groupe
              </label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={!canEdit}
                className="mt-1 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500 focus:border-[var(--accent)] focus:outline-none disabled:opacity-60"
                placeholder="Ex: Groupe Elite"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Description
              </label>
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={!canEdit}
                className="mt-1 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500 focus:border-[var(--accent)] focus:outline-none disabled:opacity-60"
                placeholder="Optionnel"
              />
            </div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!canEdit || creating || !name.trim()}
              className="rounded-xl bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? "Creation..." : "Creer"}
            </button>
          </div>
        </section>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <section className="space-y-3">
          {loading ? (
            <div className="panel rounded-2xl p-6 text-sm text-[var(--muted)]">
              Chargement...
            </div>
          ) : groups.length === 0 ? (
            <div className="panel rounded-2xl p-6 text-sm text-[var(--muted)]">
              Aucun groupe pour l instant.
            </div>
          ) : (
            groups.map((group) => (
              <div
                key={group.id}
                className="panel rounded-2xl border border-white/10 p-5"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">
                      {group.name}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {group.description ?? "Aucune description."}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                      {group.studentCount} eleves
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                      {group.coachCount} coachs
                    </span>
                    <Link
                      href={`/app/org/groups/${group.id}`}
                      className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
                    >
                      Gerer
                    </Link>
                  </div>
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </RoleGuard>
  );
}
