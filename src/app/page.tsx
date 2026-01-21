"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Status = "idle" | "sending" | "sent" | "error";
type AuthMode = "password" | "magic";

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<AuthMode>("password");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session) {
        router.replace("/app");
      }
    };

    checkSession();

    return () => {
      active = false;
    };
  }, [router]);

  const sendMagicLink = async (trimmedEmail: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    setStatus("sent");
    setMessage("Magic link envoye. Verifie ta boite mail.");
  };

  const signInWithPassword = async (
    trimmedEmail: string,
    trimmedPassword: string
  ) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password: trimmedPassword,
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    router.replace("/app");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("sending");
    setMessage("");

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setStatus("error");
      setMessage("Ajoute un email.");
      return;
    }

    if (mode === "password") {
      const trimmedPassword = password.trim();
      if (!trimmedPassword) {
        setStatus("error");
        setMessage("Ajoute un mot de passe.");
        return;
      }
      await signInWithPassword(trimmedEmail, trimmedPassword);
      return;
    }

    await sendMagicLink(trimmedEmail);
  };

  const handlePasswordReset = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setStatus("error");
      setMessage("Ajoute un email pour reinitialiser le mot de passe.");
      return;
    }

    setStatus("sending");
    setMessage("");

    const { error } = await supabase.auth.resetPasswordForEmail(
      trimmedEmail,
      {
        redirectTo: `${window.location.origin}/auth/reset`,
      }
    );

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    setStatus("sent");
    setMessage("Email de reinitialisation envoye.");
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-[var(--text)]">
      <div className="w-full max-w-md space-y-6">
        <div className="panel rounded-3xl px-6 py-8">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
            Golf Coaching
          </p>
          <h1 className="mt-3 font-[var(--font-display)] text-3xl font-semibold">
            Connexion
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Choisis ta methode de connexion.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/5 p-1 text-xs uppercase tracking-wide text-[var(--muted)]">
            <button
              type="button"
              onClick={() => setMode("password")}
              className={`rounded-xl px-3 py-2 transition ${
                mode === "password"
                  ? "bg-white/15 text-[var(--text)]"
                  : "hover:text-[var(--text)]"
              }`}
            >
              Mot de passe
            </button>
            <button
              type="button"
              onClick={() => setMode("magic")}
              className={`rounded-xl px-3 py-2 transition ${
                mode === "magic"
                  ? "bg-white/15 text-[var(--text)]"
                  : "hover:text-[var(--text)]"
              }`}
            >
              Magic link
            </button>
          </div>
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block text-xs uppercase tracking-wide text-[var(--muted)]" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="toi@email.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-3 text-sm text-[var(--text)] placeholder:text-zinc-500 focus:border-[var(--accent)] focus:outline-none"
            />
            {mode === "password" ? (
              <>
                <label
                  className="block text-xs uppercase tracking-wide text-[var(--muted)]"
                  htmlFor="password"
                >
                  Mot de passe
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Votre mot de passe"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-3 text-sm text-[var(--text)] placeholder:text-zinc-500 focus:border-[var(--accent)] focus:outline-none"
                />
              </>
            ) : null}
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full rounded-xl bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {status === "sending"
                ? "Traitement..."
                : mode === "password"
                ? "Se connecter"
                : "Envoyer le magic link"}
            </button>
          </form>
          {mode === "password" ? (
            <button
              type="button"
              onClick={handlePasswordReset}
              className="mt-3 text-left text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
            >
              Mot de passe oublie ?
            </button>
          ) : null}
          {message ? (
            <p
              className={`mt-4 text-sm ${
                status === "error" ? "text-red-400" : "text-[var(--muted)]"
              }`}
            >
              {message}
            </p>
          ) : null}
        </div>
        <div className="panel-outline rounded-2xl px-5 py-4 text-xs text-[var(--muted)]">
          Pas encore de compte ? Il sera cree automatiquement a la premiere
          connexion.
        </div>
      </div>
    </main>
  );
}
