"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import RoleGuard from "../../_components/role-guard";
import { useProfile } from "../../_components/profile-context";

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
  const { refresh } = useProfile();
  const [profile, setProfile] = useState<ProfileSettings | null>(null);
  const [organization, setOrganization] =
    useState<OrganizationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [avatarDragging, setAvatarDragging] = useState(false);
  const [logoDragging, setLogoDragging] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const previewSections = useMemo(
    () => normalizeSections(reportDefaultSections),
    [reportDefaultSections]
  );

  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true);
      setError("");

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, org_id, full_name, avatar_url, bio")
        .single();

      if (profileError || !profileData) {
        setError(profileError?.message ?? "Profil introuvable.");
        setLoading(false);
        return;
      }

      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .select(
          "id, name, logo_url, accent_color, email_sender_name, email_reply_to, report_title_template, report_signature, report_default_sections, locale, timezone"
        )
        .eq("id", profileData.org_id)
        .single();

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

      setLoading(false);
    };

    loadSettings();
  }, []);

  const uploadAsset = async (
    file: File,
    kind: "avatar" | "logo"
  ) => {
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

    const { data } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filePath);
    if (kind === "avatar") {
      setAvatarUrl(data.publicUrl);
      setUploadingAvatar(false);
    } else {
      setLogoUrl(data.publicUrl);
      setUploadingLogo(false);
    }

    setSuccess("Image chargee. Pense a sauvegarder.");
  };

  const handleFileInput = (
    files: FileList | null,
    kind: "avatar" | "logo"
  ) => {
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
          <section className="panel rounded-2xl p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Parametres coach
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
              Identite et branding
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Configure ton profil, ton organisation et les rapports.
            </p>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <div className="panel rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-[var(--text)]">
                Profil coach
              </h3>
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
                        <p className="text-[0.65rem]">
                          PNG ou JPG, 2 Mo max.
                        </p>
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
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      Upload en cours...
                    </p>
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
              <h3 className="text-lg font-semibold text-[var(--text)]">
                Organisation
              </h3>
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
                        <p className="text-[0.65rem]">
                          PNG ou JPG, 2 Mo max.
                        </p>
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
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      Upload en cours...
                    </p>
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
              <h3 className="text-lg font-semibold text-[var(--text)]">
                Emails
              </h3>
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
                    onChange={(event) =>
                      setReportTitleTemplate(event.target.value)
                    }
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
                    onChange={(event) =>
                      setReportDefaultSections(event.target.value)
                    }
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
                    <p className="text-[var(--muted)]">
                      Aucune section definie.
                    </p>
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
        </div>
      )}
    </RoleGuard>
  );
}
