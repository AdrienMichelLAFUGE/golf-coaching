"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import PageBack from "../_components/page-back";
import RoleGuard from "../_components/role-guard";
import { useProfile } from "../_components/profile-context";
import Badge from "../_components/badge";

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
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
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

  useEffect(() => {
    if (!createOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !creating) {
        setCreateOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [createOpen, creating]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setCreateError("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setCreateError("Session invalide.");
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
      setCreateError(payload.error ?? "Creation impossible.");
      setCreating(false);
      return;
    }
    setName("");
    setDescription("");
    setCreateOpen(false);
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
          <Badge as="div" className={`mt-3 ${modeBadgeTone}`}>
            <span className="min-w-0 break-words">Vous travaillez dans {modeLabel}</span>
          </Badge>
          {isOrgReadOnly ? (
            <p className="mt-3 text-sm text-amber-300">
              Plan Pro requis pour creer ou modifier des groupes.
            </p>
          ) : null}
          <div className="mt-4">
            <button
              type="button"
              onClick={() => {
                setCreateError("");
                setCreateOpen(true);
              }}
              disabled={!canEdit}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
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
              Nouveau groupe
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
                <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
                  <div className="flex items-center justify-center self-center">
                    <Link
                      href={`/app/org/groups/${group.id}`}
                      aria-label={`Ouvrir le groupe ${group.name}`}
                      title="Ouvrir le groupe"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)]"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </Link>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--text)]">
                          {group.name}
                        </p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {group.description ?? "Aucune description."}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
                        <Badge tone="muted">{group.studentCount} eleves</Badge>
                        <Badge tone="muted">{group.coachCount} coachs</Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </section>

        {createOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-group-title"
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
                  id="create-group-title"
                  className="text-center text-base font-semibold text-[var(--text)]"
                >
                  Creer un groupe
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

              <form onSubmit={handleCreate}>
                <div className="space-y-4 px-6 py-5">
                  <div>
                    <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      Nom du groupe
                    </label>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      disabled={!canEdit || creating}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500 focus:border-[var(--accent)] focus:outline-none disabled:opacity-60"
                      placeholder="Ex: Groupe Elite"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      Description
                    </label>
                    <input
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      disabled={!canEdit || creating}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500 focus:border-[var(--accent)] focus:outline-none disabled:opacity-60"
                      placeholder="Optionnel"
                    />
                  </div>
                  {isOrgReadOnly ? (
                    <p className="text-sm text-amber-300">
                      Lecture seule: plan Free en organisation.
                    </p>
                  ) : null}
                  {createError ? <p className="text-sm text-red-400">{createError}</p> : null}
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
                    type="submit"
                    disabled={!canEdit || creating || !name.trim()}
                    className="rounded-xl bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-5 py-2 text-sm font-semibold text-zinc-900 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {creating ? "Creation..." : "Creer"}
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
