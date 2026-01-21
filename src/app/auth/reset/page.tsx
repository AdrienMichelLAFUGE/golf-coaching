"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "success">(
    "idle"
  );
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    const initSession = async () => {
      const code = searchParams.get("code");
      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
      }

      const { data } = await supabase.auth.getSession();
      if (!active) return;

      if (!data.session) {
        setMessage("Lien invalide ou expire.");
        setStatus("error");
        return;
      }

      setReady(true);
    };

    initSession();

    return () => {
      active = false;
    };
  }, [searchParams]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("saving");
    setMessage("");

    const nextPassword = password.trim();
    if (nextPassword.length < 8) {
      setStatus("error");
      setMessage("Le mot de passe doit faire au moins 8 caracteres.");
      return;
    }

    if (nextPassword !== confirm.trim()) {
      setStatus("error");
      setMessage("Les mots de passe ne correspondent pas.");
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: nextPassword,
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    setStatus("success");
    setMessage("Mot de passe mis a jour.");
  };

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 text-[var(--text)]">
        <div className="panel rounded-3xl px-6 py-8">
          <p className="text-sm text-[var(--muted)]">
            Preparation du lien de reinitialisation...
          </p>
          {message ? (
            <p className="mt-3 text-sm text-red-400">{message}</p>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-[var(--text)]">
      <div className="panel rounded-3xl px-6 py-8">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
          Reinitialisation
        </p>
        <h1 className="mt-3 text-2xl font-semibold">Nouveau mot de passe</h1>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
              Confirmer
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
            />
          </div>
          <button
            type="submit"
            disabled={status === "saving"}
            className="w-full rounded-xl bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
          >
            {status === "saving" ? "Enregistrement..." : "Mettre a jour"}
          </button>
        </form>
        {message ? (
          <p
            className={`mt-4 text-sm ${
              status === "error" ? "text-red-400" : "text-[var(--muted)]"
            }`}
          >
            {message}
          </p>
        ) : null}
        {status === "success" ? (
          <button
            type="button"
            onClick={() => router.replace("/app")}
            className="mt-4 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--text)]"
          >
            Continuer
          </button>
        ) : null}
      </div>
    </main>
  );
}
