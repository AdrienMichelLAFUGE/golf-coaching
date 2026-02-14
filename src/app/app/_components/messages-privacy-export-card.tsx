"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function MessagesPrivacyExportCard() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportSuccess, setExportSuccess] = useState("");

  const handleExportMessages = async () => {
    setExporting(true);
    setExportError("");
    setExportSuccess("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setExportError("Session invalide. Reconnecte-toi.");
        return;
      }

      const response = await fetch("/api/messages/export", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          typeof payload?.error === "string"
            ? payload.error
            : "Export des donnees messagerie impossible.";
        setExportError(message);
        return;
      }

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `messages-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);

      setExportSuccess("Export telecharge avec succes.");
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "Export des donnees messagerie impossible."
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="panel rounded-2xl p-6">
      <h3 className="text-lg font-semibold text-[var(--text)]">Confidentialite</h3>
      <p className="mt-2 text-xs text-[var(--muted)]">
        Telecharge une copie JSON de tes conversations pour l&apos;acces a tes donnees.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleExportMessages()}
          disabled={exporting}
          className="rounded-full border border-white/10 bg-white/10 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20 disabled:opacity-60"
        >
          {exporting ? "Export..." : "Exporter mes donnees messagerie"}
        </button>
        <span className="text-xs text-[var(--muted)]">
          Format JSON, telechargement local.
        </span>
      </div>
      {exportError ? <p className="mt-3 text-sm text-red-400">{exportError}</p> : null}
      {exportSuccess ? <p className="mt-3 text-sm text-emerald-200">{exportSuccess}</p> : null}
    </section>
  );
}
