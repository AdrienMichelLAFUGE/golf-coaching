"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type Status = "idle" | "sending" | "sent" | "error";
type AccountType = "coach" | "student";
type CoachFlow = "signin" | "signup";

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.sessionStorage.getItem("gc.rememberMe") !== "false";
  });
  const [accountType, setAccountType] = useState<AccountType>("coach");
  const [coachFlow, setCoachFlow] = useState<CoachFlow>("signin");
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

  useEffect(() => {
    if (coachFlow === "signup") return;
  }, [coachFlow]);

  const handleAccountTypeChange = (nextType: AccountType) => {
    setAccountType(nextType);
    if (nextType === "student") {
      setCoachFlow("signin");
    }
  };

  const applyRememberPreference = (value: boolean) => {
    if (typeof window === "undefined") return;
    if (value) {
      window.sessionStorage.removeItem("gc.rememberMe");
      return;
    }
    window.sessionStorage.setItem("gc.rememberMe", "false");
  };

  const ensureProfile = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      return { ok: false, error: "Session invalide." };
    }

    const response = await fetch("/api/onboarding/ensure-profile", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      return { ok: false, error: data.error ?? "Acces refuse." };
    }
    return { ok: true };
  };

  const signInWithPassword = async (trimmedEmail: string, trimmedPassword: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password: trimmedPassword,
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    const ensured = await ensureProfile();
    if (!ensured.ok) {
      await supabase.auth.signOut();
      setStatus("error");
      setMessage(ensured.error ?? "Acces refuse.");
      return;
    }

    router.replace("/app");
  };

  const signUpCoach = async (trimmedEmail: string, trimmedPassword: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password: trimmedPassword,
      options: {
        data: { role: "coach" },
      },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    if (!data.session) {
      setStatus("sent");
      setMessage("Compte cree. Verifie ta boite mail pour confirmer, puis connecte-toi.");
      return;
    }

    const ensured = await ensureProfile();
    if (!ensured.ok) {
      await supabase.auth.signOut();
      setStatus("error");
      setMessage(ensured.error ?? "Acces refuse.");
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

    applyRememberPreference(rememberMe);

    if (accountType === "coach" && coachFlow === "signup") {
      const trimmedPassword = password.trim();
      if (!trimmedPassword) {
        setStatus("error");
        setMessage("Ajoute un mot de passe.");
        return;
      }
      await signUpCoach(trimmedEmail, trimmedPassword);
      return;
    }

    const trimmedPassword = password.trim();
    if (!trimmedPassword) {
      setStatus("error");
      setMessage("Ajoute un mot de passe.");
      return;
    }
    await signInWithPassword(trimmedEmail, trimmedPassword);
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

    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: `${window.location.origin}/auth/reset`,
    });

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
            {accountType === "coach" && coachFlow === "signup"
              ? "Creation coach"
              : "Connexion"}
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {accountType === "student"
              ? "Acces eleve uniquement sur invitation."
              : "Choisis ton mode d acces."}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/5 p-1 text-xs uppercase tracking-wide text-[var(--muted)]">
            <button
              type="button"
              onClick={() => handleAccountTypeChange("coach")}
              className={`rounded-xl px-3 py-2 transition ${
                accountType === "coach"
                  ? "bg-white/15 text-[var(--text)]"
                  : "hover:text-[var(--text)]"
              }`}
            >
              Coach
            </button>
            <button
              type="button"
              onClick={() => handleAccountTypeChange("student")}
              className={`rounded-xl px-3 py-2 transition ${
                accountType === "student"
                  ? "bg-white/15 text-[var(--text)]"
                  : "hover:text-[var(--text)]"
              }`}
            >
              Eleve
            </button>
          </div>
          {accountType === "coach" ? (
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/5 p-1 text-xs uppercase tracking-wide text-[var(--muted)]">
              <button
                type="button"
                onClick={() => setCoachFlow("signin")}
                className={`rounded-xl px-3 py-2 transition ${
                  coachFlow === "signin"
                    ? "bg-white/15 text-[var(--text)]"
                    : "hover:text-[var(--text)]"
                }`}
              >
                Se connecter
              </button>
              <button
                type="button"
                onClick={() => {
                  setCoachFlow("signup");
                }}
                className={`rounded-xl px-3 py-2 transition ${
                  coachFlow === "signup"
                    ? "bg-white/15 text-[var(--text)]"
                    : "hover:text-[var(--text)]"
                }`}
              >
                Creer un compte
              </button>
            </div>
          ) : null}
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label
              className="block text-xs uppercase tracking-wide text-[var(--muted)]"
              htmlFor="email"
            >
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
            <label className="mt-3 flex items-center gap-2 text-xs text-[var(--muted)]">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                className="h-4 w-4 rounded border-white/10 bg-[var(--bg-elevated)]"
              />
              Se souvenir de moi
            </label>
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full rounded-xl bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {status === "sending"
                ? "Traitement..."
                : accountType === "coach" && coachFlow === "signup"
                  ? "Creer un compte coach"
                  : accountType === "student"
                    ? "Connexion eleve"
                    : "Se connecter"}
            </button>
          </form>
          <button
            type="button"
            onClick={handlePasswordReset}
            className="mt-3 text-left text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
          >
            Mot de passe oublie ?
          </button>
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
          {accountType === "student"
            ? "Un compte eleve est cree uniquement via une invitation coach."
            : "Creer un compte coach pour demarrer en freemium."}
        </div>
      </div>
    </main>
  );
}
