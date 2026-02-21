"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { resolvePostLoginPath } from "@/lib/auth/post-login-path";
import { waitForRecoveredSession } from "@/lib/auth/session-recovery";

type Status = "idle" | "sending" | "sent" | "error";
type ResetStatus = "idle" | "sending" | "sent" | "error";
type AccountType = "coach" | "student" | "parent";
type CoachFlow = "signin" | "signup";

const rememberStorageKey = "gc.rememberMe";
const lastAppPathStorageKey = "gc.lastAppPath";

const isLikelyEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const resolveStoredAppPath = () => {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(lastAppPathStorageKey);
  if (!value) return null;
  if (!value.startsWith("/app")) return null;
  if (value.startsWith("//")) return null;
  if (value.includes("\\")) return null;
  return value;
};

export default function LoginClient({
  resetSuccess,
  nextPath,
  initialCoachFlow,
  initialAccountType,
  forcedAccountType,
  requireRoleSelection,
}: {
  resetSuccess: boolean;
  nextPath: string | null;
  initialCoachFlow: CoachFlow | null;
  initialAccountType: AccountType | null;
  forcedAccountType?: AccountType;
  requireRoleSelection?: boolean;
}) {
  const router = useRouter();
  const [sessionChecking, setSessionChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [rememberMe, setRememberMe] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.sessionStorage.getItem(rememberStorageKey) !== "false";
  });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [selectedAccountType, setSelectedAccountType] = useState<AccountType>(
    initialAccountType ?? forcedAccountType ?? "coach"
  );
  const accountType = forcedAccountType ?? selectedAccountType;
  const [coachFlow, setCoachFlow] = useState<CoachFlow>(initialCoachFlow ?? "signin");
  const [status, setStatus] = useState<Status>(() => (resetSuccess ? "sent" : "idle"));
  const [message, setMessage] = useState(() =>
    resetSuccess ? "Mot de passe mis a jour. Connectez-vous." : ""
  );

  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetStatus, setResetStatus] = useState<ResetStatus>("idle");
  const [resetMessage, setResetMessage] = useState("");
  const isAccountTypeLocked = Boolean(forcedAccountType);
  const startsWithRoleSelection =
    Boolean(requireRoleSelection) && !isAccountTypeLocked && !initialAccountType;
  const [roleSelected, setRoleSelected] = useState(!startsWithRoleSelection);
  const showRoleStep = !isAccountTypeLocked && !roleSelected;
  const parentSignupHref = nextPath
    ? `/signup/parent?next=${encodeURIComponent(nextPath)}`
    : "/signup/parent";
  const coachSignupReturnTo = nextPath
    ? `/login/coach?mode=signup&next=${encodeURIComponent(nextPath)}`
    : "/login/coach?mode=signup";
  const cguHref = `/cgu?returnTo=${encodeURIComponent(coachSignupReturnTo)}`;
  const cgvHref = `/cgv?returnTo=${encodeURIComponent(coachSignupReturnTo)}`;

  async function ensureProfile() {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      return { ok: false as const, error: "Session invalide.", role: null };
    }

    const response = await fetch("/api/onboarding/ensure-profile", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await response.json()) as { error?: string; role?: string };
    if (!response.ok) {
      return { ok: false as const, error: data.error ?? "Acces refuse.", role: null };
    }
    return { ok: true as const, role: data.role ?? null };
  }

  const resolveLoginTarget = useCallback(
    () => nextPath ?? resolveStoredAppPath(),
    [nextPath]
  );

  const buildRoleLoginHref = useCallback(
    (nextType: AccountType) => {
      const basePath =
        nextType === "coach"
          ? "/login/coach"
          : nextType === "student"
            ? "/login/eleve"
            : "/login/parent";
      const params = new URLSearchParams();
      if (nextPath) params.set("next", nextPath);
      if (nextType === "coach" && initialCoachFlow) {
        params.set("mode", initialCoachFlow);
      }
      const query = params.toString();
      return query ? `${basePath}?${query}` : basePath;
    },
    [initialCoachFlow, nextPath]
  );

  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      const session = await waitForRecoveredSession(supabase.auth, {
        timeoutMs: 1400,
      });
      if (!active) return;
      if (session) {
        const ensured = await ensureProfile();
        if (!active) return;
        if (!ensured.ok) {
          await supabase.auth.signOut();
          setStatus("error");
          setMessage(ensured.error ?? "Acces refuse.");
          setSessionChecking(false);
          return;
        }
        router.replace(
          resolveLoginTarget() ??
            resolvePostLoginPath({
              role: ensured.role,
              email: session.user.email ?? null,
            })
        );
        return;
      }
      setSessionChecking(false);
    };

    void checkSession();

    return () => {
      active = false;
    };
  }, [resolveLoginTarget, router]);

  const handleAccountTypeChange = (nextType: AccountType) => {
    if (isAccountTypeLocked) return;
    if (showRoleStep) {
      router.replace(buildRoleLoginHref(nextType));
      return;
    }
    setSelectedAccountType(nextType);
    setRoleSelected(true);
    if (nextType !== "coach") {
      setCoachFlow("signin");
      setAcceptTerms(false);
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

    router.replace(
      resolveLoginTarget() ??
        resolvePostLoginPath({
          role: ensured.role,
          email: trimmedEmail,
        })
    );
  };

  const signUpCoach = async (
    trimmedEmail: string,
    trimmedPassword: string,
    trimmedFullName: string
  ) => {
    const acceptedAt = new Date().toISOString();
    const emailRedirectTo = `${window.location.origin}/auth/callback`;
    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password: trimmedPassword,
      options: {
        emailRedirectTo,
        data: {
          role: "coach",
          full_name: trimmedFullName,
          locale: "fr",
          preferred_locale: "fr",
          terms_accepted: true,
          terms_accepted_at: acceptedAt,
          cgu_accepted: true,
          cgv_accepted: true,
        },
      },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    if (!data.session) {
      const loginTarget = resolveLoginTarget();
      const next = loginTarget ? `&next=${encodeURIComponent(loginTarget)}` : "";
      router.replace(`/auth/account?flow=coach&state=verify${next}`);
      return;
    }

    const ensured = await ensureProfile();
    if (!ensured.ok) {
      await supabase.auth.signOut();
      setStatus("error");
      setMessage(ensured.error ?? "Acces refuse.");
      return;
    }

    const loginTarget = resolveLoginTarget();
    const next = loginTarget ? `&next=${encodeURIComponent(loginTarget)}` : "";
    router.replace(`/auth/account?flow=coach&state=ready${next}`);
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
      if (!acceptTerms) {
        setStatus("error");
        setMessage("Tu dois accepter les CGU et CGV pour creer un compte.");
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
            {showRoleStep
              ? "Choisis d abord ton profil pour acceder au bon espace."
              : accountType === "student"
                ? "Acces eleve uniquement sur invitation."
                : accountType === "parent"
                  ? "Acces parent en lecture seule pour suivre vos enfants."
                  : "Choisis ton mode d acces."}
          </p>
          {showRoleStep ? (
            <div className="mt-6 grid gap-2">
              <button
                type="button"
                onClick={() => handleAccountTypeChange("coach")}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-white/25 hover:bg-white/10"
              >
                <span className="block text-sm font-semibold text-[var(--text)]">
                  Coach / Structure
                </span>
                <span className="mt-1 block text-xs text-[var(--muted)]">
                  Gestion du workspace coaching et des eleves.
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleAccountTypeChange("student")}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-white/25 hover:bg-white/10"
              >
                <span className="block text-sm font-semibold text-[var(--text)]">
                  Eleve
                </span>
                <span className="mt-1 block text-xs text-[var(--muted)]">
                  Acces eleve par invitation du coach.
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleAccountTypeChange("parent")}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-white/25 hover:bg-white/10"
              >
                <span className="block text-sm font-semibold text-[var(--text)]">
                  Parent
                </span>
                <span className="mt-1 block text-xs text-[var(--muted)]">
                  Suivi parent en lecture seule.
                </span>
              </button>
            </div>
          ) : null}
          {!isAccountTypeLocked && roleSelected ? (
            <div className="mt-6 grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-white/5 p-1 text-xs uppercase tracking-wide text-[var(--muted)]">
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
              <button
                type="button"
                onClick={() => handleAccountTypeChange("parent")}
                className={`rounded-xl px-3 py-2 transition ${
                  accountType === "parent"
                    ? "bg-white/15 text-[var(--text)]"
                    : "hover:text-[var(--text)]"
                }`}
              >
                Parent
              </button>
            </div>
          ) : null}
          {accountType === "coach" && roleSelected ? (
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/5 p-1 text-xs uppercase tracking-wide text-[var(--muted)]">
              <button
                type="button"
                onClick={() => {
                  setCoachFlow("signin");
                  setAcceptTerms(false);
                }}
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
          {roleSelected ? (
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
              {accountType === "coach" && coachFlow === "signup" ? (
                <label className="block text-xs text-[var(--muted)]">
                  <span className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={acceptTerms}
                      onChange={(event) => setAcceptTerms(event.target.checked)}
                      required
                      className="mt-0.5 h-4 w-4 rounded border-white/10 bg-[var(--bg-elevated)]"
                    />
                    <span>
                      J accepte les{" "}
                      <a
                        href={cguHref}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-[var(--text)] underline decoration-white/30 underline-offset-2 hover:decoration-white/70"
                      >
                        CGU
                      </a>{" "}
                      et les{" "}
                      <a
                        href={cgvHref}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-[var(--text)] underline decoration-white/30 underline-offset-2 hover:decoration-white/70"
                      >
                        CGV
                      </a>
                      .
                    </span>
                  </span>
                </label>
              ) : null}
              <button
                type="submit"
                disabled={status === "sending" || sessionChecking}
                className="w-full rounded-xl bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {status === "sending" || sessionChecking
                  ? "Traitement..."
                  : accountType === "coach" && coachFlow === "signup"
                    ? "Creer un compte coach"
                    : accountType === "student"
                      ? "Connexion eleve"
                      : accountType === "parent"
                        ? "Connexion parent"
                      : "Se connecter"}
              </button>
              {accountType === "parent" ? (
                <a
                  href={parentSignupHref}
                  className="block text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                >
                  Creer un compte parent
                </a>
              ) : null}
            </form>
          ) : null}
          {roleSelected ? (
            <button
              type="button"
              onClick={openResetModal}
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
          {showRoleStep
            ? "Selectionne ton profil pour acceder au bon parcours de connexion."
            : accountType === "student"
              ? "Un compte eleve est cree uniquement via une invitation coach."
              : accountType === "parent"
                ? "Un compte parent permet de consulter les espaces enfants en lecture seule."
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

      {sessionChecking ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1.5px]" />
          <div className="relative rounded-full border border-white/15 bg-[var(--bg-elevated)]/80 px-5 py-2 text-xs uppercase tracking-[0.22em] text-[var(--muted)]">
            Verification de la session...
          </div>
        </div>
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
