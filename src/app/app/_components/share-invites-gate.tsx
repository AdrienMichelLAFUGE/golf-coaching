"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useProfile } from "./profile-context";

type PendingShare = {
  id: string;
  status: "pending_coach" | "pending_student";
  created_at: string;
};

export default function ShareInvitesGate() {
  const { profile, userEmail } = useProfile();
  const [pending, setPending] = useState<PendingShare | null>(null);
  const [loading, setLoading] = useState(false);
  const [decisionError, setDecisionError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadPending = useCallback(async () => {
    setDecisionError("");
    if (!profile) return;
    if (profile.role === "student") {
      setLoading(true);
      const { data, error } = await supabase
        .from("student_shares")
        .select("id, status, created_at")
        .eq("status", "pending_student")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) {
        setPending(null);
      } else {
        setPending(data as PendingShare | null);
      }
      setLoading(false);
      return;
    }

    if (!userEmail) return;

    setLoading(true);
    const { data, error } = await supabase
      .from("student_shares")
      .select("id, status, created_at")
      .eq("status", "pending_coach")
      .ilike("viewer_email", userEmail)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) {
      setPending(null);
    } else {
      setPending(data as PendingShare | null);
    }
    setLoading(false);
  }, [profile, userEmail]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (cancelled) return;
      await loadPending();
    });
    return () => {
      cancelled = true;
    };
  }, [loadPending]);

  const handleDecision = async (decision: "accept" | "reject") => {
    if (!pending) return;
    setDecisionError("");
    setSubmitting(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setDecisionError("Session invalide.");
      setSubmitting(false);
      return;
    }

    const response = await fetch("/api/student-shares/respond", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ shareId: pending.id, decision }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setDecisionError(payload.error ?? "Reponse impossible.");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    await loadPending();
  };

  if (!pending || loading) return null;

  const isCoachStep = pending.status === "pending_coach";
  const title = isCoachStep ? "Partage d eleve a valider" : "Partage d eleve a confirmer";
  const message = isCoachStep
    ? "Un coach proprietaire souhaite partager un eleve avec vous. L acces aux donnees ne sera actif qu apres validation de l eleve."
    : "Votre coach souhaite partager vos donnees avec un autre coach en lecture seule. Vous pouvez refuser ou accepter.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Partage eleve
            </p>
            <h3 className="mt-2 text-lg font-semibold text-[var(--text)]">{title}</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">{message}</p>
          </div>
        </div>
        {decisionError ? (
          <p className="mt-4 text-sm text-red-400">{decisionError}</p>
        ) : null}
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => handleDecision("reject")}
            disabled={submitting}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
          >
            Refuser
          </button>
          <button
            type="button"
            onClick={() => handleDecision("accept")}
            disabled={submitting}
            className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Traitement..." : "Accepter"}
          </button>
        </div>
      </div>
    </div>
  );
}
