"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Status = "idle" | "sending" | "error" | "success";

const fetchWithAuth = async (input: string, init: RequestInit) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error("Session invalide.");
  }

  return fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
};

export default function ParentLinkChildPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [secretCode, setSecretCode] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("sending");
    setMessage("");

    try {
      const response = await fetchWithAuth("/api/parent/link-child", {
        method: "POST",
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          secretCode,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setStatus("error");
        setMessage(payload.error ?? "Rattachement impossible.");
        return;
      }

      setStatus("success");
      setMessage("Enfant rattache.");
      router.replace("/parent");
    } catch (submitError) {
      setStatus("error");
      setMessage(submitError instanceof Error ? submitError.message : "Rattachement impossible.");
    }
  };

  return (
    <section className="panel mx-auto w-full max-w-2xl rounded-2xl p-5">
      <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
        Rattachement
      </p>
      <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">Rattacher un enfant</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Renseignez les informations exactes de l enfant et son code secret.
      </p>

      <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
        <div>
          <label className="text-xs uppercase tracking-wide text-[var(--muted)]" htmlFor="firstName">
            Prenom
          </label>
          <input
            id="firstName"
            type="text"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-[var(--muted)]" htmlFor="lastName">
            Nom
          </label>
          <input
            id="lastName"
            type="text"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs uppercase tracking-wide text-[var(--muted)]" htmlFor="email">
            Email enfant
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs uppercase tracking-wide text-[var(--muted)]" htmlFor="secretCode">
            Code secret enfant
          </label>
          <input
            id="secretCode"
            type="text"
            value={secretCode}
            onChange={(event) => setSecretCode(event.target.value.toUpperCase())}
            className="mt-1 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm tracking-[0.18em] text-[var(--text)]"
            placeholder="A7K3P9Q2"
            maxLength={12}
          />
        </div>

        <div className="md:col-span-2 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => router.replace("/parent")}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={status === "sending"}
            className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "sending" ? "Rattachement..." : "Rattacher"}
          </button>
        </div>
      </form>

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
