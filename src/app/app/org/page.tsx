"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import PageBack from "../_components/page-back";
import RoleGuard from "../_components/role-guard";
import { useProfile } from "../_components/profile-context";
import Badge from "../_components/badge";
import {
  ORG_GROUP_COLOR_LABELS,
  ORG_GROUP_COLOR_TOKENS,
  getOrgGroupColorTheme,
  getOrgGroupPrimaryCardClass,
  type OrgGroupColorToken,
} from "@/lib/org-groups";

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  parent_group_id: string | null;
  color_token: OrgGroupColorToken | null;
  studentCount: number;
  coachCount: number;
  studentIds: string[];
  coachIds: string[];
};

type GroupTreeNode = GroupRow & { children: GroupTreeNode[] };

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
  const [createParentGroupId, setCreateParentGroupId] = useState<string | null>(null);
  const [colorToken, setColorToken] = useState<OrgGroupColorToken>("mint");
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
    const uniqueGroups = new Map<string, GroupRow>();
    (payload.groups ?? []).forEach((group) => {
      uniqueGroups.set(group.id, {
        ...group,
        studentIds: group.studentIds ?? [],
        coachIds: group.coachIds ?? [],
      });
    });
    setGroups(Array.from(uniqueGroups.values()));
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

  const groupTree = useMemo(() => {
    const groupsById = new Map<string, GroupTreeNode>();
    groups.forEach((group) => {
      if (!groupsById.has(group.id)) {
        groupsById.set(group.id, {
          ...group,
          children: [],
        });
      }
    });

    const roots: GroupTreeNode[] = [];
    groupsById.forEach((node) => {
      if (node.parent_group_id && groupsById.has(node.parent_group_id)) {
        const parentNode = groupsById.get(node.parent_group_id);
        if (parentNode && !parentNode.children.some((child) => child.id === node.id)) {
          parentNode.children.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    const sortTree = (nodes: GroupTreeNode[]) => {
      nodes.sort((left, right) => left.name.localeCompare(right.name, "fr"));
      nodes.forEach((node) => sortTree(node.children));
    };
    sortTree(roots);
    return roots;
  }, [groups]);

  const rootAggregates = useMemo(() => {
    const aggregates = new Map<
      string,
      { studentCount: number; coachCount: number; totalSubgroups: number }
    >();

    const walk = (
      node: GroupTreeNode
    ): {
      studentIds: Set<string>;
      coachIds: Set<string>;
      totalSubgroups: number;
    } => {
      const studentIds = new Set(node.studentIds);
      const coachIds = new Set(node.coachIds);
      let totalSubgroups = 0;

      node.children.forEach((child) => {
        const childResult = walk(child);
        totalSubgroups += 1 + childResult.totalSubgroups;
        childResult.studentIds.forEach((studentId) => studentIds.add(studentId));
        childResult.coachIds.forEach((coachId) => coachIds.add(coachId));
      });

      aggregates.set(node.id, {
        studentCount: studentIds.size,
        coachCount: coachIds.size,
        totalSubgroups,
      });

      return { studentIds, coachIds, totalSubgroups };
    };

    groupTree.forEach((root) => {
      walk(root);
    });

    return aggregates;
  }, [groupTree]);

  const renderSubgroupTree = (nodes: GroupTreeNode[], depth = 1): ReactNode =>
    nodes.map((node) => (
      <div key={node.id} className="space-y-2">
        <div
          className="flex items-center justify-between gap-3 rounded-xl border border-white/30 bg-black/15 px-3 py-2 backdrop-blur-[2px]"
          style={{ marginLeft: `${Math.max(0, depth - 1) * 10}px` }}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{node.name}</p>
            {node.description?.trim() ? (
              <p className="mt-0.5 truncate text-[11px] text-white/80">
                {node.description}
              </p>
            ) : null}
            <p className="mt-1 text-[10px] text-white/80">
              {node.studentCount} eleves - {node.coachCount} coachs
            </p>
          </div>
          <Link
            href={`/app/org/groups/${node.id}`}
            aria-label={`Ouvrir le sous-groupe ${node.name}`}
            title="Ouvrir le sous-groupe"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/30 bg-black/20 text-white/85 transition hover:text-white"
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
              <path d="M7 17 17 7" />
              <path d="M8 7h9v9" />
            </svg>
          </Link>
        </div>
        {node.children.length > 0 ? renderSubgroupTree(node.children, depth + 1) : null}
      </div>
    ));

  const createParentGroup = useMemo(
    () => groups.find((group) => group.id === createParentGroupId) ?? null,
    [groups, createParentGroupId]
  );

  const openCreateRootModal = () => {
    setCreateError("");
    setName("");
    setDescription("");
    setCreateParentGroupId(null);
    setColorToken("mint");
    setCreateOpen(true);
  };

  const openCreateSubgroupModal = (parentId: string) => {
    setCreateError("");
    setName("");
    setDescription("");
    setCreateParentGroupId(parentId);
    setColorToken("mint");
    setCreateOpen(true);
  };

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
      body: JSON.stringify({
        name,
        description,
        parentGroupId: createParentGroupId,
        colorToken: createParentGroupId ? null : colorToken,
      }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setCreateError(payload.error ?? "Creation impossible.");
      setCreating(false);
      return;
    }
    setName("");
    setDescription("");
    setCreateParentGroupId(null);
    setColorToken("mint");
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
              onClick={openCreateRootModal}
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
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {groupTree.map((rootGroup) => {
                const rootCardClass = getOrgGroupPrimaryCardClass(rootGroup.color_token);
                const aggregate = rootAggregates.get(rootGroup.id);
                const totalStudentCount = aggregate?.studentCount ?? rootGroup.studentCount;
                const totalCoachCount = aggregate?.coachCount ?? rootGroup.coachCount;
                const totalSubgroups = aggregate?.totalSubgroups ?? rootGroup.children.length;
                return (
                  <article
                    key={rootGroup.id}
                    className={`relative overflow-hidden rounded-2xl border text-white shadow-[0_10px_28px_rgba(15,23,42,0.28)] ${rootCardClass}`}
                  >
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-black/10 to-transparent" />
                    <div className="pointer-events-none absolute -right-10 top-8 h-28 w-28 rounded-full border border-white/15 bg-white/10" />
                    <div className="pointer-events-none absolute right-10 top-2 h-3 w-3 rounded-full bg-white/20" />

                    <div className="relative p-5">
                      <div className="flex items-start gap-3">
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/5 bg-white/90 text-zinc-900 shadow-sm">
                          <svg
                            viewBox="0 0 24 24"
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                          </svg>
                        </span>

                        <div className="min-w-0">
                          <h3 className="truncate text-lg font-semibold text-white">
                            {rootGroup.name}
                          </h3>
                          {rootGroup.description?.trim() ? (
                            <p className="mt-1.5 line-clamp-2 text-sm text-white/90">
                              {rootGroup.description}
                            </p>
                          ) : (
                            <p className="mt-1.5 text-sm text-white/85">
                              
                            </p>
                          )}
                        </div>
                      </div>

                      <p className="mt-4 text-xs text-white/90">
                        <span className="font-semibold">{totalStudentCount}</span> eleves
                        <span className="mx-1.5 opacity-70">-</span>
                        <span className="font-semibold">{totalCoachCount}</span> coachs
                        <span className="mx-1.5 opacity-70">-</span>
                        <span className="font-semibold">{totalSubgroups}</span> sous-groupes
                      </p>

                      <div className="mt-4 flex items-center gap-2">
                        <Link
                          href={`/app/org/groups/${rootGroup.id}`}
                          aria-label={`Ouvrir le groupe ${rootGroup.name}`}
                          title="Ouvrir le groupe"
                          className="inline-flex items-center gap-2 rounded-lg border-white/30 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 transition hover:bg-white/90"
                        >
                          Ouvrir
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
                            <path d="m9 18 6-6-6-6" />
                          </svg>
                        </Link>
                      </div>

                      <details
                        open={rootGroup.children.length > 0}
                        className="mt-4 rounded-xl border border-white/25 bg-black/15 backdrop-blur-[2px]"
                      >
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 border-b border-white/20 px-3 py-2 text-xs font-medium text-white/90">
                          <span>Sous-groupes ({totalSubgroups})</span>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              openCreateSubgroupModal(rootGroup.id);
                            }}
                            disabled={!canEdit}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 bg-white/15 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white transition hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-60"
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
                              <path d="M12 5v14" />
                              <path d="M5 12h14" />
                            </svg>
                            Ajouter
                          </button>
                        </summary>
                        <div className="px-3 py-2">
                          {rootGroup.children.length === 0 ? (
                            <p className="text-xs text-white/80">Aucun sous-groupe.</p>
                          ) : (
                            <div className="space-y-2">{renderSubgroupTree(rootGroup.children)}</div>
                          )}
                        </div>
                      </details>
                    </div>

                  </article>
                );
              })}
            </div>
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
                  {createParentGroupId ? "Creer un sous-groupe" : "Creer un groupe principal"}
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
                      {createParentGroupId ? "Nom du sous-groupe" : "Nom du groupe"}
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
                  {createParentGroupId ? (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                        Groupe parent
                      </p>
                      <p className="mt-1 text-sm text-[var(--text)]">
                        {createParentGroup?.name ?? "Groupe principal"}
                      </p>
                    </div>
                  ) : null}
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
                  {createParentGroupId ? (
                    <p className="text-xs text-[var(--muted)]">
                      Les sous-groupes utilisent automatiquement la couleur du groupe parent.
                    </p>
                  ) : (
                    <div>
                      <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                        Couleur pastel (groupe principal)
                      </label>
                      <div
                        role="radiogroup"
                        aria-label="Couleur du groupe"
                        className="mt-2 grid grid-cols-2 gap-2"
                      >
                        {ORG_GROUP_COLOR_TOKENS.map((token) => {
                          const selected = colorToken === token;
                          const dotClass = getOrgGroupColorTheme(token).dotClass;
                          return (
                            <label
                              key={token}
                              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                                selected
                                  ? "border-emerald-300/40 bg-emerald-400/10 text-[var(--text)]"
                                  : "border-white/10 bg-white/5 text-[var(--muted)]"
                              } ${!canEdit || creating ? "opacity-60" : "cursor-pointer hover:border-white/20 hover:text-[var(--text)]"}`}
                            >
                              <input
                                type="radio"
                                name="group-color-token"
                                value={token}
                                checked={selected}
                                onChange={() => setColorToken(token)}
                                disabled={!canEdit || creating}
                                className="sr-only"
                              />
                              <span
                                className={`h-2.5 w-2.5 rounded-full ${dotClass}`}
                                aria-hidden="true"
                              />
                              <span>{ORG_GROUP_COLOR_LABELS[token]}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
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
                    {creating
                      ? "Creation..."
                      : createParentGroupId
                        ? "Creer le sous-groupe"
                        : "Creer le groupe"}
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
