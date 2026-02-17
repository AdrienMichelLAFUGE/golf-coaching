"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Status = "idle" | "sending" | "error";

export default function ParentSignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("sending");
    setError("");

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();
    if (!trimmedEmail) {
      setStatus("error");
      setError("Ajoutez un email.");
      return;
    }
    if (!trimmedPassword) {
      setStatus("error");
      setError("Ajoutez un mot de passe.");
      return;
    }

    const { data, error: signupError } = await supabase.auth.signUp({
      email: trimmedEmail,
      password: trimmedPassword,
      options: {
        data: {
          role: "parent",
          full_name: null,
        },
      },
    });

    if (signupError) {
      setStatus("error");
      setError(signupError.message);
      return;
    }

    if (!data.session) {
      router.replace("/auth/account?flow=parent&state=verify");
      return;
    }

    router.replace("/auth/account?flow=parent&state=ready");
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-[var(--text)]">
      <div className="w-full max-w-md space-y-6">
        <div className="panel rounded-3xl px-6 py-8">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
            Compte parent
          </p>
          <h1 className="mt-3 text-2xl font-semibold">Creer votre acces parent</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Vous pourrez ensuite rattacher un ou plusieurs enfants en lecture seule.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label
                className="block text-xs uppercase tracking-wide text-[var(--muted)]"
                htmlFor="parent-email"
              >
                Email
              </label>
              <input
                id="parent-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-3 text-sm text-[var(--text)]"
                placeholder="parent@email.com"
              />
            </div>

            <div>
              <label
                className="block text-xs uppercase tracking-wide text-[var(--muted)]"
                htmlFor="parent-password"
              >
                Mot de passe
              </label>
              <input
                id="parent-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-3 text-sm text-[var(--text)]"
                placeholder="Votre mot de passe"
              />
            </div>

            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full rounded-xl bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {status === "sending" ? "Creation..." : "Creer un compte parent"}
            </button>
          </form>

          {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
        </div>

        <div className="panel-outline rounded-2xl px-5 py-4 text-xs text-[var(--muted)]">
          <Link href="/login" className="uppercase tracking-wide hover:text-[var(--text)]">
            Retour a la connexion
          </Link>
        </div>
      </div>
    </main>
  );
}
