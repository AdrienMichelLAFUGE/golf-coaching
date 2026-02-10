"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { PLAN_ENTITLEMENTS, PLAN_LABELS } from "@/lib/plans";
import { RADAR_LOADING_PHRASES, TPI_LOADING_PHRASES } from "@/lib/loading-phrases";
import { useRotatingPhrase } from "@/lib/use-rotating-phrase";
import RoleGuard from "../../../_components/role-guard";
import { useProfile } from "../../../_components/profile-context";
import PageBack from "../../../_components/page-back";
import PageHeader from "../../../_components/page-header";
import PremiumOfferModal from "../../../_components/premium-offer-modal";
import ShareStudentModal from "../../../_components/share-student-modal";
import RadarReviewModal from "../../../_components/radar-review-modal";
import Badge from "../../../_components/badge";
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
import { z } from "zod";
import {
  buildNormalizedTestsSummary,
  getNormalizedTestDescription,
  getNormalizedTestTitle,
  NormalizedTestAssignmentSchema,
  NormalizedTestAttemptSchema,
  type NormalizedTestAssignment,
  type NormalizedTestAttempt,
  type NormalizedTestSlug,
} from "@/lib/normalized-tests/monitoring";
import { pickReportTime } from "@/lib/reports-kpis";
import {
  ReportSectionKpiSchema,
  buildLongTermHighlights,
  buildReportHighlights,
  type LongTermHighlights,
  type ReportHighlights,
} from "@/lib/report-highlights";
import {
  ReportKpisRowSchema,
  ReportKpisStatusSchema,
  type ReportKpisRow,
  type ReportKpisStatus,
} from "@/lib/report-kpis-ai";
import { PELZ_PUTTING_SLUG } from "@/lib/normalized-tests/pelz-putting";
import { PELZ_APPROCHES_SLUG } from "@/lib/normalized-tests/pelz-approches";
import { WEDGING_DRAPEAU_LONG_SLUG } from "@/lib/normalized-tests/wedging-drapeau-long";
import { WEDGING_DRAPEAU_COURT_SLUG } from "@/lib/normalized-tests/wedging-drapeau-court";

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
  org_id: string;
  coach_observations?: string | null;
  coach_work?: string | null;
  coach_club?: string | null;
  organizations?: OrganizationRef;
};

type OrganizationRef =
  | {
      name: string | null;
    }
  | { name: string | null }[]
  | null;

type TpiReport = {
  id: string;
  status: "processing" | "ready" | "error";
  file_url: string;
  file_type: "pdf" | "image";
  original_name: string | null;
  created_at: string;
  org_id: string;
  organizations?: OrganizationRef;
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
  status: "processing" | "ready" | "error" | "review";
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
  org_id: string;
  organizations?: OrganizationRef;
};

type ShareEntry = {
  id: string;
  viewer_email: string;
  created_at: string;
};

type AssignmentCoach = {
  coach_id: string;
  profiles?: { full_name: string | null } | null;
};

type OrgCoachOption = {
  user_id: string;
  role: "admin" | "coach";
  status: "active" | "invited" | "disabled";
  profiles?: { full_name: string | null } | null;
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

const tpiStatusLabel = (color: TpiTest["result_color"]) => {
  if (color === "green") return "OK";
  if (color === "orange") return "A surveiller";
  return "Bloquant";
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

const NORMALIZED_TEST_CHOICES: Array<{
  slug: NormalizedTestSlug;
  title: string;
  description: string;
}> = [
  {
    slug: PELZ_PUTTING_SLUG,
    title: getNormalizedTestTitle(PELZ_PUTTING_SLUG),
    description: getNormalizedTestDescription(PELZ_PUTTING_SLUG),
  },
  {
    slug: PELZ_APPROCHES_SLUG,
    title: getNormalizedTestTitle(PELZ_APPROCHES_SLUG),
    description: getNormalizedTestDescription(PELZ_APPROCHES_SLUG),
  },
  {
    slug: WEDGING_DRAPEAU_LONG_SLUG,
    title: getNormalizedTestTitle(WEDGING_DRAPEAU_LONG_SLUG),
    description: getNormalizedTestDescription(WEDGING_DRAPEAU_LONG_SLUG),
  },
  {
    slug: WEDGING_DRAPEAU_COURT_SLUG,
    title: getNormalizedTestTitle(WEDGING_DRAPEAU_COURT_SLUG),
    description: getNormalizedTestDescription(WEDGING_DRAPEAU_COURT_SLUG),
  },
];

export default function CoachStudentDetailPage() {
  const {
    organization,
    userEmail,
    profile,
    workspaceType,
    isWorkspaceAdmin,
    isWorkspacePremium,
    planTier,
  } = useProfile();
  const params = useParams();
  const router = useRouter();
  const studentId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [student, setStudent] = useState<Student | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tpiReport, setTpiReport] = useState<TpiReport | null>(null);
  const [tpiTests, setTpiTests] = useState<TpiTest[]>([]);
  const [tpiFilter, setTpiFilter] = useState<"all" | TpiTest["result_color"]>("all");
  const [tpiQuery, setTpiQuery] = useState("");
  const [tpiLoading, setTpiLoading] = useState(false);
  const [tpiError, setTpiError] = useState("");
  const [tpiUploading, setTpiUploading] = useState(false);
  const [tpiProgress, setTpiProgress] = useState(0);
  const [tpiPhase, setTpiPhase] = useState<"upload" | "analyse">("upload");
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
  const [normalizedTestAssignments, setNormalizedTestAssignments] = useState<
    NormalizedTestAssignment[]
  >([]);
  const [normalizedTestAttempts, setNormalizedTestAttempts] = useState<
    NormalizedTestAttempt[]
  >([]);
  const [normalizedTestsLoading, setNormalizedTestsLoading] = useState(false);
  const [normalizedTestsError, setNormalizedTestsError] = useState("");
  const [assignTestModalOpen, setAssignTestModalOpen] = useState(false);
  const [assignTestSlug, setAssignTestSlug] = useState<NormalizedTestSlug>(PELZ_PUTTING_SLUG);
  const [assignTestSubmitting, setAssignTestSubmitting] = useState(false);
  const [assignTestError, setAssignTestError] = useState("");
  const [radarProgress, setRadarProgress] = useState(0);
  const [radarPhase, setRadarPhase] = useState<"upload" | "analyse">("upload");
  const radarInputRef = useRef<HTMLInputElement | null>(null);
  const radarProgressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [radarPreview, setRadarPreview] = useState<RadarFile | null>(null);
  const [radarReview, setRadarReview] = useState<RadarFile | null>(null);
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
  const [assignmentCoaches, setAssignmentCoaches] = useState<AssignmentCoach[]>([]);
  const [coachOptions, setCoachOptions] = useState<OrgCoachOption[]>([]);
  const [selectedCoachIds, setSelectedCoachIds] = useState<string[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignmentsSaving, setAssignmentsSaving] = useState(false);
  const [assignmentsError, setAssignmentsError] = useState("");
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [shareStatus, setShareStatus] = useState<ShareStatus | null>(null);
  const [ownerShares, setOwnerShares] = useState<ShareEntry[]>([]);
  const [ownerShareError, setOwnerShareError] = useState("");
  const [ownerShareRevokingId, setOwnerShareRevokingId] = useState<string | null>(null);
  const locale = organization?.locale ?? "fr-FR";
  const timezone = organization?.timezone ?? "Europe/Paris";
  const isAdmin = userEmail?.toLowerCase() === "adrien.lafuge@outlook.fr";
  const entitlements = PLAN_ENTITLEMENTS[planTier];
  const tpiAddonEnabled = isAdmin || entitlements.tpiEnabled;
  const radarAddonEnabled = isAdmin || entitlements.dataExtractEnabled;
  const tpiLocked = !tpiAddonEnabled;
  const radarLoadingPhrase = useRotatingPhrase(
    RADAR_LOADING_PHRASES,
    radarUploading,
    { intervalMs: 14000 }
  );
  const tpiLoadingPhrase = useRotatingPhrase(TPI_LOADING_PHRASES, tpiUploading, {
    intervalMs: 14000,
  });
  const radarLocked = !radarAddonEnabled;
  const isOwner = profile?.role === "owner";
  const isAssigned = assignmentCoaches.some((entry) => entry.coach_id === profile?.id);
  const canPublishInOrg =
    workspaceType === "org" && isWorkspacePremium && (isAssigned || isWorkspaceAdmin);
  const canProposeInOrg = workspaceType === "org" && isWorkspacePremium && !isAssigned;
  const shareAccess = getViewerShareAccess(shareStatus);
  const getOrgName = useCallback((value?: OrganizationRef) => {
    if (!value) return null;
    if (Array.isArray(value)) return value[0]?.name ?? null;
    return value.name ?? null;
  }, []);
  const formatSourceLabel = useCallback(
    (orgId?: string | null, orgName?: string | null) => {
      if (orgName) return orgName;
      if (!orgId) return null;
      if (orgId === organization?.id) return "Workspace actuel";
      return "Autre workspace";
    },
    [organization?.id]
  );
  const tpiSourceLabel = formatSourceLabel(
    tpiReport?.org_id,
    getOrgName(tpiReport?.organizations)
  );
  const resolveLinkedStudentIds = useCallback(
    async (targetStudentId?: string | null) => {
      if (!targetStudentId) return [];
      const { data, error } = await supabase.rpc("get_linked_student_ids", {
        _student_id: targetStudentId,
      });
      if (error) return [targetStudentId];
      const ids = Array.isArray(data) ? data.filter(Boolean) : [];
      return ids.length > 0 ? (ids as string[]) : [targetStudentId];
    },
    []
  );
  const isOrgReadOnly = workspaceType === "org" && !isWorkspacePremium;
  const isReadOnly = shareAccess.canRead || isOrgReadOnly;
  const canWriteReports = workspaceType === "org" ? canPublishInOrg : !isReadOnly;
  const canManageAssignments = workspaceType === "org" && isWorkspacePremium && !isReadOnly;
  const radarTechMeta = getRadarTechMeta(radarTech);
  const getCoachLabel = (fullName: string | null | undefined, coachId: string) => {
    const trimmed = fullName?.trim();
    if (trimmed) return trimmed;
    return `Coach (${coachId.slice(0, 6)})`;
  };
  const hasMissingCoachNames = coachOptions.some((coach) => !coach.profiles?.full_name);
  const radarVisibleFiles = useMemo(() => {
    if (radarFilter === "all") return radarFiles;
    return radarFiles.filter((file) => file.source === radarFilter);
  }, [radarFiles, radarFilter]);

  const tpiCounts = useMemo(() => {
    const total = tpiTests.length;
    const green = tpiTests.filter((t) => t.result_color === "green").length;
    const orange = tpiTests.filter((t) => t.result_color === "orange").length;
    const red = tpiTests.filter((t) => t.result_color === "red").length;
    return { total, green, orange, red };
  }, [tpiTests]);

  const visibleTpiTests = useMemo(() => {
    const normalizedQuery = tpiQuery.trim().toLowerCase();
    return tpiTests.filter((test) => {
      if (tpiFilter !== "all" && test.result_color !== tpiFilter) return false;
      if (!normalizedQuery) return true;
      return (
        test.test_name.toLowerCase().includes(normalizedQuery) ||
        formatTpiTestName(test.test_name).toLowerCase().includes(normalizedQuery)
      );
    });
  }, [tpiTests, tpiFilter, tpiQuery]);
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

  const publishedReports = useMemo(() => {
    const eligible = reports.filter((report) => Boolean(report.sent_at));
    // Sort newest-first by report_date then created_at.
    return [...eligible].sort((a, b) => pickReportTime(b) - pickReportTime(a));
  }, [reports]);
  const latestPublishedReport = useMemo(
    () => publishedReports[0] ?? null,
    [publishedReports]
  );
  const longReportIds = useMemo(
    () => publishedReports.slice(0, 5).map((r) => r.id),
    [publishedReports]
  );
  const shortReportId = latestPublishedReport?.id ?? null;
  const [reportHighlightsShort, setReportHighlightsShort] = useState<ReportHighlights>({
    strength: null,
    weakness: null,
    physical: null,
    technical: null,
  });
  const [reportHighlightsLong, setReportHighlightsLong] = useState<LongTermHighlights>({
    strength: { snippet: null, mentions: 0 },
    weakness: { snippet: null, mentions: 0 },
    physical: { snippet: null, mentions: 0 },
    technical: { snippet: null, mentions: 0 },
  });
  const [reportHighlightsLoading, setReportHighlightsLoading] = useState(false);
  const [reportHighlightsError, setReportHighlightsError] = useState("");
  const [aiKpisRow, setAiKpisRow] = useState<ReportKpisRow | null>(null);
  const [aiKpisStatus, setAiKpisStatus] = useState<ReportKpisStatus | "missing">("missing");
  const [aiKpisLoading, setAiKpisLoading] = useState(false);
  const [aiKpisError, setAiKpisError] = useState("");
  const [aiKpisRegenerating, setAiKpisRegenerating] = useState(false);
  const normalizedTestsSummary = useMemo(
    () => buildNormalizedTestsSummary(normalizedTestAssignments, normalizedTestAttempts),
    [normalizedTestAssignments, normalizedTestAttempts]
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

  const handleRegenerateAiKpis = useCallback(async () => {
    if (!shortReportId) return;
    setAiKpisError("");
    setAiKpisRegenerating(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setAiKpisError("Session invalide.");
      setAiKpisRegenerating(false);
      return;
    }

    const response = await fetch("/api/reports/kpis/regenerate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reportId: shortReportId }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      status?: string;
      error?: string;
    };

    if (!response.ok) {
      setAiKpisError(payload.error ?? "Regeneration impossible.");
      setAiKpisRegenerating(false);
      return;
    }

    const nextStatusParsed = ReportKpisStatusSchema.safeParse(payload.status);
    const nextStatus: ReportKpisStatus = nextStatusParsed.success
      ? nextStatusParsed.data
      : ("pending" as const);
    setAiKpisStatus(nextStatus);

    setAiKpisLoading(true);
    const { data: rowData, error: rowError } = await supabase
      .from("report_kpis")
      .select(
        "id, org_id, student_id, report_id, status, input_hash, prompt_version, model, kpis_short, kpis_long, error, created_at, updated_at"
      )
      .eq("report_id", shortReportId)
      .maybeSingle();

    if (rowError) {
      setAiKpisError("KPI IA indisponibles.");
      setAiKpisLoading(false);
      setAiKpisRegenerating(false);
      return;
    }

    if (!rowData) {
      setAiKpisRow(null);
      setAiKpisLoading(false);
      setAiKpisRegenerating(false);
      return;
    }

    const rowParsed = ReportKpisRowSchema.safeParse(rowData);
    if (!rowParsed.success) {
      setAiKpisError("Donnees KPI invalides.");
      setAiKpisLoading(false);
      setAiKpisRegenerating(false);
      return;
    }

    const rowStatusParsed = ReportKpisStatusSchema.safeParse(rowParsed.data.status);
    setAiKpisStatus(rowStatusParsed.success ? rowStatusParsed.data : nextStatus);
    setAiKpisRow(rowParsed.data);
    setAiKpisLoading(false);
    setAiKpisRegenerating(false);
  }, [shortReportId]);

  const openRadarAddonModal = useCallback(() => {
    const planLabel = PLAN_LABELS[planTier];
    openPremiumModal({
      title: "Acces datas bloque",
      description:
        planTier === "free"
          ? "Disponible des le plan Pro."
          : "Ton plan actuel ne permet pas l extraction de datas.",
      tags: [`Plan ${planLabel}`],
      status: [{ label: "Plan", value: planLabel }],
    });
  }, [openPremiumModal, planTier]);

  const openTpiAddonModal = useCallback(() => {
    const planLabel = PLAN_LABELS[planTier];
    openPremiumModal({
      title: "Acces TPI bloque",
      description:
        planTier === "free"
          ? "Disponible des le plan Pro."
          : "Ton plan actuel ne permet pas le profil TPI.",
      tags: [`Plan ${planLabel}`],
      status: [{ label: "Plan", value: planLabel }],
    });
  }, [openPremiumModal, planTier]);

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
    async () => {
      if (!studentId) return;

      setTpiLoading(true);
      setTpiError("");

      const linkedIds = await resolveLinkedStudentIds(studentId);
      if (linkedIds.length === 0) {
        setTpiReport(null);
        setTpiTests([]);
        setSelectedTpi(null);
        setTpiLoading(false);
        return;
      }

      let reportData: TpiReport | null = null;

      if (!reportData) {
        const { data, error } = await supabase
          .from("tpi_reports")
          .select(
            "id, status, file_url, file_type, original_name, created_at, org_id, organizations(name)"
          )
          .in("student_id", linkedIds)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!error && data) reportData = data as TpiReport;
      }

      if (reportData && reportData.status !== "ready") {
        const { data, error } = await supabase
          .from("tpi_reports")
          .select(
            "id, status, file_url, file_type, original_name, created_at, org_id, organizations(name)"
          )
          .in("student_id", linkedIds)
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
    [studentId, resolveLinkedStudentIds]
  );

  const loadRadars = useCallback(async () => {
    if (!studentId) return [];
    setRadarLoading(true);
    setRadarError("");

    const linkedIds = await resolveLinkedStudentIds(studentId);
    if (linkedIds.length === 0) {
      setRadarFiles([]);
      setRadarLoading(false);
      return [];
    }

    const { data, error } = await supabase
      .from("radar_files")
      .select(
        "id, status, source, original_name, file_url, file_mime, columns, shots, stats, config, summary, analytics, created_at, extracted_at, error, org_id, organizations(name)"
      )
      .in("student_id", linkedIds)
      .order("created_at", { ascending: false });

    if (error) {
      setRadarError(error.message);
      setRadarFiles([]);
      setRadarLoading(false);
      return [];
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
    return normalized as RadarFile[];
  }, [studentId, resolveLinkedStudentIds]);

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
      setTpiError("Plan Pro requis pour importer un rapport TPI.");
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
      const message =
        (insertError?.message?.includes("row-level security") ?? false)
          ? "Quota TPI atteint (30 jours glissants)."
          : (insertError?.message ?? "Erreur lors de l enregistrement TPI.");
      setTpiError(message);
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

    await loadTpi();
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
      setRadarError("Plan Pro requis pour importer un fichier datas.");
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
      const message =
        (insertError?.message?.includes("row-level security") ?? false)
          ? "Plan Pro requis pour importer des datas."
          : (insertError?.message ?? "Erreur d enregistrement datas.");
      setRadarError(message);
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

    const refreshed = await loadRadars();
    stopRadarProgress();
    setRadarProgress(100);
    setRadarUploading(false);
    const reviewFile = refreshed.find((file) => file.id === radarRow.id);
    if (reviewFile?.status === "review") {
      setRadarReview(reviewFile);
    }
  };

  const handleConfirmRadarReview = async (payload: {
    columns: RadarColumn[];
    shots: RadarShot[];
    club: "auto" | "driver" | "iron";
  }) => {
    if (!radarReview) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      throw new Error("Session invalide.");
    }
    const response = await fetch("/api/radar/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        radarFileId: radarReview.id,
        columns: payload.columns,
        shots: payload.shots,
        club: payload.club,
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? "Validation impossible.");
    }
    await loadRadars();
    setRadarReview(null);
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
        .maybeSingle();

      if (studentError) {
        setError(studentError.message);
        setLoading(false);
        return;
      }
      if (!studentData) {
        setLoading(false);
        router.replace("/app/coach/eleves");
        return;
      }

      setStudent(studentData);
      await loadTpi();

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

      const linkedIds = await resolveLinkedStudentIds(studentId);
      if (linkedIds.length === 0) {
        setReports([]);
        setLoading(false);
        return;
      }
      const { data: reportData, error: reportError } = await supabase
        .from("reports")
        .select(
          "id, title, report_date, created_at, sent_at, org_id, organizations(name), coach_observations, coach_work, coach_club"
        )
        .in("student_id", linkedIds)
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
  }, [studentId, loadTpi, resolveLinkedStudentIds, userEmail, isOwner, router]);

  const loadNormalizedTests = useCallback(
    async (targetStudentId: string, isCancelled?: () => boolean) => {
      const parsedId = z.string().uuid().safeParse(targetStudentId);
      if (!parsedId.success) {
        setNormalizedTestsError("Identifiant eleve invalide.");
        setNormalizedTestAssignments([]);
        setNormalizedTestAttempts([]);
        return;
      }

      setNormalizedTestsLoading(true);
      setNormalizedTestsError("");

      const { data: assignmentData, error: assignmentError } = await supabase
        .from("normalized_test_assignments")
        .select(
          "id, test_slug, status, assigned_at, started_at, finalized_at, archived_at, updated_at, index_or_flag_label, clubs_used"
        )
        .eq("student_id", targetStudentId)
        .order("assigned_at", { ascending: false });

      if (isCancelled?.()) return;

      if (assignmentError) {
        setNormalizedTestsError(assignmentError.message);
        setNormalizedTestAssignments([]);
        setNormalizedTestAttempts([]);
        setNormalizedTestsLoading(false);
        return;
      }

      const assignmentsParsed = z
        .array(NormalizedTestAssignmentSchema)
        .safeParse(assignmentData ?? []);

      if (!assignmentsParsed.success) {
        setNormalizedTestsError("Donnees de tests invalides.");
        setNormalizedTestAssignments([]);
        setNormalizedTestAttempts([]);
        setNormalizedTestsLoading(false);
        return;
      }

      const assignments = assignmentsParsed.data;
      setNormalizedTestAssignments(assignments);

      const assignmentIds = assignments.map((a) => a.id);
      if (assignmentIds.length === 0) {
        setNormalizedTestAttempts([]);
        setNormalizedTestsLoading(false);
        return;
      }

      const { data: attemptData, error: attemptError } = await supabase
        .from("normalized_test_attempts")
        .select("id, assignment_id, subtest_key, attempt_index, result_value, points, created_at")
        .in("assignment_id", assignmentIds);

      if (isCancelled?.()) return;

      if (attemptError) {
        setNormalizedTestsError(attemptError.message);
        setNormalizedTestAttempts([]);
        setNormalizedTestsLoading(false);
        return;
      }

      const attemptsParsed = z
        .array(NormalizedTestAttemptSchema)
        .safeParse(attemptData ?? []);

      if (!attemptsParsed.success) {
        setNormalizedTestsError("Donnees de tentatives invalides.");
        setNormalizedTestAttempts([]);
        setNormalizedTestsLoading(false);
        return;
      }

      setNormalizedTestAttempts(attemptsParsed.data);
      setNormalizedTestsLoading(false);
    },
    []
  );

  useEffect(() => {
    if (!studentId) return;

    let cancelled = false;

    Promise.resolve().then(() => {
      if (cancelled) return;
      void loadNormalizedTests(studentId, () => cancelled);
    });

    return () => {
      cancelled = true;
    };
  }, [studentId, loadNormalizedTests]);

  useEffect(() => {
    if (workspaceType !== "org" || !studentId || !organization?.id) {
      return;
    }

    const loadAssignments = async () => {
      setAssignmentsLoading(true);
      setAssignmentsError("");

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setAssignmentsError("Session invalide.");
        setAssignmentsLoading(false);
        return;
      }

      const assignmentsResponse = await fetch(
        `/api/orgs/assignments?studentId=${studentId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const assignmentsPayload = (await assignmentsResponse.json()) as {
        assignments?: AssignmentCoach[];
        error?: string;
      };
      if (!assignmentsResponse.ok) {
        setAssignmentsError(assignmentsPayload.error ?? "Chargement impossible.");
        setAssignmentsLoading(false);
        return;
      }
      const assignmentsData = assignmentsPayload.assignments ?? [];

      const assignments = (assignmentsData ?? []).map((entry) => {
        const profiles = Array.isArray(entry.profiles)
          ? (entry.profiles[0] ?? null)
          : (entry.profiles ?? null);
        return {
          coach_id: entry.coach_id,
          profiles,
        };
      }) as AssignmentCoach[];
      setAssignmentCoaches(assignments);
      setSelectedCoachIds(assignments.map((item) => item.coach_id));
      if (canManageAssignments) {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          setAssignmentsError("Session invalide.");
          setAssignmentsLoading(false);
          return;
        }
        const membersResponse = await fetch("/api/orgs/coaches", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const membersPayload = (await membersResponse.json()) as {
          members?: OrgCoachOption[];
          error?: string;
        };
        if (!membersResponse.ok) {
          setAssignmentsError(membersPayload.error ?? "Chargement impossible.");
          setAssignmentsLoading(false);
          return;
        }
        const options = (membersPayload.members ?? []).map((entry) => {
          const profiles = Array.isArray(entry.profiles)
            ? (entry.profiles[0] ?? null)
            : (entry.profiles ?? null);
          return {
            user_id: entry.user_id,
            role: entry.role,
            status: entry.status,
            profiles,
          };
        }) as OrgCoachOption[];
        setCoachOptions(options);
      } else {
        setCoachOptions([]);
      }
      setAssignmentsLoading(false);
    };

    loadAssignments();
  }, [workspaceType, studentId, organization?.id, canManageAssignments]);

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

  const handleSaveAssignments = async () => {
    if (!studentId) return;
    if (selectedCoachIds.length === 0) {
      setAssignmentsError("Selectionne au moins un coach.");
      return;
    }
    setAssignmentsSaving(true);
    setAssignmentsError("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setAssignmentsError("Session invalide.");
      setAssignmentsSaving(false);
      return;
    }
    const response = await fetch("/api/orgs/assignments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        studentId,
        coachIds: selectedCoachIds,
      }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setAssignmentsError(payload.error ?? "Mise a jour impossible.");
      setAssignmentsSaving(false);
      return;
    }
    setAssignmentsSaving(false);
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

  useEffect(() => {
    if (!assignTestModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAssignTestModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [assignTestModalOpen]);

  useEffect(() => {
    const ids = Array.from(
      new Set([...(shortReportId ? [shortReportId] : []), ...longReportIds])
    );

    if (ids.length === 0) {
      let cancelled = false;
      // Avoid synchronous setState inside effect body (ESLint rule).
      Promise.resolve().then(() => {
        if (cancelled) return;
        setReportHighlightsShort({
          strength: null,
          weakness: null,
          physical: null,
          technical: null,
        });
        setReportHighlightsLong({
          strength: { snippet: null, mentions: 0 },
          weakness: { snippet: null, mentions: 0 },
          physical: { snippet: null, mentions: 0 },
          technical: { snippet: null, mentions: 0 },
        });
        setReportHighlightsError("");
        setReportHighlightsLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;

    const loadHighlights = async () => {
      setReportHighlightsLoading(true);
      setReportHighlightsError("");

      const { data, error } = await supabase
        .from("report_sections")
        .select("id, report_id, title, content, content_formatted, position, created_at")
        .in("report_id", ids)
        .order("position", { ascending: true });

      if (cancelled) return;

      if (error) {
        setReportHighlightsError(error.message);
        setReportHighlightsLoading(false);
        return;
      }

      const parsed = z.array(ReportSectionKpiSchema).safeParse(data ?? []);
      if (!parsed.success) {
        setReportHighlightsError("Donnees de sections invalides.");
        setReportHighlightsLoading(false);
        return;
      }

      const sections = parsed.data;
      const short = shortReportId
        ? buildReportHighlights(sections.filter((s) => s.report_id === shortReportId))
        : {
            strength: null,
            weakness: null,
            physical: null,
            technical: null,
          };
      const long = buildLongTermHighlights(longReportIds, sections);

      setReportHighlightsShort(short);
      setReportHighlightsLong(long);
      setReportHighlightsLoading(false);
    };

    Promise.resolve().then(() => {
      if (cancelled) return;
      void loadHighlights();
    });

    return () => {
      cancelled = true;
    };
  }, [shortReportId, longReportIds]);

  useEffect(() => {
    let cancelled = false;

    if (!shortReportId) {
      Promise.resolve().then(() => {
        if (cancelled) return;
        setAiKpisRow(null);
        setAiKpisStatus("missing");
        setAiKpisError("");
        setAiKpisLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    const loadAiKpis = async () => {
      setAiKpisLoading(true);
      setAiKpisError("");

      const { data, error } = await supabase
        .from("report_kpis")
        .select(
          "id, org_id, student_id, report_id, status, input_hash, prompt_version, model, kpis_short, kpis_long, error, created_at, updated_at"
        )
        .eq("report_id", shortReportId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setAiKpisRow(null);
        setAiKpisStatus("missing");
        setAiKpisError("KPI IA indisponibles.");
        setAiKpisLoading(false);
        return;
      }

      if (!data) {
        setAiKpisRow(null);
        setAiKpisStatus("missing");
        setAiKpisLoading(false);
        return;
      }

      const parsed = ReportKpisRowSchema.safeParse(data);
      if (!parsed.success) {
        setAiKpisRow(null);
        setAiKpisStatus("missing");
        setAiKpisError("Donnees KPI invalides.");
        setAiKpisLoading(false);
        return;
      }

      const statusParsed = ReportKpisStatusSchema.safeParse(parsed.data.status);
      const status: ReportKpisStatus =
        statusParsed.success ? statusParsed.data : ("error" as const);

      setAiKpisRow(parsed.data);
      setAiKpisStatus(status);
      setAiKpisLoading(false);
    };

    Promise.resolve().then(() => {
      if (cancelled) return;
      void loadAiKpis();
    });

    return () => {
      cancelled = true;
    };
  }, [shortReportId]);

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

  const handleAssignNormalizedTest = async () => {
    if (!studentId) return;
    if (isReadOnly) return;

    setAssignTestSubmitting(true);
    setAssignTestError("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setAssignTestError("Session invalide.");
      setAssignTestSubmitting(false);
      return;
    }

    const response = await fetch("/api/normalized-tests/assign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        testSlug: assignTestSlug,
        studentIds: [studentId],
      }),
    });

    const payload = await response.json().catch(() => ({}));
    const parsed = z
      .union([
        z.object({ ok: z.literal(true), count: z.number().int().optional() }),
        z.object({ error: z.string().min(1), details: z.unknown().optional() }),
      ])
      .safeParse(payload);

    if (!response.ok) {
      const errorMessage =
        parsed.success && "error" in parsed.data
          ? parsed.data.error
          : "Assignation impossible.";
      setAssignTestError(errorMessage);
      setAssignTestSubmitting(false);
      return;
    }

    setAssignTestSubmitting(false);
    setAssignTestModalOpen(false);
    await loadNormalizedTests(studentId);
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
        <div className="space-y-4">
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
          <PageHeader
            overline={
              <div className="flex items-center gap-2">
                <PageBack />
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                  Eleve
                </p>
              </div>
            }
            leading={
              student.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={student.avatar_url}
                  alt={`Photo de ${student.first_name}`}
                  className="h-12 w-12 rounded-full border-white/10 object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/10 text-sm font-semibold text-[var(--muted)]">
                  {(student.first_name || "E").charAt(0).toUpperCase()}
                </div>
              )
            }
            title={`${student.first_name} ${student.last_name ?? ""}`.trim()}
            titleBadges={
              student.activated_at ? (
                <Badge tone="emerald" size="sm">
                  Actif
                </Badge>
              ) : student.invited_at ? (
                <Badge tone="amber" size="sm">
                  Invite
                </Badge>
              ) : (
                <Badge tone="muted" size="sm">
                  A inviter
                </Badge>
              )
            }
            subtitle={student.email || "-"}
            actions={
              <>
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
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="currentColor"
                      >
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
              </>
            }
          />

          <div className="mt-4 px-1">
            <p className="text-xs text-[var(--muted)]">
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
          </div>

          <section className="panel relative overflow-hidden rounded-3xl p-6">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
            />
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                  Synthese eleve
                </p>
                <h3 className="mt-2 text-lg font-semibold text-[var(--text)]">
                  Vue rapide, priorites, dernieres donnees.
                </h3>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge tone="muted" size="sm">
                    {latestPublishedReport
                      ? `Dernier rapport: ${formatDate(
                          latestPublishedReport.report_date ??
                            latestPublishedReport.created_at,
                          locale,
                          timezone
                        )}`
                      : "Aucun rapport publie"}
                  </Badge>
                  <Badge tone="muted" size="sm">
                    TPI: {tpiCounts.red} rouge, {tpiCounts.orange} orange
                  </Badge>
                  <Badge
                    size="sm"
                    className={
                      aiKpisStatus === "ready"
                        ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200"
                        : aiKpisStatus === "pending"
                          ? "border-amber-300/30 bg-amber-400/10 text-amber-200"
                          : "border-white/10 bg-white/5 text-[var(--muted)]"
                    }
                  >
                    IA:{" "}
                    {aiKpisStatus === "ready"
                      ? "pret"
                      : aiKpisStatus === "pending"
                        ? "en cours"
                        : "off"}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(aiKpisStatus === "missing" || aiKpisStatus === "error") &&
                shortReportId ? (
                  <button
                    type="button"
                    onClick={handleRegenerateAiKpis}
                    disabled={aiKpisRegenerating}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {aiKpisRegenerating ? "Regeneration..." : "Regenerer KPI IA"}
                  </button>
                ) : null}
              </div>
            </div>

            {reportHighlightsError ? (
              <p className="mt-4 text-sm text-red-300">{reportHighlightsError}</p>
            ) : null}
            {reportHighlightsLoading ? (
              <p className="mt-4 text-sm text-[var(--muted)]">Chargement des KPI...</p>
            ) : null}
            {aiKpisError ? <p className="mt-4 text-sm text-red-300">{aiKpisError}</p> : null}
            {aiKpisLoading ? (
              <p className="mt-4 text-sm text-[var(--muted)]">Chargement des KPI IA...</p>
            ) : null}
            {aiKpisStatus === "pending" ? (
              <p className="mt-4 text-sm text-[var(--muted)]">
                KPI IA en cours de generation...
              </p>
            ) : null}
            {aiKpisStatus === "error" && aiKpisRow?.error ? (
              <p className="mt-4 text-sm text-red-300">{aiKpisRow.error}</p>
            ) : null}

            <div className="relative mt-6 grid gap-8 lg:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                  Court terme
                </p>
                <div className="mt-4">
                  {aiKpisStatus === "ready" && aiKpisRow ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {aiKpisRow.kpis_short.map((kpi, index, list) => {
                        const shouldSpanTwo =
                          list.length % 2 === 1 && index === list.length - 1;
                        return (
                          <div
                            key={kpi.id}
                            className={`min-h-36 rounded-2xl bg-[var(--panel-strong)] p-4 ${
                              shouldSpanTwo ? "sm:col-span-2" : ""
                            }`}
                          >
                            <p className="text-[0.65rem] uppercase tracking-[0.25em] text-[var(--muted)]">
                              {kpi.title}
                            </p>
                            <p className="mt-2 text-sm font-semibold text-[var(--text)]">
                              {kpi.value ?? "-"}
                            </p>
                            <p className="mt-2 text-xs whitespace-pre-line text-[var(--muted)]">
                              {kpi.evidence}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key: "strength" as const, label: "Point fort" },
                        { key: "weakness" as const, label: "Point faible" },
                        { key: "physical" as const, label: "Physique" },
                        { key: "technical" as const, label: "Technique" },
                      ].map((item) => (
                        <div
                          key={`short-${item.key}`}
                          className="rounded-2xl bg-[var(--panel-strong)] p-4"
                        >
                          <p className="text-[0.65rem] uppercase tracking-[0.25em] text-[var(--muted)]">
                            {item.label}
                          </p>
                          <p className="mt-2 text-sm font-semibold text-[var(--text)]">
                            {reportHighlightsShort[item.key] ?? "-"}
                          </p>
                          {item.key === "physical" ? (
                            <div className="mt-3 flex flex-wrap gap-2 text-[0.7rem] text-[var(--muted)]">
                              <Badge tone="rose" size="sm">
                                {tpiCounts.red} rouge
                              </Badge>
                              <Badge tone="amber" size="sm">
                                {tpiCounts.orange} orange
                              </Badge>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                  Long terme
                </p>
                <div className="mt-4">
                  {aiKpisStatus === "ready" && aiKpisRow ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {aiKpisRow.kpis_long.map((kpi, index, list) => {
                        const shouldSpanTwo =
                          list.length % 2 === 1 && index === list.length - 1;
                        return (
                          <div
                            key={kpi.id}
                            className={`min-h-36 rounded-2xl bg-[var(--panel-strong)] p-4 ${
                              shouldSpanTwo ? "sm:col-span-2" : ""
                            }`}
                          >
                            <p className="text-[0.65rem] uppercase tracking-[0.25em] text-[var(--muted)]">
                              {kpi.title}
                            </p>
                            <p className="mt-2 text-sm font-semibold text-[var(--text)]">
                              {kpi.value ?? "-"}
                            </p>
                            <p className="mt-2 text-xs whitespace-pre-line text-[var(--muted)]">
                              {kpi.evidence}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key: "strength" as const, label: "Point fort" },
                        { key: "weakness" as const, label: "Point faible" },
                        { key: "physical" as const, label: "Physique" },
                        { key: "technical" as const, label: "Technique" },
                      ].map((item) => (
                        <div
                          key={`long-${item.key}`}
                          className="rounded-2xl bg-[var(--panel-strong)] p-4"
                        >
                          <p className="text-[0.65rem] uppercase tracking-[0.25em] text-[var(--muted)]">
                            {item.label}
                          </p>
                          <p className="mt-2 text-sm font-semibold text-[var(--text)]">
                            {reportHighlightsLong[item.key].snippet ?? "-"}
                          </p>
                          <p className="mt-2 text-xs text-[var(--muted)]">
                            Mentionne dans {reportHighlightsLong[item.key].mentions}/5 rapports
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {workspaceType === "org" ? (
            <section className="panel-soft rounded-2xl p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--text)]">
                    Assignations
                  </h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {canPublishInOrg
                      ? "Vous pouvez publier pour cet eleve."
                      : canProposeInOrg
                        ? "Vous pouvez proposer une modification."
                        : "Lecture seule sur cet eleve."}
                  </p>
                </div>
                {canProposeInOrg ? (
                  <Link
                    href={`/app/org/proposals/new?studentId=${student.id}`}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--text)] transition hover:border-white/30"
                  >
                    Proposer une modification
                  </Link>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-[var(--muted)]">
                {assignmentsLoading ? (
                  <span>Chargement des assignations...</span>
                ) : assignmentCoaches.length === 0 ? (
                  <span>Aucun coach assigne</span>
                ) : (
                  assignmentCoaches.map((entry) => (
                    <Badge
                      key={entry.coach_id}
                      tone="muted"
                      size="sm"
                      className="normal-case tracking-normal"
                    >
                      {getCoachLabel(entry.profiles?.full_name, entry.coach_id)}
                    </Badge>
                  ))
                )}
              </div>
              {!isWorkspacePremium ? (
                <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-xs uppercase tracking-wide text-amber-100">
                  Freemium: lecture seule en organisation.
                </div>
              ) : null}
              {canManageAssignments ? (
                <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Modifier les assignations
                  </p>
                  {hasMissingCoachNames ? (
                    <p className="mt-2 text-xs text-amber-200">
                      Certains coachs n ont pas renseigne leur nom/prenom. Demandez-leur
                      de completer leur profil.
                    </p>
                  ) : null}
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {coachOptions.map((coach) => {
                      const label = getCoachLabel(
                        coach.profiles?.full_name,
                        coach.user_id
                      );
                      const checked = selectedCoachIds.includes(coach.user_id);
                      return (
                        <label
                          key={coach.user_id}
                          className="flex items-center gap-2 text-xs text-[var(--muted)]"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              const next = event.target.checked
                                ? [...selectedCoachIds, coach.user_id]
                                : selectedCoachIds.filter((id) => id !== coach.user_id);
                              setSelectedCoachIds(next);
                            }}
                            className="h-4 w-4 rounded border-white/10 bg-[var(--bg-elevated)]"
                          />
                          {label}
                        </label>
                      );
                    })}
                  </div>
                  {assignmentsError ? (
                    <p className="mt-3 text-sm text-red-400">{assignmentsError}</p>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleSaveAssignments}
                    disabled={assignmentsSaving}
                    className="mt-4 rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
                  >
                    {assignmentsSaving ? "Enregistrement..." : "Enregistrer"}
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}

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
                      {ownerShareRevokingId === share.id ? "Revocation..." : "Revoquer"}
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
            <section className="border border-pink-200 bg-[var(--panel)] rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[var(--text)]">Rapports</h3>
                {!canWriteReports ? (
                  <Badge tone="muted" size="sm">
                    Lecture seule
                  </Badge>
                ) : (
                  <Link
                href="/app/coach/rapports/nouveau"
                className="inline-flex items-center gap-2 rounded-full border border-pink-200 px-4 py-2 text-xs text-pink-700 font-semibold uppercase tracking-wide transition hover:opacity-90"
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
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
                Nouveau
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
                      className="flex flex-col gap-3 rounded-xl border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--text)] md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{report.title}</p>
                          {!report.sent_at ? (
                            <Badge tone="muted" size="sm">
                              Brouillon
                            </Badge>
                          ) : null}
                          {(() => {
                            const label = formatSourceLabel(
                              report.org_id,
                              getOrgName(report.organizations)
                            );
                            if (!label) return null;
                            return (
                              <Badge tone="muted" size="sm">
                                {label}
                              </Badge>
                            );
                          })()}
                        </div>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {formatDate(
                            report.report_date ?? report.created_at,
                            locale,
                            timezone
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 self-end md:self-auto">
                        <Link
                          href={`/app/coach/rapports/${report.id}`}
                          aria-label="Ouvrir le rapport"
                          title="Ouvrir"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[var(--muted)] transition hover:bg-white/20 hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/50"
                        >
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
                            <path d="M7 17L17 7" />
                            <path d="M9 7h8v8" />
                          </svg>
                        </Link>

                        <Link
                          href={`/app/coach/rapports/nouveau?reportId=${report.id}`}
                          onClick={(event) => {
                            if (!canWriteReports) event.preventDefault();
                          }}
                          aria-disabled={!canWriteReports}
                          tabIndex={!canWriteReports ? -1 : undefined}
                          aria-label="Modifier le rapport"
                          title={canWriteReports ? "Modifier" : "Lecture seule"}
                          className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/50 ${
                            !canWriteReports
                              ? "cursor-not-allowed text-[var(--muted)] opacity-50"
                              : "text-[var(--muted)] hover:bg-white/10 hover:text-[var(--text)]"
                          }`}
                        >
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
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                          </svg>
                        </Link>

                        <button
                          type="button"
                          onClick={() => handleDeleteReport(report)}
                          disabled={!canWriteReports || deletingId === report.id}
                          aria-label="Supprimer le rapport"
                          title={deletingId === report.id ? "Suppression..." : "Supprimer"}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-red-300 transition hover:bg-white/10 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200/40 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingId === report.id ? (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4 animate-spin"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M21 12a9 9 0 1 1-3-6.7" />
                            </svg>
                          ) : (
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
                              <path d="M3 6h18" />
                              <path d="M8 6V4h8v2" />
                              <path d="M19 6l-1 14H6L5 6" />
                              <path d="M10 11v6" />
                              <path d="M14 11v6" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section
              id="tpi"
              className="border border-teal-200 bg-[var(--panel)] relative scroll-mt-24 rounded-2xl p-6"
            >
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-[var(--text)]">
                    Profil TPI
                    {tpiReport?.created_at ? (
                      <span className="text-sm font-medium text-[var(--muted)]">
                        {" "}
                        Importé le - {formatDate(tpiReport.created_at, locale, timezone)}
                      </span>
                    ) : null}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Screening physique TPI, synthétisé, et connecté à l&apos;IA de Swingflow.
                  </p>

                  {tpiSourceLabel ? (
                    <Badge as="div" tone="muted" size="sm" className="mt-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                      Source: {tpiSourceLabel}
                    </Badge>
                  ) : null} <br/>
                  <Badge as="div" tone="emerald" size="sm" className="mt-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                    L assistant IA s appuie sur ce profil pour ses analyses.
                  </Badge>
                </div>

                <div className="flex items-center justify-end gap-2 sm:justify-self-end">
                  <span className="group relative">
                    <button
                      type="button"
                      onClick={() => setTpiHelpOpen((prev) => !prev)}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm text-[var(--muted)] transition hover:text-[var(--text)]"
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
                          Envoie le rapport TPI depuis myTPI Pro a l eleve, en te mettant
                          en copie (CC to me).
                        </li>
                        <li>
                          Dans ta boite mail, ouvre le mail et clique sur partager (icone
                          fleche).
                        </li>
                        <li>Selectionne Imprimer.</li>
                        <li>
                          Dans l ecran d impression, partage a nouveau et choisis Enregistrer
                          dans Fichiers.
                        </li>
                        <li>
                          Importe le PDF ici. Attends quelques minutes, puis le profil apparait
                          en dessous dans la langue du compte.
                        </li>
                      </ol>
                      <span className="mt-3 block text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                        PC
                      </span>
                      <ol className="mt-2 list-decimal space-y-1 pl-4 text-[0.68rem] text-[var(--muted)]">
                        <li>
                          Envoie le rapport TPI depuis myTPI Pro a l eleve, en te mettant
                          en copie (CC to me).
                        </li>
                        <li>Ouvre le mail recu et imprime (Ctrl + P).</li>
                        <li>Dans la fenetre d impression, choisis Print to PDF.</li>
                        <li>
                          Importe le PDF ici. Attends quelques minutes, puis le profil apparait
                          en dessous dans la langue du compte.
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
                    className={`rounded-full border border-teal-400 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-teal-700 transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/70 ${
                      tpiLocked || isReadOnly ? "cursor-not-allowed opacity-60" : ""
                    } disabled:opacity-60`}
                    aria-disabled={tpiLocked || isReadOnly}
                  >
                    Parcourir
                  </button>
                  <input
                    ref={tpiInputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    disabled={tpiUploading || isReadOnly || tpiLocked}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file) void handleTpiFile(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </div>
              </div>
              {tpiLocked ? (
                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-100">
                  <span>Plan Pro requis pour importer. Lecture seule.</span>
                  <button
                    type="button"
                    onClick={openTpiAddonModal}
                    className="rounded-full border border-rose-200/40 bg-rose-400/20 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-rose-100 transition hover:bg-rose-400/30"
                  >
                    Voir les offres
                  </button>
                </div>
              ) : null}
              

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
                  {tpiLoadingPhrase ? (
                    <p className="mt-2 text-[0.65rem] text-[var(--muted)]" aria-live="polite">
                      {tpiLoadingPhrase}
                    </p>
                  ) : null}
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
                      {tpiTests.length > 0 ? (
                        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex flex-wrap items-center gap-2">
                            {(
                              [
                                { id: "all" as const, label: `Tous (${tpiCounts.total})` },
                                { id: "red" as const, label: `Bloquants (${tpiCounts.red})` },
                                {
                                  id: "orange" as const,
                                  label: `A surveiller (${tpiCounts.orange})`,
                                },
                                { id: "green" as const, label: `OK (${tpiCounts.green})` },
                              ] as const
                            ).map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => setTpiFilter(option.id)}
                                className={`rounded-full px-3 py-1 text-[0.65rem] uppercase tracking-wide transition ${
                                  tpiFilter === option.id
                                    ? "border-white/30 bg-white/15 text-[var(--text)]"
                                    : "border-white/10 bg-white/5 text-[var(--muted)] hover:border-white/20 hover:text-[var(--text)]"
                                } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/50`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                          <div className="relative w-full sm:w-56">
                            <input
                              value={tpiQuery}
                              onChange={(event) => setTpiQuery(event.target.value)}
                              placeholder="Rechercher..."
                              className="w-full rounded-full border border-white/10 bg-[var(--bg-elevated)] px-4 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/50"
                              aria-label="Rechercher un test TPI"
                            />
                          </div>
                        </div>
                      ) : null}
                      {tpiTests.length === 0 ? (
                        <div className="rounded-xl border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                          Aucun test TPI detecte.
                        </div>
                      ) : (
                        visibleTpiTests.length === 0 ? (
                          <div className="rounded-xl border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                            Aucun test ne correspond a ce filtre.
                          </div>
                        ) : (
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {visibleTpiTests.map((test) => {
                              const colorClass =
                                test.result_color === "green"
                                  ? "bg-emerald-400"
                                  : test.result_color === "orange"
                                    ? "bg-amber-400"
                                    : "bg-rose-400";
                              const selectedTone =
                                test.result_color === "green"
                                  ? "border-emerald-300/40 bg-emerald-400/10"
                                  : test.result_color === "orange"
                                    ? "border-amber-300/40 bg-amber-400/10"
                                    : "border-rose-300/40 bg-rose-400/10";
                              const isSelected = selectedTpi?.id === test.id;
                              return (
                                <button
                                  key={test.id}
                                  type="button"
                                  onClick={() => setSelectedTpi(test)}
                                  aria-pressed={isSelected}
                                  aria-label={`${formatTpiTestName(test.test_name)} - ${tpiStatusLabel(test.result_color)}`}
                                  className={`flex h-20 items-start gap-2 overflow-hidden rounded-xl px-4 py-3 text-left transition ${
                                    isSelected
                                      ? selectedTone
                                      : "border-white/10 bg-white/5 hover:border-white/20"
                                  } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/50`}
                                >
                                  <span
                                    className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${colorClass}`}
                                  />
                                <span className="min-w-0">
                                  <span className="block max-h-16 overflow-hidden break-keep text-[0.7rem] font-semibold leading-snug text-[var(--text)]">
                                    {formatTpiTestName(test.test_name)}
                                  </span>
                                  <span className="sr-only">
                                    Statut: {tpiStatusLabel(test.result_color)}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )
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

            <section
              id="standard-tests"
              className=" relative scroll-mt-24 rounded-2xl border border-orange-200 bg-[var(--panel)] p-6 lg:col-span-2"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--text)]">Tests standardises</h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Suivez les tests assignes a cet eleve, ceux en cours et l historique.
                  </p>
                </div>
                {!isReadOnly ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAssignTestError("");
                      setAssignTestSubmitting(false);
                      setAssignTestSlug(NORMALIZED_TEST_CHOICES[0]?.slug ?? PELZ_PUTTING_SLUG);
                      setAssignTestModalOpen(true);
                    }}
                    className="rounded-full border border-orange-400 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-orange-700 transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/70"
                  >
                    Assigner un test
                  </button>
                ) : (
                  <span className="rounded-full border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)] opacity-70">
                    Assigner un test
                  </span>
                )}
              </div>

              {normalizedTestsLoading ? (
                <p className="mt-3 text-xs text-[var(--muted)]">Chargement des tests...</p>
              ) : null}
              {normalizedTestsError ? (
                <p className="mt-3 text-xs text-red-300">{normalizedTestsError}</p>
              ) : null}

              {!normalizedTestsLoading &&
              !normalizedTestsError &&
              normalizedTestAssignments.length === 0 ? (
                <div className="mt-4 rounded-xl border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                  Aucun test assigne.
                </div>
              ) : null}

              {!normalizedTestsLoading &&
              !normalizedTestsError &&
              normalizedTestAssignments.length > 0 ? (
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border-white/10 bg-white/5 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                      En cours
                    </p>
                    {normalizedTestsSummary.current.length === 0 ? (
                      <p className="mt-3 text-sm text-[var(--muted)]">Aucun test en cours.</p>
                    ) : (
                      <ul className="mt-3 space-y-3">
                        {normalizedTestsSummary.current.map((item) => (
                          <li
                            key={item.assignmentId}
                            className="rounded-xl border-white/10 bg-[var(--bg-elevated)] px-4 py-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-[var(--text)]">
                                  {item.title}
                                </p>
                                <p className="mt-1 text-xs text-[var(--muted)]">
                                  Assigne le{" "}
                                  {formatDate(item.assignedAt, locale, timezone)}
                                  {item.attemptsCount > 0
                                    ? ` • ${item.attemptsCount} tentative${
                                        item.attemptsCount > 1 ? "s" : ""
                                      }`
                                    : ""}
                                </p>
                              </div>
                              <Badge
                                tone={
                                  item.status === "assigned"
                                    ? "muted"
                                    : item.status === "in_progress"
                                      ? "amber"
                                      : "emerald"
                                }
                                size="sm"
                                className="shrink-0"
                              >
                                {item.status === "assigned"
                                  ? "A faire"
                                  : item.status === "in_progress"
                                    ? "En cours"
                                    : "Finalise"}
                              </Badge>
                            </div>
                            {item.indexOrFlagLabel ? (
                              <p className="mt-2 text-xs text-[var(--muted)]">
                                Index / drapeau: {item.indexOrFlagLabel}
                              </p>
                            ) : null}
                            {item.clubsUsed ? (
                              <p className="mt-1 text-xs text-[var(--muted)]">
                                Clubs: {item.clubsUsed}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                      Historique
                    </p>
                    {normalizedTestsSummary.history.length === 0 ? (
                      <p className="mt-3 text-sm text-[var(--muted)]">
                        Aucun historique pour le moment.
                      </p>
                    ) : (
                      <ul className="mt-3 space-y-3">
                        {normalizedTestsSummary.history.map((item) => (
                          <li
                            key={item.assignmentId}
                            className="rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-4 py-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-[var(--text)]">
                                  {item.title}
                                </p>
                                <p className="mt-1 text-xs text-[var(--muted)]">
                                  {item.finalizedAt
                                    ? `Termine le ${formatDate(
                                        item.finalizedAt,
                                        locale,
                                        timezone
                                      )}`
                                    : `Derniere activite le ${formatDate(
                                        item.lastActivityAt,
                                        locale,
                                        timezone
                                      )}`}
                                  {item.attemptsCount > 0
                                    ? ` • ${item.attemptsCount} tentative${
                                        item.attemptsCount > 1 ? "s" : ""
                                      }`
                                    : ""}
                                </p>
                              </div>
                              <Badge
                                tone={item.archivedAt ? "amber" : "emerald"}
                                size="sm"
                                className="shrink-0"
                              >
                                {item.archivedAt ? "Archive" : "Termine"}
                              </Badge>
                            </div>
                            {item.indexOrFlagLabel ? (
                              <p className="mt-2 text-xs text-[var(--muted)]">
                                Index / drapeau: {item.indexOrFlagLabel}
                              </p>
                            ) : null}
                            {item.clubsUsed ? (
                              <p className="mt-1 text-xs text-[var(--muted)]">
                                Clubs: {item.clubsUsed}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null}
            </section>

            <section className=" border border-purple-200 bg-[var(--panel)] relative rounded-2xl p-6 lg:col-span-2">
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
                <div className="flex flex-wrap items-center gap-2 rounded-full px-2 py-1">
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
                    className="rounded-full border-white/10 bg-[var(--panel-strong)] px-3 py-1.5 text-xs text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-60"
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
                    className={`rounded-full border border-purple-400 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-purple-700 transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/70 ${
                      radarLocked || isReadOnly ? "cursor-not-allowed opacity-60" : ""
                    } disabled:opacity-60`}
                    aria-disabled={radarLocked || isReadOnly}
                  >
                    Importer
                  </button>
                  <input
                    ref={radarInputRef}
                    type="file"
                    accept="image/*,.heic,.heif"
                    disabled={radarLocked || isReadOnly || radarUploading}
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      // Reset so picking the same file twice still triggers onChange.
                      event.target.value = "";
                      if (file) void handleRadarFile(file);
                    }}
                  />
                </div>
              </div>
              {radarLocked ? (
                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-violet-300/30 bg-violet-400/10 px-3 py-2 text-xs text-violet-100">
                  <span>Plan Pro requis pour importer. Lecture seule.</span>
                  <button
                    type="button"
                    onClick={openRadarAddonModal}
                    className="rounded-full border border-violet-200/40 bg-violet-400/20 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-violet-100 transition hover:bg-violet-400/30"
                  >
                    Voir les offres
                  </button>
                </div>
              ) : null}

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
                  {radarLoadingPhrase ? (
                    <p className="mt-2 text-[0.65rem] text-[var(--muted)]" aria-live="polite">
                      {radarLoadingPhrase}
                    </p>
                  ) : null}
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
                    const isReview = file.status === "review";
                    const badgeTone =
                      file.status === "ready"
                        ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
                        : file.status === "error"
                          ? "border-rose-300/30 bg-rose-400/10 text-rose-100"
                          : "border-amber-300/30 bg-amber-400/10 text-amber-100";
                    const isExternalFile =
                      Boolean(organization?.id) && file.org_id !== organization?.id;
                    const configDisabled = !isReady || isReadOnly || isExternalFile;
                    const deleteDisabled =
                      radarDeletingId === file.id || isReadOnly || isExternalFile;
                    const canReview = isReview && !isReadOnly && !isExternalFile;
                    const canPreview = isReady;
                    const canOpen = canPreview || canReview;
                    const sourceLabel = formatSourceLabel(
                      file.org_id,
                      getOrgName(file.organizations)
                    );
                    return (
                      <div
                        key={file.id}
                        className="flex flex-col gap-3 rounded-xl border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--text)] md:flex-row md:items-center md:justify-between"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">
                              {file.original_name ||
                                formatRadarSourceFallback(file.source)}
                            </p>
                            <Badge
                              size="sm"
                              className={radarTechTone[file.source] ?? radarTechTone.unknown}
                            >
                              {isRadarTech(file.source)
                                ? getRadarTechMeta(file.source).prefix
                                : "UNK"}
                            </Badge>
                            <Badge size="sm" className={badgeTone}>
                              {file.status === "ready"
                                ? "Pret"
                                : file.status === "review"
                                  ? "A verifier"
                                : file.status === "error"
                                  ? "Erreur"
                                  : "Analyse"}
                              {file.status === "processing" ? <LoadingDots /> : null}
                            </Badge>
                            {sourceLabel ? (
                              <Badge tone="muted" size="sm">
                                {sourceLabel}
                              </Badge>
                            ) : null}
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
                            disabled={!canOpen}
                            onClick={() =>
                              canReview ? setRadarReview(file) : setRadarPreview(file)
                            }
                            aria-label={isReview ? "Verifier le fichier" : "Voir le fichier"}
                            title={isReview ? "Verifier" : "Voir"}
                            className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/50 ${
                              canOpen
                                ? "border-white/10 bg-white/10 text-[var(--muted)] hover:bg-white/20 hover:text-[var(--text)]"
                                : "cursor-not-allowed border-white/5 bg-white/5 text-[var(--muted)] opacity-60"
                            }`}
                          >
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
                              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>

                          <button
                            type="button"
                            disabled={configDisabled}
                            onClick={() => handleOpenRadarConfig(file)}
                            aria-label="Configurer le fichier"
                            title="Configurer"
                            className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/50 ${
                              !configDisabled
                                ? "border-white/10 bg-white/5 text-[var(--muted)] hover:bg-white/10 hover:text-[var(--text)]"
                                : "cursor-not-allowed border-white/5 bg-white/5 text-[var(--muted)] opacity-60"
                            }`}
                          >
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
                              <circle cx="12" cy="12" r="3" />
                              <path d="M19.4 15a7.8 7.8 0 0 0 .1-6l2-1-2-3-2 1a8 8 0 0 0-5-2l-.5-2h-4l-.5 2a8 8 0 0 0-5 2l-2-1-2 3 2 1a7.8 7.8 0 0 0 .1 6l-2 1 2 3 2-1a8 8 0 0 0 5 2l.5 2h4l.5-2a8 8 0 0 0 5-2l2 1 2-3-2-1z" />
                            </svg>
                          </button>

                          <button
                            type="button"
                            disabled={deleteDisabled}
                            onClick={() => handleDeleteRadarFile(file)}
                            aria-label="Supprimer le fichier"
                            title={radarDeletingId === file.id ? "Suppression..." : "Supprimer"}
                            className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200/40 ${
                              deleteDisabled
                                ? "cursor-not-allowed border-rose-300/20 bg-rose-400/10 text-rose-100/70 opacity-70"
                                : "border-rose-300/30 bg-rose-400/10 text-rose-100 hover:bg-rose-400/20"
                            }`}
                          >
                            {radarDeletingId === file.id ? (
                              <svg
                                viewBox="0 0 24 24"
                                className="h-4 w-4 animate-spin"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M21 12a9 9 0 1 1-3-6.7" />
                              </svg>
                            ) : (
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
                                <path d="M3 6h18" />
                                <path d="M8 6V4h8v2" />
                                <path d="M19 6l-1 14H6L5 6" />
                                <path d="M10 11v6" />
                                <path d="M14 11v6" />
                              </svg>
                            )}
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

            {radarReview ? (
              <RadarReviewModal
                file={radarReview}
                onClose={() => setRadarReview(null)}
                onConfirm={handleConfirmRadarReview}
              />
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
                                    className={`rounded-full border px-3 py-1 text-[0.6rem] uppercase tracking-wide transition ${
                                      (radarConfigDraft.options?.aiPreset ??
                                        "standard") === option.id
                                        ? "border-emerald-300/40 bg-emerald-400/20 text-emerald-50"
                                        : "border-emerald-200/20 text-emerald-100/70 hover:border-emerald-300/60 hover:bg-emerald-400/30 hover:text-emerald-100"
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
                                    className={`rounded-full border px-3 py-1 text-[0.6rem] uppercase tracking-wide transition ${
                                      (radarConfigDraft.options?.aiSyntax ??
                                        "exp-tech-solution") === option.id
                                        ? "border-emerald-300/40 bg-emerald-400/20 text-emerald-50"
                                        : "border-emerald-200/20 text-emerald-100/70 hover:border-emerald-300/60 hover:bg-emerald-400/30 hover:text-emerald-100"
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
                              className={`rounded-full border px-3 py-1 text-[0.6rem] uppercase tracking-wide transition ${
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
                              className={`rounded-full border px-3 py-1 text-[0.6rem] uppercase tracking-wide transition ${
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
          {assignTestModalOpen ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
              onClick={() => {
                if (assignTestSubmitting) return;
                setAssignTestModalOpen(false);
              }}
              role="dialog"
              aria-modal="true"
              aria-label="Assigner un test"
            >
              <div
                className="w-full max-w-lg rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                      Tests
                    </p>
                    <h4 className="mt-2 text-lg font-semibold text-[var(--text)]">
                      Assigner un test
                    </h4>
                    <p className="mt-2 text-sm text-[var(--muted)]">
                      Choisissez un test standardise a assigner a cet eleve.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (assignTestSubmitting) return;
                      setAssignTestModalOpen(false);
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/50"
                    aria-label="Fermer"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18" />
                      <path d="M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="mt-5 space-y-3">
                  {NORMALIZED_TEST_CHOICES.map((choice) => {
                    const selected = assignTestSlug === choice.slug;
                    return (
                      <button
                        key={choice.slug}
                        type="button"
                        onClick={() => setAssignTestSlug(choice.slug)}
                        className={`w-full rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/50 ${
                          selected
                            ? "border-emerald-300/40 bg-emerald-400/10"
                            : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                        }`}
                        aria-pressed={selected}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[var(--text)]">
                              {choice.title}
                            </p>
                            <p className="mt-1 text-xs text-[var(--muted)]">
                              {choice.description}
                            </p>
                          </div>
                          <span
                            className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                              selected
                                ? "border-emerald-300/40 bg-emerald-400/20 text-emerald-100"
                                : "border-white/10 bg-white/5 text-[var(--muted)]"
                            }`}
                            aria-hidden="true"
                          >
                            {selected ? (
                              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 6L9 17l-5-5" />
                              </svg>
                            ) : null}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {assignTestError ? (
                  <p className="mt-4 text-sm text-red-300">{assignTestError}</p>
                ) : null}

                <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (assignTestSubmitting) return;
                      setAssignTestModalOpen(false);
                    }}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                    disabled={assignTestSubmitting}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleAssignNormalizedTest}
                    disabled={assignTestSubmitting}
                    className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
                  >
                    {assignTestSubmitting ? "Assignation..." : "Assigner"}
                  </button>
                </div>
              </div>
            </div>
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
