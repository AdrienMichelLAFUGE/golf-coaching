"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type EmailChangeSource = "old" | "new" | "unknown";
type EmailChangeContext = {
  oldEmail: string;
  newEmail: string;
};

type ViewState =
  | {
      status: "loading";
      message: string;
      currentEmail: string | null;
      oldEmail: string | null;
      newEmail: string | null;
    }
  | {
      status: "pending";
      message: string;
      currentEmail: string | null;
      oldEmail: string | null;
      newEmail: string | null;
    }
  | {
      status: "complete";
      message: string;
      currentEmail: string | null;
      oldEmail: string | null;
      newEmail: string | null;
    }
  | {
      status: "error";
      message: string;
      currentEmail: string | null;
      oldEmail: string | null;
      newEmail: string | null;
    };

const EMAIL_CHANGE_GLOBAL_STORAGE_KEY = "student-email-change-last";

const parseSource = (value: string | null): EmailChangeSource => {
  if (value === "old" || value === "new") return value;
  return "unknown";
};

const normalizeEmail = (value: string | null | undefined) =>
  (value ?? "").trim().toLowerCase();

const parseStoredEmailChangeContext = (): EmailChangeContext | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(EMAIL_CHANGE_GLOBAL_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as {
      oldEmail?: unknown;
      newEmail?: unknown;
    };
    const oldEmail =
      typeof parsed.oldEmail === "string" ? normalizeEmail(parsed.oldEmail) : "";
    const newEmail =
      typeof parsed.newEmail === "string" ? normalizeEmail(parsed.newEmail) : "";
    if (!oldEmail || !newEmail) {
      return null;
    }
    return { oldEmail, newEmail };
  } catch {
    return null;
  }
};

export default function EmailChangePage() {
  const router = useRouter();
  const [searchParams] = useState<URLSearchParams | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search);
  });
  const source = useMemo(
    () => parseSource(searchParams?.get("source") ?? null),
    [searchParams]
  );
  const legacyMessage = useMemo(
    () => (searchParams?.get("legacyMessage") ?? "").trim(),
    [searchParams]
  );
  const oldEmailFromUrl = useMemo(
    () => normalizeEmail(searchParams?.get("oldEmail")),
    [searchParams]
  );
  const newEmailFromUrl = useMemo(
    () => normalizeEmail(searchParams?.get("newEmail")),
    [searchParams]
  );

  const [viewState, setViewState] = useState<ViewState>({
    status: "loading",
    message: "Verification du lien en cours...",
    currentEmail: null,
    oldEmail: null,
    newEmail: null,
  });
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    let active = true;

    const resolveState = async () => {
      const contextFromStorage = parseStoredEmailChangeContext();
      const context: EmailChangeContext | null =
        oldEmailFromUrl && newEmailFromUrl
          ? {
              oldEmail: oldEmailFromUrl,
              newEmail: newEmailFromUrl,
            }
          : contextFromStorage;

      if (context && typeof window !== "undefined") {
        window.localStorage.setItem(
          EMAIL_CHANGE_GLOBAL_STORAGE_KEY,
          JSON.stringify({
            oldEmail: context.oldEmail,
            newEmail: context.newEmail,
          })
        );
      }

      const [{ data: sessionData, error: sessionError }, { data: userData, error: userError }] =
        await Promise.all([supabase.auth.getSession(), supabase.auth.getUser()]);
      if (!active) return;

      const user = userData.user ?? sessionData.session?.user ?? null;
      const authEmail = normalizeEmail(user?.email);
      const authPendingNewEmail = normalizeEmail(
        (user as { new_email?: string | null } | null)?.new_email
      );

      if ((sessionError || userError || !sessionData.session) && !user) {
        const normalizedLegacyMessage = legacyMessage.toLowerCase();
        if (
          normalizedLegacyMessage.includes("confirm link sent to the other email")
        ) {
          setViewState({
            status: "pending",
            message:
              "Lien valide. Une autre confirmation email reste a valider pour finaliser la modification.",
            currentEmail: null,
            oldEmail: context?.oldEmail ?? null,
            newEmail: context?.newEmail ?? null,
          });
          return;
        }

        setViewState({
          status: "error",
          message:
            "Session introuvable. Reconnecte-toi pour verifier l etat de ton changement d email.",
          currentEmail: null,
          oldEmail: context?.oldEmail ?? null,
          newEmail: context?.newEmail ?? null,
        });
        return;
      }

      if (context) {
        const isAuthOnNewEmail = authEmail === context.newEmail;
        if (source === "old") {
          if (isAuthOnNewEmail) {
            setViewState({
              status: "complete",
              message:
                "Vos emails sont bien valides, vous pouvez vous reconnecter avec votre nouvel email.",
              currentEmail: authEmail || context.newEmail,
              oldEmail: context.oldEmail,
              newEmail: context.newEmail,
            });
            return;
          }
          setViewState({
            status: "pending",
            message:
              "Vous venez de confirmer votre ancien email, il faut maintenant valider le nouvel email.",
            currentEmail: authEmail || context.oldEmail,
            oldEmail: context.oldEmail,
            newEmail: context.newEmail,
          });
          return;
        }
        if (source === "new") {
          if (isAuthOnNewEmail) {
            setViewState({
              status: "complete",
              message:
                "Nouvel email de connexion definitivement modifie. Reconnectez-vous maintenant.",
              currentEmail: authEmail || context.newEmail,
              oldEmail: context.oldEmail,
              newEmail: context.newEmail,
            });
            return;
          }
          setViewState({
            status: "pending",
            message:
              "Vous venez de confirmer votre nouvel email, il faut maintenant valider votre ancien email avant de pouvoir vous connecter avec votre nouvel email.",
            currentEmail: authEmail || context.oldEmail,
            oldEmail: context.oldEmail,
            newEmail: context.newEmail,
          });
          return;
        }

        if (authPendingNewEmail || authEmail === context.oldEmail) {
          setViewState({
            status: "pending",
            message:
              "Une confirmation email reste a valider avant de finaliser la modification.",
            currentEmail: authEmail || context.oldEmail,
            oldEmail: context.oldEmail,
            newEmail: context.newEmail,
          });
          return;
        }

        setViewState({
          status: "complete",
          message:
            "Vos emails sont bien valides, vous pouvez vous reconnecter avec votre nouvel email.",
          currentEmail: authEmail || context.newEmail,
          oldEmail: context.oldEmail,
          newEmail: context.newEmail,
        });
        return;
      }

      if (authPendingNewEmail) {
        setViewState({
          status: "pending",
          message:
            "Une confirmation email reste a valider avant de finaliser la modification.",
          currentEmail: authEmail || null,
          oldEmail: null,
          newEmail: authPendingNewEmail || null,
        });
        return;
      }

      setViewState({
        status: "complete",
        message:
          source === "new"
            ? "Nouvel email de connexion definitivement modifie. Reconnectez-vous maintenant."
            : "Vos emails sont bien valides, vous pouvez vous reconnecter avec votre nouvel email.",
        currentEmail: authEmail || null,
        oldEmail: null,
        newEmail: null,
      });
    };

    void resolveState();

    return () => {
      active = false;
    };
  }, [legacyMessage, newEmailFromUrl, oldEmailFromUrl, source]);

  const handleStudentReconnect = async () => {
    setReconnecting(true);
    await supabase.auth.signOut();
    router.replace("/login/eleve");
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10 text-[var(--text)]">
      <section className="panel w-full max-w-2xl rounded-3xl px-6 py-8">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Tempo IA</p>
        <h1 className="mt-3 text-2xl font-semibold">Mise a jour de ton email</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">{viewState.message}</p>

        <div className="mt-3 grid gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
          <p>
            Ancien email:{" "}
            <span className="font-semibold">{viewState.oldEmail ?? "indisponible"}</span>
          </p>
          <p>
            Nouvel email:{" "}
            <span className="font-semibold">{viewState.newEmail ?? "indisponible"}</span>
          </p>
          {viewState.currentEmail ? (
            <p>
              Email actif actuel:{" "}
              <span className="font-semibold">{viewState.currentEmail}</span>
            </p>
          ) : null}
        </div>

        {viewState.status === "complete" || viewState.status === "error" ? (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleStudentReconnect()}
              disabled={reconnecting}
              className="rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/15 px-5 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text)] transition hover:bg-[var(--accent)]/25 disabled:opacity-60"
            >
              {reconnecting ? "Redirection..." : "Connexion eleve"}
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
