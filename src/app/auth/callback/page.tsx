"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { resolvePostLoginPath } from "@/lib/auth/post-login-path";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Signing you in...");

  useEffect(() => {
    let active = true;

    const completeSignIn = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!active) return;
        if (error) {
          setMessage("Sign-in failed. Please try again.");
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!active) return;

      if (data.session) {
        const token = data.session.access_token;
        const response = await fetch("/api/onboarding/ensure-profile", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = (await response.json()) as { error?: string; role?: string };
        if (!response.ok) {
          await supabase.auth.signOut();
          setMessage(payload.error ?? "Acces refuse.");
          return;
        }

        router.replace(
          resolvePostLoginPath({
            role: payload.role ?? null,
            email: data.session.user.email ?? null,
          })
        );
        return;
      }

      setMessage("No session found. Please sign in again.");
    };

    completeSignIn();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-[var(--text)]">
      <div className="panel rounded-3xl px-6 py-8">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
          Connexion
        </p>
        <h1 className="mt-3 text-2xl font-semibold">Validation du lien</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">{message}</p>
      </div>
    </main>
  );
}
