"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import PremiumOfferModal from "../_components/premium-offer-modal";

const normalizeInterval = (value: string | null): "month" | "year" | undefined => {
  if (!value) return undefined;
  if (value === "year") return "year";
  if (value === "month") return "month";
  return undefined;
};

export default function AppPricingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(true);
  const [autoStatus, setAutoStatus] = useState<
    "idle" | "starting" | "error" | "done"
  >("idle");
  const [autoError, setAutoError] = useState("");
  const startedRef = useRef(false);

  const initialInterval = useMemo(
    () => normalizeInterval(searchParams.get("interval")),
    [searchParams]
  );
  const focusPlanBaseSlug = useMemo(() => {
    const plan = searchParams.get("plan");
    return plan ? plan.toLowerCase().trim() : undefined;
  }, [searchParams]);

  const autostartParam = useMemo(() => searchParams.get("autostart") === "1", [searchParams]);
  // Latch autostart on first render to avoid re-trigger loops if we later sanitize the URL.
  const [autostartMode] = useState(() => autostartParam);

  useEffect(() => {
    if (!autostartMode) return;

    // Remove autostart from the URL to avoid looping when the user navigates back from Stripe.
    // IMPORTANT: using the History API avoids triggering a Next.js navigation (which could
    // remount the page and cancel the autostart side-effect).
    const url = new URL(window.location.href);
    if (!url.searchParams.has("autostart")) return;
    url.searchParams.delete("autostart");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, [autostartMode, router]);

  const startCheckout = useCallback(async () => {
    setAutoStatus("starting");
    setAutoError("");

    const interval = initialInterval ?? "month";
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setAutoStatus("error");
      setAutoError("Session invalide. Reconnecte-toi.");
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);

    let response: Response;
    try {
      response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ interval }),
        signal: controller.signal,
      });
    } catch (err) {
      window.clearTimeout(timeout);
      setAutoStatus("error");
      setAutoError(
        err instanceof DOMException && err.name === "AbortError"
          ? "La requete a expire. Reessaie."
          : "Impossible de contacter le serveur."
      );
      return;
    } finally {
      window.clearTimeout(timeout);
    }

    let payload: unknown = null;
    try {
      payload = (await response.json()) as unknown;
    } catch {
      try {
        payload = await response.text();
      } catch {
        payload = null;
      }
    }

    const url =
      typeof payload === "object" &&
      payload !== null &&
      "url" in payload &&
      typeof (payload as { url?: unknown }).url === "string"
        ? (payload as { url: string }).url
        : null;
    const errorMessage =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : null;

    if (!response.ok || !url) {
      console.error("Checkout autostart failed.", {
        status: response.status,
        payload,
      });
      setAutoStatus("error");
      setAutoError(errorMessage ?? "Impossible d ouvrir Stripe.");
      return;
    }

    setAutoStatus("done");
    window.location.assign(url);
  }, [initialInterval]);

  useEffect(() => {
    if (!autostartMode) return;
    if (startedRef.current) return;

    // React Strict Mode runs effects twice in dev (mount -> cleanup -> mount).
    // If we mark started before the async tick, the first cleanup cancels the tick and
    // the second mount won't run it again. So we latch *inside* the tick.
    const handle = window.setTimeout(() => {
      if (startedRef.current) return;
      startedRef.current = true;
      void startCheckout();
    }, 0);

    return () => window.clearTimeout(handle);
  }, [autostartMode, startCheckout]);

  return (
    <div className="min-h-[70vh]">
      {autostartMode ? (
        <div className="mx-auto mt-10 w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-6 text-[var(--text)]">
          <p className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">
            Abonnement
          </p>
          <h1 className="mt-2 text-xl font-semibold">Redirection vers Stripe</h1>
          <p className="mt-3 text-sm text-[var(--muted)]">
            {autoStatus === "starting"
              ? "Nous preparons votre paiement..."
              : autoStatus === "error"
                ? autoError
                : "Ouverture de Stripe..."}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.replace("/app")}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--text)]"
            >
              Annuler
            </button>
            {autoStatus === "error" ? (
              <button
                type="button"
                onClick={() => {
                  startedRef.current = false;
                  setAutoStatus("idle");
                  setAutoError("");
                  void startCheckout();
                }}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--text)]"
              >
                Reessayer
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <PremiumOfferModal
        open={open && !autostartMode}
        onClose={() => {
          setOpen(false);
          router.replace("/app");
        }}
        initialInterval={initialInterval}
        focusPlanBaseSlug={focusPlanBaseSlug}
      />
    </div>
  );
}
