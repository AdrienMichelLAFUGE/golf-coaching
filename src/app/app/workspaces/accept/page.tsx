"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function WorkspaceInviteAcceptPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    const run = async () => {
      if (!token) {
        setStatus("error");
        setMessage("Invitation invalide.");
        return;
      }
      setStatus("loading");
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setStatus("error");
        setMessage("Connecte-toi pour accepter l invitation.");
        return;
      }

      const response = await fetch("/api/orgs/invitations/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ token }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setStatus("error");
        setMessage(payload.error ?? "Acceptation impossible.");
        return;
      }
      setStatus("done");
      setMessage("Invitation acceptee.");
      setTimeout(() => router.replace("/app"), 1200);
    };
    run();
  }, [token, router]);

  return (
    <section className="panel rounded-2xl p-6">
      <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
        Workspaces
      </p>
      <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
        Acceptation d invitation
      </h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        {status === "loading"
          ? "Traitement..."
          : message || "Verification en cours."}
      </p>
    </section>
  );
}
