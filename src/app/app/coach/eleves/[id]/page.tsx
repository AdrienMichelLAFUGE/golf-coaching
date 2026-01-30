"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import RoleGuard from "../../../_components/role-guard";
import { useProfile } from "../../../_components/profile-context";
import PageBack from "../../../_components/page-back";
import PremiumOfferModal from "../../../_components/premium-offer-modal";
import ShareStudentModal from "../../../_components/share-student-modal";
import RadarCharts, {
  defaultRadarConfig,
  type RadarConfig,
  type RadarColumn,
  type RadarShot,
  type RadarStats,
} from "../../../_components/radar-charts";
import { RADAR_CHART_DEFINITIONS, RADAR_CHART_GROUPS } from "@/lib/radar/charts/registry";
import {
  RADAR_TECH_OPTIONS,
  type RadarTech,
  buildRadarFileDisplayName,
  getRadarTechLabel,
  getRadarTechMeta,
  isRadarTech,
} from "@/lib/radar/file-naming";
import type { RadarAnalytics } from "@/lib/radar/types";
import { getViewerShareAccess, type ShareStatus } from "@/lib/student-share";

type Student = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
  invited_at: string | null;
  activated_at: string | null;
  created_at: string;
  tpi_report_id: string | null;
  playing_hand: "right" | "left" | null;
};

type Report = {
  id: string;
  title: string;
  report_date: string | null;
  created_at: string;
  sent_at: string | null;
};

type TpiReport = {
  id: string;
  status: "processing" | "ready" | "error";
  file_url: string;
  file_type: "pdf" | "image";
  original_name: string | null;
  created_at: string;
};

type TpiTest = {
  id: string;
  test_name: string;
  result_color: "green" | "orange" | "red";
  mini_summary: string | null;
  details: string | null;
  details_translated: string | null;
  position: number;
};

type RadarFile = {
  id: string;
  status: "processing" | "ready" | "error";
  source: "flightscope" | "trackman" | "smart2move" | "unknown";
  original_name: string | null;
  file_url: string;
  file_mime: string | null;
  columns: RadarColumn[];
  shots: RadarShot[];
  stats: RadarStats | null;
  summary: string | null;
  config: RadarConfig | null;
  analytics?: RadarAnalytics | null;
  created_at: string;
  extracted_at: string | null;
  error: string | null;
};

type ShareEntry = {
  id: string;
  viewer_email: string;
  created_at: string;
};

type StudentEditForm = {
  first_name: string;
  last_name: string;
  email: string;
  playing_hand: "" | "right" | "left";
};

const tpiColorRank: Record<TpiTest["result_color"], number> = {
  red: 0,
  orange: 1,
  green: 2,
};

const tpiLegendByColor: Record<TpiTest["result_color"], string> = {
  red: "Affecte fortement le swing",
  orange: "A surveiller",
  green: "Mobilite optimale",
};

const formatTpiTestName = (name: string) => {
  const shortened = name.replace(/Extension/g, "Ext.").replace(/Rotation/g, "Rota.");
  return shortened === "Wrist Flexion/Ext." ? "Wrist Flex./Ext." : shortened;
};

const formatDate = (
  value?: string | null,
  locale?: string | null,
  timezone?: string | null
) => {
  if (!value) return "-";
  const options = timezone ? { timeZone: timezone } : undefined;
  return new Date(value).toLocaleDateString(locale ?? "fr-FR", options);
};

const formatRadarSourceFallback = (source: RadarFile["source"]) =>
  `Export ${getRadarTechLabel(source)}`;

type RadarFilter = "all" | RadarTech;

const isRadarFilter = (value: string): value is RadarFilter =>
  value === "all" || isRadarTech(value);

const radarTechTone = {
  flightscope: "border-sky-300/30 bg-sky-400/10 text-sky-100",
  trackman: "border-emerald-300/30 bg-emerald-400/10 text-emerald-100",
  smart2move: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  unknown: "border-white/10 bg-white/5 text-[var(--muted)]",
} as const;

const LoadingDots = () => (
  <span className="ml-1 inline-flex items-center gap-0.5">
    {[0, 1, 2].map((index) => (
      <span
        key={`dot-${index}`}
        className="h-1 w-1 rounded-full bg-current opacity-70 animate-pulse"
        style={{ animationDelay: `${index * 160}ms` }}
      />
    ))}
  </span>
);

export default function CoachStudentDetailPage() {
  const { organization, userEmail, profile } = useProfile();
  const params = useParams();
  const studentId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [student, setStudent] = useState<Student | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tpiReport, setTpiReport] = useState<TpiReport | null>(null);
  const [tpiTests, setTpiTests] = useState<TpiTest[]>([]);
  const [tpiLoading, setTpiLoading] = useState(false);
  const [tpiError, setTpiError] = useState("");
  const [tpiUploading, setTpiUploading] = useState(false);
  const [tpiProgress, setTpiProgress] = useState(0);
  const [tpiPhase, setTpiPhase] = useState<"upload" | "analyse">("upload");
  const [tpiDragging, setTpiDragging] = useState(false);
  const tpiInputRef = useRef<HTMLInputElement | null>(null);
  const [tpiDetail, setTpiDetail] = useState<TpiTest | null>(null);
  const [selectedTpi, setSelectedTpi] = useState<TpiTest | null>(null);
  const [tpiHelpOpen, setTpiHelpOpen] = useState(false);
  const tpiProgressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [radarFiles, setRadarFiles] = useState<RadarFile[]>([]);
  const [radarLoading, setRadarLoading] = useState(false);
  const [radarError, setRadarError] = useState("");
  const [radarTech, setRadarTech] = useState<RadarTech>("flightscope");
  const [radarFilter, setRadarFilter] = useState<RadarFilter>("all");
  const [radarUploading, setRadarUploading] = useState(false);
  const [radarProgress, setRadarProgress] = useState(0);
  const [radarPhase, setRadarPhase] = useState<"upload" | "analyse">("upload");
  const radarInputRef = useRef<HTMLInputElement | null>(null);
  const radarProgressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [radarPreview, setRadarPreview] = useState<RadarFile | null>(null);
  const [radarConfigOpen, setRadarConfigOpen] = useState(false);
  const [radarConfigDraft, setRadarConfigDraft] =
    useState<RadarConfig>(defaultRadarConfig);
  const [radarConfigFile, setRadarConfigFile] = useState<RadarFile | null>(null);
  const [radarConfigSaving, setRadarConfigSaving] = useState(false);
  const [radarConfigError, setRadarConfigError] = useState("");
  const [radarDeletingId, setRadarDeletingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<StudentEditForm>({
    first_name: "",
    last_name: "",
    email: "",
    playing_hand: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [shareStatus, setShareStatus] = useState<ShareStatus | null>(null);
  const [ownerShares, setOwnerShares] = useState<ShareEntry[]>([]);
  const [ownerShareError, setOwnerShareError] = useState("");
  const [ownerShareRevokingId, setOwnerShareRevokingId] = useState<string | null>(
    null
  );
  const locale = organization?.locale ?? "fr-FR";
  const timezone = organization?.timezone ?? "Europe/Paris";
  const aiEnabled = organization?.ai_enabled ?? false;
  const isAdmin = userEmail?.toLowerCase() === "adrien.lafuge@outlook.fr";
  const tpiAddonEnabled = isAdmin || organization?.tpi_enabled;
  const radarAddonEnabled = isAdmin || organization?.radar_enabled;
  const tpiLocked = !tpiAddonEnabled;
  const radarLocked = !radarAddonEnabled;
  const isOwner = profile?.role === "owner";
  const shareAccess = getViewerShareAccess(shareStatus);
  const isReadOnly = shareAccess.canRead;
  const radarTechMeta = getRadarTechMeta(radarTech);
  const radarVisibleFiles = useMemo(() => {
    if (radarFilter === "all") return radarFiles;
    return radarFiles.filter((file) => file.source === radarFilter);
  }, [radarFiles, radarFilter]);
  const radarFilterOptions = useMemo(
    () => [
      {
        id: "all" as const,
        label: "Toutes",
        tone: "border-white/10 bg-white/5 text-[var(--muted)]",
      },
      ...RADAR_TECH_OPTIONS.map((option) => ({
        id: option.id,
        label: option.label,
        tone: radarTechTone[option.id],
      })),
    ],
    []
  );
  const [premiumModalOpen, setPremiumModalOpen] = useState(false);
  const [premiumNotice, setPremiumNotice] = useState<{
    title: string;
    description: string;
    tags?: string[];
    status?: { label: string; value: string }[];
  } | null>(null);

  const openPremiumModal = useCallback(
    (
      notice?: {
        title: string;
        description: string;
        tags?: string[];
        status?: { label: string; value: string }[];
      } | null
    ) => {
      setPremiumNotice(notice ?? null);
      setPremiumModalOpen(true);
    },
    []
  );

  const handleRadarFilterChange = (next: string) => {
    if (!isRadarFilter(next)) {
      setRadarError("Filtre datas invalide.");
      return;
    }
    setRadarError("");
    setRadarFilter(next);
  };

  const closePremiumModal = useCallback(() => {
    setPremiumModalOpen(false);
    setPremiumNotice(null);
  }, []);

  const openRadarAddonModal = useCallback(() => {
    const needsPremium = !aiEnabled;
    openPremiumModal({
      title: "Acces datas bloque",
      description: needsPremium
        ? "Cette section est reservee aux coachs Premium IA avec l add-on Datas."
        : "Ajoute l add-on Datas pour debloquer cette section.",
      tags: needsPremium ? ["Premium IA", "Add-on Datas"] : ["Add-on Datas"],
      status: [
        { label: "Premium IA", value: aiEnabled ? "Actif" : "Inactif" },
        { label: "Add-on Datas", value: radarAddonEnabled ? "Actif" : "Inactif" },
      ],
    });
  }, [aiEnabled, openPremiumModal, radarAddonEnabled]);

  const openTpiAddonModal = useCallback(() => {
    const needsPremium = !aiEnabled;
    openPremiumModal({
      title: "Acces TPI bloque",
      description: needsPremium
        ? "Cette fonctionnalite est reservee aux coachs Premium IA avec l add-on TPI."
        : "Ajoute l add-on TPI pour debloquer cette fonctionnalite.",
      tags: needsPremium ? ["Premium IA", "Add-on TPI"] : ["Add-on TPI"],
      status: [
        { label: "Premium IA", value: aiEnabled ? "Actif" : "Inactif" },
        { label: "Add-on TPI", value: tpiAddonEnabled ? "Actif" : "Inactif" },
      ],
    });
  }, [aiEnabled, openPremiumModal, tpiAddonEnabled]);

  const handleShareStudent = async (email: string) => {
    if (!studentId) {
      return { error: "Eleve introuvable." };
    }

    setShareMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      return { error: "Session invalide." };
    }

    const response = await fetch("/api/student-shares/invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ studentId, coachEmail: email }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { error: payload.error ?? "Invitation impossible." };
    }

    setShareMessage("Invitation envoyee.");
    return {};
  };

  const loadTpi = useCallback(
    async (reportId?: string | null) => {
      if (!studentId) return;

      setTpiLoading(true);
      setTpiError("");

      let reportData: TpiReport | null = null;

      if (reportId) {
        const { data, error } = await supabase
          .from("tpi_reports")
          .select("id, status, file_url, file_type, original_name, created_at")
          .eq("id", reportId)
          .single();
        if (!error && data) reportData = data as TpiReport;
      }

      if (!reportData) {
        const { data, error } = await supabase
          .from("tpi_reports")
          .select("id, status, file_url, file_type, original_name, created_at")
          .eq("student_id", studentId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!error && data) reportData = data as TpiReport;
      }

      if (reportData && reportData.status !== "ready") {
        const { data, error } = await supabase
          .from("tpi_reports")
          .select("id, status, file_url, file_type, original_name, created_at")
          .eq("student_id", studentId)
          .eq("status", "ready")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!error && data) reportData = data as TpiReport;
      }

      if (!reportData) {
        setTpiReport(null);
        setTpiTests([]);
        setSelectedTpi(null);
        setTpiLoading(false);
        return;
      }

      setTpiReport(reportData);

      const { data: testsData, error: testsError } = await supabase
        .from("tpi_tests")
        .select(
          "id, test_name, result_color, mini_summary, details, details_translated, position"
        )
        .eq("report_id", reportData.id)
        .order("position", { ascending: true });

      if (testsError) {
        setTpiError(testsError.message);
        setTpiTests([]);
        setSelectedTpi(null);
        setTpiLoading(false);
        return;
      }

      const normalizedTests = (testsData ?? []) as TpiTest[];
      const sorted = [...normalizedTests].sort((a, b) => {
        const rank = tpiColorRank[a.result_color] - tpiColorRank[b.result_color];
        if (rank !== 0) return rank;
        return a.position - b.position;
      });
      setTpiTests(sorted);
      setSelectedTpi((current) => {
        if (!sorted.length) return null;
        if (current && sorted.some((test) => test.id === current.id)) {
          return current;
        }
        return sorted[0];
      });
      setTpiLoading(false);
    },
    [studentId]
  );

  const loadRadars = useCallback(async () => {
    if (!studentId) return;
    setRadarLoading(true);
    setRadarError("");

    const { data, error } = await supabase
      .from("radar_files")
      .select(
        "id, status, source, original_name, file_url, file_mime, columns, shots, stats, config, summary, analytics, created_at, extracted_at, error"
      )
      .eq("student_id", studentId)
      .order("created_at", { ascending: false });

    if (error) {
      setRadarError(error.message);
      setRadarFiles([]);
      setRadarLoading(false);
      return;
    }

    const normalized =
      data?.map((file) => ({
        ...file,
        columns: Array.isArray(file.columns) ? file.columns : [],
        shots: Array.isArray(file.shots) ? file.shots : [],
        stats: file.stats && typeof file.stats === "object" ? file.stats : null,
        config: file.config && typeof file.config === "object" ? file.config : null,
        analytics:
          file.analytics && typeof file.analytics === "object" ? file.analytics : null,
      })) ?? [];

    setRadarFiles(normalized as RadarFile[]);
    setRadarLoading(false);
  }, [studentId]);

  const stopTpiProgress = () => {
    if (tpiProgressTimer.current) {
      clearInterval(tpiProgressTimer.current);
      tpiProgressTimer.current = null;
    }
  };

  const runTpiProgress = (
    target: number,
    step: number,
    delay: number,
    onComplete?: () => void
  ) => {
    stopTpiProgress();
    tpiProgressTimer.current = setInterval(() => {
      let reached = false;
      setTpiProgress((prev) => {
        if (prev >= target) {
          reached = true;
          return prev;
        }
        const next = Math.min(prev + step, target);
        if (next >= target) reached = true;
        return next;
      });
      if (reached) {
        stopTpiProgress();
        if (onComplete) onComplete();
      }
    }, delay);
  };

  const stopRadarProgress = () => {
    if (radarProgressTimer.current) {
      clearInterval(radarProgressTimer.current);
      radarProgressTimer.current = null;
    }
  };

  const runRadarProgress = (
    target: number,
    step: number,
    delay: number,
    onComplete?: () => void
  ) => {
    stopRadarProgress();
    radarProgressTimer.current = setInterval(() => {
      let reached = false;
      setRadarProgress((prev) => {
        if (prev >= target) {
          reached = true;
          return prev;
        }
        const next = Math.min(prev + step, target);
        if (next >= target) reached = true;
        return next;
      });
      if (reached) {
        stopRadarProgress();
        if (onComplete) onComplete();
      }
    }, delay);
  };

  const handleTpiFile = async (file: File) => {
    if (isReadOnly) {
      setTpiError("Lecture seule: modification des fichiers impossible.");
      return;
    }
    if (tpiLocked) {
      setTpiError("Add-on TPI requis pour importer un rapport.");
      openTpiAddonModal();
      return;
    }
    if (!studentId || !organization?.id) return;
    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setTpiError("Importe uniquement le PDF TPI Pro recu par email.");
      return;
    }

    setTpiUploading(true);
    setTpiError("");
    setTpiProgress(8);
    setTpiPhase("upload");
    runTpiProgress(45, 1.5, 350);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${organization.id}/students/${studentId}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("tpi-reports")
      .upload(path, file, { cacheControl: "3600", upsert: true });

    if (uploadError) {
      setTpiError(uploadError.message);
      stopTpiProgress();
      setTpiProgress(0);
      setTpiUploading(false);
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const uploadedBy = userData.user?.id ?? null;

    const { data: reportData, error: insertError } = await supabase
      .from("tpi_reports")
      .insert([
        {
          org_id: organization.id,
          student_id: studentId,
          uploaded_by: uploadedBy,
          file_url: path,
          file_type: isPdf ? "pdf" : "image",
          original_name: file.name,
          status: "processing",
        },
      ])
      .select("id")
      .single();

    if (insertError || !reportData) {
      setTpiError(insertError?.message ?? "Erreur lors de l enregistrement TPI.");
      stopTpiProgress();
      setTpiProgress(0);
      setTpiUploading(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("students")
      .update({ tpi_report_id: reportData.id })
      .eq("id", studentId);
    if (updateError) {
      setTpiError(updateError.message);
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setTpiError("Session invalide.");
      stopTpiProgress();
      setTpiProgress(0);
      setTpiUploading(false);
      return;
    }

    setTpiProgress(50);
    setTpiPhase("analyse");
    runTpiProgress(90, 0.4, 600, () => {
      runTpiProgress(99, 0.1, 1650);
    });

    const response = await fetch("/api/tpi/extract", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reportId: reportData.id }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setTpiError(payload.error ?? "Erreur lors de l analyse TPI.");
      stopTpiProgress();
      setTpiProgress(0);
      setTpiUploading(false);
      return;
    }

    await loadTpi(reportData.id);
    stopTpiProgress();
    setTpiProgress(100);
    setTpiUploading(false);
  };

  const handleRadarFile = async (file: File) => {
    if (isReadOnly) {
      setRadarError("Lecture seule: modification des fichiers impossible.");
      return;
    }
    if (radarLocked) {
      setRadarError("Add-on Datas requis pour importer un fichier.");
      openRadarAddonModal();
      return;
    }
    if (!studentId || !organization?.id) {
      setRadarError("Choisis un eleve avant d importer un fichier datas.");
      return;
    }
    const techMeta = getRadarTechMeta(radarTech);
    const isRadarImageFile = () => {
      if (file.type.startsWith("image/")) return true;
      const name = file.name.toLowerCase();
      return [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"].some((ext) =>
        name.endsWith(ext)
      );
    };
    if (!isRadarImageFile()) {
      setRadarError(`Importe une image ${techMeta.label} (jpg, png, heic...).`);
      return;
    }

    setRadarUploading(true);
    setRadarError("");
    setRadarProgress(8);
    setRadarPhase("upload");
    runRadarProgress(45, 1.5, 350);

    const studentLabel = [student?.first_name, student?.last_name]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join(" ")
      .trim();
    const displayName = buildRadarFileDisplayName({
      tech: radarTech,
      studentName: studentLabel,
      reportDate: null,
      club: null,
      originalName: file.name,
      fallbackDate: new Date(),
    });
    const safeName = displayName.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${organization.id}/students/${studentId}/radars/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("radar-files")
      .upload(path, file, { cacheControl: "3600", upsert: true });

    if (uploadError) {
      setRadarError(uploadError.message);
      stopRadarProgress();
      setRadarProgress(0);
      setRadarUploading(false);
      return;
    }

    const { data: radarRow, error: insertError } = await supabase
      .from("radar_files")
      .insert([
        {
          org_id: organization.id,
          student_id: studentId,
          source: techMeta.id,
          status: "processing",
          original_name: displayName,
          file_url: path,
          file_mime: file.type,
        },
      ])
      .select("id")
      .single();

    if (insertError || !radarRow) {
      setRadarError(insertError?.message ?? "Erreur d enregistrement datas.");
      stopRadarProgress();
      setRadarProgress(0);
      setRadarUploading(false);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setRadarError("Session invalide.");
      stopRadarProgress();
      setRadarProgress(0);
      setRadarUploading(false);
      return;
    }

    setRadarProgress(50);
    setRadarPhase("analyse");
    runRadarProgress(90, 0.4, 600, () => {
      runRadarProgress(99, 0.1, 1650);
    });

    const response = await fetch("/api/radar/extract", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ radarFileId: radarRow.id }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setRadarError(payload.error ?? "Erreur lors de l extraction datas.");
      stopRadarProgress();
      setRadarProgress(0);
      setRadarUploading(false);
      await loadRadars();
      return;
    }

    await loadRadars();
    stopRadarProgress();
    setRadarProgress(100);
    setRadarUploading(false);
  };

  useEffect(() => {
    if (!studentId) return;

    const loadStudent = async () => {
      setLoading(true);
      setError("");

      const { data: studentData, error: studentError } = await supabase
        .from("students")
        .select(
          "id, first_name, last_name, email, avatar_url, invited_at, activated_at, created_at, tpi_report_id, playing_hand"
        )
        .eq("id", studentId)
        .single();

      if (studentError) {
        setError(studentError.message);
        setLoading(false);
        return;
      }

      setStudent(studentData);
      await loadTpi(studentData.tpi_report_id);

      if (userEmail) {
        const { data: shareData, error: shareError } = await supabase
          .from("student_shares")
          .select("id, status")
          .eq("student_id", studentId)
          .ilike("viewer_email", userEmail)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (shareError) {
          setShareStatus(null);
        } else {
          setShareStatus((shareData?.status as ShareStatus) ?? null);
        }
      } else {
        setShareStatus(null);
      }

      if (isOwner) {
        const { data: sharesData, error: sharesError } = await supabase
          .from("student_shares")
          .select("id, viewer_email, created_at")
          .eq("student_id", studentId)
          .eq("status", "active")
          .order("created_at", { ascending: false });
        if (sharesError) {
          setOwnerShareError(sharesError.message);
          setOwnerShares([]);
        } else {
          setOwnerShareError("");
          setOwnerShares((sharesData ?? []) as ShareEntry[]);
        }
      } else {
        setOwnerShareError("");
        setOwnerShares([]);
      }

      const { data: reportData, error: reportError } = await supabase
        .from("reports")
        .select("id, title, report_date, created_at, sent_at")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false });

      if (reportError) {
        setError(reportError.message);
        setLoading(false);
        return;
      }

      setReports(reportData ?? []);
      setLoading(false);
    };

    loadStudent();
  }, [studentId, loadTpi, userEmail, isOwner]);

  const handleOwnerRevokeShare = async (shareId: string) => {
    setOwnerShareError("");
    setOwnerShareRevokingId(shareId);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setOwnerShareError("Session invalide.");
      setOwnerShareRevokingId(null);
      return;
    }

    const response = await fetch("/api/student-shares/revoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ shareId }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setOwnerShareError(payload.error ?? "Revoquer impossible.");
      setOwnerShareRevokingId(null);
      return;
    }

    setOwnerShares((prev) => prev.filter((share) => share.id !== shareId));
    setOwnerShareRevokingId(null);
  };

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      void loadRadars();
    });
    return () => {
      cancelled = true;
    };
  }, [studentId, loadRadars]);

  useEffect(() => {
    return () => {
      stopTpiProgress();
      stopRadarProgress();
    };
  }, []);

  useEffect(() => {
    if (!headerMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-student-header-menu]")) return;
      setHeaderMenuOpen(false);
    };
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [headerMenuOpen]);

  const handleDeleteReport = async (report: Report) => {
    if (isReadOnly) return;
    const confirmed = window.confirm(`Supprimer le rapport "${report.title}" ?`);
    if (!confirmed) return;

    setDeletingId(report.id);
    const { error: deleteError } = await supabase
      .from("reports")
      .delete()
      .eq("id", report.id);

    if (deleteError) {
      setError(deleteError.message);
      setDeletingId(null);
      return;
    }

    setReports((prev) => prev.filter((item) => item.id !== report.id));
    setDeletingId(null);
  };

  const handleDeleteRadarFile = async (file: RadarFile) => {
    if (isReadOnly) return;
    const name = file.original_name || formatRadarSourceFallback(file.source);
    const confirmed = window.confirm(`Supprimer le fichier datas "${name}" ?`);
    if (!confirmed) return;

    setRadarDeletingId(file.id);
    setRadarError("");

    let storageError: string | null = null;
    if (file.file_url) {
      const { error } = await supabase.storage
        .from("radar-files")
        .remove([file.file_url]);
      if (error) {
        storageError = error.message;
      }
    }

    const { error: deleteError } = await supabase
      .from("radar_files")
      .delete()
      .eq("id", file.id);

    if (deleteError) {
      setRadarError(deleteError.message);
      setRadarDeletingId(null);
      return;
    }

    setRadarFiles((prev) => prev.filter((item) => item.id !== file.id));
    if (radarPreview?.id === file.id) {
      setRadarPreview(null);
    }
    if (radarConfigFile?.id === file.id) {
      setRadarConfigOpen(false);
      setRadarConfigFile(null);
    }

    if (storageError) {
      setRadarError(`Fichier datas supprime, mais erreur de stockage: ${storageError}`);
    }
    setRadarDeletingId(null);
  };

  const handleOpenEdit = () => {
    if (isReadOnly) return;
    if (!student) return;
    setHeaderMenuOpen(false);
    setEditError("");
    setEditForm({
      first_name: student.first_name ?? "",
      last_name: student.last_name ?? "",
      email: student.email ?? "",
      playing_hand: student.playing_hand ?? "",
    });
    setEditOpen(true);
  };

  const handleCloseEdit = () => {
    if (editSaving) return;
    setEditOpen(false);
    setEditError("");
  };

  const handleUpdateStudent = async () => {
    if (isReadOnly) return;
    if (!student) return;
    const firstName = editForm.first_name.trim();
    const lastName = editForm.last_name.trim();
    const email = editForm.email.trim();
    const playingHand = editForm.playing_hand || null;

    if (!firstName) {
      setEditError("Le prenom est obligatoire.");
      return;
    }

    setEditSaving(true);
    setEditError("");

    const { error: updateError } = await supabase
      .from("students")
      .update({
        first_name: firstName,
        last_name: lastName || null,
        email: email || null,
        playing_hand: playingHand,
      })
      .eq("id", student.id);

    if (updateError) {
      setEditError(updateError.message);
      setEditSaving(false);
      return;
    }

    setStudent((prev) =>
      prev
        ? {
            ...prev,
            first_name: firstName,
            last_name: lastName || null,
            email: email || null,
            playing_hand: playingHand,
          }
        : prev
    );
    setEditSaving(false);
    setEditOpen(false);
  };

  const handleOpenRadarConfig = (file: RadarFile) => {
    setRadarConfigError("");
    setRadarConfigFile(file);
    const merged: RadarConfig = {
      ...defaultRadarConfig,
      ...(file.config ?? {}),
      charts: {
        ...defaultRadarConfig.charts,
        ...(file.config?.charts ?? {}),
      },
      thresholds: {
        ...defaultRadarConfig.thresholds,
        ...(file.config?.thresholds ?? {}),
      },
      options: {
        ...defaultRadarConfig.options,
        ...(file.config?.options ?? {}),
      },
    };
    setRadarConfigDraft(merged);
    setRadarConfigOpen(true);
  };

  const handleCloseRadarConfig = () => {
    if (radarConfigSaving) return;
    setRadarConfigOpen(false);
    setRadarConfigFile(null);
  };

  const handleSaveRadarConfig = async () => {
    if (isReadOnly) return;
    if (!radarConfigFile) return;
    setRadarConfigSaving(true);
    setRadarConfigError("");

    const { error: updateError } = await supabase
      .from("radar_files")
      .update({ config: radarConfigDraft })
      .eq("id", radarConfigFile.id);

    if (updateError) {
      setRadarConfigError(updateError.message);
      setRadarConfigSaving(false);
      return;
    }

    setRadarFiles((prev) =>
      prev.map((file) =>
        file.id === radarConfigFile.id ? { ...file, config: radarConfigDraft } : file
      )
    );
    setRadarConfigSaving(false);
    setRadarConfigOpen(false);
    setRadarConfigFile(null);
  };

  return (
    <RoleGuard allowedRoles={["owner", "coach", "staff"]}>
      {loading ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-[var(--muted)]">Chargement de l eleve...</p>
        </section>
      ) : error || !student ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-red-400">{error || "Eleve introuvable."}</p>
        </section>
      ) : (
        <div className="space-y-6">
          <style jsx>{`
            .tpi-dots {
              display: inline-block;
              width: 1.5em;
              overflow: hidden;
              vertical-align: bottom;
            }
            .tpi-dots::after {
              content: "...";
              display: block;
              width: 0;
              animation: tpiDots 1.4s steps(4, end) infinite;
            }
            @keyframes tpiDots {
              0% {
                width: 0;
              }
              100% {
                width: 1.5em;
              }
            }
          `}</style>
          <section className="panel rounded-2xl p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <PageBack />
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                  Eleve
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isOwner ? (
                  <button
                    type="button"
                    onClick={() => setShareModalOpen(true)}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)]"
                    aria-label="Partager l eleve"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="18" cy="5" r="3" />
                      <circle cx="6" cy="12" r="3" />
                      <circle cx="18" cy="19" r="3" />
                      <path d="M8.6 13.5l6.8 3.9" />
                      <path d="M15.4 6.6L8.6 10.5" />
                    </svg>
                  </button>
                ) : null}
                {!isReadOnly ? (
                  <div className="relative" data-student-header-menu>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setHeaderMenuOpen((prev) => !prev);
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)]"
                      aria-label="Actions eleve"
                      aria-expanded={headerMenuOpen}
                      aria-haspopup="menu"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                      </svg>
                    </button>
                    {headerMenuOpen ? (
                      <div
                        role="menu"
                        onClick={(event) => event.stopPropagation()}
                        className="absolute right-0 z-50 mt-2 w-40 rounded-xl border border-white/10 bg-[var(--bg-elevated)] p-1 text-xs shadow-[0_12px_30px_rgba(0,0,0,0.35)]"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={handleOpenEdit}
                          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[0.65rem] uppercase tracking-wide text-[var(--text)] transition hover:bg-white/10"
                        >
                          Editer
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              {student.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={student.avatar_url}
                  alt={`Photo de ${student.first_name}`}
                  className="h-12 w-12 rounded-full border border-white/10 object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/10 text-sm font-semibold text-[var(--muted)]">
                  {(student.first_name || "E").charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <h2 className="text-2xl font-semibold text-[var(--text)]">
                  {student.first_name} {student.last_name ?? ""}
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {student.email || "-"}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide">
              {student.activated_at ? (
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-emerald-200">
                  Actif
                </span>
              ) : student.invited_at ? (
                <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-1 text-amber-200">
                  Invite
                </span>
              ) : (
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[var(--muted)]">
                  A inviter
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Invite le {formatDate(student.invited_at, locale, timezone)} - Cree le{" "}
              {formatDate(student.created_at, locale, timezone)}
            </p>
            {shareMessage ? (
              <p className="mt-3 text-xs text-emerald-200">{shareMessage}</p>
            ) : null}
            {isReadOnly ? (
              <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-xs uppercase tracking-wide text-amber-100">
                Lecture seule active (eleve partage)
              </div>
            ) : null}
          </section>

          {isOwner && ownerShares.length > 0 ? (
            <section className="panel-soft rounded-2xl p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--text)]">
                    Partages actifs
                  </h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Revoque un acces lecture seule si necessaire.
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {ownerShares.map((share) => (
                  <div
                    key={share.id}
                    className="flex flex-col gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--text)] md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="font-medium">{share.viewer_email}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Partage actif depuis{" "}
                        {formatDate(share.created_at, locale, timezone)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOwnerRevokeShare(share.id)}
                      disabled={ownerShareRevokingId === share.id}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-red-300 transition hover:text-red-200 disabled:opacity-60"
                    >
                      {ownerShareRevokingId === share.id
                        ? "Revocation..."
                        : "Revoquer"}
                    </button>
                  </div>
                ))}
              </div>
              {ownerShareError ? (
                <p className="mt-3 text-sm text-red-400">{ownerShareError}</p>
              ) : null}
            </section>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <section className="panel rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[var(--text)]">Rapports</h3>
                {isReadOnly ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)]">
                    Lecture seule
                  </span>
                ) : (
                  <Link
                    href={`/app/coach/rapports/nouveau?studentId=${student.id}`}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--text)]"
                  >
                    Nouveau rapport
                  </Link>
                )}
              </div>
              {reports.length === 0 ? (
                <div className="mt-4 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                  Aucun rapport pour cet eleve.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {reports.map((report) => (
                    <div
                      key={report.id}
                      className="flex flex-col gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--text)] md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{report.title}</p>
                          {!report.sent_at ? (
                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                              Brouillon
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {formatDate(
                            report.report_date ?? report.created_at,
                            locale,
                            timezone
                          )}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2 self-end md:self-auto">
                        <Link
                          href={`/app/coach/rapports/${report.id}`}
                          className="w-28 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-center text-[0.65rem] uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
                        >
                          Ouvrir
                        </Link>
                        <Link
                          href={`/app/coach/rapports/nouveau?reportId=${report.id}`}
                          onClick={(event) => {
                            if (isReadOnly) event.preventDefault();
                          }}
                          aria-disabled={isReadOnly}
                          className={`w-28 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-center text-[0.65rem] uppercase tracking-wide transition ${
                            isReadOnly
                              ? "cursor-not-allowed text-[var(--muted)] opacity-60"
                              : "text-[var(--muted)] hover:text-[var(--text)]"
                          }`}
                        >
                          Modifier
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDeleteReport(report)}
                          disabled={isReadOnly || deletingId === report.id}
                          className="w-28 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-center text-[0.65rem] uppercase tracking-wide text-red-300 transition hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingId === report.id ? "Suppression..." : "Supprimer"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="panel relative rounded-2xl border border-rose-400/40 bg-rose-500/5 p-6">
              {tpiLocked ? (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={openTpiAddonModal}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openTpiAddonModal();
                    }
                  }}
                  className="absolute inset-0 z-10 flex cursor-pointer items-center justify-center rounded-2xl border border-rose-300/40 bg-rose-500/10 text-center text-xs uppercase tracking-[0.2em] text-rose-100 backdrop-blur-sm"
                >
                  <div className="flex flex-col items-center gap-3 px-6">
                    <span className="flex items-center gap-2">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <rect x="5" y="11" width="14" height="9" rx="2" />
                        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                      </svg>
                      Add-on TPI requis
                    </span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openTpiAddonModal();
                      }}
                      className="rounded-full border border-rose-200/40 bg-rose-400/20 px-4 py-1 text-[0.6rem] uppercase tracking-wide text-rose-100 transition hover:bg-rose-400/30"
                    >
                      Voir les offres
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--text)]">
                    Profil TPI
                    {tpiReport?.created_at ? (
                      <span className="text-sm font-medium text-[var(--muted)]">
                        {" "}
                        - {formatDate(tpiReport.created_at, locale, timezone)}
                      </span>
                    ) : null}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Ajoute un screening TPI pour obtenir une synthese claire des points a
                    travailler et des points forts.
                  </p>
                  <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-emerald-100">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />L
                    assistant IA s appuie sur ce profil pour ses analyses.
                  </div>
                </div>
              </div>
              <div
                className={`mt-4 rounded-xl border border-dashed px-4 py-4 text-sm text-[var(--muted)] transition ${
                  tpiDragging
                    ? "border-rose-300/50 bg-rose-400/10 text-rose-100"
                    : "border-white/10 bg-white/5"
                }`}
                onDragOver={(event) => {
                  if (tpiLocked) return;
                  event.preventDefault();
                  setTpiDragging(true);
                }}
                onDragLeave={() => setTpiDragging(false)}
                onDrop={(event) => {
                  if (tpiLocked) {
                    setTpiError("Add-on TPI requis pour importer un rapport.");
                    openTpiAddonModal();
                    return;
                  }
                  event.preventDefault();
                  setTpiDragging(false);
                  const file = event.dataTransfer.files?.[0];
                  if (file) void handleTpiFile(file);
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-[var(--text)]">
                      Glisse le PDF TPI Pro recu par email.
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Seul le PDF du rapport TPI Pro est accepte.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="group relative">
                      <button
                        type="button"
                        onClick={() => setTpiHelpOpen((prev) => !prev)}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[0.7rem] text-[var(--muted)] transition hover:text-[var(--text)]"
                        aria-label="Aide import TPI"
                        aria-expanded={tpiHelpOpen}
                      >
                        ?
                      </button>
                      <span
                        className={`absolute right-0 top-full z-20 mt-2 w-80 rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-3 text-xs text-[var(--text)] shadow-xl transition ${
                          tpiHelpOpen
                            ? "pointer-events-auto opacity-100"
                            : "pointer-events-none opacity-0"
                        } group-hover:opacity-100 group-focus-within:opacity-100`}
                      >
                        <span className="block text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                          Tablette / mobile
                        </span>
                        <ol className="mt-2 list-decimal space-y-1 pl-4 text-[0.68rem] text-[var(--muted)]">
                          <li>
                            Envoie le rapport TPI depuis myTPI Pro a l eleve, en te
                            mettant en copie (CC to me).
                          </li>
                          <li>
                            Dans ta boite mail, ouvre le mail et clique sur partager
                            (icone fleche).
                          </li>
                          <li>Selectionne Imprimer.</li>
                          <li>
                            Dans l ecran d impression, partage a nouveau et choisis
                            Enregistrer dans Fichiers.
                          </li>
                          <li>
                            Importe le PDF ici. Attends quelques minutes, puis le profil
                            apparait en dessous dans la langue du compte.
                          </li>
                        </ol>
                        <span className="mt-3 block text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                          PC
                        </span>
                        <ol className="mt-2 list-decimal space-y-1 pl-4 text-[0.68rem] text-[var(--muted)]">
                          <li>
                            Envoie le rapport TPI depuis myTPI Pro a l eleve, en te
                            mettant en copie (CC to me).
                          </li>
                          <li>Ouvre le mail recu et imprime (Ctrl + P).</li>
                          <li>Dans la fenetre d impression, choisis Print to PDF.</li>
                          <li>
                            Importe le PDF ici. Attends quelques minutes, puis le profil
                            apparait en dessous dans la langue du compte.
                          </li>
                        </ol>
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={tpiUploading || isReadOnly}
                      onClick={() => {
                        if (tpiLocked) {
                          openTpiAddonModal();
                          return;
                        }
                        if (isReadOnly) return;
                        tpiInputRef.current?.click();
                      }}
                      className={`rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20 ${
                        tpiLocked || isReadOnly ? "cursor-not-allowed opacity-60" : ""
                      } disabled:opacity-60`}
                      aria-disabled={tpiLocked || isReadOnly}
                    >
                      Parcourir
                    </button>
                  </div>
                </div>
                <input
                  ref={tpiInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  disabled={tpiLocked || isReadOnly}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleTpiFile(file);
                  }}
                />
              </div>

              {tpiUploading ? (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                    <span>
                      {tpiPhase === "upload" ? (
                        <>
                          Upload du rapport
                          <span className="tpi-dots" aria-hidden="true" />
                        </>
                      ) : (
                        <>
                          Analyse en cours
                          <span className="tpi-dots" aria-hidden="true" />
                        </>
                      )}
                    </span>
                    <span className="min-w-[3ch] text-right text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                      {Math.round(tpiProgress)}%
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-white/10">
                    <div
                      className="h-2 rounded-full bg-rose-300 transition-all duration-700 ease-out"
                      style={{ width: `${tpiProgress}%` }}
                    />
                  </div>
                </div>
              ) : null}
              {tpiLoading ? (
                <p className="mt-3 text-xs text-[var(--muted)]">
                  Chargement des donnees TPI...
                </p>
              ) : null}
              {tpiError ? <p className="mt-3 text-xs text-red-300">{tpiError}</p> : null}

              {tpiReport && tpiReport.status === "ready" ? (
                <>
                  <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                    <div>
                      {tpiTests.length === 0 ? (
                        <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                          Aucun test TPI detecte.
                        </div>
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          {tpiTests.map((test) => {
                            const colorClass =
                              test.result_color === "green"
                                ? "bg-emerald-400"
                                : test.result_color === "orange"
                                  ? "bg-amber-400"
                                  : "bg-rose-400";
                            const isSelected = selectedTpi?.id === test.id;
                            return (
                              <button
                                key={test.id}
                                type="button"
                                onClick={() => setSelectedTpi(test)}
                                aria-pressed={isSelected}
                                className={`flex h-20 items-start gap-2 overflow-hidden rounded-xl border px-4 py-3 text-left transition ${
                                  isSelected
                                    ? "border-rose-300/40 bg-rose-400/10"
                                    : "border-white/10 bg-white/5 hover:border-white/20"
                                }`}
                              >
                                <span
                                  className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${colorClass}`}
                                />
                                <span className="max-h-16 min-w-0 overflow-hidden break-keep text-[0.7rem] font-semibold leading-snug text-[var(--text)]">
                                  {formatTpiTestName(test.test_name)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-[var(--muted)]">
                        {(["red", "orange", "green"] as const).map((color) => {
                          const dotClass =
                            color === "green"
                              ? "bg-emerald-400"
                              : color === "orange"
                                ? "bg-amber-400"
                                : "bg-rose-400";
                          return (
                            <div key={color} className="flex items-center gap-2">
                              <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
                              <span>{tpiLegendByColor[color]}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="panel-soft h-full rounded-2xl p-4">
                      {selectedTpi ? (
                        <div className="flex h-full flex-col gap-4">
                          <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                              Detail test
                            </p>
                            <h4 className="mt-2 text-lg font-semibold text-[var(--text)]">
                              {formatTpiTestName(selectedTpi.test_name)}
                            </h4>
                          </div>
                          <p className="text-sm text-[var(--muted)]">
                            {selectedTpi.mini_summary || "Resume indisponible."}
                          </p>
                          <button
                            type="button"
                            onClick={() => setTpiDetail(selectedTpi)}
                            disabled={
                              !selectedTpi.details && !selectedTpi.details_translated
                            }
                            className={`mt-auto w-full rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                              selectedTpi.details || selectedTpi.details_translated
                                ? "border-white/10 bg-white/10 text-[var(--text)] hover:bg-white/20"
                                : "cursor-not-allowed border-white/5 bg-white/5 text-[var(--muted)]"
                            }`}
                          >
                            Voir le detail complet
                          </button>
                        </div>
                      ) : (
                        <div className="text-sm text-[var(--muted)]">
                          Selectionne un test pour afficher le resume.
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : null}
            </section>

            <section className="panel relative rounded-2xl border border-violet-400/40 bg-violet-500/5 p-6 lg:col-span-2">
              {radarLocked ? (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={openRadarAddonModal}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openRadarAddonModal();
                    }
                  }}
                  className="absolute inset-0 z-10 flex cursor-pointer items-center justify-center rounded-2xl border border-violet-300/40 bg-violet-500/10 text-center text-xs uppercase tracking-[0.2em] text-violet-100 backdrop-blur-sm"
                >
                  <div className="flex flex-col items-center gap-3 px-6">
                    <span className="flex items-center gap-2">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <rect x="5" y="11" width="14" height="9" rx="2" />
                        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                      </svg>
                      Add-on Datas requis
                    </span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openRadarAddonModal();
                      }}
                      className="rounded-full border border-violet-200/40 bg-violet-400/20 px-4 py-1 text-[0.6rem] uppercase tracking-wide text-violet-100 transition hover:bg-violet-400/30"
                    >
                      Voir les offres
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--text)]">
                    Fichiers datas
                  </h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Importe un export {radarTechMeta.label} pour generer graphes, stats et
                    resume.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1">
                  <select
                    value={radarTech}
                    onChange={(event) => {
                      const next = event.target.value;
                      if (!isRadarTech(next)) {
                        setRadarError("Technologie datas invalide.");
                        return;
                      }
                      setRadarError("");
                      setRadarTech(next);
                    }}
                    disabled={radarLocked}
                    className="rounded-full border border-white/10 bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label="Technologie radar"
                  >
                    {RADAR_TECH_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={radarUploading || isReadOnly}
                    onClick={() => {
                      if (radarLocked) {
                        openRadarAddonModal();
                        return;
                      }
                      if (isReadOnly) return;
                      radarInputRef.current?.click();
                    }}
                    className={`rounded-full border border-white/10 bg-white/10 px-4 py-1.5 text-[0.65rem] uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20 ${
                      radarLocked || isReadOnly ? "cursor-not-allowed opacity-60" : ""
                    } disabled:opacity-60`}
                    aria-disabled={radarLocked || isReadOnly}
                  >
                    Importer un fichier
                  </button>
                </div>
              </div>
              <div
                className={`mt-4 rounded-xl border border-dashed px-4 py-4 text-sm text-[var(--muted)] transition ${
                  radarUploading
                    ? "border-violet-300/40 bg-violet-400/10 text-violet-100"
                    : "border-white/10 bg-white/5"
                }`}
                onDragOver={(event) => {
                  if (radarLocked || isReadOnly) return;
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  if (isReadOnly) return;
                  if (radarLocked) {
                    setRadarError("Add-on Datas requis pour importer un fichier.");
                    openRadarAddonModal();
                    return;
                  }
                  event.preventDefault();
                  const file = event.dataTransfer.files?.[0];
                  if (file) void handleRadarFile(file);
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-[var(--text)]">
                      Glisse une image d export {radarTechMeta.label}.
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      OCR et detection de tableau automatiquement.
                    </p>
                  </div>
                  <span className="rounded-full border border-violet-300/30 bg-violet-400/10 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-violet-100">
                    Add-on Datas Extraction
                  </span>
                </div>
                <input
                  ref={radarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={radarLocked || isReadOnly}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleRadarFile(file);
                  }}
                />
              </div>

              {radarUploading ? (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                    <span>
                      {radarPhase === "upload" ? (
                        <>
                          Upload du fichier
                          <span className="tpi-dots" aria-hidden="true" />
                        </>
                      ) : (
                        <>
                          Extraction en cours
                          <span className="tpi-dots" aria-hidden="true" />
                        </>
                      )}
                    </span>
                    <span className="min-w-[3ch] text-right text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                      {Math.round(radarProgress)}%
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-white/10">
                    <div
                      className="h-2 rounded-full bg-violet-300 transition-all duration-700 ease-out"
                      style={{ width: `${radarProgress}%` }}
                    />
                  </div>
                </div>
              ) : null}
              {radarLoading ? (
                <p className="mt-3 text-xs text-[var(--muted)]">
                  Chargement des fichiers datas...
                </p>
              ) : null}
              {radarError ? (
                <p className="mt-3 text-xs text-red-300">{radarError}</p>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-2 text-[0.6rem] uppercase tracking-wide">
                {radarFilterOptions.map((option) => {
                  const active = radarFilter === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleRadarFilterChange(option.id)}
                      className={`rounded-full border px-3 py-1 transition ${
                        active
                          ? option.tone
                          : "border-white/5 bg-white/5 text-[var(--muted)] hover:bg-white/10"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 space-y-3">
                {radarVisibleFiles.length === 0 ? (
                  <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                    {radarFilter === "all"
                      ? "Aucun fichier datas pour cet eleve."
                      : "Aucun fichier datas pour cette technologie."}
                  </div>
                ) : (
                  radarVisibleFiles.map((file) => {
                    const shotCount = file.shots?.length ?? 0;
                    const isReady = file.status === "ready";
                    const badgeTone =
                      file.status === "ready"
                        ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
                        : file.status === "error"
                          ? "border-rose-300/30 bg-rose-400/10 text-rose-100"
                          : "border-amber-300/30 bg-amber-400/10 text-amber-100";
                    return (
                      <div
                        key={file.id}
                        className="flex flex-col gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--text)] md:flex-row md:items-center md:justify-between"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">
                              {file.original_name ||
                                formatRadarSourceFallback(file.source)}
                            </p>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[0.6rem] uppercase tracking-wide ${
                                radarTechTone[file.source] ?? radarTechTone.unknown
                              }`}
                            >
                              {isRadarTech(file.source)
                                ? getRadarTechMeta(file.source).prefix
                                : "UNK"}
                            </span>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[0.6rem] uppercase tracking-wide ${badgeTone}`}
                            >
                              {file.status === "ready"
                                ? "Pret"
                                : file.status === "error"
                                  ? "Erreur"
                                  : "Analyse"}
                              {file.status === "processing" ? <LoadingDots /> : null}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            {formatDate(file.created_at, locale, timezone)} • {shotCount}{" "}
                            coups
                          </p>
                          {file.error ? (
                            <p
                              className={`mt-1 text-xs ${
                                file.status === "error"
                                  ? "text-rose-200"
                                  : "text-amber-200"
                              }`}
                            >
                              {file.status === "error"
                                ? file.error
                                : `A verifier: ${file.error}`}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={!isReady}
                            onClick={() => setRadarPreview(file)}
                            className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition ${
                              isReady
                                ? "border-white/10 bg-white/10 text-[var(--text)] hover:bg-white/20"
                                : "cursor-not-allowed border-white/5 bg-white/5 text-[var(--muted)]"
                            }`}
                          >
                            Voir
                          </button>
                          <button
                            type="button"
                            disabled={!isReady}
                            onClick={() => handleOpenRadarConfig(file)}
                            className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition ${
                              isReady
                                ? "border-white/10 bg-white/5 text-[var(--text)] hover:bg-white/10"
                                : "cursor-not-allowed border-white/5 bg-white/5 text-[var(--muted)]"
                            }`}
                          >
                            Configurer
                          </button>
                          <button
                            type="button"
                            disabled={radarDeletingId === file.id}
                            onClick={() => handleDeleteRadarFile(file)}
                            className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition ${
                              radarDeletingId === file.id
                                ? "cursor-not-allowed border-rose-300/20 bg-rose-400/10 text-rose-100/70"
                                : "border-rose-300/30 bg-rose-400/10 text-rose-100 hover:bg-rose-400/20"
                            }`}
                          >
                            {radarDeletingId === file.id ? "Suppression..." : "Supprimer"}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            {tpiDetail ? (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                onClick={() => setTpiDetail(null)}
              >
                <div
                  className="panel w-full max-w-2xl rounded-2xl p-6"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                        Test TPI
                      </p>
                      <h4 className="mt-2 text-lg font-semibold text-[var(--text)]">
                        {formatTpiTestName(tpiDetail.test_name)}
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTpiDetail(null)}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                    >
                      Fermer
                    </button>
                  </div>
                  <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--text)]">
                    <p className="whitespace-pre-wrap">
                      {tpiDetail.details_translated ||
                        tpiDetail.details ||
                        "Details indisponibles."}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {radarPreview ? (
              <div
                className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4"
                onClick={() => setRadarPreview(null)}
              >
                <div
                  className="panel w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl p-6"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                        Datas
                      </p>
                      <h4 className="mt-2 text-lg font-semibold text-[var(--text)]">
                        {radarPreview.original_name ||
                          formatRadarSourceFallback(radarPreview.source)}
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRadarPreview(null)}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                    >
                      Fermer
                    </button>
                  </div>
                  <div className="mt-4">
                    <RadarCharts
                      columns={radarPreview.columns ?? []}
                      shots={radarPreview.shots ?? []}
                      stats={radarPreview.stats}
                      summary={radarPreview.summary}
                      config={radarPreview.config}
                      analytics={radarPreview.analytics}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {radarConfigOpen && radarConfigFile ? (
              <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4">
                <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                        Extraction datas
                      </p>
                      <h3 className="mt-2 text-lg font-semibold text-[var(--text)]">
                        Mode d affichage
                      </h3>
                      <p className="mt-2 text-sm text-[var(--muted)]">
                        Definis les graphes et informations visibles par defaut.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCloseRadarConfig}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)]"
                      aria-label="Fermer"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M18 6L6 18" />
                        <path d="M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="mt-5 space-y-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                        Mode
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {[
                          { id: "default", label: "Defaut" },
                          { id: "custom", label: "Personnalise" },
                          { id: "ai", label: "IA" },
                        ].map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() =>
                              setRadarConfigDraft((prev) =>
                                option.id === "default"
                                  ? { ...defaultRadarConfig, mode: "default" }
                                  : option.id === "custom"
                                    ? { ...prev, mode: "custom" }
                                    : {
                                        ...prev,
                                        mode: "ai",
                                        options: {
                                          ...prev.options,
                                          aiPreset: prev.options?.aiPreset ?? "standard",
                                          aiSyntax:
                                            prev.options?.aiSyntax ?? "exp-tech-solution",
                                        },
                                      }
                              )
                            }
                            className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition ${
                              radarConfigDraft.mode === option.id
                                ? "border-violet-300/40 bg-violet-400/10 text-violet-100"
                                : "border-white/10 bg-white/5 text-[var(--muted)] hover:text-[var(--text)]"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-[0.65rem] text-[var(--muted)]">
                        En mode defaut, la selection des graphes est bloquee.
                      </p>
                      {radarConfigDraft.mode === "ai" ? (
                        <div className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3 text-[0.7rem] text-emerald-100">
                          <p className="text-[0.55rem] uppercase tracking-wide text-emerald-200/80">
                            Reglages IA datas
                          </p>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <div>
                              <p className="text-[0.6rem] uppercase tracking-wide text-emerald-200/80">
                                Nombre de graph
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {[
                                  { id: "ultra", label: "Ultra focus" },
                                  { id: "synthetic", label: "Synthetique" },
                                  { id: "standard", label: "Standard" },
                                  { id: "pousse", label: "Pousse" },
                                  { id: "complet", label: "Complet" },
                                ].map((option) => (
                                  <button
                                    key={option.id}
                                    type="button"
                                    onClick={() =>
                                      setRadarConfigDraft((prev) => ({
                                        ...prev,
                                        options: {
                                          ...prev.options,
                                          aiPreset: option.id as
                                            | "ultra"
                                            | "synthetic"
                                            | "standard"
                                            | "pousse"
                                            | "complet",
                                        },
                                      }))
                                    }
                                    className={`rounded-full border px-3 py-1 text-[0.6rem] uppercase tracking-wide ${
                                      (radarConfigDraft.options?.aiPreset ??
                                        "standard") === option.id
                                        ? "border-emerald-300/40 bg-emerald-400/20 text-emerald-50"
                                        : "border-emerald-200/20 text-emerald-100/70"
                                    }`}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <p className="text-[0.6rem] uppercase tracking-wide text-emerald-200/80">
                                Synthaxe
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {[
                                  { id: "exp-tech", label: "Explicative + technique" },
                                  {
                                    id: "exp-comp",
                                    label: "Explicative + comparative",
                                  },
                                  {
                                    id: "exp-tech-solution",
                                    label: "Explicative + tech + solution",
                                  },
                                  {
                                    id: "exp-solution",
                                    label: "Explicative + solution",
                                  },
                                  { id: "global", label: "Global" },
                                ].map((option) => (
                                  <button
                                    key={option.id}
                                    type="button"
                                    onClick={() =>
                                      setRadarConfigDraft((prev) => ({
                                        ...prev,
                                        options: {
                                          ...prev.options,
                                          aiSyntax: option.id as
                                            | "exp-tech"
                                            | "exp-comp"
                                            | "exp-tech-solution"
                                            | "exp-solution"
                                            | "global",
                                        },
                                      }))
                                    }
                                    className={`rounded-full border px-3 py-1 text-[0.6rem] uppercase tracking-wide ${
                                      (radarConfigDraft.options?.aiSyntax ??
                                        "exp-tech-solution") === option.id
                                        ? "border-emerald-300/40 bg-emerald-400/20 text-emerald-50"
                                        : "border-emerald-200/20 text-emerald-100/70"
                                    }`}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                          <p className="mt-3 text-[0.65rem] text-emerald-100/70">
                            Utilise ces reglages pour l auto-selection IA.
                          </p>
                        </div>
                      ) : null}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        { key: "showSummary", label: "Resume IA" },
                        { key: "showTable", label: "Tableau complet" },
                        { key: "showSegments", label: "Comparatifs & segments" },
                      ].map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          disabled={radarConfigDraft.mode !== "custom"}
                          onClick={() =>
                            setRadarConfigDraft((prev) => ({
                              ...prev,
                              [item.key]:
                                !prev[
                                  item.key as "showSummary" | "showTable" | "showSegments"
                                ],
                            }))
                          }
                          className={`rounded-2xl border px-3 py-3 text-left text-sm transition ${
                            radarConfigDraft[
                              item.key as "showSummary" | "showTable" | "showSegments"
                            ]
                              ? "border-violet-300/40 bg-violet-400/10 text-violet-100"
                              : "border-white/10 bg-white/5 text-[var(--muted)]"
                          } ${
                            radarConfigDraft.mode !== "custom"
                              ? "cursor-not-allowed opacity-60"
                              : "hover:text-[var(--text)]"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                        Graphes
                      </p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {[
                          {
                            key: "dispersion",
                            label: "Dispersion",
                            description:
                              "Dispersion laterale vs distance pour evaluer la precision.",
                          },
                          {
                            key: "carryTotal",
                            label: "Carry vs total",
                            description: "Compare carry et distance totale par coup.",
                          },
                          {
                            key: "speeds",
                            label: "Vitesse club/balle",
                            description:
                              "Evolution des vitesses pour estimer l efficacite.",
                          },
                          {
                            key: "spinCarry",
                            label: "Spin vs carry",
                            description: "Relation entre spin et distance (carry).",
                          },
                          {
                            key: "smash",
                            label: "Smash factor",
                            description: "Efficacite d impact au fil des coups.",
                          },
                          {
                            key: "faceImpact",
                            label: "Impact face",
                            description: "Carte des impacts sur la face du club.",
                          },
                        ].map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            disabled={radarConfigDraft.mode !== "custom"}
                            onClick={() =>
                              setRadarConfigDraft((prev) => ({
                                ...prev,
                                charts: {
                                  ...prev.charts,
                                  [item.key]:
                                    !prev.charts[item.key as keyof RadarConfig["charts"]],
                                },
                              }))
                            }
                            title={item.description}
                            className={`rounded-2xl border px-3 py-3 text-left text-sm transition ${
                              radarConfigDraft.charts[
                                item.key as keyof RadarConfig["charts"]
                              ]
                                ? "border-violet-300/40 bg-violet-400/10 text-violet-100"
                                : "border-white/10 bg-white/5 text-[var(--muted)]"
                            } ${
                              radarConfigDraft.mode !== "custom"
                                ? "cursor-not-allowed opacity-60"
                                : "hover:text-[var(--text)]"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span>{item.label}</span>
                              <span
                                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-white/5 text-[0.6rem] font-semibold text-[var(--text)]"
                                title={item.description}
                              >
                                ?
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                      <details className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
                        <summary className="cursor-pointer text-xs uppercase tracking-wide text-[var(--muted)]">
                          Graphes avances
                        </summary>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[0.65rem] text-[var(--muted)]">
                            Astuce: passe en mode personnalise pour activer/desactiver.
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={radarConfigDraft.mode !== "custom"}
                              onClick={() =>
                                setRadarConfigDraft((prev) => ({
                                  ...prev,
                                  charts: {
                                    ...prev.charts,
                                    ...Object.fromEntries(
                                      RADAR_CHART_DEFINITIONS.map((definition) => [
                                        definition.key,
                                        true,
                                      ])
                                    ),
                                  },
                                }))
                              }
                              className={`rounded-full border px-3 py-1 text-[0.6rem] uppercase tracking-wide ${
                                radarConfigDraft.mode !== "custom"
                                  ? "border-white/10 text-[var(--muted)] opacity-60"
                                  : "border-white/20 text-[var(--text)] hover:text-white"
                              }`}
                            >
                              Tout activer
                            </button>
                            <button
                              type="button"
                              disabled={radarConfigDraft.mode !== "custom"}
                              onClick={() =>
                                setRadarConfigDraft((prev) => ({
                                  ...prev,
                                  charts: {
                                    ...prev.charts,
                                    ...Object.fromEntries(
                                      RADAR_CHART_DEFINITIONS.map((definition) => [
                                        definition.key,
                                        false,
                                      ])
                                    ),
                                  },
                                }))
                              }
                              className={`rounded-full border px-3 py-1 text-[0.6rem] uppercase tracking-wide ${
                                radarConfigDraft.mode !== "custom"
                                  ? "border-white/10 text-[var(--muted)] opacity-60"
                                  : "border-white/20 text-[var(--text)] hover:text-white"
                              }`}
                            >
                              Tout desactiver
                            </button>
                          </div>
                        </div>
                        <div className="mt-3 space-y-4">
                          {RADAR_CHART_GROUPS.map((group) => {
                            const charts = RADAR_CHART_DEFINITIONS.filter(
                              (definition) => definition.group === group.key
                            );
                            if (!charts.length) return null;
                            return (
                              <div key={group.key} className="space-y-2">
                                <p className="text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                                  {group.label}
                                </p>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  {charts.map((definition) => (
                                    <button
                                      key={definition.key}
                                      type="button"
                                      disabled={radarConfigDraft.mode !== "custom"}
                                      onClick={() =>
                                        setRadarConfigDraft((prev) => ({
                                          ...prev,
                                          charts: {
                                            ...prev.charts,
                                            [definition.key]:
                                              !prev.charts[definition.key],
                                          },
                                        }))
                                      }
                                      className={`rounded-2xl border px-3 py-3 text-left text-[0.7rem] transition ${
                                        radarConfigDraft.charts[definition.key]
                                          ? "border-violet-300/40 bg-violet-400/10 text-violet-100"
                                          : "border-white/10 bg-white/5 text-[var(--muted)]"
                                      } ${
                                        radarConfigDraft.mode !== "custom"
                                          ? "cursor-not-allowed opacity-60"
                                          : "hover:text-[var(--text)]"
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span>{definition.title}</span>
                                        <span
                                          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-white/5 text-[0.55rem] font-semibold text-[var(--text)]"
                                          title={definition.description}
                                        >
                                          ?
                                        </span>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    </div>
                  </div>
                  {radarConfigError ? (
                    <p className="mt-4 text-sm text-red-400">{radarConfigError}</p>
                  ) : null}
                  <div className="mt-6 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={handleCloseRadarConfig}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                      disabled={radarConfigSaving}
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveRadarConfig}
                      disabled={radarConfigSaving}
                      className="rounded-full bg-gradient-to-r from-violet-300 via-violet-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
                    >
                      {radarConfigSaving ? "Sauvegarde..." : "Sauvegarder"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {editOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
              <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                      Eleve
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-[var(--text)]">
                      Modifier les informations
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseEdit}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)]"
                    aria-label="Fermer"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 6L6 18" />
                      <path d="M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="mt-5 grid gap-4">
                  <div>
                    <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      Prenom
                    </label>
                    <input
                      type="text"
                      value={editForm.first_name}
                      onChange={(event) =>
                        setEditForm((prev) => ({
                          ...prev,
                          first_name: event.target.value,
                        }))
                      }
                      className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      Nom
                    </label>
                    <input
                      type="text"
                      value={editForm.last_name}
                      onChange={(event) =>
                        setEditForm((prev) => ({
                          ...prev,
                          last_name: event.target.value,
                        }))
                      }
                      className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      Email
                    </label>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(event) =>
                        setEditForm((prev) => ({
                          ...prev,
                          email: event.target.value,
                        }))
                      }
                      className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      Sens de jeu
                    </label>
                    <select
                      value={editForm.playing_hand}
                      onChange={(event) =>
                        setEditForm((prev) => ({
                          ...prev,
                          playing_hand: event.target.value as "" | "left" | "right",
                        }))
                      }
                      className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                    >
                      <option value="">Non precise</option>
                      <option value="right">Droitier</option>
                      <option value="left">Gaucher</option>
                    </select>
                  </div>
                </div>
                {editError ? (
                  <p className="mt-4 text-sm text-red-400">{editError}</p>
                ) : null}
                <div className="mt-6 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCloseEdit}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                    disabled={editSaving}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleUpdateStudent}
                    disabled={editSaving}
                    className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
                  >
                    {editSaving ? "Enregistrement..." : "Enregistrer"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {shareModalOpen ? (
            <ShareStudentModal
              onClose={() => setShareModalOpen(false)}
              onShare={handleShareStudent}
            />
          ) : null}
          <PremiumOfferModal
            open={premiumModalOpen}
            onClose={closePremiumModal}
            notice={premiumNotice}
          />
        </div>
      )}
    </RoleGuard>
  );
}
