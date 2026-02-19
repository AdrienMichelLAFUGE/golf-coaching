"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Status = "idle" | "loading" | "success" | "error";

export default function ParentInvitationAcceptPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";

  const [secretCode, setSecretCode] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  const handleAccept = async () => {
    if (!token) {
      setStatus("error");
      setMessage("Lien d invitation invalide.");
      return;
    }
    if (!secretCode.trim()) {
      setStatus("error");
      setMessage("Renseignez le code secret eleve.");
      return;
    }

    setStatus("loading");
    setMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      const nextPath = `/parent/invitations/accept?token=${encodeURIComponent(token)}`;
      router.replace(`/login/parent?next=${encodeURIComponent(nextPath)}`);
      return;
    }

    const response = await fetch("/api/parent/invitations/accept", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ token, secretCode }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };

    if (!response.ok) {
      setStatus("error");
      setMessage(payload.error ?? "Acceptation impossible.");
      return;
    }

    setStatus("success");
    setMessage("Invitation acceptee. Redirection...");
    router.replace("/parent");
  };

  return (
    <section className="panel mx-auto w-full max-w-2xl rounded-2xl p-5">
      <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
        Invitation parent
      </p>
      <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">Accepter le rattachement</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Ce lien est personnel et expire automatiquement.
      </p>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Le code secret est transmis hors email (par votre enfant ou le coach).
      </p>

      {!token ? (
        <p className="mt-5 text-sm text-red-400">Lien d invitation invalide.</p>
      ) : (
        <div className="mt-5 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
              Code secret eleve (8 caracteres)
            </label>
            <input
              type="text"
              value={secretCode}
              onChange={(event) =>
                setSecretCode(event.target.value.toUpperCase().replace(/\s+/g, ""))
              }
              placeholder="A7K3P9Q2"
              maxLength={8}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm tracking-[0.18em] text-[var(--text)]"
            />
            <p className="mt-2 text-xs text-[var(--muted)]">
              Exemple : A7K3P9Q2. Le rattachement est valide seulement avec ce code.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleAccept()}
            disabled={status === "loading" || status === "success"}
            className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "loading"
              ? "Verification..."
              : status === "success"
                ? "Accepte"
                : "Accepter l invitation"}
          </button>
          <Link
            href="/parent"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
          >
            Retour
          </Link>
          </div>
        </div>
      )}

      {message ? (
        <p
          className={`mt-4 text-sm ${
            status === "error" ? "text-red-400" : "text-emerald-200"
          }`}
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
