"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Status = "idle" | "sending" | "sent" | "error";

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("sending");
    setMessage("");

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setStatus("error");
      setMessage("Please enter an email address.");
      return;
    }

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
    setMessage("Magic link sent. Check your inbox.");
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-[var(--text)]">
      <div className="w-full max-w-md space-y-6">
        <div className="panel rounded-3xl px-6 py-8">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
            Golf Coaching
          </p>
          <h1 className="mt-3 font-[var(--font-display)] text-3xl font-semibold">
            Connexion par magic link
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Entre ton email pour recevoir un lien de connexion.
          </p>
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
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full rounded-xl bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {status === "sending" ? "Envoi..." : "Envoyer le magic link"}
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
        </div>
        <div className="panel-outline rounded-2xl px-5 py-4 text-xs text-[var(--muted)]">
          Pas encore de compte ? Il sera cree automatiquement a la premiere
          connexion.
        </div>
      </div>
    </main>
  );
}
