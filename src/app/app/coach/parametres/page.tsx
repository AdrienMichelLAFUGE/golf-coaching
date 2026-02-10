"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { PLAN_ENTITLEMENTS } from "@/lib/plans";
import RoleGuard from "../../_components/role-guard";
import { useProfile } from "../../_components/profile-context";
import PageBack from "../../_components/page-back";
import PremiumOfferModal from "../../_components/premium-offer-modal";
import PageHeader from "../../_components/page-header";
import { z } from "zod";

type ProfileSettings = {
  id: string;
  org_id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
};

type OrganizationSettings = {
  id: string;
  name: string | null;
  logo_url: string | null;
  accent_color: string | null;
  email_sender_name: string | null;
  email_reply_to: string | null;
  report_title_template: string | null;
  report_signature: string | null;
  report_default_sections: string[] | null;
  locale: string | null;
  timezone: string | null;
  plan_tier?: string | null;
  ai_enabled: boolean | null;
  ai_model: string | null;
  ai_tone: string | null;
  ai_tech_level: string | null;
  ai_style: string | null;
  ai_length: string | null;
  ai_imagery: string | null;
  ai_focus: string | null;
  stripe_status?: string | null;
  stripe_current_period_end?: string | null;
  stripe_cancel_at_period_end?: boolean | null;
  stripe_customer_id?: string | null;
};

const STORAGE_BUCKET = "coach-assets";

const normalizeSections = (value: string) => {
  const seen = new Set<string>();
  const output: string[] = [];
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((section) => {
      const key = section.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      output.push(section);
    });
  return output;
};

export default function CoachSettingsPage() {
  const { refresh, planTier } = useProfile();
  const [profile, setProfile] = useState<ProfileSettings | null>(null);
  const [organization, setOrganization] = useState<OrganizationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [premiumModalOpen, setPremiumModalOpen] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState("");

  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bio, setBio] = useState("");
  const [orgName, setOrgName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [accentColor, setAccentColor] = useState("#6ee7b7");
  const [emailSender, setEmailSender] = useState("");
  const [emailReplyTo, setEmailReplyTo] = useState("");
  const [reportTitleTemplate, setReportTitleTemplate] = useState("");
  const [reportSignature, setReportSignature] = useState("");
  const [reportDefaultSections, setReportDefaultSections] = useState("");
  const [locale, setLocale] = useState("fr-FR");
  const [timezone, setTimezone] = useState("Europe/Paris");
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiModel, setAiModel] = useState("gpt-5-mini");
  const [aiTone, setAiTone] = useState("bienveillant");
  const [aiTechLevel, setAiTechLevel] = useState("intermediaire");
  const [aiStyle, setAiStyle] = useState("redactionnel");
  const [aiLength, setAiLength] = useState("normal");
  const [aiImagery, setAiImagery] = useState("equilibre");
  const [aiFocus, setAiFocus] = useState("mix");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [avatarDragging, setAvatarDragging] = useState(false);
  const [logoDragging, setLogoDragging] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [resetStatus, setResetStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [resetMessage, setResetMessage] = useState("");

  const previewSections = useMemo(
    () => normalizeSections(reportDefaultSections),
    [reportDefaultSections]
  );
  const entitlements = PLAN_ENTITLEMENTS[planTier];
  const aiLocked = !entitlements.aiEnabled;
  const openPremiumModal = () => setPremiumModalOpen(true);
  const closePremiumModal = () => setPremiumModalOpen(false);
  const showPaymentIssue = organization?.stripe_status === "past_due";
  const billingEndLabel = (() => {
    if (!organization?.stripe_cancel_at_period_end) return null;
    if (!organization?.stripe_current_period_end) return null;
    const parsed = new Date(organization.stripe_current_period_end);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: timezone,
    }).format(parsed);
  })();

  const handleOpenPortal = async () => {
    setBillingLoading(true);
    setBillingError("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setBillingError("Session invalide. Reconnecte toi.");
      setBillingLoading(false);
      return;
    }

    const response = await fetch("/api/billing/portal", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json()) as { url?: string; error?: string };

    if (!response.ok || !payload.url) {
      setBillingError(payload.error ?? "Impossible d ouvrir la page Stripe.");
      setBillingLoading(false);
      return;
    }

    window.location.assign(payload.url);
  };

  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true);
      setError("");

      const { data: userData, error: userError } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (userError || !userId) {
        setError("Session invalide. Reconnecte toi.");
        setLoading(false);
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, org_id, full_name, avatar_url, bio")
        .eq("id", userId)
        .maybeSingle();

      if (profileError || !profileData) {
        setError(profileError?.message ?? "Profil introuvable.");
        setLoading(false);
        return;
      }

      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .select(
          "id, name, logo_url, accent_color, email_sender_name, email_reply_to, report_title_template, report_signature, report_default_sections, locale, timezone, plan_tier, ai_enabled, ai_model, ai_tone, ai_tech_level, ai_style, ai_length, ai_imagery, ai_focus, stripe_status, stripe_current_period_end, stripe_cancel_at_period_end, stripe_customer_id"
        )
        .eq("id", profileData.org_id)
        .maybeSingle();

      if (orgError || !orgData) {
        setError(orgError?.message ?? "Organisation introuvable.");
        setLoading(false);
        return;
      }

      setProfile(profileData);
      setOrganization(orgData);

      setFullName(profileData.full_name ?? "");
      setAvatarUrl(profileData.avatar_url ?? "");
      setBio(profileData.bio ?? "");
      setOrgName(orgData.name ?? "");
      setLogoUrl(orgData.logo_url ?? "");
      setAccentColor(orgData.accent_color ?? "#6ee7b7");
      setEmailSender(orgData.email_sender_name ?? "");
      setEmailReplyTo(orgData.email_reply_to ?? "");
      setReportTitleTemplate(orgData.report_title_template ?? "");
      setReportSignature(orgData.report_signature ?? "");
      setReportDefaultSections((orgData.report_default_sections ?? []).join("\n"));
      setLocale(orgData.locale ?? "fr-FR");
      setTimezone(orgData.timezone ?? "Europe/Paris");
      setAiEnabled(orgData.ai_enabled ?? false);
      setAiModel(orgData.ai_model ?? "gpt-5-mini");
      setAiTone(orgData.ai_tone ?? "bienveillant");
      setAiTechLevel(orgData.ai_tech_level ?? "intermediaire");
      setAiStyle(orgData.ai_style ?? "redactionnel");
      setAiLength(orgData.ai_length ?? "normal");
      setAiImagery(orgData.ai_imagery ?? "equilibre");
      setAiFocus(orgData.ai_focus ?? "mix");

      setLoading(false);
    };

    loadSettings();
  }, []);

  const uploadAsset = async (file: File, kind: "avatar" | "logo") => {
    if (!profile || !organization) return;
    if (!file.type.startsWith("image/")) {
      setError("Selectionne un fichier image.");
      return;
    }

    setError("");
    setSuccess("");
    if (kind === "avatar") {
      setUploadingAvatar(true);
    } else {
      setUploadingLogo(true);
    }

    const ext = file.name.split(".").pop() || "png";
    const filePath =
      kind === "avatar"
        ? `profiles/${profile.id}/avatar.${ext}`
        : `organizations/${organization.id}/logo.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      setError(uploadError.message);
      if (kind === "avatar") {
        setUploadingAvatar(false);
      } else {
        setUploadingLogo(false);
      }
      return;
    }

    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    if (kind === "avatar") {
      setAvatarUrl(data.publicUrl);
      setUploadingAvatar(false);
    } else {
      setLogoUrl(data.publicUrl);
      setUploadingLogo(false);
    }

    setSuccess("Image chargee. Pense a sauvegarder.");
  };

  const handleFileInput = (files: FileList | null, kind: "avatar" | "logo") => {
    const file = files?.[0];
    if (!file) return;
    uploadAsset(file, kind);
  };

  const handleDrop = (
    event: React.DragEvent<HTMLDivElement>,
    kind: "avatar" | "logo"
  ) => {
    event.preventDefault();
    if (kind === "avatar") {
      setAvatarDragging(false);
    } else {
      setLogoDragging(false);
    }
    handleFileInput(event.dataTransfer.files, kind);
  };

  const handleSave = async () => {
    if (!profile || !organization) return;

    setSaving(true);
    setError("");
    setSuccess("");

    const sections = normalizeSections(reportDefaultSections);

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        bio: bio.trim() || null,
      })
      .eq("id", profile.id);

    if (profileError) {
      setError(profileError.message);
      setSaving(false);
      return;
    }

    const { error: orgError } = await supabase
      .from("organizations")
      .update({
        name: orgName.trim() || null,
        logo_url: logoUrl.trim() || null,
        accent_color: accentColor.trim() || null,
        email_sender_name: emailSender.trim() || null,
        email_reply_to: emailReplyTo.trim() || null,
        report_title_template: reportTitleTemplate.trim() || null,
        report_signature: reportSignature.trim() || null,
        report_default_sections: sections.length ? sections : null,
        locale,
        timezone,
        ai_enabled: aiEnabled,
        ai_model: aiModel.trim() || null,
        ai_tone: aiTone,
        ai_tech_level: aiTechLevel,
        ai_style: aiStyle,
        ai_length: aiLength,
        ai_imagery: aiImagery,
        ai_focus: aiFocus,
      })
      .eq("id", organization.id);

    if (orgError) {
      setError(orgError.message);
      setSaving(false);
      return;
    }

    await refresh();
    setSuccess("Parametres sauvegardes.");
    setSaving(false);
  };

  const handleSendPasswordReset = async () => {
    setResetStatus("sending");
    setResetMessage("");

    const { data: userData, error: userError } = await supabase.auth.getUser();
    const email = userData.user?.email ?? "";
    const parsedEmail = z.string().email().safeParse(email);

    if (userError || !parsedEmail.success) {
      setResetStatus("error");
      setResetMessage("Email du compte introuvable. Reconnecte toi.");
      return;
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(parsedEmail.data, {
      redirectTo: `${window.location.origin}/auth/reset`,
    });

    if (resetError) {
      setResetStatus("error");
      setResetMessage(resetError.message);
      return;
    }

    setResetStatus("sent");
    setResetMessage("Email de reinitialisation envoye.");
  };

  return (
    <RoleGuard allowedRoles={["owner", "coach", "staff"]}>
      {loading ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-[var(--muted)]">Chargement...</p>
        </section>
      ) : error ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-red-400">{error}</p>
        </section>
      ) : (
        <div className="space-y-6">
          <PageHeader
            overline={
              <div className="flex items-center gap-2">
                <PageBack />
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                  Parametres coach
                </p>
              </div>
            }
            title="Identite et branding"
            subtitle="Configure ton profil, ton organisation et les rapports."
          />

          <section className="panel rounded-2xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                  Abonnement
                </p>
                <h3 className="mt-2 text-lg font-semibold text-[var(--text)]">
                  Plan {PLAN_ENTITLEMENTS[planTier].label}
                </h3>
                {billingEndLabel ? (
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Actif jusqu au {billingEndLabel}.
                  </p>
                ) : null}
                {showPaymentIssue ? (
                  <p className="mt-2 text-xs text-amber-200">
                    Paiement en attente. Pense a mettre a jour ton moyen de paiement.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {planTier === "pro" ? (
                  <button
                    type="button"
                    onClick={handleOpenPortal}
                    disabled={billingLoading || !organization?.stripe_customer_id}
                    className={`rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-400/20 ${
                      billingLoading || !organization?.stripe_customer_id
                        ? "cursor-not-allowed opacity-60"
                        : ""
                    }`}
                  >
                    {billingLoading ? "Ouverture..." : "Gerer mon abonnement"}
                  </button>
                ) : planTier === "free" ? (
                  <button
                    type="button"
                    onClick={openPremiumModal}
                    className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-400/20"
                  >
                    Passer Pro
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="cursor-not-allowed rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]"
                  >
                    Sur mesure
                  </button>
                )}
              </div>
            </div>
            {billingError ? (
              <p className="mt-3 text-xs text-amber-200">{billingError}</p>
            ) : null}
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <div className="panel rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-[var(--text)]">Profil coach</h3>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Nom affiche
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Adrien Lafuge"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Photo de profil
                  </label>
                  <div
                    onDragOver={(event) => event.preventDefault()}
                    onDragEnter={() => setAvatarDragging(true)}
                    onDragLeave={() => setAvatarDragging(false)}
                    onDrop={(event) => handleDrop(event, "avatar")}
                    className={`mt-2 rounded-2xl border border-dashed px-4 py-3 transition ${
                      avatarDragging
                        ? "border-[var(--accent)] bg-[var(--accent)]/10"
                        : "border-white/10 bg-white/5"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-4">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt="Photo de profil"
                          className="h-14 w-14 rounded-full border border-white/10 object-cover"
                        />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/10 text-xs text-[var(--muted)]">
                          Photo
                        </div>
                      )}
                      <div className="space-y-1 text-xs text-[var(--muted)]">
                        <p>Glisse une image ici.</p>
                        <button
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
                        >
                          Parcourir
                        </button>
                        <p className="text-[0.65rem]">PNG ou JPG, 2 Mo max.</p>
                      </div>
                    </div>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        handleFileInput(event.target.files, "avatar");
                        event.currentTarget.value = "";
                      }}
                      className="hidden"
                    />
                  </div>
                  {uploadingAvatar ? (
                    <p className="mt-2 text-xs text-[var(--muted)]">Upload en cours...</p>
                  ) : null}
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Bio courte
                  </label>
                  <textarea
                    rows={4}
                    value={bio}
                    onChange={(event) => setBio(event.target.value)}
                    placeholder="Coach golf, specialiste swing..."
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                  />
                </div>
              </div>
            </div>

            <div className="panel rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-[var(--text)]">Organisation</h3>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Nom de structure
                  </label>
                  <input
                    type="text"
                    value={orgName}
                    onChange={(event) => setOrgName(event.target.value)}
                    placeholder="OneGolf Academy"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Logo
                  </label>
                  <div
                    onDragOver={(event) => event.preventDefault()}
                    onDragEnter={() => setLogoDragging(true)}
                    onDragLeave={() => setLogoDragging(false)}
                    onDrop={(event) => handleDrop(event, "logo")}
                    className={`mt-2 rounded-2xl border border-dashed px-4 py-3 transition ${
                      logoDragging
                        ? "border-[var(--accent)] bg-[var(--accent)]/10"
                        : "border-white/10 bg-white/5"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-4">
                      {logoUrl ? (
                        <img
                          src={logoUrl}
                          alt="Logo organisation"
                          className="h-14 w-14 rounded-xl border border-white/10 object-cover"
                        />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-xs text-[var(--muted)]">
                          Logo
                        </div>
                      )}
                      <div className="space-y-1 text-xs text-[var(--muted)]">
                        <p>Glisse un logo ici.</p>
                        <button
                          type="button"
                          onClick={() => logoInputRef.current?.click()}
                          className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
                        >
                          Parcourir
                        </button>
                        <p className="text-[0.65rem]">PNG ou JPG, 2 Mo max.</p>
                      </div>
                    </div>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        handleFileInput(event.target.files, "logo");
                        event.currentTarget.value = "";
                      }}
                      className="hidden"
                    />
                  </div>
                  {uploadingLogo ? (
                    <p className="mt-2 text-xs text-[var(--muted)]">Upload en cours...</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      Couleur d accent
                    </label>
                    <input
                      type="text"
                      value={accentColor}
                      onChange={(event) => setAccentColor(event.target.value)}
                      placeholder="#6ee7b7"
                      className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                    />
                  </div>
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(event) => setAccentColor(event.target.value)}
                    className="mt-8 h-10 w-10 rounded-lg border border-white/10 bg-[var(--bg-elevated)]"
                    aria-label="Choisir la couleur d accent"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <div className="panel rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-[var(--text)]">Emails</h3>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Nom expediteur
                  </label>
                  <input
                    type="text"
                    value={emailSender}
                    onChange={(event) => setEmailSender(event.target.value)}
                    placeholder="Coach Adrien"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Email de reponse
                  </label>
                  <input
                    type="email"
                    value={emailReplyTo}
                    onChange={(event) => setEmailReplyTo(event.target.value)}
                    placeholder="contact@tonclub.fr"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                  />
                </div>
              </div>
            </div>

            <div className="panel rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-[var(--text)]">
                Langue et fuseau horaire
              </h3>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Langue
                  </label>
                  <select
                    value={locale}
                    onChange={(event) => setLocale(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                  >
                    <option value="fr-FR">Francais (France)</option>
                    <option value="fr-CA">Francais (Canada)</option>
                    <option value="en-US">Anglais (US)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Fuseau horaire
                  </label>
                  <select
                    value={timezone}
                    onChange={(event) => setTimezone(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                  >
                    <option value="Europe/Paris">Europe/Paris</option>
                    <option value="Europe/Brussels">Europe/Bruxelles</option>
                    <option value="Europe/Zurich">Europe/Zurich</option>
                    <option value="America/Montreal">America/Montreal</option>
                  </select>
                </div>
              </div>
            </div>
          </section>

          <section className="panel rounded-2xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-[var(--text)]">Assistant IA</h3>
              {aiLocked ? (
                <button
                  type="button"
                  onClick={openPremiumModal}
                  className="flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-1 text-[0.6rem] uppercase tracking-wide text-amber-200 transition hover:bg-amber-400/20"
                  aria-label="Voir les offres"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Plan requis
                </button>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Parametres par defaut utilises par l IA. Les actions IA sont reservees aux
              plans Pro/Entreprise.
            </p>
            <div className="relative mt-4">
              {aiLocked ? (
                <button
                  type="button"
                  onClick={openPremiumModal}
                  className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-[var(--overlay)] px-4 text-left backdrop-blur-sm"
                  aria-label="Voir les offres"
                >
                  <div className="flex w-full max-w-md items-center justify-between gap-4 rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-amber-200 shadow-[0_16px_40px_rgba(15,23,42,0.25)]">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-300/40 bg-amber-400/20">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="3" y="11" width="18" height="11" rx="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </span>
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em]">Assistant IA</p>
                        <p className="text-sm text-amber-100/80">
                          Debloque l IA complete (Pro/Entreprise)
                        </p>
                      </div>
                    </div>
                    <span className="rounded-full border border-amber-300/40 bg-amber-400/20 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-amber-200">
                      Voir les offres
                    </span>
                  </div>
                </button>
              ) : null}
              <div
                className={`grid gap-4 md:grid-cols-[1fr_1fr] ${
                  aiLocked ? "pointer-events-none opacity-60" : ""
                }`}
              >
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    IA active
                  </label>
                  <select
                    value={aiEnabled ? "on" : "off"}
                    onChange={(event) => setAiEnabled(event.target.value === "on")}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                  >
                    <option value="off">Desactive</option>
                    <option value="on">IA active</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Modele IA
                  </label>
                  <select
                    value={aiModel}
                    onChange={(event) => setAiModel(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                  >
                    <option value="gpt-5-mini">gpt-5-mini</option>
                    <option value="gpt-5">gpt-5</option>
                    <option value="gpt-5.2">gpt-5.2</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Ton
                  </label>
                  <select
                    value={aiTone}
                    onChange={(event) => setAiTone(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                  >
                    <option value="bienveillant">Bienveillant</option>
                    <option value="direct">Direct</option>
                    <option value="motivant">Motivant</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Technicite
                  </label>
                  <select
                    value={aiTechLevel}
                    onChange={(event) => setAiTechLevel(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                  >
                    <option value="debutant">Debutant</option>
                    <option value="intermediaire">Intermediaire</option>
                    <option value="avance">Avance</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Style
                  </label>
                  <select
                    value={aiStyle}
                    onChange={(event) => setAiStyle(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                  >
                    <option value="redactionnel">Redactionnel</option>
                    <option value="structure">Structure</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Longueur
                  </label>
                  <select
                    value={aiLength}
                    onChange={(event) => setAiLength(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                  >
                    <option value="court">Court</option>
                    <option value="normal">Normal</option>
                    <option value="long">Long</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Metaphores
                  </label>
                  <select
                    value={aiImagery}
                    onChange={(event) => setAiImagery(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                  >
                    <option value="faible">Faible</option>
                    <option value="equilibre">Equilibre</option>
                    <option value="fort">Fort</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Focus
                  </label>
                  <select
                    value={aiFocus}
                    onChange={(event) => setAiFocus(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                  >
                    <option value="mix">Mix</option>
                    <option value="technique">Technique</option>
                    <option value="mental">Mental</option>
                    <option value="strategie">Strategie</option>
                  </select>
                </div>
              </div>
            </div>
          </section>

          <section className="panel rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-[var(--text)]">
              Rapports par defaut
            </h3>
            <div className="mt-4 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-4">
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Modele de titre
                  </label>
                  <input
                    type="text"
                    value={reportTitleTemplate}
                    onChange={(event) => setReportTitleTemplate(event.target.value)}
                    placeholder="Bilan - {eleve} - {date}"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Signature
                  </label>
                  <textarea
                    rows={3}
                    value={reportSignature}
                    onChange={(event) => setReportSignature(event.target.value)}
                    placeholder="Coach Adrien - OneGolf"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Sections par defaut (1 par ligne)
                  </label>
                  <textarea
                    rows={6}
                    value={reportDefaultSections}
                    onChange={(event) => setReportDefaultSections(event.target.value)}
                    placeholder="Resume de la seance"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                  />
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  Apercu
                </p>
                <div className="mt-3 space-y-2 text-sm text-[var(--text)]">
                  {previewSections.length === 0 ? (
                    <p className="text-[var(--muted)]">Aucune section definie.</p>
                  ) : (
                    previewSections.map((section) => (
                      <div
                        key={section}
                        className="rounded-xl border border-white/5 bg-white/5 px-3 py-2"
                      >
                        {section}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="panel rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-[var(--text)]">Mot de passe</h3>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Reinitialise ton mot de passe via un email (procedure classique).
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSendPasswordReset}
                disabled={resetStatus === "sending"}
                className="rounded-full border border-white/10 bg-white/10 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20 disabled:opacity-60"
              >
                {resetStatus === "sending" ? "Envoi..." : "Reinitialiser"}
              </button>
              <span className="text-xs text-[var(--muted)]">
                Un email sera envoye a l adresse de votre compte.
              </span>
            </div>
            {resetMessage ? (
              <p
                className={`mt-3 text-sm ${
                  resetStatus === "error" ? "text-red-400" : "text-emerald-200"
                }`}
              >
                {resetMessage}
              </p>
            ) : null}
          </section>

          <section className="panel-soft rounded-2xl p-5">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
              >
                {saving ? "Sauvegarde..." : "Sauvegarder"}
              </button>
              {success ? (
                <span className="text-sm text-emerald-200">{success}</span>
              ) : null}
              {error ? <span className="text-sm text-red-400">{error}</span> : null}
            </div>
          </section>
          <PremiumOfferModal open={premiumModalOpen} onClose={closePremiumModal} />
        </div>
      )}
    </RoleGuard>
  );
}
