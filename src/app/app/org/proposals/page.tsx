"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { useProfile } from "../../_components/profile-context";
import RoleGuard from "../../_components/role-guard";
import PageBack from "../../_components/page-back";
import Badge from "../../_components/badge";

type ProposalRow = {
  id: string;
  student_id: string;
  created_by: string;
  status: "pending" | "accepted" | "rejected";
  summary: string | null;
  payload: { title?: string } | null;
  created_at: string;
};

const PROPOSAL_STATUS_TONE = {
  pending: "amber",
  accepted: "emerald",
  rejected: "rose",
} as const;

export default function OrgProposalsPage() {
  const { workspaceType, isWorkspacePremium, organization } = useProfile();
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [commentById, setCommentById] = useState<Record<string, string>>({});
  const isOrgReadOnly = workspaceType === "org" && !isWorkspacePremium;
  const modeLabel =
    (organization?.workspace_type ?? "personal") === "org"
      ? `Organisation : ${organization?.name ?? "Organisation"}`
      : "Espace personnel";
  const modeBadgeTone =
    (organization?.workspace_type ?? "personal") === "org"
      ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
      : "border-sky-300/30 bg-sky-400/10 text-sky-100";

  const loadProposals = async () => {
    setLoading(true);
    setError("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Session invalide.");
      setLoading(false);
      return;
    }
    const response = await fetch("/api/orgs/proposals", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json()) as {
      proposals?: ProposalRow[];
      error?: string;
    };
    if (!response.ok) {
      setError(payload.error ?? "Chargement impossible.");
      setLoading(false);
      return;
    }
    setProposals(payload.proposals ?? []);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      void loadProposals();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDecision = async (proposalId: string, decision: "accept" | "reject") => {
    setActionId(proposalId);
    setError("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Session invalide.");
      setActionId(null);
      return;
    }
    const response = await fetch("/api/orgs/proposals/decide", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ proposalId, decision }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Action impossible.");
      setActionId(null);
      return;
    }
    await loadProposals();
    setActionId(null);
  };

  const handleComment = async (proposalId: string) => {
    const comment = (commentById[proposalId] ?? "").trim();
    if (!comment) return;
    setActionId(proposalId);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Session invalide.");
      setActionId(null);
      return;
    }
    const response = await fetch("/api/orgs/proposals/comment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ proposalId, comment }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Commentaire impossible.");
      setActionId(null);
      return;
    }
    setCommentById((prev) => ({ ...prev, [proposalId]: "" }));
    setActionId(null);
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
            Propositions en attente
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Accepte ou refuse les propositions des coachs non assignes.
          </p>
          <Badge as="div" className={`mt-3 ${modeBadgeTone}`}>
            <span className="min-w-0 break-words">Vous travaillez dans {modeLabel}</span>
          </Badge>
          {isOrgReadOnly ? (
            <p className="mt-3 text-sm text-amber-300">
              Freemium: lecture seule en organisation.
            </p>
          ) : null}
        </section>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <section className="space-y-3">
          {loading ? (
            <div className="panel rounded-2xl p-6 text-sm text-[var(--muted)]">
              Chargement...
            </div>
          ) : proposals.length === 0 ? (
            <div className="panel rounded-2xl p-6 text-sm text-[var(--muted)]">
              Aucune proposition.
            </div>
          ) : (
            proposals.map((proposal) => (
              <div
                key={proposal.id}
                className="panel rounded-2xl border border-white/10 p-5"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">
                      {proposal.payload?.title ?? "Proposition"}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Eleve:{" "}
                      <Link
                        href={`/app/coach/eleves/${proposal.student_id}`}
                        className="underline"
                      >
                        Voir fiche
                      </Link>
                    </p>
                  </div>
                  <Badge tone={PROPOSAL_STATUS_TONE[proposal.status]} size="sm">
                    {proposal.status}
                  </Badge>
                </div>
                <p className="mt-3 text-sm text-[var(--muted)]">
                  {proposal.summary ?? "-"}
                </p>
                {proposal.status === "pending" ? (
                  <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
                    <button
                      type="button"
                      disabled={actionId === proposal.id || isOrgReadOnly}
                      onClick={() => handleDecision(proposal.id, "accept")}
                      className="rounded-full bg-emerald-300/90 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-950 transition hover:bg-emerald-200 disabled:opacity-60"
                    >
                      Accepter
                    </button>
                    <button
                      type="button"
                      disabled={actionId === proposal.id || isOrgReadOnly}
                      onClick={() => handleDecision(proposal.id, "reject")}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-60"
                    >
                      Refuser
                    </button>
                    <div className="flex flex-1 items-center gap-2">
                      <input
                        type="text"
                        value={commentById[proposal.id] ?? ""}
                        onChange={(event) =>
                          setCommentById((prev) => ({
                            ...prev,
                            [proposal.id]: event.target.value,
                          }))
                        }
                        placeholder="Ajouter un commentaire"
                        disabled={isOrgReadOnly || actionId === proposal.id}
                        className="w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text)]"
                      />
                      <button
                        type="button"
                        onClick={() => handleComment(proposal.id)}
                        disabled={actionId === proposal.id || isOrgReadOnly}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[0.6rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-60"
                      >
                        Envoyer
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </section>
      </div>
    </RoleGuard>
  );
}
