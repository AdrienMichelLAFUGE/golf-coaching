"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { PLAN_ENTITLEMENTS } from "@/lib/plans";
import Badge from "../../_components/badge";
import RoleGuard from "../../_components/role-guard";
import { useProfile } from "../../_components/profile-context";
import PageBack from "../../_components/page-back";
import PremiumOfferModal from "../../_components/premium-offer-modal";
import PageHeader from "../../_components/page-header";
import MessagesPrivacyExportCard from "../../_components/messages-privacy-export-card";
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

type AiBudgetSummary = {
  enabled: boolean;
  monthly_budget_cents: number | null;
  spent_cents_current_month: number;
  topup_cents_current_month: number;
  topup_carryover_cents?: number;
  topup_remaining_cents_current_month?: number;
  base_remaining_cents_current_month?: number;
  available_cents_current_month: number | null;
  remaining_cents_current_month: number | null;
  usage_percent_current_month: number | null;
  month_key: string;
  window_kind?: "calendar_month" | "sliding_pro";
  window_days?: number | null;
  window_start_iso?: string;
  window_end_iso?: string;
  quota_reset_at_iso?: string;
};

const STORAGE_BUCKET = "coach-assets";
const AI_TOPUP_OPTIONS_CENTS = [500, 1000, 2000] as const;
const AI_TOPUP_FIXED_ACTIONS_BY_CENTS: Record<number, number> = {
  500: 150,
  1000: 350,
  2000: 800,
};
const AVERAGE_AI_ACTION_COST_USD = 0.017;

type TopupValidationState = "idle" | "validating" | "pending" | "success";

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
  const [aiBudgetSummary, setAiBudgetSummary] = useState<AiBudgetSummary | null>(null);
  const [aiBudgetLoading, setAiBudgetLoading] = useState(false);
  const [aiBudgetError, setAiBudgetError] = useState("");
  const [topupLoadingCents, setTopupLoadingCents] = useState<number | null>(null);
  const [topupValidationState, setTopupValidationState] =
    useState<TopupValidationState>("idle");
  const [topupValidationActions, setTopupValidationActions] = useState<number | null>(
    null
  );

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
  const formatEuro = (cents: number) =>
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  const usageWindowLabel = useMemo(() => {
    const windowDays = aiBudgetSummary?.window_days ?? null;
    const windowStartRaw = aiBudgetSummary?.window_start_iso ?? null;
    const windowEndRaw = aiBudgetSummary?.window_end_iso ?? null;
    if (windowDays && windowDays > 0 && windowStartRaw && windowEndRaw) {
      const start = new Date(windowStartRaw);
      const end = new Date(windowEndRaw);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        const formatDate = new Intl.DateTimeFormat(locale, {
          dateStyle: "short",
          timeZone: "UTC",
        });
        return `periode active (${formatDate.format(start)} - ${formatDate.format(end)})`;
      }
      return "periode active";
    }

    const monthKey = aiBudgetSummary?.month_key;
    if (!monthKey) {
      return new Date().toLocaleDateString("fr-FR", {
        month: "long",
        year: "numeric",
      });
    }
    const [yearRaw, monthRaw] = monthKey.split("-");
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return monthKey;
    }
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }, [
    aiBudgetSummary?.month_key,
    aiBudgetSummary?.window_days,
    aiBudgetSummary?.window_start_iso,
    aiBudgetSummary?.window_end_iso,
    locale,
  ]);
  const usagePercent = aiBudgetSummary?.usage_percent_current_month ?? null;
  const quotaResetLabel = useMemo(() => {
    const resetRaw =
      aiBudgetSummary?.quota_reset_at_iso ?? aiBudgetSummary?.window_end_iso ?? null;
    if (!resetRaw) return null;
    const parsed = new Date(resetRaw);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: timezone,
    }).format(parsed);
  }, [
    aiBudgetSummary?.quota_reset_at_iso,
    aiBudgetSummary?.window_end_iso,
    locale,
    timezone,
  ]);
  const estimateActions = (amountCents: number) => {
    if (amountCents <= 0) return 0;
    const amountUsdEstimate = amountCents / 100;
    return Math.max(1, Math.round(amountUsdEstimate / AVERAGE_AI_ACTION_COST_USD));
  };
  const estimateTopupActions = (amountCents: number) => {
    if (amountCents <= 0) return 0;
    const fixed = AI_TOPUP_FIXED_ACTIONS_BY_CENTS[amountCents];
    if (typeof fixed === "number") return fixed;
    return Math.max(0, Math.round((amountCents * 150) / 500));
  };
  const formatActions = (count: number) => `${count.toLocaleString("fr-FR")} actions`;
  const confettiPieces = useMemo(
    () =>
      Array.from({ length: 30 }, (_, index) => ({
        id: index,
        left: `${((index * 17) % 100) + 1}%`,
        delay: `${(index % 10) * 0.08}s`,
        duration: `${2.8 + (index % 5) * 0.25}s`,
        rotate: `${(index * 29) % 360}deg`,
        color:
          index % 4 === 0
            ? "#34d399"
            : index % 4 === 1
              ? "#facc15"
              : index % 4 === 2
                ? "#60a5fa"
                : "#fb7185",
      })),
    []
  );
  const showTopupValidationModal =
    topupValidationState === "validating" ||
    topupValidationState === "success" ||
    topupValidationState === "pending";
  const creditedActionsLabel =
    topupValidationActions && topupValidationActions > 0
      ? `${topupValidationActions.toLocaleString("fr-FR")} credits`
      : "nouveaux credits";
  const loadAiBudgetSummary = useCallback(async (token: string) => {
    setAiBudgetLoading(true);
    setAiBudgetError("");
    const response = await fetch("/api/coach/ai-budget", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json()) as {
      summary?: AiBudgetSummary;
      error?: string;
    };

    if (!response.ok || !payload.summary) {
      setAiBudgetError(payload.error ?? "Chargement du quota IA impossible.");
      setAiBudgetLoading(false);
      return;
    }

    setAiBudgetSummary(payload.summary);
    setAiBudgetLoading(false);
  }, []);

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

  const handleAiTopupCheckout = async (amountCents: number) => {
    if (!aiBudgetSummary?.enabled) {
      setAiBudgetError("Quota IA desactive. Contacte ton administrateur.");
      return;
    }

    const accepted = window.confirm(`Confirmer une recharge de ${formatEuro(amountCents)} ?`);
    if (!accepted) return;

    setTopupLoadingCents(amountCents);
    setTopupValidationState("idle");
    setTopupValidationActions(null);
    setAiBudgetError("");
    setSuccess("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setAiBudgetError("Session invalide. Reconnecte toi.");
        return;
      }

      const response = await fetch("/api/coach/ai-budget/topup-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount_cents: amountCents,
        }),
      });

      const payload = (await response.json()) as { error?: string; url?: string };
      if (!response.ok) {
        setAiBudgetError(payload.error ?? "Creation checkout recharge impossible.");
        return;
      }
      if (!payload.url) {
        setAiBudgetError("URL checkout Stripe manquante.");
        return;
      }

      window.location.assign(payload.url);
    } finally {
      setTopupLoadingCents(null);
    }
  };

  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true);
      setError("");
      setAiBudgetError("");

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? null;

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

      if (token) {
        await loadAiBudgetSummary(token);
      } else {
        setAiBudgetSummary(null);
        setAiBudgetError("Session invalide. Reconnecte toi.");
      }

      setLoading(false);
    };

    loadSettings();
  }, [loadAiBudgetSummary]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const topup = params.get("topup");
    const checkoutSessionId = params.get("session_id");
    if (topup !== "success" && topup !== "cancel") {
      return;
    }

    const notify = async () => {
      if (topup === "success") {
        setTopupValidationState("validating");
        setTopupValidationActions(null);
        const validationStartedAt = Date.now();
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token ?? null;
        setAiBudgetError("");
        if (!token) {
          setAiBudgetError("Session invalide. Reconnecte toi.");
          setTopupValidationState("idle");
          return;
        }

        if (checkoutSessionId) {
          const confirmResponse = await fetch("/api/coach/ai-budget/topup-confirm", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              session_id: checkoutSessionId,
            }),
          });
          const confirmPayload = (await confirmResponse.json()) as {
            status?: "credited" | "already_credited" | "pending";
            error?: string;
            amount_cents?: number;
          };
          const elapsedMs = Date.now() - validationStartedAt;
          if (elapsedMs < 1200) {
            await new Promise((resolve) => window.setTimeout(resolve, 1200 - elapsedMs));
          }

          if (!confirmResponse.ok && confirmPayload.status !== "pending") {
            setAiBudgetError(
              confirmPayload.error ?? "Confirmation recharge impossible."
            );
            setTopupValidationState("idle");
          } else if (confirmPayload.status === "pending") {
            setSuccess("Paiement confirme. Recharge en attente de validation.");
            setTopupValidationState("pending");
          } else if (confirmPayload.status === "already_credited") {
            setSuccess("Recharge IA deja prise en compte.");
            const creditedActions = estimateTopupActions(
              Number(confirmPayload.amount_cents ?? 0)
            );
            setTopupValidationActions(creditedActions > 0 ? creditedActions : null);
            setTopupValidationState("success");
          } else {
            setSuccess("Recharge IA creditee.");
            const creditedActions = estimateTopupActions(
              Number(confirmPayload.amount_cents ?? 0)
            );
            setTopupValidationActions(creditedActions > 0 ? creditedActions : null);
            setTopupValidationState("success");
          }
        } else {
          setSuccess("Paiement recharge confirme.");
          setTopupValidationState("success");
        }

        if (token) {
          await loadAiBudgetSummary(token);
        }
      } else {
        setAiBudgetError("Paiement recharge annule.");
        setTopupValidationState("idle");
      }
    };
    void notify();

    params.delete("topup");
    params.delete("session_id");
    const queryString = params.toString();
    const nextUrl = queryString
      ? `${window.location.pathname}?${queryString}`
      : window.location.pathname;
    window.history.replaceState({}, "", nextUrl);
  }, [loadAiBudgetSummary]);

  useEffect(() => {
    if (topupValidationState !== "success" && topupValidationState !== "pending") return;
    const timer = window.setTimeout(() => {
      setTopupValidationState("idle");
      setTopupValidationActions(null);
    }, topupValidationState === "success" ? 7000 : 5000);
    return () => window.clearTimeout(timer);
  }, [topupValidationState]);

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

          <section className="panel rounded-2xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                  Credits IA
                </p>
                <h3 className="mt-2 text-lg font-semibold text-[var(--text)]">
                  Consommation IA
                </h3>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Suivi de {usageWindowLabel} et recharge du compte.
                </p>
              </div>
              <Badge tone={aiBudgetSummary?.enabled ? "emerald" : "muted"}>
                {aiBudgetSummary?.enabled ? "Quota actif" : "Quota inactif"}
              </Badge>
            </div>
            {aiBudgetLoading ? (
              <p className="mt-3 text-xs text-[var(--muted)]">
                Chargement du quota IA...
              </p>
            ) : aiBudgetSummary ? (
              <div className="mt-4 space-y-3">
                {usagePercent !== null ? (
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs text-[var(--muted)]">
                      <span>Utilisation</span>
                      <span className="text-[var(--text)]">{usagePercent}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full transition-all ${
                          usagePercent >= 90
                            ? "bg-rose-300"
                            : usagePercent >= 70
                              ? "bg-amber-300"
                              : "bg-emerald-300"
                        }`}
                        style={{
                          width: `${Math.max(0, Math.min(100, usagePercent))}%`,
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--muted)]">
                    Le quota est desactive: consommation non bloquee.
                  </p>
                )}
                {(() => {
                  const spentActions = estimateActions(
                    aiBudgetSummary.spent_cents_current_month
                  );
                  const quotaActions =
                    aiBudgetSummary.monthly_budget_cents === null
                      ? null
                      : estimateActions(aiBudgetSummary.monthly_budget_cents);
                  const topupActions = estimateTopupActions(
                    aiBudgetSummary.topup_cents_current_month
                  );
                  const topupRemainingCents = Math.max(
                    0,
                    aiBudgetSummary.topup_remaining_cents_current_month ??
                      (aiBudgetSummary.topup_cents_current_month +
                        (aiBudgetSummary.topup_carryover_cents ?? 0) -
                        aiBudgetSummary.spent_cents_current_month)
                  );
                  const topupRemainingActions = estimateTopupActions(topupRemainingCents);
                  const remainingActions =
                    aiBudgetSummary.remaining_cents_current_month === null
                      ? null
                      : estimateActions(
                          Math.max(0, aiBudgetSummary.remaining_cents_current_month)
                        );

                  return (
                    <div className="grid gap-2 text-xs text-[var(--muted)] sm:grid-cols-2">
                      <p>
                        Quota ({usageWindowLabel}):{" "}
                        <span className="text-[var(--text)]">
                          {quotaActions === null ? "Illimite" : formatActions(quotaActions)}
                        </span>
                      </p>
                      <p>
                        Consomme:{" "}
                        <span className="text-[var(--text)]">
                          {formatActions(spentActions)}
                        </span>
                      </p>
                      <p>
                        Restant:{" "}
                        <span
                          className={
                            aiBudgetSummary.remaining_cents_current_month !== null &&
                            aiBudgetSummary.remaining_cents_current_month <= 0
                              ? "text-rose-300"
                              : "text-[var(--text)]"
                          }
                        >
                          {remainingActions === null
                            ? "Illimite"
                            : formatActions(remainingActions)}
                        </span>
                        {remainingActions !== null && topupRemainingActions > 0 ? (
                          <span className="text-emerald-200">
                            {" "}
                            (+{topupRemainingActions.toLocaleString("fr-FR")} actions de
                            recharge)
                          </span>
                        ) : null}
                      </p>
                      <p>
                        Recharges:{" "}
                        <span className="text-[var(--text)]">
                          {formatActions(topupActions)}
                        </span>
                      </p>
                    </div>
                  );
                })()}
                {quotaResetLabel ? (
                  <p className="text-[11px] text-[var(--muted)]">
                    Le quota principal sera reinitialise le {quotaResetLabel}.
                  </p>
                ) : null}
                <div className="rounded-xl border border-white/10 bg-[var(--bg-elevated)] p-3">
                  <p className="text-xs text-[var(--muted)]">Recharger</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {AI_TOPUP_OPTIONS_CENTS.map((amountCents) => {
                      const actions = estimateTopupActions(amountCents);
                      const isLoading = topupLoadingCents === amountCents;
                      return (
                        <button
                          key={amountCents}
                          type="button"
                          disabled={!aiBudgetSummary.enabled || topupLoadingCents !== null}
                          onClick={() => void handleAiTopupCheckout(amountCents)}
                          className="rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 text-[11px] font-semibold text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isLoading ? "Ouverture..." : formatEuro(amountCents)}{" "}
                          {!isLoading ? (
                            <span className="text-emerald-200/80">
                              ({actions.toLocaleString("fr-FR")} actions)
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  {!aiBudgetSummary.enabled ? (
                    <p className="mt-2 text-[11px] text-[var(--muted)]">
                      Demande a l admin d activer le quota IA pour autoriser les
                      recharges.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-[var(--muted)]">
                Donnees de quota indisponibles.
              </p>
            )}
            {aiBudgetError ? (
              <p className="mt-3 text-xs text-amber-200">{aiBudgetError}</p>
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
                    <Badge tone="amber" size="sm">
                      Voir les offres
                    </Badge>
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

          <MessagesPrivacyExportCard />

          <section className="">
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
          {showTopupValidationModal ? (
            <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
              {topupValidationState === "success" ? (
                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                  {confettiPieces.map((piece) => (
                    <span
                      key={piece.id}
                      className="absolute top-[-12%] h-4 w-2 rounded-sm opacity-95"
                      style={{
                        left: piece.left,
                        backgroundColor: piece.color,
                        transform: `rotate(${piece.rotate})`,
                        animation: `topup-confetti-fall ${piece.duration} linear ${piece.delay} forwards`,
                      }}
                    />
                  ))}
                </div>
              ) : null}
              <div className="topup-modal-pop relative w-full max-w-lg overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-950/95 p-8 text-center text-slate-100 shadow-[0_30px_120px_rgba(2,6,23,0.75)]">
                {topupValidationState === "validating" ? (
                  <>
                    <div className="relative mx-auto mb-6 h-24 w-24">
                      <span className="topup-loader-ring absolute inset-0 rounded-full border-4 border-emerald-400/30 border-t-emerald-200" />
                      <span className="topup-loader-core absolute inset-[30%] rounded-full bg-emerald-200" />
                    </div>
                    <p className="text-xs uppercase tracking-[0.24em] text-emerald-200">
                      Validation en cours
                    </p>
                    <h3 className="mt-3 text-2xl font-semibold text-white">
                      Confirmation du paiement
                    </h3>
                    <p className="mt-2 text-sm text-slate-200">
                      Un instant, nous finalisons votre recharge IA.
                    </p>
                  </>
                ) : topupValidationState === "pending" ? (
                  <>
                    <div className="topup-loader-pulse mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-amber-300/70 bg-amber-500/25 text-amber-100">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-12 w-12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                    </div>
                    <p className="text-xs uppercase tracking-[0.24em] text-amber-200">
                      Paiement confirme
                    </p>
                    <h3 className="mt-3 text-2xl font-semibold text-white">
                      Recharge en cours
                    </h3>
                    <p className="mt-2 text-sm text-slate-200">
                      Le paiement est valide. Les credits seront visibles d ici quelques
                      instants.
                    </p>
                    <button
                      type="button"
                      onClick={() => setTopupValidationState("idle")}
                      className="mt-6 rounded-full border border-amber-300/70 bg-amber-500/35 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-amber-500/50"
                    >
                      Fermer
                    </button>
                  </>
                ) : (
                  <>
                    <div className="topup-check-bounce mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-emerald-300/70 bg-emerald-500/30 text-white">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-12 w-12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M6 12.5 10.2 16.5 18 8.5" />
                      </svg>
                    </div>
                    <p className="text-xs uppercase tracking-[0.24em] text-emerald-200">
                      Achat valide
                    </p>
                    <h3 className="mt-3 text-3xl font-semibold text-white">
                      Felicitations !
                    </h3>
                    <p className="mt-2 text-base text-white">
                      Votre compte a ete credite de {creditedActionsLabel}.
                    </p>
                    <p className="mt-1 text-sm text-slate-200">
                      Les credits sont deja disponibles dans votre quota.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setTopupValidationState("idle");
                        setTopupValidationActions(null);
                      }}
                      className="mt-6 rounded-full border border-emerald-300/70 bg-emerald-500/35 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-emerald-500/50"
                    >
                      Continuer
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : null}
          <style jsx global>{`
            @keyframes topup-loader-spin {
              to {
                transform: rotate(360deg);
              }
            }
            @keyframes topup-loader-pulse {
              0%,
              100% {
                transform: scale(1);
                opacity: 1;
              }
              50% {
                transform: scale(1.08);
                opacity: 0.85;
              }
            }
            @keyframes topup-modal-pop {
              0% {
                transform: translateY(12px) scale(0.94);
                opacity: 0;
              }
              100% {
                transform: translateY(0) scale(1);
                opacity: 1;
              }
            }
            @keyframes topup-check-bounce {
              0% {
                transform: scale(0.75);
              }
              55% {
                transform: scale(1.12);
              }
              100% {
                transform: scale(1);
              }
            }
            @keyframes topup-confetti-fall {
              0% {
                transform: translate3d(0, -8vh, 0) rotate(0deg);
                opacity: 0;
              }
              10% {
                opacity: 1;
              }
              100% {
                transform: translate3d(0, 115vh, 0) rotate(560deg);
                opacity: 0;
              }
            }
            .topup-loader-ring {
              animation: topup-loader-spin 1s linear infinite;
            }
            .topup-loader-core {
              animation: topup-loader-pulse 1.1s ease-in-out infinite;
            }
            .topup-loader-pulse {
              animation: topup-loader-pulse 1.4s ease-in-out infinite;
            }
            .topup-modal-pop {
              animation: topup-modal-pop 260ms ease-out;
            }
            .topup-check-bounce {
              animation: topup-check-bounce 480ms ease-out;
            }
          `}</style>
          <PremiumOfferModal open={premiumModalOpen} onClose={closePremiumModal} />
        </div>
      )}
    </RoleGuard>
  );
}
