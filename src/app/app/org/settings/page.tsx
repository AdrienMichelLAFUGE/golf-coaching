"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/lib/supabase/client";
import RoleGuard from "../../_components/role-guard";
import PageBack from "../../_components/page-back";
import PageHeader from "../../_components/page-header";
import { useProfile } from "../../_components/profile-context";
import Badge from "../../_components/badge";

const OrgSettingsResponseSchema = z.object({
  organization: z.object({
    id: z.string().uuid(),
    name: z.string().nullable(),
    workspaceType: z.literal("org"),
    planTier: z.string().nullable(),
  }),
  canEdit: z.boolean(),
});

type OrgSettingsResponse = z.infer<typeof OrgSettingsResponseSchema>;

export default function OrgSettingsPage() {
  const { organization, workspaceType, refresh } = useProfile();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [settings, setSettings] = useState<OrgSettingsResponse | null>(null);
  const [orgName, setOrgName] = useState("");

  const modeLabel = useMemo(
    () =>
      (organization?.workspace_type ?? "personal") === "org"
        ? `Organisation : ${organization?.name ?? "Organisation"}`
        : "Espace personnel",
    [organization?.name, organization?.workspace_type]
  );

  const loadSettings = async () => {
    setLoading(true);
    setError("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Session invalide.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/orgs/settings", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : "Chargement impossible.";
      setError(message);
      setLoading(false);
      return;
    }

    const parsed = OrgSettingsResponseSchema.safeParse(payload);
    if (!parsed.success) {
      setError("Reponse reglage invalide.");
      setLoading(false);
      return;
    }

    setSettings(parsed.data);
    setOrgName(parsed.data.organization.name ?? "");
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      void loadSettings();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    const trimmedName = orgName.trim();
    if (!trimmedName) {
      setError("Le nom de l organisation est obligatoire.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Session invalide.");
      setSaving(false);
      return;
    }

    const response = await fetch("/api/orgs/settings", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: trimmedName }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : "Mise a jour impossible.";
      setError(message);
      setSaving(false);
      return;
    }

    setSuccess("Nom de l organisation mis a jour.");
    await refresh();
    await loadSettings();
    setSaving(false);
  };

  return (
    <RoleGuard allowedRoles={["owner", "coach", "staff"]}>
      <div className="space-y-6">
        <PageHeader
          overline={
            <div className="flex items-center gap-2">
              <PageBack fallbackHref="/app/org" />
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                Organisation
              </p>
            </div>
          }
          title="Reglages organisation"
          subtitle="Parametrez votre organisation et le nom visible dans le workspace."
          meta={
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-emerald-300/30 bg-emerald-400/10 text-emerald-100">
                {modeLabel}
              </Badge>
              {settings?.organization.planTier ? (
                <Badge tone="muted">Plan {settings.organization.planTier}</Badge>
              ) : null}
            </div>
          }
        />

        {workspaceType !== "org" ? (
          <section className="panel rounded-2xl p-6 text-sm text-[var(--muted)]">
            Cette page est disponible uniquement en workspace organisation.
          </section>
        ) : (
          <section className="panel rounded-2xl border border-white/10 p-6">
            {loading ? (
              <p className="text-sm text-[var(--muted)]">Chargement...</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Nom de l organisation
                  </label>
                  <input
                    value={orgName}
                    onChange={(event) => setOrgName(event.target.value)}
                    disabled={saving || !settings?.canEdit}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500 focus:border-[var(--accent)] focus:outline-none disabled:opacity-60"
                    placeholder="Ex: AS Golf de la Cote"
                  />
                </div>
                {!settings?.canEdit ? (
                  <p className="text-sm text-amber-300">
                    Vous etes en lecture seule. Seul un admin organisation peut modifier ces
                    reglages.
                  </p>
                ) : null}
                {error ? <p className="text-sm text-red-400">{error}</p> : null}
                {success ? <p className="text-sm text-emerald-300">{success}</p> : null}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !settings?.canEdit || !orgName.trim()}
                    className="rounded-xl bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-5 py-2 text-sm font-semibold text-zinc-900 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? "Sauvegarde..." : "Sauvegarder"}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </RoleGuard>
  );
}

