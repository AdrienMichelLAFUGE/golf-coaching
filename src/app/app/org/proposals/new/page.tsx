"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import RoleGuard from "../../../_components/role-guard";
import PageBack from "../../../_components/page-back";
import { useProfile } from "../../../_components/profile-context";

export default function NewProposalPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { workspaceType, isWorkspacePremium } = useProfile();
  const studentId = searchParams.get("studentId") ?? "";
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isOrgReadOnly = workspaceType === "org" && !isWorkspacePremium;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (isOrgReadOnly) {
      setError("Lecture seule: premium requis pour proposer.");
      return;
    }
    if (!studentId) {
      setError("Eleve introuvable.");
      return;
    }
    if (!title.trim() || !summary.trim()) {
      setError("Ajoute un titre et un resume.");
      return;
    }
    setSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Session invalide.");
      setSaving(false);
      return;
    }
    const response = await fetch("/api/orgs/proposals", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ studentId, title, summary }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Proposition impossible.");
      setSaving(false);
      return;
    }
    router.replace("/app/org/proposals");
  };

  return (
    <RoleGuard allowedRoles={["owner", "coach", "staff"]}>
      <div className="space-y-6">
        <section className="panel rounded-2xl p-6">
          <div className="flex items-center gap-2">
            <PageBack fallbackHref="/app/org/proposals" />
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Organisation
            </p>
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
            Nouvelle proposition
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Propose une mise a jour pour cet eleve. L acceptation cree un nouveau contenu
            publie.
          </p>
          {isOrgReadOnly ? (
            <p className="mt-3 text-sm text-amber-300">
              Freemium: lecture seule en organisation.
            </p>
          ) : null}
        </section>

        <section className="panel-soft rounded-2xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Titre
              </label>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={saving || isOrgReadOnly}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Resume
              </label>
              <textarea
                rows={5}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                disabled={saving || isOrgReadOnly}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
              />
            </div>
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            <button
              type="submit"
              disabled={saving || isOrgReadOnly}
              className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Envoi..." : "Envoyer"}
            </button>
          </form>
        </section>
      </div>
    </RoleGuard>
  );
}
