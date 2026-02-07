"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type Status = "idle" | "sending" | "sent" | "error";
type ResetStatus = "idle" | "sending" | "sent" | "error";
type AccountType = "coach" | "student";
type CoachFlow = "signin" | "signup";

const rememberStorageKey = "gc.rememberMe";

const isLikelyEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export default function LoginClient({ resetSuccess }: { resetSuccess: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [rememberMe, setRememberMe] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.sessionStorage.getItem(rememberStorageKey) !== "false";
  });
  const [accountType, setAccountType] = useState<AccountType>("coach");
  const [coachFlow, setCoachFlow] = useState<CoachFlow>("signin");
  const [status, setStatus] = useState<Status>(() => (resetSuccess ? "sent" : "idle"));
  const [message, setMessage] = useState(() =>
    resetSuccess ? "Mot de passe mis a jour. Connectez-vous." : ""
  );

  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetStatus, setResetStatus] = useState<ResetStatus>("idle");
  const [resetMessage, setResetMessage] = useState("");

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

  const handleAccountTypeChange = (nextType: AccountType) => {
    setAccountType(nextType);
    if (nextType === "student") {
      setCoachFlow("signin");
    }
  };

  const applyRememberPreference = (value: boolean) => {
    if (typeof window === "undefined") return;
    if (value) {
      window.sessionStorage.removeItem(rememberStorageKey);
      return;
    }
    window.sessionStorage.setItem(rememberStorageKey, "false");
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

  const signUpCoach = async (
    trimmedEmail: string,
    trimmedPassword: string,
    trimmedFullName: string
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password: trimmedPassword,
      options: {
        data: { role: "coach", full_name: trimmedFullName },
      },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    if (!data.session) {
      router.replace("/auth/account?flow=coach&state=verify");
      return;
    }

    const ensured = await ensureProfile();
    if (!ensured.ok) {
      await supabase.auth.signOut();
      setStatus("error");
      setMessage(ensured.error ?? "Acces refuse.");
      return;
    }

    router.replace("/auth/account?flow=coach&state=ready");
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
      const trimmedFullName = fullName.trim();
      if (!trimmedFullName) {
        setStatus("error");
        setMessage("Ajoute ton nom et prenom.");
        return;
      }
      if (!trimmedPassword) {
        setStatus("error");
        setMessage("Ajoute un mot de passe.");
        return;
      }
      await signUpCoach(trimmedEmail, trimmedPassword, trimmedFullName);
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

  const openResetModal = () => {
    setResetEmail(email.trim());
    setResetStatus("idle");
    setResetMessage("");
    setResetOpen(true);
  };

  const closeResetModal = () => {
    setResetOpen(false);
    setResetStatus("idle");
    setResetMessage("");
    setResetEmail("");
  };

  const handleResetSubmit = async () => {
    const trimmedEmail = resetEmail.trim();
    if (!trimmedEmail) {
      setResetStatus("error");
      setResetMessage("Ajoutez un email pour reinitialiser le mot de passe.");
      return;
    }
    if (!isLikelyEmail(trimmedEmail)) {
      setResetStatus("error");
      setResetMessage("Email invalide.");
      return;
    }

    setResetStatus("sending");
    setResetMessage("");

    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: `${window.location.origin}/auth/reset`,
    });

    if (error) {
      setResetStatus("error");
      setResetMessage(error.message);
      return;
    }

    // Always show a non-enumerating success message.
    setResetStatus("sent");
    setResetMessage(
      "Si un compte existe pour cet email, un lien de reinitialisation vient d etre envoye."
    );
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-[var(--text)]">
      <div className="w-full max-w-md space-y-6">
        <div className="panel rounded-3xl px-6 py-8">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
            SwingFlow
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
            {accountType === "coach" && coachFlow === "signup" ? (
              <div>
                <label
                  className="block text-xs uppercase tracking-wide text-[var(--muted)]"
                  htmlFor="fullName"
                >
                  Nom et prenom
                </label>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  placeholder="Prenom Nom"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-3 text-sm text-[var(--text)] placeholder:text-zinc-500 focus:border-[var(--accent)] focus:outline-none"
                />
              </div>
            ) : null}
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
            onClick={openResetModal}
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

      {resetOpen ? (
        <ForgotPasswordModal
          email={resetEmail}
          status={resetStatus}
          message={resetMessage}
          onChangeEmail={setResetEmail}
          onClose={closeResetModal}
          onSubmit={handleResetSubmit}
        />
      ) : null}
    </main>
  );
}

function ForgotPasswordModal({
  email,
  status,
  message,
  onChangeEmail,
  onClose,
  onSubmit,
}: {
  email: string;
  status: ResetStatus;
  message: string;
  onChangeEmail: (value: string) => void;
  onClose: () => void;
  onSubmit: () => Promise<void>;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    // Focus the email field when the modal opens.
    const handle = window.setTimeout(() => {
      const input = document.getElementById("resetEmail") as HTMLInputElement | null;
      input?.focus();
      input?.select();
    }, 0);
    return () => window.clearTimeout(handle);
  }, []);

  const isSending = status === "sending";
  const isSent = status === "sent";
  const isError = status === "error";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-title"
      onMouseDown={(event) => {
        // Close only when clicking the backdrop, not the modal content.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-[var(--bg-elevated)] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Mot de passe
            </p>
            <h2 id="reset-title" className="mt-2 text-xl font-semibold text-[var(--text)]">
              Reinitialiser votre mot de passe
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
            aria-label="Fermer"
          >
            Fermer
          </button>
        </div>

        {isSent ? (
          <div className="mt-5 space-y-3 text-sm text-[var(--muted)]">
            <p>{message}</p>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                Marche a suivre
              </p>
              <ol className="mt-3 list-decimal space-y-2 pl-5">
                <li>Ouvrez votre boite mail (et verifiez les spams).</li>
                <li>Cliquez sur le lien de reinitialisation.</li>
                <li>Choisissez votre nouveau mot de passe.</li>
              </ol>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <p className="text-sm text-[var(--muted)]">
              Entrez l&apos;email du compte. Vous recevrez un lien pour reinitialiser votre
              mot de passe.
            </p>

            <div>
              <label
                className="block text-xs uppercase tracking-wide text-[var(--muted)]"
                htmlFor="resetEmail"
              >
                Email
              </label>
              <input
                id="resetEmail"
                name="resetEmail"
                type="email"
                autoComplete="email"
                placeholder="toi@email.com"
                value={email}
                onChange={(event) => onChangeEmail(event.target.value)}
                disabled={isSending}
                className="mt-1 w-full rounded-xl border border-white/10 bg-[var(--bg)] px-3 py-3 text-sm text-[var(--text)] placeholder:text-zinc-500 focus:border-[var(--accent)] focus:outline-none disabled:opacity-70"
              />
            </div>

            {message ? (
              <p className={`text-sm ${isError ? "text-red-400" : "text-[var(--muted)]"}`}>
                {message}
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSending}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-[var(--text)] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={isSending}
                className="rounded-xl bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSending ? "Envoi..." : "Envoyer le lien"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
