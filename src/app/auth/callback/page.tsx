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
      const flow = url.searchParams.get("flow");
      const next = url.searchParams.get("next");
      const clickedEmail = (url.searchParams.get("email") ?? "").trim().toLowerCase();
      const oldEmail = (url.searchParams.get("oldEmail") ?? "").trim().toLowerCase();
      const newEmail = (url.searchParams.get("newEmail") ?? "").trim().toLowerCase();
      const providerMessage = (url.searchParams.get("message") ?? "").trim();

      const withQueryParams = (path: string, params: Record<string, string>) => {
        const target = new URL(path, window.location.origin);
        for (const [key, value] of Object.entries(params)) {
          target.searchParams.set(key, value);
        }
        return `${target.pathname}${target.search}`;
      };

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

        if (flow === "email-change") {
          const defaultTarget = "/auth/email-change";
          const safeNext = next && next.startsWith("/") ? next : defaultTarget;
          const currentEmail = (data.session.user.email ?? "").trim().toLowerCase();
          const pendingNewEmail = (
            (data.session.user as { new_email?: string | null }).new_email ?? ""
          )
            .trim()
            .toLowerCase();

          const isEmailChangeScreen = safeNext.startsWith("/auth/email-change");
          if (!isEmailChangeScreen) {
            router.replace(withQueryParams(safeNext, { emailChange: "confirmed" }));
            return;
          }

          let source: "old" | "new" | "unknown" = "unknown";
          if (clickedEmail && pendingNewEmail && clickedEmail === pendingNewEmail) {
            source = "new";
          } else if (clickedEmail && currentEmail && clickedEmail === currentEmail) {
            source = "old";
          } else if (clickedEmail && !pendingNewEmail) {
            source = clickedEmail === currentEmail ? "new" : "old";
          }

          const nextParams: Record<string, string> = { source };
          if (oldEmail) {
            nextParams.oldEmail = oldEmail;
          }
          if (newEmail) {
            nextParams.newEmail = newEmail;
          }
          if (providerMessage) {
            nextParams.legacyMessage = providerMessage;
          }

          router.replace(
            withQueryParams("/auth/email-change", nextParams)
          );
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
