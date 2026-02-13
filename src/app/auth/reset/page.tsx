"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { z } from "zod";

export const dynamic = "force-dynamic";

const flowSchema = z.enum(["student"]);

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "redirecting" | "error">("idle");
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const flowParam = searchParams.get("flow");
  const isStudentInvite = flowSchema.safeParse(flowParam).success;

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

    if (isStudentInvite) {
      router.replace("/auth/account?flow=student&state=ready");
      return;
    }

    // Recovery flow authenticates the user. Sign out so /login doesn't immediately redirect to /app.
    setStatus("redirecting");
    setMessage("Mot de passe mis a jour. Redirection...");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (token) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
    }
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setStatus("error");
      setMessage(signOutError.message);
      return;
    }
    router.replace("/login?reset=success");
  };

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 text-[var(--text)]">
        <div className="panel rounded-3xl px-6 py-8">
          <p className="text-sm text-[var(--muted)]">
            Preparation du lien de reinitialisation...
          </p>
          {message ? <p className="mt-3 text-sm text-red-400">{message}</p> : null}
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
              type={showPassword ? "text" : "password"}
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
              type={showPassword ? "text" : "password"}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(event) => setShowPassword(event.target.checked)}
              className="h-4 w-4 rounded border-white/10 bg-[var(--bg-elevated)]"
            />
            Afficher le mot de passe
          </label>
          <button
            type="submit"
            disabled={status === "saving" || status === "redirecting"}
            className="w-full rounded-xl bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
          >
            {status === "saving"
              ? "Enregistrement..."
              : status === "redirecting"
                ? "Redirection..."
                : "Mettre a jour"}
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
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center px-6 text-[var(--text)]">
          <div className="panel rounded-3xl px-6 py-8">
            <p className="text-sm text-[var(--muted)]">Chargement du formulaire...</p>
          </div>
        </main>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
