"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { supabase } from "@/lib/supabase/client";
import { resolvePostLoginPath } from "@/lib/auth/post-login-path";

const paramsSchema = z.object({
  flow: z.enum(["coach", "student", "parent"]).optional(),
  state: z.enum(["ready", "verify"]).optional(),
  next: z.string().optional(),
});

function AccountStatusContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sessionStatus, setSessionStatus] = useState<
    "idle" | "loading" | "ready" | "missing"
  >("idle");

  const parsed = useMemo(
    () =>
      paramsSchema.safeParse({
        flow: searchParams.get("flow") ?? undefined,
        state: searchParams.get("state") ?? undefined,
        next: searchParams.get("next") ?? undefined,
      }),
    [searchParams]
  );

  const flow = parsed.success ? (parsed.data.flow ?? "coach") : "coach";
  const state = parsed.success ? (parsed.data.state ?? "ready") : "ready";
  const flowLabel =
    flow === "student" ? "eleve" : flow === "parent" ? "parent" : "coach";
  const nextPath = (() => {
    if (!parsed.success) return null;
    const raw = parsed.data.next;
    if (!raw) return null;
    if (!raw.startsWith("/") || raw.startsWith("//")) return null;
    if (raw.includes("\\")) return null;
    return raw;
  })();

  const fallbackRole = flow === "student" ? "student" : flow === "parent" ? "parent" : "coach";
  const fallbackRedirectPath = nextPath ?? resolvePostLoginPath({ role: fallbackRole });

  useEffect(() => {
    if (state !== "ready") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const checkSession = async () => {
      setSessionStatus("loading");
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session) {
        setSessionStatus("ready");
        const redirectPath =
          nextPath ??
          resolvePostLoginPath({
            role: fallbackRole,
            email: data.session.user.email ?? null,
          });
        timer = setTimeout(() => router.replace(redirectPath), 1200);
        return;
      }
      setSessionStatus("missing");
    };

    void checkSession();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [router, state, nextPath, fallbackRole]);

  const headline = state === "verify" ? "Compte cree" : "Compte pret, connexion en cours";
  const description =
    state === "verify"
      ? `Ton compte ${flowLabel} est cree. Verifie ton email puis connecte-toi.`
      : sessionStatus === "missing"
        ? "Session introuvable. Connecte-toi pour continuer."
        : `Ton compte ${flowLabel} est pret. Nous finalisons la connexion.`;

  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-[var(--text)]">
      <div className="panel rounded-3xl px-6 py-8">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
          Compte {flowLabel}
        </p>
        <h1 className="mt-3 text-2xl font-semibold">{headline}</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">{description}</p>
        {state === "ready" && sessionStatus === "loading" ? (
          <p className="mt-2 text-xs text-[var(--muted)]">
            Verification de la session...
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          {state === "verify" || sessionStatus === "missing" ? (
            <button
              type="button"
              onClick={() => {
                const next = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
                router.replace(`/login${next}`);
              }}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--text)]"
            >
              Retour a la connexion
            </button>
          ) : (
            <button
              type="button"
              onClick={() => router.replace(fallbackRedirectPath)}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--text)]"
            >
              Acceder a l app
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

export default function AccountStatusPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center px-6 text-[var(--text)]">
          <div className="panel rounded-3xl px-6 py-8">
            <p className="text-sm text-[var(--muted)]">Chargement du statut...</p>
          </div>
        </main>
      }
    >
      <AccountStatusContent />
    </Suspense>
  );
}
