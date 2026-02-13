"use client";

/* eslint-disable @next/next/no-img-element */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { defaultSectionTemplates } from "@/lib/default-section-templates";
import { PLAN_ENTITLEMENTS, PLAN_LABELS } from "@/lib/plans";
import { RADAR_LOADING_PHRASES, TPI_LOADING_PHRASES } from "@/lib/loading-phrases";
import { useRotatingPhrase } from "@/lib/use-rotating-phrase";
import RoleGuard from "../../../_components/role-guard";
import { useProfile } from "../../../_components/profile-context";
import PageBack from "../../../_components/page-back";
import PageHeader from "../../../_components/page-header";
import PremiumOfferModal from "../../../_components/premium-offer-modal";
import Badge from "../../../_components/badge";
import RadarReviewModal from "../../../_components/radar-review-modal";
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
  getRadarTechMeta,
  isRadarTech,
} from "@/lib/radar/file-naming";
import type { RadarAnalytics } from "@/lib/radar/types";
import {
  validateVideoSections,
  VIDEO_MAX_DURATION_SECONDS as VIDEO_DURATION_LIMIT_SECONDS,
  VIDEO_MAX_PER_SECTION as VIDEO_PER_SECTION_LIMIT,
  VIDEO_MAX_SECTIONS_PER_REPORT as VIDEO_SECTIONS_LIMIT,
} from "@/lib/report-video";

type SectionType = "text" | "image" | "video" | "radar";
type SectionLibraryFilterValue = "all" | SectionType;

const SECTION_LIBRARY_FILTERS: ReadonlyArray<{
  value: SectionLibraryFilterValue;
  label: string;
}> = [
  { value: "all", label: "Tous" },
  { value: "text", label: "Texte" },
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "radar", label: "Datas" },
];

type SectionTemplate = {
  id?: string;
  title: string;
  type: SectionType;
  tags?: string[];
};

const starterSections: SectionTemplate[] = defaultSectionTemplates;

const sectionTagMap = new Map(
  starterSections.map((section) => [section.title.toLowerCase(), section.tags ?? []])
);
sectionTagMap.set("technique", ["technique", "swing"]);
sectionTagMap.set("plan pour la semaine", ["planning"]);
sectionTagMap.set("images", ["visual", "swing"]);
sectionTagMap.set("feedback mental", ["mental", "focus"]);

const CAPTION_LIMIT = 150;
const CLARIFY_THRESHOLD = 0.8;

type ReportSection = {
  id: string;
  title: string;
  type: SectionType;
  content: string;
  contentFormatted?: string | null;
  contentFormatHash?: string | null;
  mediaUrls: string[];
  mediaCaptions: string[];
  radarFileId?: string | null;
  radarConfig?: RadarConfig | null;
};

type RadarFile = {
  id: string;
  status: "processing" | "ready" | "error" | "review";
  original_name: string | null;
  columns: RadarColumn[];
  shots: RadarShot[];
  stats: RadarStats | null;
  summary: string | null;
  config: RadarConfig | null;
  analytics?: RadarAnalytics | null;
  created_at: string;
  error: string | null;
  org_id: string;
  organizations?: { name: string | null } | { name: string | null }[] | null;
};

type StudentOption = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  tpi_report_id: string | null;
};

type DiffSegment = {
  type: "equal" | "insert" | "delete";
  text: string;
};

type AiPreview = {
  original: string;
  suggestion: string;
  mode: "improve" | "propagate" | "finalize";
};

type PropagationPayload = {
  sectionTitle: string;
  sectionContent: string;
  allSections: { title: string; content: string }[];
  targetSections: string[];
  propagateMode: "empty" | "append";
  tpiContext?: string;
};

type AxisOption = {
  id: string;
  title: string;
  summary: string;
};

type AxesForSection = {
  section: string;
  options: AxisOption[];
};

type ClarifyQuestion = {
  id: string;
  question: string;
  type: "text" | "choices";
  choices?: string[];
  multi?: boolean;
  required?: boolean;
  placeholder?: string;
};

type ClarifyAnswerValue = string | string[];

type LocalDraft = {
  studentId: string;
  title: string;
  reportDate: string;
  reportSections: ReportSection[];
  workingObservations: string;
  workingNotes: string;
  workingClub: string;
  builderStep: "layout" | "sections" | "report";
  selectedLayoutId?: string;
  selectedLayoutOptionId?: string;
  savedAt: string;
};

const isLocalDraftMeaningful = (draft: LocalDraft) => {
  // Only consider "meaningful" when a section actually contains content.
  // This is used to avoid prompting users to resume empty drafts.
  return draft.reportSections.some((section) => {
    if ((section.content ?? "").trim().length > 0) return true;
    if ((section.contentFormatted ?? "").trim().length > 0) return true;
    if ((section.mediaUrls ?? []).length > 0) return true;
    if (section.type === "radar" && section.radarFileId) return true;
    return false;
  });
};

type SectionLayout = {
  id: string;
  title: string;
  templateIds: string[];
};

type LayoutOption = {
  id: string;
  title: string;
  hint: string;
  templates: SectionTemplate[];
  source: "suggested" | "saved" | "ai";
};

type AiLayoutAnswers = {
  goal: string;
  focus: string;
  sector: string;
  detail: "quick" | "standard" | "complete";
  images: "auto" | "yes" | "no";
  sectionCount: number;
};

type RadarAiQuestion = {
  id: string;
  question: string;
  type: "text" | "choices";
  choices?: string[];
  required?: boolean;
  placeholder?: string;
};

const DEFAULT_RADAR_AI_QUESTIONS: RadarAiQuestion[] = [
  {
    id: "goal",
    question: "Objectif principal de la seance datas ?",
    type: "choices",
    choices: ["Precision", "Distance", "Regularite", "Contact", "Trajectoire"],
    required: true,
  },
  {
    id: "club",
    question: "Club principal travaille ?",
    type: "choices",
    choices: ["Driver", "Bois", "Fer", "Wedge", "Mixte"],
    required: true,
  },
  {
    id: "notes",
    question: "Contexte libre (optionnel)",
    type: "text",
    placeholder: "Ex: travail du chemin, controle spin, etc.",
    required: false,
  },
];

const defaultReportSections: SectionTemplate[] = [
  { title: "Resume de la seance", type: "text" },
  { title: "Diagnostic swing", type: "text" },
  { title: "Plan 7 jours", type: "text" },
];

const createSection = (template: SectionTemplate): ReportSection => ({
  id:
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  title: template.title,
  type: template.type,
  content: "",
  contentFormatted: null,
  contentFormatHash: null,
  mediaUrls: [],
  mediaCaptions: [],
  radarFileId: null,
  radarConfig:
    template.type === "radar"
      ? { ...defaultRadarConfig, charts: { ...defaultRadarConfig.charts } }
      : null,
});

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDateInputValue = (value?: string | null) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return formatDateInput(parsed);
};

const UUID_LIKE_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuidLike = (value?: string | null) =>
  typeof value === "string" && UUID_LIKE_REGEX.test(value);

const isSummaryTitle = (title: string) => /resume|synthese|bilan/i.test(title);

const isPlanTitle = (title: string) =>
  /plan|planning|programme|routine|semaine/i.test(title);

const normalizeSectionType = (value?: string | null): SectionType =>
  value === "image"
    ? "image"
    : value === "video"
      ? "video"
      : value === "radar"
        ? "radar"
        : "text";

type FeatureKey = "ai" | "image" | "video" | "radar" | "tpi";

const featureTones = {
  ai: {
    label: "IA",
    badge: "border-emerald-300/30 bg-emerald-400/10 text-emerald-100",
    chip: "border-emerald-300/30 bg-emerald-400/10 text-emerald-100",
    dot: "bg-emerald-300",
    panel: "border-emerald-400/50 bg-emerald-400/10",
    border: "border-emerald-400/50",
    button: "border-emerald-300/40 bg-emerald-400/10 text-emerald-100",
  },
  image: {
    label: "Image",
    badge: "border-sky-300/30 bg-sky-400/10 text-sky-100",
    chip: "border-sky-300/30 bg-sky-400/10 text-sky-100",
    dot: "bg-sky-300",
    panel: "border-sky-400/50 bg-sky-400/10",
    border: "border-sky-400/50",
    button: "border-sky-300/40 bg-sky-400/10 text-sky-100",
  },
  video: {
    label: "Video",
    badge: "border-pink-300/30 bg-pink-400/10 text-pink-400",
    chip: "border-pink-300/30 bg-pink-400/10 text-pink-400",
    dot: "bg-pink-300",
    panel: "border-pink-400/50 bg-pink-400/10",
    border: "border-pink-400/50",
    button: "border-pink-300/40 bg-pink-400/10 text-pink-400",
  },
  radar: {
    label: "Datas",
    badge: "border-violet-300/30 bg-violet-400/10 text-violet-100",
    chip: "border-violet-300/30 bg-violet-400/10 text-violet-100",
    dot: "bg-violet-300",
    panel: "border-violet-400/50 bg-violet-400/10",
    border: "border-violet-400/50",
    button: "border-violet-300/40 bg-violet-400/10 text-violet-100",
  },
  tpi: {
    label: "TPI",
    badge: "border-rose-300/30 bg-rose-400/10 text-rose-100",
    chip: "border-rose-300/30 bg-rose-400/10 text-rose-100",
    dot: "bg-rose-300",
    panel: "border-rose-400/50 bg-rose-400/10",
    border: "border-rose-400/50",
    button: "border-rose-300/40 bg-rose-400/10 text-rose-100",
  },
} as const;

const normalizeTags = (tags?: string[] | null) =>
  (tags ?? []).map((tag) => tag.toLowerCase());

const hasTpiHint = (title?: string | null, tags?: string[] | null) => {
  const loweredTitle = (title ?? "").toLowerCase();
  if (loweredTitle.includes("tpi")) return true;
  return normalizeTags(tags).some((tag) => tag.includes("tpi"));
};

const getSectionFeatureKey = (section: {
  type?: string | null;
  title?: string | null;
  tags?: string[] | null;
}): FeatureKey | null => {
  if (section.type === "image") return "image";
  if (section.type === "video") return "video";
  if (section.type === "radar") return "radar";
  if (hasTpiHint(section.title, section.tags)) return "tpi";
  return null;
};

const renderFeatureBadge = (featureKey: FeatureKey | null) => {
  if (!featureKey) return null;
  const tone = featureTones[featureKey];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-[0.55rem] uppercase tracking-wide ${tone.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {tone.label}
    </span>
  );
};

const renderTemplateChip = (
  template: { id?: string; title: string; type?: string | null; tags?: string[] | null },
  keyPrefix: string
) => {
  const featureKey = getSectionFeatureKey(template);
  const tone = featureKey ? featureTones[featureKey] : null;
  return (
    <span
      key={`${keyPrefix}-${template.id ?? template.title}`}
      className={`inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-[0.55rem] uppercase tracking-wide ${
        tone ? tone.chip : "border-white/15 bg-white/5 text-[var(--muted)]"
      }`}
    >
      {tone ? <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} /> : null}
      {template.title}
    </span>
  );
};

const buildDiffSegments = (original: string, updated: string): DiffSegment[] => {
  const oldChars = Array.from(original);
  const newChars = Array.from(updated);
  const rows = oldChars.length + 1;
  const cols = newChars.length + 1;
  const table: Uint16Array[] = Array.from({ length: rows }, () => new Uint16Array(cols));

  for (let i = rows - 2; i >= 0; i -= 1) {
    for (let j = cols - 2; j >= 0; j -= 1) {
      if (oldChars[i] === newChars[j]) {
        table[i][j] = table[i + 1][j + 1] + 1;
      } else {
        table[i][j] = Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }
  }

  const segments: DiffSegment[] = [];
  const push = (type: DiffSegment["type"], text: string) => {
    if (!text) return;
    const last = segments[segments.length - 1];
    if (last && last.type === type) {
      last.text += text;
      return;
    }
    segments.push({ type, text });
  };

  let i = 0;
  let j = 0;
  while (i < oldChars.length && j < newChars.length) {
    if (oldChars[i] === newChars[j]) {
      push("equal", oldChars[i]);
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      push("delete", oldChars[i]);
      i += 1;
    } else {
      push("insert", newChars[j]);
      j += 1;
    }
  }

  while (i < oldChars.length) {
    push("delete", oldChars[i]);
    i += 1;
  }

  while (j < newChars.length) {
    push("insert", newChars[j]);
    j += 1;
  }

  return segments;
};

export default function CoachReportBuilderPage() {
  const {
    organization,
    userEmail,
    workspaceType,
    isWorkspacePremium,
    isWorkspaceAdmin,
    planTier,
    profile,
  } = useProfile();
  const modeLabel =
    (organization?.workspace_type ?? "personal") === "org"
      ? `Organisation : ${organization?.name ?? "Organisation"}`
      : "Espace personnel";
  const modeBadgeTone =
    (organization?.workspace_type ?? "personal") === "org"
      ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
      : "border-sky-300/30 bg-sky-400/10 text-sky-100";
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestedStudentIdRaw = searchParams.get("studentId");
  const requestedStudentId = isUuidLike(requestedStudentIdRaw)
    ? requestedStudentIdRaw
    : "";
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editingReportOrgId, setEditingReportOrgId] = useState<string | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [isSharedReadOnly, setIsSharedReadOnly] = useState(false);
  const isEditing = Boolean(editingReportId);
  const isNewReport = !editingReportId;
  const legacyDraftKey = "gc.reportDraft.new";
  const draftKey = requestedStudentId
    ? `gc.reportDraft.new.${requestedStudentId}`
    : legacyDraftKey;
  const draftTimer = useRef<number | null>(null);
  const [localDraftPrompt, setLocalDraftPrompt] = useState<{
    key: string;
    savedAt: string | null;
  } | null>(null);
  const [localDraftHandled, setLocalDraftHandled] = useState(false);
  const [sectionTemplates, setSectionTemplates] =
    useState<SectionTemplate[]>(starterSections);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [layouts, setLayouts] = useState<SectionLayout[]>([]);
  const [selectedLayoutId, setSelectedLayoutId] = useState("");
  const [layoutMessage, setLayoutMessage] = useState("");
  const [layoutMessageType, setLayoutMessageType] = useState<
    "idle" | "error" | "success"
  >("idle");
  const [layoutEditorOpen, setLayoutEditorOpen] = useState(false);
  const [layoutEditingId, setLayoutEditingId] = useState<string | null>(null);
  const [layoutTitle, setLayoutTitle] = useState("");
  const [layoutTemplateIds, setLayoutTemplateIds] = useState<string[]>([]);
  const [layoutSaving, setLayoutSaving] = useState(false);
  const [layoutCustomTitle, setLayoutCustomTitle] = useState("");
  const [layoutCustomType, setLayoutCustomType] = useState<SectionType>("text");
  const [layoutTemplateSearch, setLayoutTemplateSearch] = useState("");
  const [layoutTemplateSearchOpen, setLayoutTemplateSearchOpen] = useState(false);
  const initialBuilderStep = searchParams.get("reportId") ? "report" : "layout";
  const [builderStep, setBuilderStep] = useState<"layout" | "sections" | "report">(
    initialBuilderStep
  );
  const [selectedLayoutOptionId, setSelectedLayoutOptionId] = useState("");
  const [sectionLibraryOpen, setSectionLibraryOpen] = useState(false);
  const [sectionCreateModalOpen, setSectionCreateModalOpen] = useState(false);
  const [aiLayoutOpen, setAiLayoutOpen] = useState(false);
  const [aiLayoutAnswers, setAiLayoutAnswers] = useState<AiLayoutAnswers>({
    goal: "",
    focus: "",
    sector: "",
    detail: "standard",
    images: "auto",
    sectionCount: 5,
  });
  const [aiLayoutCountTouched, setAiLayoutCountTouched] = useState(false);
  const [aiLayoutOption, setAiLayoutOption] = useState<LayoutOption | null>(null);
  const [aiLayoutTitle, setAiLayoutTitle] = useState("");
  const [aiLayoutSaving, setAiLayoutSaving] = useState(false);
  const [aiLayoutMessage, setAiLayoutMessage] = useState("");
  const [premiumModalOpen, setPremiumModalOpen] = useState(false);
  const [premiumNotice, setPremiumNotice] = useState<{
    title: string;
    description: string;
    tags?: string[];
    status?: { label: string; value: string }[];
  } | null>(null);
  const [reportSections, setReportSections] = useState<ReportSection[]>(
    defaultReportSections.map(createSection)
  );
  const [customSection, setCustomSection] = useState("");
  const [customType, setCustomType] = useState<SectionType>("text");
  const [sectionSearch, setSectionSearch] = useState("");
  const [sectionLibraryTypeFilter, setSectionLibraryTypeFilter] =
    useState<SectionLibraryFilterValue>("all");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [draggingAvailable, setDraggingAvailable] = useState<SectionTemplate | null>(
    null
  );
  const [sectionsMessage, setSectionsMessage] = useState("");
  const [sectionsMessageType, setSectionsMessageType] = useState<
    "idle" | "error" | "success"
  >("idle");
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [dragEnabled, setDragEnabled] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const itemRefs = useRef(new Map<string, HTMLDivElement | null>());
  const positions = useRef(new Map<string, DOMRect>());
  const shouldAnimate = useRef(false);
  const skipResetRef = useRef(false);
  const showSlots = dragEnabled && (dragIndex !== null || draggingAvailable !== null);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const sectionLibraryTitleId = useId();
  const sectionCreateTitleId = useId();
  const aiAssistantTitleId = useId();
  const aiSettingsTitleId = useId();
  const studentPickerTitleId = useId();
  const [aiAssistantModalOpen, setAiAssistantModalOpen] = useState(false);
  const [aiSettingsModalOpen, setAiSettingsModalOpen] = useState(false);
  const [stickyActionsExpanded, setStickyActionsExpanded] = useState(false);
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [studentPickerQuery, setStudentPickerQuery] = useState("");
  const [radarFiles, setRadarFiles] = useState<RadarFile[]>([]);
  const [radarLoading, setRadarLoading] = useState(false);
  const [radarError, setRadarError] = useState("");
  const [radarTech, setRadarTech] = useState<RadarTech>("flightscope");
  const radarTechRef = useRef<RadarTech>("flightscope");
  useEffect(() => {
    radarTechRef.current = radarTech;
  }, [radarTech]);
  const radarImportTitleId = useId();
  const [radarImportOpen, setRadarImportOpen] = useState(false);
  const [radarImportSectionId, setRadarImportSectionId] = useState<string | null>(
    null
  );
  const [radarImportTech, setRadarImportTech] = useState<RadarTech>("flightscope");
  const [radarImportError, setRadarImportError] = useState("");
  const [radarUploading, setRadarUploading] = useState(false);
  const [radarUploadProgress, setRadarUploadProgress] = useState(0);
  const [radarReview, setRadarReview] = useState<RadarFile | null>(null);
  const [radarUploadBatch, setRadarUploadBatch] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [radarShowAllFiles, setRadarShowAllFiles] = useState(false);
  const radarUploadTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [radarSessionFileIds, setRadarSessionFileIds] = useState<string[]>([]);
  const [radarConfigOpen, setRadarConfigOpen] = useState(false);
  const [radarConfigDraft, setRadarConfigDraft] =
    useState<RadarConfig>(defaultRadarConfig);
  const [radarConfigSectionId, setRadarConfigSectionId] = useState<string | null>(null);
  const [radarConfigSaving, setRadarConfigSaving] = useState(false);
  const [radarConfigError, setRadarConfigError] = useState("");
  const [tpiContext, setTpiContext] = useState("");
  const [tpiContextLoading, setTpiContextLoading] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [title, setTitle] = useState("");
  const [reportDate, setReportDate] = useState(() => formatDateInput(new Date()));
  const [isAssignedCoach, setIsAssignedCoach] = useState(false);
  const [assignmentChecked, setAssignmentChecked] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState<"idle" | "error" | "success">("idle");
  const [saving, setSaving] = useState(false);
  const [saveIntent, setSaveIntent] = useState<"publish" | "save" | null>(null);
  const [aiTone, setAiTone] = useState("bienveillant");
  const [aiTechLevel, setAiTechLevel] = useState("intermediaire");
  const [aiStyle, setAiStyle] = useState("redactionnel");
  const [aiLength, setAiLength] = useState("normal");
  const [aiImagery, setAiImagery] = useState("equilibre");
  const [aiFocus, setAiFocus] = useState("mix");
  const [aiPropagationReview, setAiPropagationReview] = useState(true);
  const [aiSummary, setAiSummary] = useState("");
  const [aiError, setAiError] = useState("");
  const [aiBusyId, setAiBusyId] = useState<string | null>(null);
  const [radarAiQaOpen, setRadarAiQaOpen] = useState(false);
  const [radarAiQaAnswers, setRadarAiQaAnswers] = useState<Record<string, string>>({});
  const [radarAiQuestions, setRadarAiQuestions] = useState<RadarAiQuestion[]>(
    DEFAULT_RADAR_AI_QUESTIONS
  );
  const [radarAiQuestionsLoading, setRadarAiQuestionsLoading] = useState(false);
  const [radarAiQaError, setRadarAiQaError] = useState("");
  const [radarAiAutoBusy, setRadarAiAutoBusy] = useState(false);
  const [radarAiAutoProgress, setRadarAiAutoProgress] = useState(0);
  const [radarAiAutoPreset, setRadarAiAutoPreset] = useState<"ultra" | "standard">(
    "standard"
  );
  const radarAiAutoTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [aiPreviews, setAiPreviews] = useState<Record<string, AiPreview>>({});
  const [clarifyOpen, setClarifyOpen] = useState(false);
  const [clarifyQuestions, setClarifyQuestions] = useState<ClarifyQuestion[]>([]);
  const [clarifyAnswers, setClarifyAnswers] = useState<
    Record<string, ClarifyAnswerValue>
  >({});
  const [clarifyCustomAnswers, setClarifyCustomAnswers] = useState<
    Record<string, string>
  >({});
  const [clarifyConfidence, setClarifyConfidence] = useState<number | null>(null);
  const [pendingPropagation, setPendingPropagation] = useState<{
    payloads: PropagationPayload[];
    clarifications?: { question: string; answer: string }[];
  } | null>(null);
  const [axesOpen, setAxesOpen] = useState(false);
  const [axesBySection, setAxesBySection] = useState<AxesForSection[]>([]);
  const [axesSelection, setAxesSelection] = useState<Record<string, string>>({});
  const [axesPayloads, setAxesPayloads] = useState<PropagationPayload[] | null>(null);
  const [axesClarifications, setAxesClarifications] = useState<
    { question: string; answer: string }[]
  >([]);
  const textareaRefs = useRef(new Map<string, HTMLTextAreaElement | null>());
  const [workingObservations, setWorkingObservations] = useState("");
  const [workingNotes, setWorkingNotes] = useState("");
  const [workingClub, setWorkingClub] = useState("");
  const workingObservationsRef = useRef<HTMLTextAreaElement | null>(null);
  const workingNotesRef = useRef<HTMLTextAreaElement | null>(null);
  const [uploadingSections, setUploadingSections] = useState<Record<string, boolean>>({});
  const [imageErrors, setImageErrors] = useState<Record<string, string>>({});
  const [activeTooltip, setActiveTooltip] = useState<
    "sections" | "layouts" | "report" | null
  >(null);
  const tooltipRefs = useRef(new Map<string, HTMLSpanElement | null>());
  const [draftId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  const isAdmin = userEmail?.toLowerCase() === "adrien.lafuge@outlook.fr";
  const isOrgAdmin = isWorkspaceAdmin || profile?.role === "owner";
  const isOrgPublishLocked =
    workspaceType === "org" &&
    (!isWorkspacePremium || (assignmentChecked && !isAssignedCoach && !isOrgAdmin));
  const isSourceWorkspaceLocked =
    Boolean(editingReportOrgId) &&
    Boolean(organization?.id) &&
    editingReportOrgId !== organization?.id;
  const isReportWriteLocked =
    isOrgPublishLocked || isSharedReadOnly || isSourceWorkspaceLocked;
  const entitlements = PLAN_ENTITLEMENTS[planTier];
  const aiProofreadEnabled = entitlements.aiProofreadEnabled;
  const aiEnabled = entitlements.aiEnabled;
  const radarAddonEnabled = isAdmin || entitlements.dataExtractEnabled;
  const tpiAddonEnabled = isAdmin || entitlements.tpiEnabled;
  const aiProofreadLocked = !aiProofreadEnabled;
  const aiFullLocked = !aiEnabled;
  const canUseAiProofread = aiProofreadEnabled && !aiBusyId;
  const canUseAiFull = aiEnabled && !aiBusyId;
  const aiStatusLabel = aiEnabled
    ? "Actif"
    : aiProofreadEnabled
      ? "Relecture uniquement"
      : "Plan requis";
  const radarLoadingPhrase = useRotatingPhrase(
    RADAR_LOADING_PHRASES,
    radarUploading,
    { intervalMs: 14000 }
  );
  const tpiLoadingPhrase = useRotatingPhrase(TPI_LOADING_PHRASES, tpiContextLoading, {
    intervalMs: 14000,
  });
  const isDraft = !sentAt;
  const showPublish = isDraft;
  const sendLabel = "Publier le rapport";
  const saveLabel = isDraft
    ? "Enregistrer le brouillon"
    : "Enregistrer les modifications";

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

  const closePremiumModal = useCallback(() => {
    setPremiumModalOpen(false);
    setPremiumNotice(null);
  }, []);

  const openRadarAddonModal = useCallback(() => {
    const planLabel = PLAN_LABELS[planTier];
    openPremiumModal({
      title: "Acces datas bloque",
      description:
        planTier === "free"
          ? "Disponible des le plan Pro."
          : "Ton plan actuel ne permet pas l extraction de datas.",
      tags: [`Plan ${planLabel}`],
      status: [
        {
          label: "Plan",
          value: planLabel,
        },
      ],
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
      status: [
        {
          label: "Plan",
          value: planLabel,
        },
      ],
    });
  }, [openPremiumModal, planTier]);

  const isFeatureLocked = useCallback(
    (featureKey: FeatureKey | null) => {
      if (featureKey === "radar") return !radarAddonEnabled;
      if (featureKey === "tpi") return !tpiAddonEnabled;
      return false;
    },
    [radarAddonEnabled, tpiAddonEnabled]
  );

  const openFeatureModal = useCallback(
    (featureKey: FeatureKey | null) => {
      if (featureKey === "radar") {
        openRadarAddonModal();
      } else if (featureKey === "tpi") {
        openTpiAddonModal();
      }
    },
    [openRadarAddonModal, openTpiAddonModal]
  );

  const formatSourceLabel = useCallback(
    (orgId?: string | null, orgName?: string | null) => {
      if (orgName) return orgName;
      if (!orgId) return null;
      if (orgId === organization?.id) return "Workspace actuel";
      return "Autre workspace";
    },
    [organization?.id]
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

  const resolveLatestTpiReportId = useCallback(
    async (targetStudentId?: string | null) => {
      if (!targetStudentId) return null;
      const linkedIds = await resolveLinkedStudentIds(targetStudentId);
      if (linkedIds.length === 0) return null;
      const baseQuery = supabase
        .from("tpi_reports")
        .select("id, status, created_at")
        .in("student_id", linkedIds)
        .order("created_at", { ascending: false })
        .limit(1);
      const { data } = await baseQuery.maybeSingle();
      if (data && data.status !== "ready") {
        const { data: readyData } = await supabase
          .from("tpi_reports")
          .select("id, status, created_at")
          .in("student_id", linkedIds)
          .eq("status", "ready")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return readyData?.id ?? data.id;
      }
      return data?.id ?? null;
    },
    [resolveLinkedStudentIds]
  );

  const availableSections = useMemo(() => {
    const inReport = new Set(
      reportSections.map((section) => section.title.toLowerCase())
    );
    return sectionTemplates.filter(
      (section) => !inReport.has(section.title.toLowerCase())
    );
  }, [sectionTemplates, reportSections]);

  const normalizedSectionSearch = sectionSearch.trim().toLowerCase();
  const filteredAvailableSections = useMemo(() => {
    if (!normalizedSectionSearch) return availableSections;
    return availableSections.filter((section) =>
      section.title.toLowerCase().includes(normalizedSectionSearch)
    );
  }, [availableSections, normalizedSectionSearch]);
  const filteredSectionLibrarySections = useMemo(() => {
    const byType =
      sectionLibraryTypeFilter === "all"
        ? availableSections
        : availableSections.filter((section) => section.type === sectionLibraryTypeFilter);
    if (!normalizedSectionSearch) return byType;
    return byType.filter((section) =>
      section.title.toLowerCase().includes(normalizedSectionSearch)
    );
  }, [availableSections, normalizedSectionSearch, sectionLibraryTypeFilter]);

  const visibleAvailableSections = useMemo(() => {
    if (!normalizedSectionSearch) return filteredAvailableSections.slice(0, 5);
    return filteredAvailableSections;
  }, [filteredAvailableSections, normalizedSectionSearch]);

  const hiddenAvailableCount = Math.max(
    0,
    filteredAvailableSections.length - visibleAvailableSections.length
  );

  const templateById = useMemo(() => {
    const map = new Map<string, SectionTemplate>();
    sectionTemplates.forEach((section) => {
      if (section.id) {
        map.set(section.id, section);
      }
    });
    return map;
  }, [sectionTemplates]);

  const radarFileMap = useMemo(() => {
    const map = new Map<string, RadarFile>();
    radarFiles.forEach((file) => {
      map.set(file.id, file);
    });
    return map;
  }, [radarFiles]);

  const studentById = useMemo(() => {
    const map = new Map<string, StudentOption>();
    students.forEach((student) => {
      map.set(student.id, student);
    });
    return map;
  }, [students]);

  const radarActiveFileIds = useMemo(() => {
    const ids = new Set(radarSessionFileIds);
    reportSections.forEach((section) => {
      if (section.type === "radar" && section.radarFileId) {
        ids.add(section.radarFileId);
      }
    });
    return ids;
  }, [radarSessionFileIds, reportSections]);

  const radarVisibleFiles = useMemo(() => {
    if (radarShowAllFiles) return radarFiles;
    return radarFiles.filter((file) => radarActiveFileIds.has(file.id));
  }, [radarFiles, radarActiveFileIds, radarShowAllFiles]);

  const selectedLayout = useMemo(
    () => layouts.find((layout) => layout.id === selectedLayoutId) ?? null,
    [layouts, selectedLayoutId]
  );

  const selectedLayoutTemplates = useMemo(() => {
    if (!selectedLayout) return [];
    return selectedLayout.templateIds
      .map((templateId) => templateById.get(templateId))
      .filter((template): template is SectionTemplate => Boolean(template));
  }, [selectedLayout, templateById]);

  const layoutAvailableTemplates = useMemo(
    () =>
      sectionTemplates.filter(
        (template) => !!template.id && !layoutTemplateIds.includes(template.id)
      ),
    [sectionTemplates, layoutTemplateIds]
  );

  const normalizedLayoutTemplateSearch = useMemo(
    () =>
      layoutTemplateSearch
        .toLocaleLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim(),
    [layoutTemplateSearch]
  );

  const filteredLayoutAvailableTemplates = useMemo(() => {
    const query = normalizedLayoutTemplateSearch;
    if (!query) return layoutAvailableTemplates;

    const normalizeTitle = (title: string) =>
      title
        .toLocaleLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const matches = layoutAvailableTemplates.filter((template) =>
      normalizeTitle(template.title).includes(query)
    );

    // Prefer "startsWith" matches first for a better autocomplete feel.
    matches.sort((a, b) => {
      const aTitle = normalizeTitle(a.title);
      const bTitle = normalizeTitle(b.title);
      const aStarts = aTitle.startsWith(query);
      const bStarts = bTitle.startsWith(query);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
      return aTitle.localeCompare(bTitle, "fr");
    });

    return matches;
  }, [layoutAvailableTemplates, normalizedLayoutTemplateSearch]);

  const layoutTemplateSuggestions = useMemo(() => {
    if (!normalizedLayoutTemplateSearch) return [];
    return filteredLayoutAvailableTemplates.slice(0, 8);
  }, [filteredLayoutAvailableTemplates, normalizedLayoutTemplateSearch]);

  const layoutOptions = useMemo(() => {
    const presets: LayoutOption[] = [];
    const templateLookup = new Map<string, SectionTemplate>();
    sectionTemplates.forEach((template) => {
      templateLookup.set(template.title.toLowerCase(), template);
    });

    const dedupeTemplates = (templates: SectionTemplate[]) => {
      const seen = new Set<string>();
      return templates.filter((template) => {
        const key = template.id ?? template.title.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    const pickTitles = (titles: string[]) =>
      titles
        .map((title) => templateLookup.get(title.toLowerCase()))
        .filter((template): template is SectionTemplate => Boolean(template));

    const pickTags = (tags: string[]) =>
      sectionTemplates.filter((template) =>
        (template.tags ?? []).some((tag) => tags.includes(tag))
      );

    const addPreset = ({
      id,
      title,
      hint,
      titles = [],
      tags = [],
      limit,
      fill = false,
    }: {
      id: string;
      title: string;
      hint: string;
      titles?: string[];
      tags?: string[];
      limit?: number;
      fill?: boolean;
    }) => {
      let templates = dedupeTemplates([...pickTitles(titles), ...pickTags(tags)]);

      if (limit && fill) {
        sectionTemplates.forEach((template) => {
          if (templates.length >= limit) return;
          if (!templates.includes(template)) {
            templates.push(template);
          }
        });
      }

      if (limit) {
        templates = templates.slice(0, limit);
      }

      if (templates.length === 0) return;
      presets.push({ id, title, hint, templates, source: "suggested" });
    };

    const coreTitles = ["Resume de la seance", "Plan 7 jours"];

    addPreset({
      id: "suggested:quick",
      title: "Rapide",
      hint: "3 sections pour aller vite",
      titles: ["Resume de la seance", "Diagnostic swing", "Plan 7 jours"],
      limit: 3,
      fill: true,
    });
    addPreset({
      id: "suggested:standard",
      title: "Standard",
      hint: "Structure equilibree",
      titles: [
        "Resume de la seance",
        "Diagnostic swing",
        "Exercices recommandes",
        "Mental - focus",
        "Plan 7 jours",
      ],
      limit: 5,
      fill: true,
    });
    addPreset({
      id: "suggested:detail",
      title: "Detaille",
      hint: "Plus de profondeur",
      titles: [
        "Resume de la seance",
        "Points forts",
        "Axes d amelioration",
        "Diagnostic swing",
        "Statistiques",
        "Exercices recommandes",
        "Plan 7 jours",
        "Routine pre-shot",
      ],
      limit: 8,
      fill: true,
    });
    addPreset({
      id: "suggested:technique",
      title: "Technique",
      hint: "Seance technique swing",
      titles: coreTitles,
      tags: ["technique", "swing", "setup", "impact"],
      limit: 6,
    });
    addPreset({
      id: "suggested:shortgame",
      title: "Petit jeu",
      hint: "Seance petit jeu et approches",
      titles: coreTitles,
      tags: ["short_game", "approach", "chipping", "pitching", "bunker"],
      limit: 6,
    });
    addPreset({
      id: "suggested:putting",
      title: "Putting",
      hint: "Seance putting et greens",
      titles: coreTitles,
      tags: ["putting", "green", "distance"],
      limit: 6,
    });
    addPreset({
      id: "suggested:course",
      title: "Parcours",
      hint: "Strategie et gestion du parcours",
      titles: coreTitles,
      tags: ["strategy", "club_choice", "driver"],
      limit: 6,
    });
    addPreset({
      id: "suggested:mental",
      title: "Mental",
      hint: "Focus mental et routines",
      titles: coreTitles,
      tags: ["mental", "focus", "stress", "confidence", "breathing", "routine"],
      limit: 6,
    });

    const saved = layouts.map((layout) => ({
      id: layout.id,
      title: layout.title,
      hint: `Layout sauvegarde - ${layout.templateIds.length} sections`,
      templates: layout.templateIds
        .map((templateId) => templateById.get(templateId))
        .filter((template): template is SectionTemplate => Boolean(template)),
      source: "saved" as const,
    }));

    const base = [...presets, ...saved];
    if (!aiLayoutOption) return base;
    return [aiLayoutOption, ...base.filter((option) => option.id !== aiLayoutOption.id)];
  }, [layouts, sectionTemplates, templateById, aiLayoutOption]);

  const selectedLayoutOption = useMemo(() => {
    const direct = layoutOptions.find((option) => option.id === selectedLayoutOptionId);
    if (direct) return direct;
    return layoutOptions[0] ?? null;
  }, [layoutOptions, selectedLayoutOptionId]);

  const maxAiLayoutCount = useMemo(
    () => Math.max(1, Math.min(12, sectionTemplates.length)),
    [sectionTemplates.length]
  );
  const minAiLayoutCount = Math.min(3, maxAiLayoutCount);
  const clampAiLayoutCount = useCallback(
    (value: number) => Math.min(maxAiLayoutCount, Math.max(minAiLayoutCount, value)),
    [maxAiLayoutCount, minAiLayoutCount]
  );
  const getAiLayoutDefaultCount = useCallback(
    (detail: AiLayoutAnswers["detail"]) => {
      const base = detail === "quick" ? 3 : detail === "standard" ? 5 : 8;
      return clampAiLayoutCount(base);
    },
    [clampAiLayoutCount]
  );

  useEffect(() => {
    if (aiLayoutCountTouched) return;
    const nextCount = getAiLayoutDefaultCount(aiLayoutAnswers.detail);
    setAiLayoutAnswers((prev) =>
      prev.sectionCount === nextCount ? prev : { ...prev, sectionCount: nextCount }
    );
  }, [aiLayoutAnswers.detail, aiLayoutCountTouched, getAiLayoutDefaultCount]);

  const aiLayoutSectionCount = clampAiLayoutCount(
    aiLayoutAnswers.sectionCount || getAiLayoutDefaultCount(aiLayoutAnswers.detail)
  );

  const aiLayoutSuggestion = useMemo(() => {
    const candidates = sectionTemplates;
    if (candidates.length === 0) return null;

    const goalKeywords: Record<string, string[]> = {
      technique: ["technique", "swing"],
      mental: ["mental"],
      performance: ["stat", "performance", "kpi"],
      synthese: ["resume", "synthese", "bilan"],
    };
    const goalTags: Record<string, string[]> = {
      technique: ["technique", "swing", "setup", "impact"],
      mental: ["mental", "focus", "stress", "confidence"],
      performance: ["stats", "performance", "strategy"],
      synthese: ["summary", "planning"],
    };
    const sectorKeywords: Record<string, string[]> = {
      swing: ["swing", "technique", "impact"],
      short_game: ["petit", "approche", "chip", "pitch", "bunker"],
      putting: ["putt", "green", "dosage"],
      parcours: ["strategie", "parcours", "tee"],
      physique: ["physique", "mobilite", "prep"],
    };
    const sectorTags: Record<string, string[]> = {
      swing: ["technique", "swing", "setup", "impact", "driver", "irons"],
      short_game: ["short_game", "approach", "chipping", "pitching", "bunker"],
      putting: ["putting", "green", "distance"],
      parcours: ["strategy", "club_choice", "driver"],
      physique: ["physical", "mobility", "prep"],
    };
    const focusKeywords: Record<string, string[]> = {
      plan: ["plan", "semaine", "programme", "routine"],
      exercices: ["exercice"],
      objectifs: ["objectif"],
      images: ["image"],
    };
    const focusTags: Record<string, string[]> = {
      plan: ["planning", "routine"],
      exercices: ["exercises", "practice"],
      objectifs: ["goals"],
      images: ["visual"],
    };
    const normalizedGoal = aiLayoutAnswers.goal;
    const normalizedFocus = aiLayoutAnswers.focus;
    const normalizedSector = aiLayoutAnswers.sector;
    const goalLabels: Record<string, string> = {
      synthese: "Synthese",
      technique: "Technique",
      mental: "Mental",
      performance: "Performance",
    };
    const focusLabels: Record<string, string> = {
      plan: "Plan",
      exercices: "Exercices",
      objectifs: "Objectifs",
      images: "Visuel",
    };
    const sectorLabels: Record<string, string> = {
      swing: "Swing",
      short_game: "Petit jeu",
      putting: "Putting",
      parcours: "Parcours",
      physique: "Physique",
    };
    const keywords = [
      ...(goalKeywords[normalizedGoal] ?? []),
      ...(focusKeywords[normalizedFocus] ?? []),
      ...(sectorKeywords[normalizedSector] ?? []),
    ];
    const targetTags = new Set<string>([
      ...(goalTags[normalizedGoal] ?? []),
      ...(focusTags[normalizedFocus] ?? []),
      ...(sectorTags[normalizedSector] ?? []),
    ]);

    const matchesKeyword = (section: SectionTemplate) =>
      keywords.some((keyword) => section.title.toLowerCase().includes(keyword));
    const matchesTag = (section: SectionTemplate) =>
      targetTags.size > 0 && (section.tags ?? []).some((tag) => targetTags.has(tag));

    const picked: SectionTemplate[] = [];
    candidates.forEach((section) => {
      if (matchesTag(section) || matchesKeyword(section)) {
        picked.push(section);
      }
    });

    if (aiLayoutAnswers.images !== "no") {
      candidates.forEach((section) => {
        if (section.type === "image" && !picked.includes(section)) {
          picked.push(section);
        }
      });
    }

    const defaultLimit = getAiLayoutDefaultCount(aiLayoutAnswers.detail);
    const requestedLimit =
      aiLayoutAnswers.sectionCount > 0 ? aiLayoutAnswers.sectionCount : defaultLimit;
    const limit = Math.min(clampAiLayoutCount(requestedLimit), candidates.length);

    candidates.forEach((section) => {
      if (picked.length >= limit) return;
      if (picked.includes(section)) return;
      picked.push(section);
    });

    const sectorLabel = sectorLabels[normalizedSector];
    const goalLabel = goalLabels[normalizedGoal];
    const focusLabel = focusLabels[normalizedFocus];
    const baseLabel = sectorLabel || goalLabel;
    const titleParts = [`Seance ${baseLabel ?? "personnalisee"}`];
    if (sectorLabel && goalLabel) {
      titleParts.push(goalLabel);
    }
    if (focusLabel) {
      titleParts.push(focusLabel);
    }
    const title = aiLayoutTitle.trim() || titleParts.join(" - ");

    return {
      title,
      templates: picked.slice(0, limit),
    };
  }, [
    aiLayoutAnswers,
    aiLayoutTitle,
    clampAiLayoutCount,
    getAiLayoutDefaultCount,
    sectionTemplates,
  ]);

  const resizeTextareaById = (id: string) => {
    const textarea = textareaRefs.current.get(id);
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  const setSectionsNotice = (message: string, type: "idle" | "error" | "success") => {
    setSectionsMessage(message);
    setSectionsMessageType(type);
  };

  const setLayoutNotice = (message: string, type: "idle" | "error" | "success") => {
    setLayoutMessage(message);
    setLayoutMessageType(type);
  };

  const createSectionTemplate = async (title: string, type: SectionType) => {
    if (!organization?.id) {
      setSectionsNotice("Organisation introuvable.", "error");
      return null;
    }

    const { data, error } = await supabase
      .from("section_templates")
      .insert([{ org_id: organization.id, title, type }])
      .select("id, title, type")
      .single();

    if (error) {
      setSectionsNotice(error.message, "error");
      return null;
    }

    const tags = sectionTagMap.get(title.toLowerCase()) ?? [];
    const nextTemplate = { ...data, tags } as SectionTemplate;
    setSectionTemplates((prev) => [...prev, nextTemplate]);
    setSectionsNotice("Section ajoutee.", "success");
    return nextTemplate;
  };

  const updateSectionTemplate = async (
    templateId: string | undefined,
    nextTitle: string
  ) => {
    if (!templateId) {
      const nextTags = sectionTagMap.get(nextTitle.toLowerCase()) ?? [];
      setSectionTemplates((prev) =>
        prev.map((section) =>
          section.title === editingSection
            ? { ...section, title: nextTitle, tags: nextTags }
            : section
        )
      );
      return true;
    }

    const { error } = await supabase
      .from("section_templates")
      .update({ title: nextTitle })
      .eq("id", templateId);

    if (error) {
      setSectionsNotice(error.message, "error");
      return false;
    }

    const nextTags = sectionTagMap.get(nextTitle.toLowerCase()) ?? [];
    setSectionTemplates((prev) =>
      prev.map((section) =>
        section.id === templateId
          ? { ...section, title: nextTitle, tags: nextTags }
          : section
      )
    );
    return true;
  };

  const deleteSectionTemplate = async (template: SectionTemplate) => {
    if (!template.id) {
      setSectionTemplates((prev) =>
        prev.filter((section) => section.title !== template.title)
      );
      return true;
    }

    const { error } = await supabase
      .from("section_templates")
      .delete()
      .eq("id", template.id);

    if (error) {
      setSectionsNotice(error.message, "error");
      return false;
    }

    setSectionTemplates((prev) => prev.filter((section) => section.id !== template.id));
    return true;
  };

  const handleAddCustomSection = async () => {
    const next = customSection.trim();
    if (!next) {
      setSectionsNotice("Saisis un nom de section.", "error");
      return false;
    }
    if (customType === "radar" && !radarAddonEnabled) {
      setSectionsNotice("Plan Pro requis pour cette section.", "error");
      openRadarAddonModal();
      return false;
    }

    const exists = sectionTemplates.some(
      (section) => section.title.toLowerCase() === next.toLowerCase()
    );

    if (exists) {
      setSectionsNotice("Cette section existe deja.", "error");
      return false;
    }

    const created = await createSectionTemplate(next, customType);
    if (!created) return false;
    setCustomSection("");
    setCustomType("text");
    return true;
  };

  const handleEditSection = (section: SectionTemplate) => {
    setEditingSection(section.title);
    setEditingValue(section.title);
    setEditingTemplateId(section.id ?? null);
    setSectionsNotice("", "idle");
  };

  const handleCancelEdit = () => {
    setEditingSection(null);
    setEditingValue("");
    setEditingTemplateId(null);
  };

  const handleSaveEdit = async () => {
    if (!editingSection) return;
    const next = editingValue.trim();

    if (!next) {
      setSectionsNotice("Saisis un nom de section.", "error");
      return;
    }

    const conflict = sectionTemplates.some(
      (section) =>
        section.title.toLowerCase() === next.toLowerCase() &&
        section.title !== editingSection
    );

    if (conflict) {
      setSectionsNotice("Cette section existe deja.", "error");
      return;
    }

    const saved = await updateSectionTemplate(editingTemplateId ?? undefined, next);
    if (!saved) return;
    setReportSections((prev) =>
      prev.map((section) =>
        section.title === editingSection ? { ...section, title: next } : section
      )
    );
    setSectionsNotice("Section modifiee.", "success");
    setEditingSection(null);
    setEditingValue("");
    setEditingTemplateId(null);
  };

  const handleAddToReport = (section: SectionTemplate) => {
    const featureKey = getSectionFeatureKey(section);
    if (isFeatureLocked(featureKey)) {
      openFeatureModal(featureKey);
      return;
    }
    const normalized = section.title.toLowerCase();
    setReportSections((prev) => {
      const exists = prev.some((item) => item.title.toLowerCase() === normalized);
      if (exists) return prev;
      if (
        section.type === "video" &&
        prev.filter((item) => item.type === "video").length >= VIDEO_SECTIONS_LIMIT
      ) {
        setSectionsNotice("Une seule section video est autorisee par rapport.", "error");
        return prev;
      }
      return [...prev, createSection(section)];
    });
    shouldAnimate.current = true;
  };

  const handleRemoveFromReport = (section: ReportSection) => {
    setReportSections((prev) => prev.filter((item) => item.id !== section.id));
    setAiPreviews((prev) => {
      if (!prev[section.id]) return prev;
      const next = { ...prev };
      delete next[section.id];
      return next;
    });
    setCollapsedSections((prev) => {
      if (!prev[section.id]) return prev;
      const next = { ...prev };
      delete next[section.id];
      return next;
    });
    setImageErrors((prev) => {
      if (!prev[section.id]) return prev;
      const next = { ...prev };
      delete next[section.id];
      return next;
    });
    setUploadingSections((prev) => {
      if (!prev[section.id]) return prev;
      const next = { ...prev };
      delete next[section.id];
      return next;
    });
    shouldAnimate.current = true;
  };

  const handleClearReportSections = () => {
    if (reportSections.length === 0) return;
    if (!window.confirm("Retirer toutes les sections du rapport ?")) return;
    setReportSections([]);
    setAiPreviews({});
    setCollapsedSections({});
    setImageErrors({});
    setUploadingSections({});
    shouldAnimate.current = true;
  };

  const handleRemoveFromAvailable = async (section: SectionTemplate) => {
    const removed = await deleteSectionTemplate(section);
    if (!removed) return;
    setReportSections((prev) => prev.filter((item) => item.title !== section.title));
    if (editingSection === section.title) {
      setEditingSection(null);
      setEditingValue("");
      setEditingTemplateId(null);
    }
    shouldAnimate.current = true;
  };

  const handleDragStart = (index: number, event: React.DragEvent<HTMLElement>) => {
    if (!dragEnabled) {
      event.preventDefault();
      return;
    }
    setDragIndex(index);
    setDraggingAvailable(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", reportSections[index].id);
  };

  const handleAvailableDragStart = (
    section: SectionTemplate,
    event: React.DragEvent<HTMLElement>
  ) => {
    if (!dragEnabled) {
      event.preventDefault();
      return;
    }
    setDraggingAvailable(section);
    setDragIndex(null);
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", section.title);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDraggingAvailable(null);
    setHoverIndex(null);
  };

  const handleDrop = (index: number) => {
    if (draggingAvailable) {
      const droppedTemplate = draggingAvailable;
      const normalized = droppedTemplate.title.toLowerCase();
      shouldAnimate.current = true;
      setReportSections((prev) => {
        const exists = prev.some((item) => item.title.toLowerCase() === normalized);
        if (exists) return prev;
        if (
          droppedTemplate.type === "video" &&
          prev.filter((item) => item.type === "video").length >= VIDEO_SECTIONS_LIMIT
        ) {
          setSectionsNotice("Une seule section video est autorisee par rapport.", "error");
          return prev;
        }
        const next = [...prev];
        next.splice(index, 0, createSection(droppedTemplate));
        return next;
      });
      setDraggingAvailable(null);
      setDragIndex(null);
      setHoverIndex(null);
      return;
    }

    if (dragIndex === null) {
      setHoverIndex(null);
      return;
    }

    const nextIndex = dragIndex < index ? index - 1 : index;
    if (nextIndex === dragIndex) {
      setHoverIndex(null);
      return;
    }

    shouldAnimate.current = true;
    setReportSections((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(nextIndex, 0, moved);
      return next;
    });

    setDragIndex(null);
    setHoverIndex(null);
  };

  const handleSectionInput = (
    id: string,
    event: React.FormEvent<HTMLTextAreaElement>
  ) => {
    const target = event.currentTarget;
    const value = target.value;
    target.style.height = "auto";
    target.style.height = `${target.scrollHeight}px`;
    setReportSections((prev) =>
      prev.map((section) =>
        section.id === id
          ? {
              ...section,
              content: value,
              contentFormatted: null,
              contentFormatHash: null,
            }
          : section
      )
    );
    if (aiPreviews[id]) {
      setAiPreviews((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleImageFiles = async (sectionId: string, files: FileList | File[]) => {
    if (!organization?.id) {
      setImageErrors((prev) => ({
        ...prev,
        [sectionId]: "Organisation introuvable.",
      }));
      return;
    }

    const list = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (list.length === 0) {
      setImageErrors((prev) => ({
        ...prev,
        [sectionId]: "Formats acceptes: JPG, PNG, WEBP.",
      }));
      return;
    }

    setImageErrors((prev) => ({ ...prev, [sectionId]: "" }));
    setUploadingSections((prev) => ({ ...prev, [sectionId]: true }));

    const uploaded: string[] = [];
    for (const file of list) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `${organization.id}/drafts/${draftId}/${sectionId}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage
        .from("report-media")
        .upload(path, file, { cacheControl: "3600", upsert: false });

      if (error) {
        setImageErrors((prev) => ({
          ...prev,
          [sectionId]: error.message,
        }));
        continue;
      }

      const { data } = supabase.storage.from("report-media").getPublicUrl(path);
      if (data?.publicUrl) {
        uploaded.push(data.publicUrl);
      }
    }

    if (uploaded.length > 0) {
      setReportSections((prev) =>
        prev.map((section) => {
          if (section.id !== sectionId) return section;
          return {
            ...section,
            mediaUrls: [...section.mediaUrls, ...uploaded],
            mediaCaptions: [...section.mediaCaptions, ...uploaded.map(() => "")],
          };
        })
      );
    }

    setUploadingSections((prev) => ({ ...prev, [sectionId]: false }));
  };

  const getVideoDurationSeconds = (file: File) =>
    new Promise<number>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";

      const cleanup = () => {
        URL.revokeObjectURL(url);
      };

      video.onloadedmetadata = () => {
        const duration = Number(video.duration);
        cleanup();
        if (!Number.isFinite(duration) || duration <= 0) {
          reject(new Error("Impossible de lire la duree de la video."));
          return;
        }
        resolve(duration);
      };

      video.onerror = () => {
        cleanup();
        reject(new Error("Impossible de lire le fichier video."));
      };

      video.src = url;
    });

  const handleVideoFiles = async (sectionId: string, files: FileList | File[]) => {
    if (!organization?.id) {
      setImageErrors((prev) => ({
        ...prev,
        [sectionId]: "Organisation introuvable.",
      }));
      return;
    }

    const list = Array.from(files).filter((file) => file.type.startsWith("video/"));
    if (list.length === 0) {
      setImageErrors((prev) => ({
        ...prev,
        [sectionId]: "Formats acceptes: MP4, MOV, WebM.",
      }));
      return;
    }

    const currentCount =
      reportSections.find((section) => section.id === sectionId)?.mediaUrls.length ?? 0;
    const remainingSlots = Math.max(0, VIDEO_PER_SECTION_LIMIT - currentCount);
    if (remainingSlots === 0) {
      setImageErrors((prev) => ({
        ...prev,
        [sectionId]: `Maximum ${VIDEO_PER_SECTION_LIMIT} videos dans cette section.`,
      }));
      return;
    }

    setImageErrors((prev) => ({ ...prev, [sectionId]: "" }));
    setUploadingSections((prev) => ({ ...prev, [sectionId]: true }));

    const uploaded: string[] = [];
    let warning = "";

    for (const file of list) {
      if (uploaded.length >= remainingSlots) break;

      try {
        const duration = await getVideoDurationSeconds(file);
        if (duration > VIDEO_DURATION_LIMIT_SECONDS) {
          warning = `Video trop longue (max ${VIDEO_DURATION_LIMIT_SECONDS}s).`;
          continue;
        }
      } catch (error) {
        warning =
          error instanceof Error ? error.message : "Impossible de verifier la video.";
        continue;
      }

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `${organization.id}/drafts/${draftId}/${sectionId}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage
        .from("report-media")
        .upload(path, file, { cacheControl: "3600", upsert: false });

      if (error) {
        warning = error.message;
        continue;
      }

      const { data } = supabase.storage.from("report-media").getPublicUrl(path);
      if (data?.publicUrl) {
        uploaded.push(data.publicUrl);
      }
    }

    if (uploaded.length > 0) {
      setReportSections((prev) =>
        prev.map((section) => {
          if (section.id !== sectionId) return section;
          return {
            ...section,
            mediaUrls: [...section.mediaUrls, ...uploaded].slice(0, VIDEO_PER_SECTION_LIMIT),
            mediaCaptions: [
              ...section.mediaCaptions,
              ...uploaded.map(() => ""),
            ].slice(0, VIDEO_PER_SECTION_LIMIT),
          };
        })
      );
    }

    if (warning) {
      setImageErrors((prev) => ({ ...prev, [sectionId]: warning }));
    }

    setUploadingSections((prev) => ({ ...prev, [sectionId]: false }));
  };

  const handleRemoveImage = (sectionId: string, index: number) => {
    setReportSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;
        return {
          ...section,
          mediaUrls: section.mediaUrls.filter((_, idx) => idx !== index),
          mediaCaptions: section.mediaCaptions.filter((_, idx) => idx !== index),
        };
      })
    );
  };

  const handleCaptionChange = (sectionId: string, index: number, value: string) => {
    const trimmed = value.slice(0, CAPTION_LIMIT);
    setReportSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;
        const nextCaptions = [...section.mediaCaptions];
        nextCaptions[index] = trimmed;
        return { ...section, mediaCaptions: nextCaptions };
      })
    );
  };

  const handleWorkingNotesInput = (event: React.FormEvent<HTMLTextAreaElement>) => {
    const target = event.currentTarget;
    const value = target.value;
    // Avoid "shrink -> grow" on every keystroke which can cause Safari/iOS to auto-scroll.
    target.style.height = `${target.scrollHeight}px`;
    setWorkingNotes(value);
  };

  const handleWorkingObservationsInput = (
    event: React.FormEvent<HTMLTextAreaElement>
  ) => {
    const target = event.currentTarget;
    const value = target.value;
    // Avoid "shrink -> grow" on every keystroke which can cause Safari/iOS to auto-scroll.
    target.style.height = `${target.scrollHeight}px`;
    setWorkingObservations(value);
  };

  const handleMoveSection = (index: number, direction: "up" | "down") => {
    setReportSections((prev) => {
      const next = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    shouldAnimate.current = true;
  };

  const toggleSectionCollapse = (id: string) => {
    setCollapsedSections((prev) => {
      const wasCollapsed = prev[id];
      const next = {
        ...prev,
        [id]: !prev[id],
      };
      if (wasCollapsed) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resizeTextareaById(id));
        });
      }
      return next;
    });
  };

  const loadStudents = async () => {
    setStudentsLoading(true);
    setStudentsLoaded(false);
    const { data, error } = await supabase
      .from("students")
      .select("id, first_name, last_name, email, tpi_report_id")
      .order("created_at", { ascending: false });

    setStudentsLoading(false);
    setStudentsLoaded(true);

    if (error) {
      setStatusMessage(error.message);
      setStatusType("error");
      return;
    }

    setStudents(data ?? []);
  };

  const loadRadarFiles = useCallback(
    async (student?: string) => {
      const targetStudentId = student ?? studentId;
      if (!targetStudentId) {
        setRadarFiles([]);
        return [];
      }
      setRadarLoading(true);
      setRadarError("");

      const linkedIds = await resolveLinkedStudentIds(targetStudentId);
      if (linkedIds.length === 0) {
        setRadarFiles([]);
        setRadarLoading(false);
        return [];
      }

      const { data, error } = await supabase
        .from("radar_files")
        .select(
          "id, status, original_name, columns, shots, stats, summary, config, analytics, created_at, error, org_id, organizations(name)"
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
    },
    [studentId, resolveLinkedStudentIds]
  );

  const stopRadarUploadProgress = () => {
    if (radarUploadTimer.current) {
      clearInterval(radarUploadTimer.current);
      radarUploadTimer.current = null;
    }
  };

  const stopRadarAiAutoProgress = () => {
    if (radarAiAutoTimer.current) {
      clearInterval(radarAiAutoTimer.current);
      radarAiAutoTimer.current = null;
    }
  };

  const runRadarAiAutoProgress = (durationMs: number) => {
    stopRadarAiAutoProgress();
    const start = Date.now();
    radarAiAutoTimer.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const ratio = Math.min(1, elapsed / durationMs);
      const next = Math.min(95, Math.max(3, ratio * 95));
      setRadarAiAutoProgress((prev) => (next > prev ? next : prev));
      if (ratio >= 1) {
        stopRadarAiAutoProgress();
      }
    }, 800);
  };

  const isRadarImageFile = (file: File) => {
    if (file.type.startsWith("image/")) return true;
    const name = file.name.toLowerCase();
    return [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"].some((ext) =>
      name.endsWith(ext)
    );
  };

  const runRadarUploadProgress = (
    target: number,
    step: number,
    delay: number,
    onComplete?: () => void
  ) => {
    stopRadarUploadProgress();
    radarUploadTimer.current = setInterval(() => {
      let reached = false;
      setRadarUploadProgress((prev) => {
        if (prev >= target) {
          reached = true;
          return prev;
        }
        const next = Math.min(prev + step, target);
        if (next >= target) reached = true;
        return next;
      });
      if (reached) {
        stopRadarUploadProgress();
        if (onComplete) onComplete();
      }
    }, delay);
  };

  const processRadarFile = async (file: File) => {
    if (!radarAddonEnabled) {
      setRadarError("Plan Pro requis pour importer un fichier datas.");
      openRadarAddonModal();
      return false;
    }
    if (!studentId || !organization?.id) {
      setRadarError("Choisis un eleve avant d importer un fichier datas.");
      return false;
    }
    const tech = radarTechRef.current;
    const techMeta = getRadarTechMeta(tech);
    if (!isRadarImageFile(file)) {
      setRadarError(`Importe une image ${techMeta.label} (jpg, png, heic...).`);
      return false;
    }

    setRadarError("");
    setRadarUploadProgress(8);
    runRadarUploadProgress(45, 1.5, 350);

    const selectedStudent = studentId ? studentById.get(studentId) : null;
    const studentLabel = [selectedStudent?.first_name, selectedStudent?.last_name]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join(" ")
      .trim();
    const displayName = buildRadarFileDisplayName({
      tech,
      studentName: studentLabel,
      reportDate,
      club: workingClub,
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
      stopRadarUploadProgress();
      setRadarUploadProgress(0);
      return false;
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
      stopRadarUploadProgress();
      setRadarUploadProgress(0);
      return false;
    }

    setRadarSessionFileIds((prev) => Array.from(new Set([...prev, radarRow.id])));

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setRadarError("Session invalide.");
      stopRadarUploadProgress();
      setRadarUploadProgress(0);
      return false;
    }

    setRadarUploadProgress(50);
    runRadarUploadProgress(90, 0.4, 600, () => {
      runRadarUploadProgress(99, 0.1, 1650);
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
      stopRadarUploadProgress();
      setRadarUploadProgress(0);
      await loadRadarFiles();
      return false;
    }

    const refreshed = await loadRadarFiles();
    stopRadarUploadProgress();
    setRadarUploadProgress(100);
    const reviewFile = refreshed.find((file) => file.id === radarRow.id);
    if (reviewFile?.status === "review") {
      setRadarReview(reviewFile);
    }
    return true;
  };

  const openRadarImportModal = (sectionId: string) => {
    setRadarImportSectionId(sectionId);
    setRadarImportTech(radarTechRef.current);
    setRadarImportError("");
    setRadarImportOpen(true);
  };

  const closeRadarImportModal = () => {
    setRadarImportOpen(false);
    setRadarImportSectionId(null);
    setRadarImportError("");
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
    await loadRadarFiles();
    setRadarReview(null);
  };

  const handleRadarUploadBatch = async (files: File[]) => {
    if (!files.length) return;
    setRadarUploading(true);
    setRadarUploadBatch({ current: 0, total: files.length });
    for (const file of files) {
      setRadarUploadBatch((prev) =>
        prev ? { ...prev, current: prev.current + 1 } : prev
      );
      const ok = await processRadarFile(file);
      if (!ok) break;
    }
    setRadarUploading(false);
    setRadarUploadBatch(null);
  };

  const loadTpiContext = async (reportId?: string | null) => {
    setTpiContextLoading(true);
    try {
      if (!reportId) {
        setTpiContext("");
        return;
      }
      const { data, error } = await supabase
        .from("tpi_tests")
        .select(
          "test_name, result_color, mini_summary, details, details_translated, position"
        )
        .eq("report_id", reportId)
        .order("position", { ascending: true });

      if (error) {
        setTpiContext("");
        return;
      }

      const context =
        data
          ?.map((test, index) => {
            const color = test.result_color;
            const details = (
              test.details_translated ||
              test.details ||
              test.mini_summary ||
              ""
            ).trim();
            return `${index + 1}. ${test.test_name} (${color})\n${details}`.trim();
          })
          .join("\n\n") ?? "";
      setTpiContext(context);
    } finally {
      setTpiContextLoading(false);
    }
  };

  const loadSectionTemplates = useCallback(async () => {
    if (!organization?.id) return;
    setTemplatesLoading(true);
    setSectionsNotice("", "idle");

    const seedDefaultTemplates = async (includeTags: boolean) => {
      const payload = starterSections.map((section) => ({
        org_id: organization.id,
        title: section.title,
        type: section.type,
        tags: section.tags ?? sectionTagMap.get(section.title.toLowerCase()) ?? [],
      }));
      if (!includeTags) {
        const fallbackPayload = payload.map(({ org_id, title, type }) => ({
          org_id,
          title,
          type,
        }));
        const { error: fallbackError } = await supabase
          .from("section_templates")
          .insert(fallbackPayload);
        return !fallbackError;
      }

      const { error: insertError } = await supabase
        .from("section_templates")
        .insert(payload);
      if (!insertError) return true;

      const message = insertError.message.toLowerCase();
      if (message.includes("tags") || message.includes("column")) {
        const fallbackPayload = payload.map(({ org_id, title, type }) => ({
          org_id,
          title,
          type,
        }));
        const { error: fallbackError } = await supabase
          .from("section_templates")
          .insert(fallbackPayload);
        return !fallbackError;
      }
      return false;
    };

    const { data, error } = await supabase
      .from("section_templates")
      .select("id, title, type, tags")
      .eq("org_id", organization.id)
      .order("created_at", { ascending: true });

    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes("tags") || message.includes("column")) {
        const fallback = await supabase
          .from("section_templates")
          .select("id, title, type")
          .eq("org_id", organization.id)
          .order("created_at", { ascending: true });
        if (fallback.error) {
          setSectionsNotice(fallback.error.message, "error");
          setSectionTemplates(starterSections);
          setTemplatesLoading(false);
          return;
        }
        const fallbackData = fallback.data ?? [];
        if (fallbackData.length === 0) {
          const seeded = await seedDefaultTemplates(false);
          if (seeded) {
            const seededFetch = await supabase
              .from("section_templates")
              .select("id, title, type")
              .eq("org_id", organization.id)
              .order("created_at", { ascending: true });
            if (seededFetch.error) {
              setSectionsNotice(seededFetch.error.message, "error");
              setSectionTemplates(starterSections);
              setTemplatesLoading(false);
              return;
            }
            const seededData = seededFetch.data ?? [];
            setSectionTemplates(
              seededData.map((item) => ({
                id: item.id,
                title: item.title,
                type: normalizeSectionType(item.type),
                tags: sectionTagMap.get(item.title.toLowerCase()) ?? [],
              }))
            );
            setSectionsNotice("Pack initial sauvegarde pour demarrer.", "success");
            setTemplatesLoading(false);
            return;
          }

          setSectionsNotice(
            "Aucune section sauvegardee. Pack initial charge (non sauvegarde).",
            "error"
          );
          setSectionTemplates(starterSections);
          setTemplatesLoading(false);
          return;
        }
        setSectionTemplates(
          fallbackData.map((item) => ({
            id: item.id,
            title: item.title,
            type: normalizeSectionType(item.type),
            tags: sectionTagMap.get(item.title.toLowerCase()) ?? [],
          }))
        );
        setTemplatesLoading(false);
        return;
      }

      setSectionsNotice(error.message, "error");
      setSectionTemplates(starterSections);
      setTemplatesLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      const seeded = await seedDefaultTemplates(true);
      if (seeded) {
        const seededFetch = await supabase
          .from("section_templates")
          .select("id, title, type, tags")
          .eq("org_id", organization.id)
          .order("created_at", { ascending: true });
        if (seededFetch.error) {
          setSectionsNotice(seededFetch.error.message, "error");
          setSectionTemplates(starterSections);
          setTemplatesLoading(false);
          return;
        }
        const seededData = seededFetch.data ?? [];
        setSectionTemplates(
          seededData.map((item) => {
            const itemTags = Array.isArray((item as { tags?: string[] }).tags)
              ? ((item as { tags?: string[] }).tags ?? [])
              : (sectionTagMap.get(item.title.toLowerCase()) ?? []);
            return {
              id: item.id,
              title: item.title,
              type: normalizeSectionType(item.type),
              tags: itemTags,
            };
          })
        );
        setSectionsNotice("Pack initial sauvegarde pour demarrer.", "success");
        setTemplatesLoading(false);
        return;
      }

      setSectionsNotice(
        "Aucune section sauvegardee. Pack initial charge (non sauvegarde).",
        "error"
      );
      setSectionTemplates(starterSections);
      setTemplatesLoading(false);
      return;
    }

    setSectionTemplates(
      data.map((item) => {
        const itemTags = Array.isArray((item as { tags?: string[] }).tags)
          ? ((item as { tags?: string[] }).tags ?? [])
          : (sectionTagMap.get(item.title.toLowerCase()) ?? []);
        return {
          id: item.id,
          title: item.title,
          type: normalizeSectionType(item.type),
          tags: itemTags,
        };
      })
    );
    setTemplatesLoading(false);
  }, [organization?.id]);

  const loadLayouts = useCallback(async () => {
    if (!organization?.id) return;
    setLayoutNotice("", "idle");

    const { data: layoutData, error: layoutError } = await supabase
      .from("section_layouts")
      .select("id, title")
      .eq("org_id", organization.id)
      .order("created_at", { ascending: true });

    if (layoutError) {
      setLayoutNotice(layoutError.message, "error");
      return;
    }

    const layoutsList = layoutData ?? [];
    if (layoutsList.length === 0) {
      setLayouts([]);
      setSelectedLayoutId("");
      return;
    }

    const layoutIds = layoutsList.map((layout) => layout.id);
    const { data: itemsData, error: itemsError } = await supabase
      .from("section_layout_items")
      .select("layout_id, template_id, position")
      .in("layout_id", layoutIds)
      .order("position", { ascending: true });

    if (itemsError) {
      setLayoutNotice(itemsError.message, "error");
      return;
    }

    const itemsByLayout = new Map<string, string[]>();
    (itemsData ?? []).forEach((item) => {
      const list = itemsByLayout.get(item.layout_id) ?? [];
      list.push(item.template_id);
      itemsByLayout.set(item.layout_id, list);
    });

    setLayouts(
      layoutsList.map((layout) => ({
        id: layout.id,
        title: layout.title,
        templateIds: itemsByLayout.get(layout.id) ?? [],
      }))
    );
  }, [organization?.id]);

  const resetLayoutEditor = () => {
    setLayoutEditingId(null);
    setLayoutTitle("");
    setLayoutTemplateIds([]);
    setLayoutCustomTitle("");
    setLayoutCustomType("text");
    setLayoutTemplateSearch("");
    setLayoutTemplateSearchOpen(false);
    setLayoutEditorOpen(false);
    setLayoutNotice("", "idle");
  };

  const startCreateLayout = () => {
    setLayoutEditingId(null);
    setLayoutTitle("");
    setLayoutTemplateIds([]);
    setLayoutCustomTitle("");
    setLayoutCustomType("text");
    setLayoutTemplateSearch("");
    setLayoutTemplateSearchOpen(false);
    setLayoutEditorOpen(true);
    setLayoutNotice("", "idle");
  };

  const startEditLayout = (layout: SectionLayout) => {
    setLayoutEditingId(layout.id);
    setLayoutTitle(layout.title);
    setLayoutTemplateIds(layout.templateIds);
    setLayoutTemplateSearch("");
    setLayoutTemplateSearchOpen(false);
    setLayoutEditorOpen(true);
    setLayoutNotice("", "idle");
  };

  const handleAddTemplateToLayout = (templateId: string) => {
    const template = templateById.get(templateId);
    const featureKey = template ? getSectionFeatureKey(template) : null;
    if (isFeatureLocked(featureKey)) {
      openFeatureModal(featureKey);
      return;
    }
    if (
      template?.type === "video" &&
      layoutTemplateIds.some((id) => templateById.get(id)?.type === "video")
    ) {
      setLayoutNotice("Une seule section video par layout (et par rapport).", "error");
      return;
    }
    setLayoutTemplateIds((prev) =>
      prev.includes(templateId) ? prev : [...prev, templateId]
    );
  };

  const handleRemoveTemplateFromLayout = (templateId: string) => {
    setLayoutTemplateIds((prev) => prev.filter((id) => id !== templateId));
  };

  const handleMoveLayoutTemplate = (index: number, direction: "up" | "down") => {
    setLayoutTemplateIds((prev) => {
      const next = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  const saveLayout = async (
    title: string,
    templateIds: string[],
    editingId: string | null,
    setSaving: (saving: boolean) => void,
    onSaved?: (layoutId: string) => void
  ) => {
    if (!organization?.id) {
      setLayoutNotice("Organisation introuvable.", "error");
      return null;
    }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setLayoutNotice("Ajoute un titre au layout.", "error");
      return null;
    }
    if (templateIds.length === 0) {
      setLayoutNotice("Ajoute au moins une section.", "error");
      return null;
    }

    setSaving(true);
    setLayoutNotice("", "idle");

    let layoutId = editingId;
    if (!layoutId) {
      const { data, error } = await supabase
        .from("section_layouts")
        .insert([{ org_id: organization.id, title: trimmedTitle }])
        .select("id")
        .single();

      if (error || !data) {
        setLayoutNotice(error?.message ?? "Creation impossible.", "error");
        setSaving(false);
        return null;
      }
      layoutId = data.id;
    } else {
      const { error } = await supabase
        .from("section_layouts")
        .update({ title: trimmedTitle })
        .eq("id", layoutId);

      if (error) {
        setLayoutNotice(error.message, "error");
        setSaving(false);
        return null;
      }

      await supabase.from("section_layout_items").delete().eq("layout_id", layoutId);
    }

    const itemsPayload = templateIds.map((templateId, index) => ({
      layout_id: layoutId,
      template_id: templateId,
      position: index,
    }));

    const { error: itemsError } = await supabase
      .from("section_layout_items")
      .insert(itemsPayload);

    if (itemsError) {
      setLayoutNotice(itemsError.message, "error");
      setSaving(false);
      return null;
    }

    await loadLayouts();
    setSelectedLayoutId(layoutId ?? "");
    setSaving(false);
    if (layoutId) {
      onSaved?.(layoutId);
    }
    return layoutId;
  };

  const handleSaveLayout = async () => {
    const saved = await saveLayout(
      layoutTitle,
      layoutTemplateIds,
      layoutEditingId,
      setLayoutSaving,
      () => {
        resetLayoutEditor();
      }
    );
    return saved;
  };

  const handleDeleteLayout = async (layout: SectionLayout) => {
    const confirmed = window.confirm(`Supprimer le layout "${layout.title}" ?`);
    if (!confirmed) return false;

    const { error: itemsError } = await supabase
      .from("section_layout_items")
      .delete()
      .eq("layout_id", layout.id);

    if (itemsError) {
      setLayoutNotice(itemsError.message, "error");
      return false;
    }

    const { error } = await supabase.from("section_layouts").delete().eq("id", layout.id);

    if (error) {
      setLayoutNotice(error.message, "error");
      return false;
    }

    await loadLayouts();
    if (selectedLayoutId === layout.id) {
      setSelectedLayoutId("");
    }
    if (selectedLayoutOptionId === layout.id) {
      setSelectedLayoutOptionId("");
    }
    return true;
  };

  const applyLayoutTemplates = (
    templates: SectionTemplate[],
    mode: "append" | "replace"
  ) => {
    setLayoutNotice("", "idle");
    let skippedVideo = false;
    const normalizedTemplates =
      templates.filter((template) => template.type !== "video").length === templates.length
        ? templates
        : (() => {
            let usedVideo = false;
            return templates.filter((template) => {
              if (template.type !== "video") return true;
              if (usedVideo) {
                skippedVideo = true;
                return false;
              }
              usedVideo = true;
              return true;
            });
          })();

    if (skippedVideo) {
      setLayoutNotice("Une seule section video par rapport. Sections video en trop ignorees.", "error");
    }

    if (mode === "replace") {
      setReportSections(normalizedTemplates.map(createSection));
      setAiPreviews({});
      setCollapsedSections({});
      setImageErrors({});
      setUploadingSections({});
      shouldAnimate.current = true;
      return;
    }

    setReportSections((prev) => {
      const existing = new Set(prev.map((section) => section.title.toLowerCase()));
      const next = [...prev];
      let hasVideo = prev.some((section) => section.type === "video");
      templates.forEach((template) => {
        const key = template.title.toLowerCase();
        if (existing.has(key)) return;
        if (template.type === "video" && hasVideo) {
          skippedVideo = true;
          return;
        }
        next.push(createSection(template));
        existing.add(key);
        if (template.type === "video") hasVideo = true;
      });
      return next;
    });

    if (skippedVideo) {
      setLayoutNotice("Une seule section video par rapport. Sections video en trop ignorees.", "error");
    }
    shouldAnimate.current = true;
  };

  const applyLayoutOption = (option: LayoutOption, mode: "append" | "replace") => {
    applyLayoutTemplates(option.templates, mode);
    if (option.source === "saved") {
      setSelectedLayoutId(option.id);
      return;
    }
    setSelectedLayoutId("");
  };

  const handleSelectLayoutOption = (option: LayoutOption) => {
    setSelectedLayoutOptionId(option.id);
    setLayoutNotice("", "idle");
    if (option.source === "saved") {
      setSelectedLayoutId(option.id);
      return;
    }
    setSelectedLayoutId("");
  };

  const handleContinueFromLayout = () => {
    if (!selectedLayoutOption) {
      setLayoutNotice("Selectionne un layout.", "error");
      return;
    }
    applyLayoutOption(selectedLayoutOption, "replace");
    setBuilderStep("sections");
  };

  const handleContinueFromSections = () => {
    setBuilderStep("report");
  };

  const handleSkipSetup = () => {
    setBuilderStep("report");
  };

  const handleOpenAiLayout = () => {
    setAiLayoutCountTouched(false);
    setAiLayoutAnswers((prev) => ({
      ...prev,
      sectionCount: clampAiLayoutCount(
        prev.sectionCount || getAiLayoutDefaultCount(prev.detail)
      ),
    }));
    setAiLayoutMessage("");
    setAiLayoutOpen(true);
  };

  const handleAiLayoutClick = () => {
    if (aiFullLocked) {
      openPremiumModal();
      return;
    }
    handleOpenAiLayout();
  };

  const handleUseAiLayout = () => {
    if (!aiLayoutSuggestion) {
      setAiLayoutMessage("Aucune suggestion disponible.");
      return;
    }
    const option: LayoutOption = {
      id: "ai:current",
      title: aiLayoutSuggestion.title,
      hint: "Suggestion IA basee sur tes reponses",
      templates: aiLayoutSuggestion.templates,
      source: "ai",
    };
    setAiLayoutOption(option);
    setSelectedLayoutOptionId(option.id);
    setAiLayoutOpen(false);
  };

  const handleSaveAiLayout = async () => {
    if (!aiLayoutSuggestion) {
      setAiLayoutMessage("Aucune suggestion disponible.");
      return;
    }
    const templateIds = aiLayoutSuggestion.templates
      .map((template) => template.id)
      .filter((id): id is string => Boolean(id));
    if (templateIds.length === 0) {
      setAiLayoutMessage(
        "Ajoute des sections sauvegardees avant de pouvoir enregistrer."
      );
      return;
    }

    const savedId = await saveLayout(
      aiLayoutSuggestion.title,
      templateIds,
      null,
      setAiLayoutSaving,
      (layoutId) => {
        setAiLayoutOption(null);
        setSelectedLayoutOptionId(layoutId);
        setAiLayoutOpen(false);
      }
    );

    if (!savedId) {
      setAiLayoutMessage("Impossible de sauvegarder le layout.");
      return;
    }
  };

  const handleApplyLayout = () => {
    const layout = layouts.find((item) => item.id === selectedLayoutId);
    if (!layout) {
      setLayoutNotice("Selectionne un layout.", "error");
      return;
    }
    if (layout.templateIds.length === 0) {
      setLayoutNotice("Ce layout est vide.", "error");
      return;
    }

    const templates = layout.templateIds
      .map((templateId) => templateById.get(templateId))
      .filter((template): template is SectionTemplate => Boolean(template));
    if (templates.length === 0) {
      setLayoutNotice("Ce layout est vide.", "error");
      return;
    }

    applyLayoutTemplates(templates, "append");
  };

  const handleAddCustomTemplateToLayout = async () => {
    const next = layoutCustomTitle.trim();
    if (!next) {
      setLayoutNotice("Saisis un nom de section.", "error");
      return;
    }
    if (layoutCustomType === "radar" && !radarAddonEnabled) {
      setLayoutNotice("Plan Pro requis pour cette section.", "error");
      openRadarAddonModal();
      return;
    }
    if (
      layoutCustomType === "video" &&
      layoutTemplateIds.some((id) => templateById.get(id)?.type === "video")
    ) {
      setLayoutNotice("Une seule section video par layout (et par rapport).", "error");
      return;
    }

    const exists = sectionTemplates.some(
      (section) => section.title.toLowerCase() === next.toLowerCase()
    );
    if (exists) {
      setLayoutNotice("Cette section existe deja.", "error");
      return;
    }

    const created = await createSectionTemplate(next, layoutCustomType);
    if (!created?.id) return;

    setLayoutTemplateIds((prev) => [...prev, created.id as string]);
    setLayoutCustomTitle("");
    setLayoutCustomType("text");
  };

  const peekLocalDraft = useCallback((): LocalDraft | null => {
    if (typeof window === "undefined") return null;
    if (!isNewReport || loadingReport) return null;
    if (!requestedStudentId) return null;
    try {
      const directRaw = window.localStorage.getItem(draftKey);
      const legacyRaw =
        // Backwards compat: older sessions wrote a single key. If it's for the requested student, migrate.
        requestedStudentId ? window.localStorage.getItem(legacyDraftKey) : null;
      const raw = directRaw ?? legacyRaw;
      const sourceKey = directRaw ? draftKey : legacyRaw ? legacyDraftKey : null;
      if (!raw) return null;
      const draft = JSON.parse(raw) as LocalDraft;
      if (!draft || !Array.isArray(draft.reportSections)) return null;

      if (requestedStudentId && draft.studentId !== requestedStudentId) {
        // Never restore another student's draft when "New report" is opened from a specific student.
        return null;
      }

      if (!isLocalDraftMeaningful(draft)) {
        if (sourceKey) {
          window.localStorage.removeItem(sourceKey);
        }
        return null;
      }

      if (requestedStudentId && !window.localStorage.getItem(draftKey)) {
        window.localStorage.setItem(draftKey, raw);
        window.localStorage.removeItem(legacyDraftKey);
      }

      return draft;
    } catch {
      window.localStorage.removeItem(draftKey);
      return null;
    }
  }, [draftKey, isNewReport, legacyDraftKey, loadingReport, requestedStudentId]);

  const applyLocalDraft = useCallback((draft: LocalDraft) => {
    setStudentId(draft.studentId ?? "");
    setTitle(draft.title ?? "");
    setReportDate(draft.reportDate ?? formatDateInput(new Date()));
    setReportSections(draft.reportSections);
    setWorkingObservations(draft.workingObservations ?? "");
    setWorkingNotes(draft.workingNotes ?? "");
    setWorkingClub(draft.workingClub ?? "");
    setSelectedLayoutId(draft.selectedLayoutId ?? "");
    setSelectedLayoutOptionId(draft.selectedLayoutOptionId ?? "");
    // After a restore, show the editor step so the user immediately sees recovered content.
    setBuilderStep(draft.builderStep ?? "report");
  }, []);

  const persistLocalDraft = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!isNewReport || loadingReport) return;
    if (localDraftPrompt) return;
    // If we don't yet know the student, don't persist: it would collide and "steal" drafts.
    const targetStudentId = studentId || requestedStudentId;
    if (!targetStudentId) return;
    const key = `gc.reportDraft.new.${targetStudentId}`;
    const payload: LocalDraft = {
      studentId: targetStudentId,
      title,
      reportDate,
      reportSections,
      workingObservations,
      workingNotes,
      workingClub,
      builderStep,
      selectedLayoutId: selectedLayoutId || undefined,
      selectedLayoutOptionId: selectedLayoutOptionId || undefined,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(key, JSON.stringify(payload));
    // Keep a "last draft" pointer for generic entrypoints without studentId.
    window.localStorage.setItem(legacyDraftKey, JSON.stringify(payload));
  }, [
    builderStep,
    isNewReport,
    loadingReport,
    localDraftPrompt,
    reportDate,
    reportSections,
    selectedLayoutId,
    selectedLayoutOptionId,
    studentId,
    requestedStudentId,
    legacyDraftKey,
    title,
    workingClub,
    workingNotes,
    workingObservations,
  ]);


  const loadReportForEdit = async (reportId: string) => {
    setLoadingReport(true);
    setStatusMessage("");
    setStatusType("idle");

    const { data: reportData, error: reportError } = await supabase
      .from("reports")
      .select(
        "id, title, report_date, created_at, student_id, sent_at, coach_observations, coach_work, coach_club, org_id, origin_share_id"
      )
      .eq("id", reportId)
      .single();

    if (reportError) {
      setStatusMessage(reportError.message);
      setStatusType("error");
      setLoadingReport(false);
      return;
    }

    if (reportData.origin_share_id) {
      setStatusMessage("Ce rapport partage est en lecture seule.");
      setStatusType("error");
      setLoadingReport(false);
      setIsSharedReadOnly(true);
      router.replace(`/app/coach/rapports/${reportId}`);
      return;
    }

    if (organization?.id && reportData.org_id && reportData.org_id !== organization.id) {
      setStatusMessage(
        "Ce rapport a ete cree dans un autre workspace. Bascule sur ce workspace pour le modifier."
      );
      setStatusType("error");
    }

    const { data: sectionsData, error: sectionsError } = await supabase
      .from("report_sections")
      .select(
        "id, title, content, content_formatted, content_format_hash, position, type, media_urls, media_captions, radar_file_id, radar_config"
      )
      .eq("report_id", reportId)
      .order("position", { ascending: true });

    if (sectionsError) {
      setStatusMessage(sectionsError.message);
      setStatusType("error");
      setLoadingReport(false);
      return;
    }

    const normalizedSections =
      sectionsData?.map((section) => {
        const type = normalizeSectionType(section.type);
        const mediaUrls = section.media_urls ?? [];
        const captions = section.media_captions ?? [];
        return {
          id: section.id,
          title: section.title,
          type,
          content: type === "text" ? (section.content ?? "") : "",
          contentFormatted: type === "text" ? (section.content_formatted ?? null) : null,
          contentFormatHash:
            type === "text" ? (section.content_format_hash ?? null) : null,
          mediaUrls,
          mediaCaptions: mediaUrls.map((url: string, index: number) =>
            (captions[index] ?? "").slice(0, CAPTION_LIMIT)
          ),
          radarFileId: section.radar_file_id ?? null,
          radarConfig:
            section.radar_config && typeof section.radar_config === "object"
              ? section.radar_config
              : null,
        } as ReportSection;
      }) ?? [];

    const nextSections =
      normalizedSections.length > 0
        ? normalizedSections
        : defaultReportSections.map(createSection);

    setEditingReportId(reportData.id);
    setEditingReportOrgId(reportData.org_id ?? null);
    setIsSharedReadOnly(false);
    setStudentId(reportData.student_id ?? "");
    setTitle(reportData.title ?? "");
    setSentAt(reportData.sent_at ?? null);
    setWorkingObservations(reportData.coach_observations ?? "");
    setWorkingNotes(reportData.coach_work ?? "");
    setWorkingClub(reportData.coach_club ?? "");
    setReportDate(
      reportData.report_date
        ? formatDateInputValue(reportData.report_date)
        : formatDateInputValue(reportData.created_at)
    );
    setReportSections(nextSections);
    setAiPreviews({});
    setAiSummary("");
    setAiError("");
    setLoadingReport(false);
  };

  const resetBuilderState = () => {
    setEditingReportId(null);
    setEditingReportOrgId(null);
    setIsSharedReadOnly(false);
    setStudentId("");
    setTitle("");
    setReportDate(formatDateInput(new Date()));
    setSentAt(null);
    setReportSections(defaultReportSections.map(createSection));
    setWorkingObservations("");
    setWorkingNotes("");
    setWorkingClub("");
    setAiPreviews({});
    setAiSummary("");
    setAiError("");
    setSectionsMessage("");
    setSectionsMessageType("idle");
    setStatusMessage("");
    setStatusType("idle");
  };

  const handleResumeLocalDraft = () => {
    const draft = peekLocalDraft();
    if (draft) {
      applyLocalDraft(draft);
    }
    setLocalDraftPrompt(null);
    setLocalDraftHandled(true);
  };

  const handleStartFreshReport = () => {
    if (typeof window !== "undefined") {
      const keyToClear = localDraftPrompt?.key ?? draftKey;
      window.localStorage.removeItem(keyToClear);
    }
    setLocalDraftPrompt(null);
    setLocalDraftHandled(true);
    resetBuilderState();
    if (requestedStudentId) {
      setStudentId(requestedStudentId);
    }
    setSelectedLayoutId("");
    setSelectedLayoutOptionId("");
    setBuilderStep("layout");
  };

  const resetWorkingContext = () => {
    setWorkingClub("");
    setWorkingObservations("");
    setWorkingNotes("");
    setAiError("");
  };

  const clearReportContent = (confirmAction = true) => {
    if (reportSections.length === 0) return;
    if (
      confirmAction &&
      !window.confirm("Vider le contenu de toutes les sections sans les retirer ?")
    ) {
      return;
    }
    setReportSections((prev) =>
      prev.map((section) => ({
        ...section,
        content: "",
        contentFormatted: null,
        contentFormatHash: null,
        mediaUrls: [],
        mediaCaptions: [],
        radarFileId: section.type === "radar" ? null : section.radarFileId,
      }))
    );
    setAiPreviews({});
    setAiSummary("");
    setAiError("");
    setSectionsMessage("");
    setSectionsMessageType("idle");
    setImageErrors({});
    setUploadingSections({});
    shouldAnimate.current = true;
  };

  const handleClearReportContent = () => {
    clearReportContent(true);
  };

  const handleOpenRadarSectionConfig = (sectionId: string) => {
    const section = reportSections.find((item) => item.id === sectionId);
    if (!section) return;
    const base =
      section.radarConfig ??
      (section.radarFileId ? radarFileMap.get(section.radarFileId)?.config : null) ??
      defaultRadarConfig;
    const merged: RadarConfig = {
      ...defaultRadarConfig,
      ...(base ?? {}),
      charts: {
        ...defaultRadarConfig.charts,
        ...(base?.charts ?? {}),
      },
      thresholds: {
        ...defaultRadarConfig.thresholds,
        ...(base?.thresholds ?? {}),
      },
      options: {
        ...defaultRadarConfig.options,
        ...(base?.options ?? {}),
      },
    };
    setRadarConfigDraft(merged);
    setRadarConfigSectionId(sectionId);
    setRadarConfigError("");
    setRadarConfigOpen(true);
  };

  const handleCloseRadarSectionConfig = () => {
    if (radarConfigSaving) return;
    setRadarConfigOpen(false);
    setRadarConfigSectionId(null);
  };

  const buildRadarAiContext = () => {
    const textSections = reportSections
      .filter((section) => section.type === "text" && section.content.trim())
      .map((section) => `${section.title}: ${section.content.trim()}`);
    const tpiBlock = tpiContext.trim() ? `Profil TPI: ${tpiContext.trim()}` : "";
    const contextBlocks = [
      ...textSections,
      tpiBlock,
      workingObservations ? `Observations: ${workingObservations}` : "",
      workingNotes ? `Notes: ${workingNotes}` : "",
      workingClub ? `Club: ${workingClub}` : "",
    ].filter(Boolean);
    return contextBlocks.join(" | ");
  };

  const loadRadarAiQuestions = async () => {
    setRadarAiQuestionsLoading(true);
    setRadarAiQaError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setRadarAiQaError("Session invalide.");
        setRadarAiQuestions(DEFAULT_RADAR_AI_QUESTIONS);
        return;
      }

      const sections = reportSections
        .filter((section) => section.type === "text" && section.content.trim())
        .map((section) => ({
          title: section.title,
          content: section.content.trim(),
        }));

      const response = await fetch("/api/radar/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode: "questions",
          context: buildRadarAiContext(),
          sections,
        }),
      });

      const raw = await response.text();
      if (!raw) {
        setRadarAiQaError("Reponse IA vide.");
        setRadarAiQuestions(DEFAULT_RADAR_AI_QUESTIONS);
        return;
      }

      let data: { questions?: RadarAiQuestion[]; error?: string };
      try {
        data = JSON.parse(raw) as {
          questions?: RadarAiQuestion[];
          error?: string;
        };
      } catch {
        setRadarAiQaError(raw.slice(0, 160));
        setRadarAiQuestions(DEFAULT_RADAR_AI_QUESTIONS);
        return;
      }

      if (!response.ok) {
        setRadarAiQaError(data.error ?? "Erreur IA.");
        setRadarAiQuestions(DEFAULT_RADAR_AI_QUESTIONS);
        return;
      }

      const questions =
        data.questions && data.questions.length
          ? data.questions
          : DEFAULT_RADAR_AI_QUESTIONS;
      setRadarAiQuestions(questions);
    } catch (error) {
      setRadarAiQaError(error instanceof Error ? error.message : "Erreur IA.");
      setRadarAiQuestions(DEFAULT_RADAR_AI_QUESTIONS);
    } finally {
      setRadarAiQuestionsLoading(false);
    }
  };

  const handleAutoDetectRadarGraphs = async (answers: Record<string, string> = {}) => {
    if (aiFullLocked) {
      openPremiumModal();
      return;
    }
    if (radarAiAutoBusy) return;
    setRadarAiAutoBusy(true);
    setRadarAiQaError("");

    const context = buildRadarAiContext();
    const enrichedAnswers = {
      ...answers,
      ...(workingClub && !answers.club ? { club: workingClub } : null),
    };
    const radarSections = reportSections.filter((section) => section.type === "radar");
    const aiSections = radarSections
      .map((section) => {
        const baseConfig =
          section.radarConfig ??
          (section.radarFileId ? radarFileMap.get(section.radarFileId)?.config : null) ??
          defaultRadarConfig;
        return { section, baseConfig };
      })
      .filter((entry) => entry.baseConfig.mode === "ai");

    if (!aiSections.length) {
      setRadarAiQaError("Aucune section datas en mode IA.");
      setRadarAiAutoBusy(false);
      return;
    }

    const missingFiles = aiSections
      .filter((entry) => !entry.section.radarFileId)
      .map((entry) => entry.section.title);
    if (missingFiles.length) {
      setRadarAiQaError(`Selectionne un fichier datas pour: ${missingFiles.join(", ")}.`);
      setRadarAiAutoBusy(false);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setRadarAiQaError("Session invalide.");
      setRadarAiAutoBusy(false);
      return;
    }

    try {
      const presets = aiSections.map(
        (entry) => entry.baseConfig.options?.aiPreset ?? "standard"
      );
      const preset =
        presets.length > 0 && presets.every((value) => value === "ultra")
          ? "ultra"
          : "standard";
      const durationMs = preset === "ultra" ? 60_000 : 240_000;
      setRadarAiAutoPreset(preset);
      setRadarAiAutoProgress(3);
      runRadarAiAutoProgress(durationMs);

      const response = await fetch("/api/radar/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode: "auto",
          context,
          answers: enrichedAnswers,
          radarSections: aiSections.map((entry) => ({
            id: entry.section.id,
            radarFileId: entry.section.radarFileId,
            preset: entry.baseConfig.options?.aiPreset ?? "standard",
            syntax: entry.baseConfig.options?.aiSyntax ?? "exp-tech-solution",
          })),
        }),
      });

      const raw = await response.text();
      if (!raw) {
        setRadarAiQaError("Reponse IA vide.");
        setRadarAiAutoBusy(false);
        return;
      }

      let data: { sections?: Array<Record<string, unknown>>; error?: string };
      try {
        data = JSON.parse(raw) as {
          sections?: Array<Record<string, unknown>>;
          error?: string;
        };
      } catch {
        setRadarAiQaError(raw.slice(0, 180));
        setRadarAiAutoBusy(false);
        return;
      }

      if (!response.ok) {
        setRadarAiQaError(data.error ?? "Erreur IA.");
        setRadarAiAutoBusy(false);
        return;
      }

      const results = (data.sections ?? []) as Array<{
        sectionId: string;
        selectionSummary?: string;
        sessionSummary?: string;
        charts?: Array<{
          key: string;
          title?: string;
          reason?: string;
          commentary?: string;
          solution?: string;
        }>;
      }>;

      const expectedSectionIds = aiSections.map((entry) => entry.section.id);
      const knownChartKeys = new Set([
        ...Object.keys(defaultRadarConfig.charts),
        ...RADAR_CHART_DEFINITIONS.map((definition) => definition.key),
      ]);
      let matchedSections = 0;
      let totalSelected = 0;
      let totalValidSelected = 0;
      const updatedSections = reportSections.map((section) => {
        if (section.type !== "radar") return section;
        const baseConfig =
          section.radarConfig ??
          (section.radarFileId ? radarFileMap.get(section.radarFileId)?.config : null) ??
          defaultRadarConfig;
        if (baseConfig.mode !== "ai") return section;

        const result = results.find((item) => item.sectionId === section.id);
        if (!result) return section;
        matchedSections += 1;

        const selectedKeys = (result.charts ?? []).map((chart) => chart.key);
        const validSelected = selectedKeys.filter((key) => knownChartKeys.has(key));
        totalSelected += selectedKeys.length;
        totalValidSelected += validSelected.length;
        const nextCharts: Record<string, boolean> = {
          ...defaultRadarConfig.charts,
        };
        Object.keys(nextCharts).forEach((key) => {
          nextCharts[key] = validSelected.includes(key);
        });

        const aiNarratives = (result.charts ?? []).reduce<
          Record<
            string,
            {
              reason?: string | null;
              commentary?: string | null;
              solution?: string | null;
            }
          >
        >((acc, chart) => {
          acc[chart.key] = {
            reason: chart.reason ?? null,
            commentary: chart.commentary ?? null,
            solution: chart.solution ?? null,
          };
          return acc;
        }, {});

        const selectionSummary = result.selectionSummary?.trim() ?? "";
        const sessionSummary = result.sessionSummary?.trim() ?? "";

        const merged: RadarConfig = {
          ...defaultRadarConfig,
          ...(baseConfig ?? {}),
          charts: {
            ...defaultRadarConfig.charts,
            ...(baseConfig?.charts ?? {}),
            ...nextCharts,
          },
          thresholds: {
            ...defaultRadarConfig.thresholds,
            ...(baseConfig?.thresholds ?? {}),
          },
          options: {
            ...defaultRadarConfig.options,
            ...(baseConfig?.options ?? {}),
            aiNarrative: "per-chart",
            aiSelectionKeys: selectedKeys,
            aiNarratives,
            aiSelectionSummary: selectionSummary || null,
            aiSessionSummary: sessionSummary || null,
          },
        };

        return {
          ...section,
          radarConfig: merged,
        };
      });

      if (matchedSections === 0) {
        const receivedIds = results.map((item) => item.sectionId).join(", ") || "aucun";
        setRadarAiQaError(
          `L IA n a rien renvoye pour les sections datas. Recu: ${receivedIds}.`
        );
        return;
      }

      if (totalValidSelected === 0) {
        const receivedIds = results.map((item) => item.sectionId).join(", ") || "aucun";
        const expectedIds = expectedSectionIds.join(", ") || "aucun";
        const detail =
          totalSelected > 0 ? "Graphes inconnus ignores." : "Aucun graphe recu.";
        setRadarAiQaError(
          `Aucun graphe valide selectionne. ${detail} Recu: ${receivedIds}. Attendu: ${expectedIds}.`
        );
        return;
      }

      setReportSections(updatedSections);
      setRadarAiQaError("");
      setRadarAiQaOpen(false);
    } catch (error) {
      setRadarAiQaError(error instanceof Error ? error.message : "Erreur IA.");
    } finally {
      stopRadarAiAutoProgress();
      setRadarAiAutoBusy(false);
      setRadarAiAutoProgress(0);
    }
  };

  const handleSaveRadarSectionConfig = () => {
    if (!radarConfigSectionId) return;
    setRadarConfigSaving(true);
    setReportSections((prev) =>
      prev.map((section) =>
        section.id === radarConfigSectionId
          ? { ...section, radarConfig: radarConfigDraft }
          : section
      )
    );
    setRadarConfigSaving(false);
    setRadarConfigOpen(false);
    setRadarConfigSectionId(null);
  };

  const handleSaveReport = async (send: boolean) => {
    if (loadingReport) {
      setStatusMessage("Attends le chargement du rapport.");
      setStatusType("error");
      return;
    }
    if (!studentId) {
      setStatusMessage("Choisis un eleve.");
      setStatusType("error");
      return;
    }
    if (!organization?.id) {
      setStatusMessage("Organisation introuvable.");
      setStatusType("error");
      return;
    }

    if (workspaceType === "org") {
      if (!isWorkspacePremium) {
        setStatusMessage("Plan requis (Pro/Entreprise) pour publier en organisation.");
        setStatusType("error");
        return;
      }
      if (!assignmentChecked) {
        setStatusMessage("Chargement des assignations en cours.");
        setStatusType("error");
        return;
      }
      if (!isAssignedCoach && !isOrgAdmin) {
        setStatusMessage(
          "Tu n es pas assigne. Propose une modification depuis la fiche eleve."
        );
        setStatusType("error");
        return;
      }
    }

    if (isSharedReadOnly) {
      setStatusMessage("Ce rapport partage est en lecture seule.");
      setStatusType("error");
      return;
    }
    if (isSourceWorkspaceLocked) {
      setStatusMessage(
        "Ce rapport a ete cree dans un autre workspace. Bascule sur ce workspace pour le modifier."
      );
      setStatusType("error");
      return;
    }

    if (!title.trim()) {
      setStatusMessage("Ajoute un titre au rapport.");
      setStatusType("error");
      return;
    }

    if (reportSections.length === 0) {
      setStatusMessage("Ajoute au moins une section.");
      setStatusType("error");
      return;
    }

    if (Object.values(uploadingSections).some(Boolean)) {
      setStatusMessage("Attends la fin des uploads de medias.");
      setStatusType("error");
      return;
    }

    const videoError = validateVideoSections(
      reportSections.map((section) => ({
        type: section.type,
        mediaUrls: section.mediaUrls,
      }))
    );
    if (videoError) {
      setStatusMessage(videoError);
      setStatusType("error");
      return;
    }

    setSaveIntent(send ? "publish" : "save");
    setSaving(true);
    setStatusMessage("");
    setStatusType("idle");
    const stopSaving = () => {
      setSaving(false);
      setSaveIntent(null);
    };

    let reportId = editingReportId;

    if (isEditing && reportId) {
      const nextSentAt = sentAt;
      const updatePayload: {
        student_id: string;
        title: string;
        report_date: string | null;
        coach_observations?: string | null;
        coach_work?: string | null;
        coach_club?: string | null;
        sent_at?: string;
      } = {
        student_id: studentId,
        title: title.trim(),
        report_date: reportDate ? reportDate : null,
        coach_observations: workingObservations.trim() || null,
        coach_work: workingNotes.trim() || null,
        coach_club: workingClub.trim() || null,
      };

      const { error: updateError } = await supabase
        .from("reports")
        .update(updatePayload)
        .eq("id", reportId);

      if (updateError) {
        setStatusMessage(updateError.message);
        setStatusType("error");
        stopSaving();
        return;
      }

      const { error: deleteError } = await supabase
        .from("report_sections")
        .delete()
        .eq("report_id", reportId);

      if (deleteError) {
        setStatusMessage(deleteError.message);
        setStatusType("error");
        stopSaving();
        return;
      }

      if (!send) {
        setSentAt(nextSentAt ?? null);
      }
    } else {
      const { data: report, error: reportError } = await supabase
        .from("reports")
        .insert([
          {
            student_id: studentId,
            title: title.trim(),
            report_date: reportDate ? reportDate : null,
            coach_observations: workingObservations.trim() || null,
            coach_work: workingNotes.trim() || null,
            coach_club: workingClub.trim() || null,
            sent_at: null,
          },
        ])
        .select("id")
        .single();

      if (reportError || !report) {
        const message =
          (reportError?.message?.includes("row-level security") ?? false)
            ? "Quota de rapports atteint (30 jours glissants)."
            : (reportError?.message ?? "Erreur de creation.");
        setStatusMessage(message);
        setStatusType("error");
        stopSaving();
        return;
      }

      reportId = report.id;
      setEditingReportId(reportId);
      setEditingReportOrgId(organization.id);
      skipResetRef.current = true;
      router.replace(`/app/coach/rapports/nouveau?reportId=${reportId}`);
      setSentAt(null);
    }

    if (!reportId) {
      setStatusMessage("Rapport introuvable.");
      setStatusType("error");
      stopSaving();
      return;
    }

    const sectionsPayload = reportSections.map((section, index) => ({
      org_id: organization.id,
      report_id: reportId,
      title: section.title,
      type: section.type,
      content: section.type === "text" ? section.content || null : null,
      content_formatted:
        section.type === "text" ? (section.contentFormatted ?? null) : null,
      content_format_hash:
        section.type === "text" ? (section.contentFormatHash ?? null) : null,
      media_urls:
        section.type === "image" || section.type === "video" ? section.mediaUrls : null,
      media_captions:
        section.type === "image" || section.type === "video"
          ? section.mediaCaptions
          : null,
      radar_file_id: section.type === "radar" ? (section.radarFileId ?? null) : null,
      radar_config: section.type === "radar" ? (section.radarConfig ?? null) : null,
      position: index,
    }));

    const { error: sectionsError } = await supabase
      .from("report_sections")
      .insert(sectionsPayload);

    if (sectionsError) {
      const message =
        sectionsError.message?.includes("row-level security") && isEditing
          ? isSourceWorkspaceLocked
            ? "Ce rapport a ete cree dans un autre workspace. Bascule sur ce workspace pour le modifier."
            : "Ce rapport ne peut pas etre modifie depuis cet espace."
          : sectionsError.message;
      setStatusMessage(message);
      setStatusType("error");
      stopSaving();
      return;
    }

    if (send || (isEditing && sentAt)) {
      setStatusMessage("Reformatage IA en cours...");
      setStatusType("idle");
      const publishResult = await publishReport(reportId);
      if (publishResult.error) {
        setStatusMessage(publishResult.error);
        setStatusType("error");
        stopSaving();
        return;
      }
      const publishedAt = publishResult.sentAt ?? new Date().toISOString();
      setSentAt(publishedAt);
    }

    setStatusMessage(
      isEditing
        ? send
          ? "Rapport mis a jour et envoye."
          : "Rapport mis a jour."
        : send
          ? "Rapport envoye avec succes."
          : "Brouillon sauvegarde."
    );
    setStatusType("success");
    stopSaving();
    if (send) {
      clearReportContent(false);
    }
    if (typeof window !== "undefined" && isNewReport) {
      window.localStorage.removeItem(draftKey);
    }
  };

  const getAiDefaults = () => ({
    tone: organization?.ai_tone ?? "bienveillant",
    techLevel: organization?.ai_tech_level ?? "intermediaire",
    style: organization?.ai_style ?? "redactionnel",
    length: organization?.ai_length ?? "normal",
    imagery: organization?.ai_imagery ?? "equilibre",
    focus: organization?.ai_focus ?? "mix",
  });

  const publishReport = async (id: string) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      return { error: "Session invalide." };
    }

    const response = await fetch("/api/reports/publish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reportId: id }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { error: payload.error ?? "Erreur de publication." };
    }

    return { sentAt: payload.sentAt as string | undefined };
  };

  const resetAiSettings = () => {
    const defaults = getAiDefaults();
    setAiTone(defaults.tone);
    setAiTechLevel(defaults.techLevel);
    setAiStyle(defaults.style);
    setAiLength(defaults.length);
    setAiImagery(defaults.imagery);
    setAiFocus(defaults.focus);
  };

  const callAi = async (payload: {
    action: "improve" | "write" | "summary" | "plan";
    sectionTitle?: string;
    sectionContent?: string;
    allSections?: { title: string; content: string }[];
    tpiContext?: string;
  }) => {
    setAiError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setAiError("Session invalide.");
        return null;
      }

      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...payload,
          tpiContext: studentId ? tpiContext || undefined : undefined,
          settings: {
            tone: aiTone,
            techLevel: aiTechLevel,
            style: aiStyle,
            length: aiLength,
            imagery: aiImagery,
            focus: aiFocus,
          },
        }),
      });

      const raw = await response.text();
      if (!raw) {
        setAiError("Reponse vide.");
        return null;
      }

      let data: { text?: string; error?: string };
      try {
        data = JSON.parse(raw) as { text?: string; error?: string };
      } catch {
        setAiError(raw.slice(0, 160));
        return null;
      }

      if (!response.ok) {
        setAiError(data.error ?? "Erreur IA.");
        return null;
      }

      return data.text ?? null;
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Erreur IA.");
      return null;
    }
  };

  const callAiPropagation = async (
    payload: PropagationPayload & {
      clarifications?: { question: string; answer: string }[];
      axesSelections?: { section: string; title: string; summary: string }[];
    }
  ) => {
    setAiError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setAiError("Session invalide.");
        return null;
      }

      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "propagate",
          sectionTitle: payload.sectionTitle,
          sectionContent: payload.sectionContent,
          allSections: payload.allSections,
          targetSections: payload.targetSections,
          propagateMode: payload.propagateMode,
          clarifications: payload.clarifications,
          axesSelections: payload.axesSelections,
          tpiContext: studentId ? tpiContext || undefined : undefined,
          settings: {
            tone: aiTone,
            techLevel: aiTechLevel,
            style: aiStyle,
            length: aiLength,
            imagery: aiImagery,
            focus: aiFocus,
          },
        }),
      });

      const raw = await response.text();
      if (!raw) {
        setAiError("Reponse vide.");
        return null;
      }

      let data: {
        suggestions?: { title: string; content: string }[];
        error?: string;
      };
      try {
        data = JSON.parse(raw) as {
          suggestions?: { title: string; content: string }[];
          error?: string;
        };
      } catch {
        setAiError(raw.slice(0, 160));
        return null;
      }

      if (!response.ok) {
        setAiError(data.error ?? "Erreur IA.");
        return null;
      }

      return data.suggestions ?? null;
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Erreur IA.");
      return null;
    }
  };

  const callAiClarify = async (payload: PropagationPayload) => {
    setAiError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setAiError("Session invalide.");
        return null;
      }

      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "clarify",
          sectionTitle: payload.sectionTitle,
          sectionContent: payload.sectionContent,
          allSections: payload.allSections,
          targetSections: payload.targetSections,
          propagateMode: payload.propagateMode,
          tpiContext: studentId ? tpiContext || undefined : undefined,
          settings: {
            tone: aiTone,
            techLevel: aiTechLevel,
            style: aiStyle,
            length: aiLength,
            imagery: aiImagery,
            focus: aiFocus,
          },
        }),
      });

      const raw = await response.text();
      if (!raw) {
        setAiError("Reponse vide.");
        return null;
      }

      let data: {
        confidence?: number;
        questions?: ClarifyQuestion[];
        error?: string;
      };
      try {
        data = JSON.parse(raw) as {
          confidence?: number;
          questions?: ClarifyQuestion[];
          error?: string;
        };
      } catch {
        setAiError(raw.slice(0, 160));
        return null;
      }

      if (!response.ok) {
        setAiError(data.error ?? "Erreur IA.");
        return null;
      }

      return {
        confidence: data.confidence ?? 0,
        questions: data.questions ?? [],
      };
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Erreur IA.");
      return null;
    }
  };

  const callAiAxes = async (
    payload: PropagationPayload,
    clarifications?: { question: string; answer: string }[]
  ) => {
    setAiError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setAiError("Session invalide.");
        return null;
      }

      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "axes",
          sectionTitle: payload.sectionTitle,
          sectionContent: payload.sectionContent,
          allSections: payload.allSections,
          targetSections: payload.targetSections,
          clarifications,
          tpiContext: studentId ? tpiContext || undefined : undefined,
          settings: {
            tone: aiTone,
            techLevel: aiTechLevel,
            style: aiStyle,
            length: aiLength,
            imagery: aiImagery,
            focus: aiFocus,
          },
        }),
      });

      const raw = await response.text();
      if (!raw) {
        setAiError("Reponse vide.");
        return null;
      }

      let data: {
        axes?: { section: string; options: { title: string; summary: string }[] }[];
        error?: string;
      };
      try {
        data = JSON.parse(raw) as {
          axes?: { section: string; options: { title: string; summary: string }[] }[];
          error?: string;
        };
      } catch {
        setAiError(raw.slice(0, 160));
        return null;
      }

      if (!response.ok) {
        setAiError(data.error ?? "Erreur IA.");
        return null;
      }

      return data.axes ?? [];
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Erreur IA.");
      return null;
    }
  };

  const handleAiImprove = async (section: ReportSection) => {
    if (!canUseAiProofread) return;
    setAiBusyId(section.id);
    const text = await callAi({
      action: "improve",
      sectionTitle: section.title,
      sectionContent: section.content,
    });
    if (text) {
      setAiPreviews((prev) => ({
        ...prev,
        [section.id]: { original: section.content, suggestion: text, mode: "improve" },
      }));
    }
    setAiBusyId(null);
  };

  const handleAiWrite = async (section: ReportSection) => {
    if (!canUseAiFull) return;
    if (!section.content.trim()) {
      const hasContext = reportSections.some(
        (item) => item.id !== section.id && item.type === "text" && item.content.trim()
      );
      if (!hasContext) {
        setAiError("Ajoute du contenu dans une autre section.");
        return;
      }
    }
    setAiBusyId(section.id);
    const text = await callAi({
      action: "write",
      sectionTitle: section.title,
      sectionContent: section.content,
      allSections: reportSections
        .filter((item) => item.type === "text")
        .map((item) => ({
          title: item.title,
          content: item.content,
        })),
    });
    if (text) {
      setAiPreviews((prev) => {
        if (!prev[section.id]) return prev;
        const next = { ...prev };
        delete next[section.id];
        return next;
      });
      setReportSections((prev) =>
        prev.map((item) =>
          item.id === section.id
            ? {
                ...item,
                content: text,
                contentFormatted: null,
                contentFormatHash: null,
              }
            : item
        )
      );
    }
    setAiBusyId(null);
  };

  const closeClarifyModal = () => {
    setClarifyOpen(false);
    setClarifyQuestions([]);
    setClarifyAnswers({});
    setClarifyCustomAnswers({});
    setClarifyConfidence(null);
    setPendingPropagation(null);
  };

  const closeAxesModal = () => {
    setAxesOpen(false);
    setAxesBySection([]);
    setAxesSelection({});
    setAxesPayloads(null);
    setAxesClarifications([]);
  };

  const openAxesModal = async (
    payloads: PropagationPayload[],
    clarifications: { question: string; answer: string }[]
  ) => {
    if (payloads.length === 0) return;
    setAiBusyId("propagate");

    const allTargets = payloads.flatMap((payload) => payload.targetSections);
    const uniqueTargets = Array.from(new Set(allTargets));

    const basePayload: PropagationPayload = {
      ...payloads[0],
      targetSections: uniqueTargets,
      propagateMode: "empty",
    };

    const axes = await callAiAxes(basePayload, clarifications);
    setAiBusyId(null);
    if (!axes || axes.length === 0) {
      setAiError("Aucun axe propose.");
      return;
    }

    const withIds: AxesForSection[] = axes.map((entry) => ({
      section: entry.section,
      options: entry.options.map((option, index) => ({
        id: `${entry.section}-${index}`,
        title: option.title,
        summary: option.summary,
      })),
    }));

    const initialSelection: Record<string, string> = {};
    withIds.forEach((entry) => {
      if (entry.options[0]) {
        initialSelection[entry.section] = entry.options[0].id;
      }
    });

    setAxesBySection(withIds);
    setAxesSelection(initialSelection);
    setAxesClarifications(clarifications);
    setAxesPayloads(payloads);
    setAxesOpen(true);
  };

  const applyPropagationSuggestions = (
    suggestions: { title: string; content: string }[]
  ) => {
    if (aiPropagationReview) {
      setAiPreviews((prev) => {
        const next = { ...prev };
        suggestions.forEach((suggestion) => {
          const target = reportSections.find(
            (item) => item.title.toLowerCase() === suggestion.title.toLowerCase()
          );
          if (!target) return;
          if (next[target.id]) return;
          const content = suggestion.content?.trim();
          if (!content) return;
          const base = target.content.trim();
          const combined = base ? `${base}\n\n${content}` : content;
          next[target.id] = {
            original: target.content,
            suggestion: combined,
            mode: "propagate",
          };
        });
        return next;
      });
      return;
    }

    const previewedIds = new Set(Object.keys(aiPreviews));
    const suggestionMap = new Map(
      suggestions.map((item) => [item.title.toLowerCase(), item.content])
    );
    setReportSections((prev) =>
      prev.map((section) => {
        if (previewedIds.has(section.id)) return section;
        const suggestion = suggestionMap.get(section.title.toLowerCase());
        const content = suggestion?.trim();
        if (!content) return section;
        const base = section.content.trim();
        const combined = base ? `${base}\n\n${content}` : content;
        return {
          ...section,
          content: combined,
          contentFormatted: null,
          contentFormatHash: null,
        };
      })
    );
  };

  const runPropagationBatch = async (
    payloads: PropagationPayload[],
    clarifications?: { question: string; answer: string }[],
    axesSelections?: { section: string; title: string; summary: string }[]
  ) => {
    if (payloads.length === 0) return;
    setAiBusyId("propagate");
    for (const payload of payloads) {
      const axesForPayload = axesSelections
        ? axesSelections.filter((item) => payload.targetSections.includes(item.section))
        : undefined;
      const suggestions = await callAiPropagation({
        ...payload,
        clarifications,
        axesSelections: axesForPayload,
      });
      if (suggestions) {
        applyPropagationSuggestions(suggestions);
      }
    }
    setAiBusyId(null);
  };

  const handleAiPropagateFromWorking = async () => {
    if (!canUseAiFull) return;
    if (!studentId) {
      setAiError("Choisis un eleve avant de lancer la propagation.");
      return;
    }
    const hasObservations = !!workingObservations.trim();
    const hasWork = !!workingNotes.trim();
    if (!hasObservations && !hasWork) {
      setAiError("Ajoute des constats ou un travail en cours.");
      return;
    }
    const eligibleSections = reportSections
      .filter((item) => !aiPreviews[item.id])
      .filter((item) => item.type === "text")
      .filter((item) => !isSummaryTitle(item.title))
      .filter((item) => !isPlanTitle(item.title));

    const emptyTargets = eligibleSections
      .filter((item) => !item.content.trim())
      .map((item) => item.title);
    const appendTargets = eligibleSections
      .filter((item) => item.content.trim())
      .map((item) => item.title);
    const targets = [...emptyTargets, ...appendTargets];

    if (targets.length === 0) {
      setAiError("Aucune section disponible.");
      return;
    }

    const sourceParts = [];
    if (workingClub.trim()) {
      sourceParts.push(`Club concerne: ${workingClub.trim()}`);
    }
    if (workingObservations.trim()) {
      sourceParts.push(`Constats:\n${workingObservations.trim()}`);
    }
    if (workingNotes.trim()) {
      sourceParts.push(`Travail en cours:\n${workingNotes.trim()}`);
    }
    const sectionContent = sourceParts.join("\n\n");

    const clarifyPayload: PropagationPayload = {
      sectionTitle: "Travail en cours",
      sectionContent,
      allSections: reportSections
        .filter((item) => item.type === "text")
        .map((item) => ({
          title: item.title,
          content: item.content,
        })),
      targetSections: targets,
      propagateMode: appendTargets.length > 0 ? "append" : "empty",
      tpiContext: tpiContext || undefined,
    };

    setAiBusyId("propagate");
    const clarification = await callAiClarify(clarifyPayload);
    setAiBusyId(null);
    if (!clarification) return;

    const missingWork = !workingNotes.trim();
    const missingObservations = !workingObservations.trim();
    const forcedQuestions: ClarifyQuestion[] = [];

    if (missingWork) {
      forcedQuestions.push({
        id: "forced-work",
        question: "Quel travail veux-tu mettre en place ? (objectif, consigne, exercice)",
        type: "text",
        choices: [],
        multi: false,
        required: true,
        placeholder: "Ex: stabiliser l'appui pied droit au backswing.",
      });
    }

    if (missingObservations) {
      forcedQuestions.push({
        id: "forced-observations",
        question: "Constats observes (si tu en as)",
        type: "text",
        choices: [],
        multi: false,
        required: false,
        placeholder: "Ex: chemin trop a gauche, perte de posture...",
      });
    }

    const questions = [...clarification.questions, ...forcedQuestions];
    const needsClarify =
      missingWork ||
      missingObservations ||
      clarification.confidence < CLARIFY_THRESHOLD ||
      clarification.questions.length > 0;

    setClarifyConfidence(clarification.confidence);
    if (!needsClarify) {
      const payloads: PropagationPayload[] = [];
      if (emptyTargets.length > 0) {
        payloads.push({
          ...clarifyPayload,
          targetSections: emptyTargets,
          propagateMode: "empty",
        });
      }
      if (appendTargets.length > 0) {
        payloads.push({
          ...clarifyPayload,
          targetSections: appendTargets,
          propagateMode: "append",
        });
      }
      await openAxesModal(payloads, []);
      return;
    }

    setClarifyQuestions(questions);
    setClarifyAnswers({});
    setClarifyCustomAnswers({});
    const pendingPayloads: PropagationPayload[] = [];
    if (emptyTargets.length > 0) {
      pendingPayloads.push({
        ...clarifyPayload,
        targetSections: emptyTargets,
        propagateMode: "empty",
      });
    }
    if (appendTargets.length > 0) {
      pendingPayloads.push({
        ...clarifyPayload,
        targetSections: appendTargets,
        propagateMode: "append",
      });
    }
    setPendingPropagation({ payloads: pendingPayloads });
    setClarifyOpen(true);
  };

  const handleAiFinalize = async () => {
    if (!canUseAiFull) return;
    const summaryTargets = reportSections.filter(
      (item) => item.type === "text" && isSummaryTitle(item.title)
    );
    const planTargets = reportSections.filter(
      (item) => item.type === "text" && isPlanTitle(item.title)
    );
    if (summaryTargets.length === 0 && planTargets.length === 0) {
      setAiError("Aucune section Resume ou Plan detectee.");
      return;
    }

    const contextSections = reportSections
      .filter((item) => item.type === "text")
      .filter((item) => !isSummaryTitle(item.title))
      .filter((item) => !isPlanTitle(item.title))
      .filter((item) => item.content.trim())
      .map((item) => ({ title: item.title, content: item.content }));
    if (workingObservations.trim()) {
      contextSections.push({
        title: "Constats",
        content: workingObservations.trim(),
      });
    }

    if (contextSections.length === 0) {
      setAiError("Ajoute du contenu avant de finaliser.");
      return;
    }

    setAiBusyId("finalize");
    const summaryMap = new Map<string, string>();
    for (const target of summaryTargets) {
      const summaryText = await callAi({
        action: "summary",
        sectionTitle: target.title,
        allSections: contextSections,
      });
      if (summaryText) {
        summaryMap.set(target.id, summaryText);
      }
    }

    const planMap = new Map<string, string>();
    for (const target of planTargets) {
      const planText = await callAi({
        action: "plan",
        sectionTitle: target.title,
        allSections: contextSections,
      });
      if (planText) {
        planMap.set(target.id, planText);
      }
    }

    setAiPreviews((prev) => {
      const next = { ...prev };
      summaryTargets.forEach((target) => {
        const text = summaryMap.get(target.id);
        if (!text) return;
        next[target.id] = {
          original: target.content,
          suggestion: text,
          mode: "finalize",
        };
      });
      planTargets.forEach((target) => {
        const text = planMap.get(target.id);
        if (!text) return;
        next[target.id] = {
          original: target.content,
          suggestion: text,
          mode: "finalize",
        };
      });
      return next;
    });

    setAiBusyId(null);
  };

  const handleAiSummary = async () => {
    if (!canUseAiFull) return;
    setAiBusyId("summary");
    const summarySections = reportSections
      .filter((item) => item.type === "text")
      .map((item) => ({
        title: item.title,
        content: item.content,
      }));
    if (workingObservations.trim()) {
      summarySections.push({
        title: "Constats",
        content: workingObservations.trim(),
      });
    }
    const text = await callAi({
      action: "summary",
      allSections: summarySections,
    });
    if (text) {
      setAiSummary(text);
    }
    setAiBusyId(null);
  };

  const isClarifyComplete = useMemo(() => {
    if (!clarifyOpen) return false;
    return clarifyQuestions.every((question) => {
      if (question.required === false) return true;
      const value = clarifyAnswers[question.id];
      const customValue = clarifyCustomAnswers[question.id]?.trim();
      if (question.type === "choices") {
        if (Array.isArray(value)) {
          return value.length > 0 || !!customValue;
        }
        return Boolean(value) || !!customValue;
      }
      return typeof value === "string" && value.trim().length > 0;
    });
  }, [clarifyOpen, clarifyQuestions, clarifyAnswers, clarifyCustomAnswers]);

  const handleConfirmClarify = async () => {
    if (!pendingPropagation) return;
    const answers = clarifyQuestions
      .map((question) => {
        const value = clarifyAnswers[question.id];
        const customValue = clarifyCustomAnswers[question.id]?.trim();
        if (!value || (Array.isArray(value) && value.length === 0)) {
          if (!customValue) return null;
        }
        if (question.type === "choices") {
          const selected = Array.isArray(value) ? value : value ? [String(value)] : [];
          const combined = customValue ? [...selected, customValue] : selected;
          if (combined.length === 0) return null;
          return { question: question.question, answer: combined.join(", ") };
        }
        const text = Array.isArray(value)
          ? value.join(", ")
          : (value ?? customValue ?? "");
        return { question: question.question, answer: text };
      })
      .filter((item): item is { question: string; answer: string } => item !== null);

    const { payloads } = pendingPropagation;
    closeClarifyModal();
    await openAxesModal(payloads, answers);
  };

  const handleConfirmAxes = async () => {
    if (!axesPayloads || axesPayloads.length === 0) return;
    const selections = axesBySection
      .map((entry) => {
        const selectedId = axesSelection[entry.section];
        const option =
          entry.options.find((item) => item.id === selectedId) ?? entry.options[0];
        if (!option) return null;
        return {
          section: entry.section,
          title: option.title,
          summary: option.summary,
        };
      })
      .filter(
        (item): item is { section: string; title: string; summary: string } =>
          item !== null
      );

    closeAxesModal();
    await runPropagationBatch(axesPayloads, axesClarifications, selections);
  };

  const handleAiApply = (id: string) => {
    const preview = aiPreviews[id];
    if (!preview) return;
    setReportSections((prev) =>
      prev.map((item) =>
        item.id === id && item.content.trim() === preview.original.trim()
          ? {
              ...item,
              content: preview.suggestion,
              contentFormatted: null,
              contentFormatHash: null,
            }
          : item
      )
    );
    setAiPreviews((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleAiReject = (id: string) => {
    setAiPreviews((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  useLayoutEffect(() => {
    const nextPositions = new Map<string, DOMRect>();
    reportSections.forEach((section) => {
      const element = itemRefs.current.get(section.id);
      if (element) {
        nextPositions.set(section.id, element.getBoundingClientRect());
      }
    });

    if (shouldAnimate.current && positions.current.size > 0) {
      reportSections.forEach((section) => {
        const element = itemRefs.current.get(section.id);
        const prev = positions.current.get(section.id);
        const next = nextPositions.get(section.id);
        if (!element || !prev || !next) return;

        const deltaX = prev.left - next.left;
        const deltaY = prev.top - next.top;

        if (deltaX || deltaY) {
          element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
          element.style.transition = "transform 0s";
          requestAnimationFrame(() => {
            element.style.transition = "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)";
            element.style.transform = "";
          });
        }
      });
    }

    positions.current = nextPositions;
    shouldAnimate.current = false;
  }, [reportSections]);

  useLayoutEffect(() => {
    loadStudents();
  }, []);

  useEffect(() => {
    if (!studentId) {
      setRadarFiles([]);
      return;
    }
    loadRadarFiles(studentId);
  }, [studentId, loadRadarFiles]);

  useEffect(() => {
    if (workspaceType !== "org" || !studentId) {
      setIsAssignedCoach(false);
      setAssignmentChecked(false);
      return;
    }

    const loadAssignment = async () => {
      if (!profile?.id) {
        setIsAssignedCoach(false);
        setAssignmentChecked(true);
        return;
      }
      const { data, error } = await supabase
        .from("student_assignments")
        .select("coach_id")
        .eq("student_id", studentId)
        .eq("coach_id", profile.id)
        .limit(1);

      if (error) {
        setIsAssignedCoach(false);
        setAssignmentChecked(true);
        return;
      }

      setIsAssignedCoach((data ?? []).length > 0);
      setAssignmentChecked(true);
    };

    loadAssignment();
  }, [workspaceType, studentId, profile?.id]);

  useEffect(() => {
    setRadarSessionFileIds([]);
  }, [studentId, editingReportId]);

  useEffect(() => {
    return () => {
      stopRadarUploadProgress();
    };
  }, []);

  useEffect(() => {
    setLocalDraftPrompt(null);
    setLocalDraftHandled(false);
  }, [requestedStudentId]);

  useEffect(() => {
    if (!isNewReport || loadingReport) return;
    if (typeof window === "undefined") return;
    if (localDraftHandled) return;
    const draft = peekLocalDraft();
    if (!draft) return;

    // For a student-scoped entrypoint, do not auto-restore.
    // Show a clear choice: resume existing draft or start fresh.
    if (!localDraftPrompt) {
      setLocalDraftPrompt({ key: draftKey, savedAt: draft.savedAt ?? null });
    }
  }, [
    draftKey,
    isNewReport,
    loadingReport,
    localDraftHandled,
    localDraftPrompt,
    peekLocalDraft,
  ]);

  useEffect(() => {
    if (!isNewReport || loadingReport) return;
    if (typeof window === "undefined") return;
    if (draftTimer.current) {
      window.clearTimeout(draftTimer.current);
    }
    draftTimer.current = window.setTimeout(() => {
      persistLocalDraft();
    }, 800);
    return () => {
      if (draftTimer.current) {
        window.clearTimeout(draftTimer.current);
      }
    };
  }, [isNewReport, loadingReport, persistLocalDraft]);

  useEffect(() => {
    if (!isNewReport || loadingReport) return;
    if (typeof window === "undefined") return;

    const handleVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      persistLocalDraft();
    };

    const handlePageHide = () => {
      persistLocalDraft();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [isNewReport, loadingReport, persistLocalDraft]);

  useEffect(() => {
    const reportId = searchParams.get("reportId");
    if (!reportId || reportId === editingReportId) return;
    loadReportForEdit(reportId);
  }, [searchParams, editingReportId]);

  useEffect(() => {
    const reportId = searchParams.get("reportId");
    if (reportId || !editingReportId) return;
    if (skipResetRef.current) {
      skipResetRef.current = false;
      return;
    }
    resetBuilderState();
  }, [searchParams, editingReportId]);

  useLayoutEffect(() => {
    reportSections.forEach((section) => {
      resizeTextareaById(section.id);
    });
  }, [reportSections]);

  // Note: workingNotes/workingObservations are auto-sized on input to avoid iOS scroll jumps.

  useEffect(() => {
    if (!activeTooltip) return;
    const handlePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      const node = tooltipRefs.current.get(activeTooltip);
      if (node && node.contains(target)) return;
      setActiveTooltip(null);
    };
    document.addEventListener("pointerdown", handlePointer);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
    };
  }, [activeTooltip]);

  useEffect(() => {
    if (!organization) return;
    setAiTone(organization.ai_tone ?? "bienveillant");
    setAiTechLevel(organization.ai_tech_level ?? "intermediaire");
    setAiStyle(organization.ai_style ?? "redactionnel");
    setAiLength(organization.ai_length ?? "normal");
    setAiImagery(organization.ai_imagery ?? "equilibre");
    setAiFocus(organization.ai_focus ?? "mix");
  }, [
    organization?.ai_tone,
    organization?.ai_tech_level,
    organization?.ai_style,
    organization?.ai_length,
    organization?.ai_imagery,
    organization?.ai_focus,
    organization,
  ]);

  useEffect(() => {
    if (!organization?.id) return;
    loadSectionTemplates();
    loadLayouts();
  }, [organization?.id, loadSectionTemplates, loadLayouts]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(min-width: 1024px) and (hover: hover)");
    const updateDragEnabled = () => setDragEnabled(media.matches);
    updateDragEnabled();
    media.addEventListener("change", updateDragEnabled);
    return () => {
      media.removeEventListener("change", updateDragEnabled);
    };
  }, []);

  useLayoutEffect(() => {
    if (!requestedStudentId || studentId) return;
    const match = students.find((student) => student.id === requestedStudentId);
    if (match) {
      setStudentId(match.id);
    }
  }, [requestedStudentId, students, studentId]);

  useEffect(() => {
    if (!studentId) {
      setTpiContext("");
      return;
    }
    let cancelled = false;
    Promise.resolve().then(async () => {
      const reportId = await resolveLatestTpiReportId(studentId);
      if (cancelled) return;
      loadTpiContext(reportId);
    });
    return () => {
      cancelled = true;
    };
  }, [studentId, resolveLatestTpiReportId]);

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === studentId) ?? null,
    [students, studentId]
  );
  const hasReportId = Boolean(searchParams.get("reportId"));
  const activeBuilderStep = hasReportId || isEditing ? "report" : builderStep;
  const studentPickerCandidates = useMemo(() => {
    const query = studentPickerQuery.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) => {
      const label = [
        student.first_name,
        student.last_name ?? "",
        student.email ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return label.includes(query);
    });
  }, [studentPickerQuery, students]);

  const shouldForceStudentPick =
    isNewReport &&
    !hasReportId &&
    builderStep === "report" &&
    !requestedStudentId &&
    !studentId;

  useEffect(() => {
    if (!studentsLoaded) return;
    if (!shouldForceStudentPick) return;
    setStudentPickerQuery("");
    setStudentPickerOpen(true);
  }, [shouldForceStudentPick, studentsLoaded]);

  useEffect(() => {
    if (!studentPickerOpen) return;
    if (studentId) setStudentPickerOpen(false);
  }, [studentId, studentPickerOpen]);
  const hasSaveInProgress = saving;
  const hasAiRequestInProgress = Boolean(aiBusyId) || radarAiAutoBusy;
  const hasMediaUploadInProgress =
    radarUploading || Object.values(uploadingSections).some(Boolean);
  const hasGlobalProcessingOverlay =
    hasSaveInProgress || hasAiRequestInProgress || hasMediaUploadInProgress;
  const globalProcessingLabel = hasSaveInProgress
    ? saveIntent === "publish"
      ? "Publication du rapport en cours"
      : isDraft
        ? "Enregistrement du brouillon en cours"
        : "Enregistrement du rapport en cours"
    : hasAiRequestInProgress
      ? hasMediaUploadInProgress
        ? "Traitement IA et upload en cours"
        : "Traitement IA en cours"
      : "Upload en cours";
  const hasBlockingModalOpen =
    layoutEditorOpen ||
    aiLayoutOpen ||
    radarConfigOpen ||
    radarAiQaOpen ||
    premiumModalOpen ||
    aiAssistantModalOpen ||
    aiSettingsModalOpen ||
    sectionLibraryOpen ||
    sectionCreateModalOpen ||
    studentPickerOpen ||
    radarImportOpen ||
    clarifyOpen ||
    axesOpen ||
    radarReview !== null;
  const shouldLockBackgroundScroll = hasBlockingModalOpen || hasGlobalProcessingOverlay;
  useEffect(() => {
    if (!shouldLockBackgroundScroll) return;
    const { body, documentElement } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;

    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, [shouldLockBackgroundScroll]);
  const showLayoutTools = false;
  const isReportStep = activeBuilderStep === "report";
  const showSectionsPanel = !isReportStep;
  const reportGridClass = isReportStep ? "lg:grid-cols-1" : "lg:grid-cols-[0.9fr_1.1fr]";
  const stickyActionShapeClass = stickyActionsExpanded
    ? "w-[9.75rem] justify-start px-3 lg:w-[10.75rem] lg:px-3.5"
    : "w-11 justify-center px-0 lg:w-12";
  const stickyActionLabelClass = stickyActionsExpanded
    ? "ml-2 max-w-[6.5rem] translate-x-0 opacity-100"
    : "ml-0 max-w-0 -translate-x-1 opacity-0";
  const stickyActionCount = 6;
  const getStickyActionDelay = (index: number) => {
    const stepMs = 45;
    const orderIndex = stickyActionsExpanded ? index : index;
    return `${orderIndex * stepMs}ms`;
  };
  const getStickyLabelDelay = (index: number) => {
    const stepMs = 45;
    const orderIndex = stickyActionsExpanded ? index : index;
    const revealOffsetMs = stickyActionsExpanded ? 80 : 0;
    return `${orderIndex * stepMs + revealOffsetMs}ms`;
  };

  return (
    <RoleGuard allowedRoles={["owner", "coach", "staff"]}>
      <>
        <style jsx>{`
          .tpi-dots {
            display: inline-flex;
            gap: 0.12em;
            margin-left: 0.15em;
            vertical-align: middle;
          }
          .tpi-dots span {
            width: 0.28em;
            height: 0.28em;
            border-radius: 999px;
            background: currentColor;
            opacity: 0.25;
            animation: tpiDotPulse 1.2s infinite ease-in-out;
          }
          .tpi-dots span:nth-child(2) {
            animation-delay: 0.2s;
          }
          .tpi-dots span:nth-child(3) {
            animation-delay: 0.4s;
          }
          .global-loader-dots {
            display: inline-flex;
            gap: 0.16em;
            margin-left: 0.3em;
            vertical-align: middle;
          }
          .global-loader-dots span {
            width: 0.36em;
            height: 0.36em;
            border-radius: 999px;
            background: currentColor;
            opacity: 0.3;
            animation: tpiDotPulse 1s infinite ease-in-out;
          }
          .global-loader-dots span:nth-child(2) {
            animation-delay: 0.18s;
          }
          .global-loader-dots span:nth-child(3) {
            animation-delay: 0.36s;
          }
          .global-loader-spinner {
            position: relative;
            width: 4.5rem;
            height: 4.5rem;
          }
          .global-loader-ring-base {
            position: absolute;
            inset: 0;
            border: 3px solid var(--border);
            border-radius: 9999px;
            opacity: 0.7;
          }
          .global-loader-ring-outer {
            position: absolute;
            inset: 0;
            border: 4px solid transparent;
            border-top-color: var(--accent);
            border-right-color: var(--accent-2);
            border-radius: 9999px;
            animation: globalLoaderSpin 0.82s linear infinite;
            filter: drop-shadow(0 0 10px rgba(0, 0, 0, 0.18));
          }
          .global-loader-ring-inner {
            position: absolute;
            inset: 0.62rem;
            border: 3px solid transparent;
            border-bottom-color: var(--accent-2);
            border-left-color: var(--accent);
            border-radius: 9999px;
            animation: globalLoaderSpinReverse 1.12s linear infinite;
          }
          .global-loader-core {
            position: absolute;
            left: 50%;
            top: 50%;
            width: 0.66rem;
            height: 0.66rem;
            transform: translate(-50%, -50%);
            border-radius: 9999px;
            background: var(--text);
            box-shadow:
              0 0 0 4px rgba(148, 163, 184, 0.24),
              0 0 14px rgba(56, 189, 248, 0.35);
          }
          @keyframes globalLoaderSpin {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }
          @keyframes globalLoaderSpinReverse {
            from {
              transform: rotate(360deg);
            }
            to {
              transform: rotate(0deg);
            }
          }
          @keyframes tpiDotPulse {
            0%,
            100% {
              opacity: 0.25;
              transform: translateY(0);
            }
            50% {
              opacity: 0.9;
              transform: translateY(-1px);
            }
          }
        `}</style>
        <div className="space-y-6">
          <PageHeader
            overline={
              <div className="flex items-center gap-2">
                <PageBack />
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                  Rapport
                </p>
              </div>
            }
            title={isEditing ? "Modifier le rapport" : "Nouveau rapport"}
            subtitle={
              isEditing
                ? "Mets a jour les sections et le contenu du rapport."
                : activeBuilderStep === "layout"
                  ? "Choisis un layout de depart pour structurer le rapport."
                  : activeBuilderStep === "sections"
                    ? "Selectionne et organise les sections avant la redaction."
                    : "Remplis le contenu et ajuste les sections au fil du rapport."
            }
            actions={
              <>
                {!isEditing && activeBuilderStep !== "report" ? (
                  <button
                    type="button"
                    onClick={handleSkipSetup}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                  >
                    Passer
                  </button>
                ) : null}
                {activeBuilderStep === "report" ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!studentId) return;
                      router.push(`/app/coach/eleves/${studentId}`);
                    }}
                    disabled={!studentId}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition ${
                      studentId
                        ? "border-white/10 bg-white/5 text-[var(--muted)] hover:text-[var(--text)]"
                        : "cursor-not-allowed border-white/5 bg-white/5 text-[var(--muted)] opacity-60"
                    }`}
                    aria-label="Dashboard eleve"
                    title="Dashboard eleve"
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
                      <rect x="3" y="3" width="7" height="7" rx="1.5" />
                      <rect x="14" y="3" width="7" height="4" rx="1.5" />
                      <rect x="14" y="10" width="7" height="11" rx="1.5" />
                      <rect x="3" y="13" width="7" height="8" rx="1.5" />
                    </svg>
                  </button>
                ) : null}
                {activeBuilderStep === "report" ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!editingReportId || !sentAt) return;
                      router.push(`/app/coach/rapports/${editingReportId}`);
                    }}
                    disabled={!editingReportId || !sentAt}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition ${
                      editingReportId && sentAt
                        ? "border-white/10 bg-white/5 text-[var(--muted)] hover:text-[var(--text)]"
                        : "cursor-not-allowed border-white/5 bg-white/5 text-[var(--muted)] opacity-60"
                    }`}
                    aria-label="Visualiser le rapport fini"
                    title={
                      editingReportId && sentAt
                        ? "Visualiser le rapport fini"
                        : "Publie d'abord le rapport pour le visualiser"
                    }
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
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                ) : null}
              </>
            }
            meta={
              <>
                {localDraftPrompt && !isEditing ? (
                  <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-[var(--shadow-soft)]">
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 bg-gradient-to-r from-amber-400/10 via-transparent to-sky-400/10"
                    />
                    <p className="relative text-sm font-semibold text-[var(--text)]">
                      Un brouillon existe deja pour cet eleve.
                    </p>
                    <p className="relative mt-1 text-xs text-[var(--muted)]">
                      {localDraftPrompt.savedAt
                        ? `Derniere sauvegarde : ${new Date(localDraftPrompt.savedAt).toLocaleString()}`
                        : "Derniere sauvegarde locale detectee."}
                    </p>
                    <div className="relative mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleResumeLocalDraft}
                        className="rounded-full bg-gradient-to-r from-amber-200 via-amber-100 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90"
                      >
                        Reprendre
                      </button>
                      <button
                        type="button"
                        onClick={handleStartFreshReport}
                        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                      >
                        Nouveau
                      </button>
                    </div>
                  </div>
                ) : null}
                <Badge as="div" className={`mt-3 ${modeBadgeTone}`}>
                  <span className="min-w-0 break-words">Vous travaillez dans {modeLabel}</span>
                </Badge>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-[0.6rem] uppercase tracking-[0.25em] text-[var(--muted)]">
                  {[
                    { id: "layout", label: "Layout" },
                    { id: "sections", label: "Sections" },
                    { id: "report", label: "Rapport" },
                  ].map((step, index) => (
                    <span
                      key={step.id}
                      className={`rounded-full border px-3 py-1 ${
                        activeBuilderStep === step.id
                          ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-100"
                          : "border-white/10 bg-white/5"
                      }`}
                    >
                      {index + 1}. {step.label}
                    </span>
                  ))}
                </div>
                {loadingReport ? (
                  <p className="mt-3 text-sm text-[var(--muted)]">
                    Chargement du rapport...
                  </p>
                ) : null}
              </>
            }
          />

          {activeBuilderStep === "layout" ? (
            <section className="panel-soft rounded-2xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--text)]">
                    Choisir un layout
                  </h3>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Selectionne une base, tu pourras ajuster les sections ensuite.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={startCreateLayout}
                    className="rounded-full bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                  >
                    Creer un layout
                  </button>
                  <button
                    type="button"
                    onClick={handleAiLayoutClick}
                    aria-disabled={aiFullLocked}
                    className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition ${
                      aiFullLocked
                        ? "border-amber-300/30 bg-amber-400/10 text-amber-200"
                        : "border-emerald-300/30 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/20"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {aiFullLocked ? (
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
                      ) : null}
                      Layout IA
                    </span>
                  </button>
                </div>
              </div>
              <div className="mt-5 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="grid gap-3 sm:grid-cols-2">
                  {layoutOptions.map((option) => {
                    const selected = selectedLayoutOption?.id === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => handleSelectLayoutOption(option)}
                        className={`rounded-2xl p-4 text-left transition ${
                          selected
                            ? "border-emerald-300/40 bg-emerald-400/10"
                            : "border-white/10 bg-white/5 hover:border-white/20"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-[var(--text)]">
                              {option.title}
                            </p>
                            <p className="mt-1 text-xs text-[var(--muted)]">
                              {option.hint}
                            </p>
                          </div>
                          <span
                            className={`rounded-full border px-2 py-1 text-[0.55rem] uppercase tracking-wide ${
                              option.source === "ai"
                                ? featureTones.ai.badge
                                : "border-white/10 bg-white/5 text-[var(--muted)]"
                            }`}
                          >
                            {option.source === "saved"
                              ? "Sauvegarde"
                              : option.source === "ai"
                                ? "IA"
                                : "Suggestion"}
                          </span>
                        </div>
                        {option.templates.length === 0 ? (
                          <p className="mt-3 text-xs text-[var(--muted)]">
                            Aucune section pour l instant.
                          </p>
                        ) : (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {option.templates
                              .slice(0, 4)
                              .map((template) => renderTemplateChip(template, option.id))}
                            {option.templates.length > 4 ? (
                              <span className="text-[0.55rem] uppercase tracking-wide text-[var(--muted)]">
                                +{option.templates.length - 4} autres
                              </span>
                            ) : null}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="panel rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                    Apercu du layout
                  </p>
                  {selectedLayoutOption ? (
                    <>
                      <p className="mt-2 text-sm font-semibold text-[var(--text)]">
                        {selectedLayoutOption.title}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {selectedLayoutOption.hint}
                      </p>
                      <div className="mt-4 space-y-2">
                        {selectedLayoutOption.templates.length === 0 ? (
                          <p className="text-xs text-[var(--muted)]">
                            Ajoute des sections a l etape suivante.
                          </p>
                        ) : (
                          selectedLayoutOption.templates.map((template) => {
                            const featureKey = getSectionFeatureKey(template);
                            return (
                              <div
                                key={`preview-${template.id ?? template.title}`}
                                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)]"
                              >
                                <span>{template.title}</span>
                                {featureKey ? (
                                  renderFeatureBadge(featureKey)
                                ) : (
                                  <span className="text-[0.55rem] uppercase tracking-wide text-[var(--muted)]">
                                    Texte
                                  </span>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                      {selectedLayout && selectedLayoutOption.source === "saved" ? (
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => startEditLayout(selectedLayout)}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                          >
                            Modifier le layout
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void handleDeleteLayout(selectedLayout);
                            }}
                            className="rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-red-200 transition hover:bg-red-500/20"
                          >
                            Supprimer le layout
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="mt-3 text-xs text-[var(--muted)]">
                      Selectionne un layout pour voir le detail.
                    </p>
                  )}
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleContinueFromLayout}
                      disabled={!selectedLayoutOption}
                      className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
                    >
                      Continuer
                    </button>
                    <button
                      type="button"
                      onClick={handleSkipSetup}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                    >
                      Passer au rapport
                    </button>
                  </div>
                  {layoutMessage ? (
                    <p
                      className={`mt-3 text-xs ${
                        layoutMessageType === "error"
                          ? "text-red-400"
                          : "text-[var(--muted)]"
                      }`}
                    >
                      {layoutMessage}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          {activeBuilderStep === "report" ? (
            <section className="panel-soft rounded-2xl p-5">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Eleve
                  </label>
                  <select
                    value={studentId}
                    onChange={(event) => setStudentId(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                  >
                    <option value="">Choisir un eleve</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.first_name} {student.last_name ?? ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Titre du rapport
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Bilan swing du 20/01"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Date
                  </label>
                  <input
                    type="date"
                    value={reportDate}
                    onChange={(event) => setReportDate(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                  />
                </div>
              </div>
            </section>
          ) : null}

          {activeBuilderStep !== "layout" ? (
            <section className={`grid gap-6 ${reportGridClass}`}>
              {showSectionsPanel ? (
                <div className="panel relative rounded-2xl p-6">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold text-[var(--text)]">
                      Sections disponibles
                    </h3>
                    <span
                      ref={(node) => {
                        if (node) {
                          tooltipRefs.current.set("sections", node);
                        } else {
                          tooltipRefs.current.delete("sections");
                        }
                      }}
                      className="group relative shrink-0"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setActiveTooltip((prev) =>
                            prev === "sections" ? null : "sections"
                          )
                        }
                        className="flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[0.7rem] text-[var(--muted)] transition hover:text-[var(--text)]"
                        aria-label="Aide sur les sections disponibles"
                        aria-expanded={activeTooltip === "sections"}
                      >
                        ?
                      </button>
                      <span
                        className={`absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text)] shadow-xl transition ${
                          activeTooltip === "sections"
                            ? "pointer-events-auto opacity-100"
                            : "pointer-events-none opacity-0"
                        } group-hover:opacity-100 group-focus-within:opacity-100`}
                      >
                        <span className="block text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                          Ce que c est
                        </span>
                        <span className="mt-1 block">
                          Bibliotheque de blocs reutilisables par coach.
                        </span>
                        <span className="mt-2 block text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                          Pourquoi
                        </span>
                        <span className="mt-1 block">
                          Chaque section structure le rapport et guide l IA.
                        </span>
                        <span className="mt-2 block text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                          Impact
                        </span>
                        <span className="mt-1 block">
                          Plus tu enrichis la liste, plus tes rapports sont sur mesure et
                          rapides a produire.
                        </span>
                      </span>
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    Clique pour ajouter une section au rapport ou cree la tienne.
                  </p>
                  {showLayoutTools ? (
                    <>
                      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            <div>
                              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                                Layouts
                              </p>
                              <p className="mt-1 text-xs text-[var(--muted)]">
                                Applique un ensemble de sections en 1 clic.
                              </p>
                            </div>
                            <span
                              ref={(node) => {
                                if (node) {
                                  tooltipRefs.current.set("layouts", node);
                                } else {
                                  tooltipRefs.current.delete("layouts");
                                }
                              }}
                              className="group relative mt-0.5 shrink-0"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setActiveTooltip((prev) =>
                                    prev === "layouts" ? null : "layouts"
                                  )
                                }
                                className="flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[0.7rem] text-[var(--muted)] transition hover:text-[var(--text)]"
                                aria-label="Aide sur les layouts"
                                aria-expanded={activeTooltip === "layouts"}
                              >
                                ?
                              </button>
                              <span
                                className={`absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text)] shadow-xl transition ${
                                  activeTooltip === "layouts"
                                    ? "pointer-events-auto opacity-100"
                                    : "pointer-events-none opacity-0"
                                } group-hover:opacity-100 group-focus-within:opacity-100`}
                              >
                                <span className="block text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                                  Ce que c est
                                </span>
                                <span className="mt-1 block">
                                  Pack de sections preconfigure (ex: seance practice,
                                  parcours).
                                </span>
                                <span className="mt-2 block text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                                  Usage
                                </span>
                                <span className="mt-1 block">
                                  Un clic pour charger la structure, puis tu ajustes au
                                  cas par cas.
                                </span>
                                <span className="mt-2 block text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                                  Impact
                                </span>
                                <span className="mt-1 block">
                                  Rapports coherents et ultra-personnalises sans repartir
                                  de zero.
                                </span>
                              </span>
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={startCreateLayout}
                            className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
                          >
                            Creer un layout
                          </button>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                          <select
                            value={selectedLayoutId}
                            onChange={(event) => setSelectedLayoutId(event.target.value)}
                            className="w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                          >
                            <option value="">Selectionner un layout</option>
                            {layouts.map((layout) => (
                              <option key={layout.id} value={layout.id}>
                                {layout.title}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={handleApplyLayout}
                            className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
                          >
                            Appliquer
                          </button>
                        </div>
                        {selectedLayoutTemplates.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selectedLayoutTemplates.map((template) =>
                              renderTemplateChip(template, "layout-preview")
                            )}
                          </div>
                        ) : selectedLayoutId ? (
                          <p className="mt-3 text-xs text-[var(--muted)]">
                            Aucune section dans ce layout.
                          </p>
                        ) : null}
                        {selectedLayout ? (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => startEditLayout(selectedLayout)}
                              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteLayout(selectedLayout)}
                              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-red-300 transition hover:text-red-200"
                            >
                              Supprimer
                            </button>
                          </div>
                        ) : null}
                        {layoutMessage ? (
                          <p
                            className={`mt-3 text-xs ${
                              layoutMessageType === "error"
                                ? "text-red-400"
                                : "text-[var(--muted)]"
                            }`}
                          >
                            {layoutMessage}
                          </p>
                        ) : null}
                      </div>
                      {layoutEditorOpen ? (
                        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                              {layoutEditingId ? "Modifier un layout" : "Nouveau layout"}
                            </p>
                            <button
                              type="button"
                              onClick={resetLayoutEditor}
                              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                            >
                              Fermer
                            </button>
                          </div>
                          <div className="mt-3">
                            <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                              Titre du layout
                            </label>
                            <input
                              type="text"
                              value={layoutTitle}
                              onChange={(event) => setLayoutTitle(event.target.value)}
                              placeholder="Seance practice - jeu de fers"
                              className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                            />
                          </div>
                          <div className="mt-4 space-y-3">
                            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                              Sections du layout
                            </p>
                            {layoutTemplateIds.length === 0 ? (
                              <p className="text-xs text-[var(--muted)]">
                                Aucune section ajoutee pour l instant.
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {layoutTemplateIds.map((templateId, index) => {
                                  const template = templateById.get(templateId);
                                  const label = template?.title ?? "Section inconnue";
                                  const featureKey = template
                                    ? getSectionFeatureKey(template)
                                    : null;
                                  const tone = featureKey
                                    ? featureTones[featureKey]
                                    : null;
                                  return (
                                    <div
                                      key={`layout-item-${templateId}`}
                                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)]"
                                    >
                                      <span className="inline-flex items-center gap-2">
                                        {tone ? (
                                          <span
                                            className={`h-2 w-2 rounded-full ${tone.dot}`}
                                          />
                                        ) : null}
                                        {label}
                                      </span>
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleMoveLayoutTemplate(index, "up")
                                          }
                                          disabled={index === 0}
                                          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-40"
                                          aria-label="Monter"
                                          title="Monter"
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
                                            <path d="M12 19V5" />
                                            <path d="M5 12l7-7 7 7" />
                                          </svg>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleMoveLayoutTemplate(index, "down")
                                          }
                                          disabled={
                                            index === layoutTemplateIds.length - 1
                                          }
                                          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-40"
                                          aria-label="Descendre"
                                          title="Descendre"
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
                                            <path d="M12 5v14" />
                                            <path d="M5 12l7 7 7-7" />
                                          </svg>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleRemoveTemplateFromLayout(templateId)
                                          }
                                          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[var(--muted)] transition hover:text-red-200"
                                          aria-label="Retirer"
                                          title="Retirer"
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
                                            <path d="M18 6L6 18" />
                                            <path d="M6 6l12 12" />
                                          </svg>
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <div className="mt-4">
                            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                              Ajouter une section existante
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {layoutAvailableTemplates.length === 0 ? (
                                <span className="text-xs text-[var(--muted)]">
                                  Toutes les sections sont deja dans ce layout.
                                </span>
                              ) : (
                                layoutAvailableTemplates.map((template) => {
                                  const featureKey = getSectionFeatureKey(template);
                                  const tone = featureKey
                                    ? featureTones[featureKey]
                                    : null;
                                  const isLocked = isFeatureLocked(featureKey);
                                  return (
                                    <button
                                      key={`layout-add-${template.id}`}
                                      type="button"
                                      onClick={() =>
                                        handleAddTemplateToLayout(template.id as string)
                                      }
                                      title={
                                        isLocked ? "Option requise" : "Ajouter au layout"
                                      }
                                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition hover:bg-white/20 ${
                                        tone
                                          ? tone.button
                                          : "border-white/10 bg-white/10 text-[var(--text)]"
                                      } ${isLocked ? "cursor-not-allowed opacity-60" : ""}`}
                                      aria-disabled={isLocked}
                                    >
                                      {tone ? (
                                        <span
                                          className={`h-1.5 w-1.5 rounded-full ${tone.dot}`}
                                        />
                                      ) : null}
                                      {template.title}
                                      {isLocked ? (
                                        <svg
                                          viewBox="0 0 24 24"
                                          className="h-3.5 w-3.5 text-[var(--muted)]"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          aria-hidden="true"
                                        >
                                          <rect
                                            x="5"
                                            y="11"
                                            width="14"
                                            height="9"
                                            rx="2"
                                          />
                                          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                                        </svg>
                                      ) : null}
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </div>
                          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
                            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                              Nouvelle section
                            </p>
                            <p className="mt-1 text-xs text-[var(--muted)]">
                              Un titre clair guide la generation IA.
                            </p>
                            <label className="mt-3 block text-xs uppercase tracking-wide text-[var(--muted)]">
                              Nom de la section
                            </label>
                            <input
                              type="text"
                              value={layoutCustomTitle}
                              onChange={(event) =>
                                setLayoutCustomTitle(event.target.value)
                              }
                              placeholder="Ex: Plan 3 mois"
                              className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                            />
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
                                Type
                              </span>
                              <button
                                type="button"
                                onClick={() => setLayoutCustomType("text")}
                                className={`rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide transition ${
                                  layoutCustomType === "text"
                                    ? "border-emerald-300/40 bg-emerald-400/15 text-emerald-100"
                                    : "border-white/10 bg-white/5 text-[var(--muted)]"
                                }`}
                                aria-pressed={layoutCustomType === "text"}
                              >
                                Texte
                              </button>
                              <button
                                type="button"
                                onClick={() => setLayoutCustomType("image")}
                                className={`rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide transition ${
                                  layoutCustomType === "image"
                                    ? "border-sky-300/40 bg-sky-400/20 text-sky-100"
                                    : "border-white/10 bg-white/5 text-[var(--muted)]"
                                }`}
                                aria-pressed={layoutCustomType === "image"}
                              >
                                Image
                              </button>
                              <button
                                type="button"
                                onClick={() => setLayoutCustomType("video")}
                                className={`rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide transition ${
                                  layoutCustomType === "video"
                                    ? "border-pink-300 bg-pink-150 text-pink-700"
                                    : "border-white/10 bg-white/5 text-[var(--muted)]"
                                }`}
                                aria-pressed={layoutCustomType === "video"}
                              >
                                Video
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!radarAddonEnabled) {
                                    openRadarAddonModal();
                                    return;
                                  }
                                  setLayoutCustomType("radar");
                                }}
                                className={`rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide transition ${
                                  layoutCustomType === "radar"
                                    ? "border-violet-300/40 bg-violet-400/15 text-violet-100"
                                    : "border-white/10 bg-white/5 text-[var(--muted)]"
                                } ${!radarAddonEnabled ? "cursor-not-allowed opacity-60" : ""}`}
                                aria-pressed={layoutCustomType === "radar"}
                                aria-disabled={!radarAddonEnabled}
                              >
                                Datas
                              </button>
                            </div>
                            {layoutCustomType === "image" ? (
                              <div className="mt-2 flex w-fit items-center gap-2 rounded-lg border border-dashed border-sky-300/30 bg-transparent px-2.5 py-1 text-[0.6rem] font-medium text-sky-100/80 select-none">
                                <svg
                                  viewBox="0 0 24 24"
                                  className="h-3.5 w-3.5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M4 7h3l2-2h6l2 2h3v12H4z" />
                                  <circle cx="12" cy="13" r="3" />
                                </svg>
                                Image: upload d images et legendes.
                              </div>
                            ) : layoutCustomType === "video" ? (
                              <div className="mt-2 flex w-fit items-center gap-2 rounded-lg border border-dashed border-pink-400 bg-transparent px-2.5 py-1 text-[0.6rem] font-medium text-pink-700 select-none">
                                <svg
                                  viewBox="0 0 24 24"
                                  className="h-3.5 w-3.5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M10 8l6 4-6 4V8z" />
                                  <rect x="3" y="6" width="18" height="12" rx="2" />
                                </svg>
                                Video: jusqu a {VIDEO_PER_SECTION_LIMIT} videos (max{" "}
                                {VIDEO_DURATION_LIMIT_SECONDS}s chacune).
                              </div>
                            ) : layoutCustomType === "radar" ? (
                              <div className="mt-2 flex w-fit items-center gap-2 rounded-lg border border-dashed border-violet-300/30 bg-transparent px-2.5 py-1 text-[0.6rem] font-medium text-violet-100/80 select-none">
                                <svg
                                  viewBox="0 0 24 24"
                                  className="h-3.5 w-3.5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <circle cx="12" cy="12" r="8" />
                                  <path d="M12 12l4-4" />
                                  <path d="M12 8v-2" />
                                  <path d="M16 12h2" />
                                </svg>
                                Datas: import d exports et graphes.
                              </div>
                            ) : (
                              <div className="mt-2 flex w-fit items-center gap-2 rounded-lg border border-dashed border-emerald-300/30 bg-transparent px-2.5 py-1 text-[0.6rem] font-medium text-emerald-100/80 select-none">
                                <svg
                                  viewBox="0 0 24 24"
                                  className="h-3.5 w-3.5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M4 6h16" />
                                  <path d="M4 12h16" />
                                  <path d="M4 18h10" />
                                </svg>
                                Texte: section ecrite libre.
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={handleAddCustomTemplateToLayout}
                              className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/10"
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
                                <path d="M12 5v14" />
                                <path d="M5 12h14" />
                              </svg>
                              Ajouter au layout
                            </button>
                          </div>
                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={layoutSaving}
                              onClick={handleSaveLayout}
                              className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
                            >
                              {layoutSaving ? "Sauvegarde..." : "Enregistrer le layout"}
                            </button>
                            <button
                              type="button"
                              onClick={resetLayoutEditor}
                              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                            >
                              Annuler
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      Nouvelle section
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Un titre clair aide l assistant IA a etre plus pertinent.
                    </p>
                    <label className="mt-3 block text-xs uppercase tracking-wide text-[var(--muted)]">
                      Nom de la section
                    </label>
                    <input
                      type="text"
                      value={customSection}
                      onChange={(event) => setCustomSection(event.target.value)}
                      placeholder="Ex: Routine pre-shot"
                      className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                    />
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
                        Type
                      </span>
                      <button
                        type="button"
                        onClick={() => setCustomType("text")}
                        className={`rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide transition ${
                          customType === "text"
                            ? "border-emerald-300/40 bg-emerald-400/15 text-emerald-100"
                            : "border-white/10 bg-white/5 text-[var(--muted)]"
                        }`}
                        aria-pressed={customType === "text"}
                      >
                        Texte
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomType("image")}
                        className={`rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide transition ${
                          customType === "image"
                            ? "border-sky-300/40 bg-sky-400/20 text-sky-100"
                            : "border-white/10 bg-white/5 text-[var(--muted)]"
                        }`}
                        aria-pressed={customType === "image"}
                      >
                        Image
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomType("video")}
                        className={`rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide transition ${
                          customType === "video"
                            ? "border-pink-400 bg-pink-200 text-pink-700"
                            : "border-white/10 bg-white/5 text-[var(--muted)]"
                        }`}
                        aria-pressed={customType === "video"}
                      >
                        Video
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!radarAddonEnabled) {
                            openRadarAddonModal();
                            return;
                          }
                          setCustomType("radar");
                        }}
                        className={`rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide transition ${
                          customType === "radar"
                            ? "border-violet-300/40 bg-violet-400/15 text-violet-100"
                            : "border-white/10 bg-white/5 text-[var(--muted)]"
                        } ${!radarAddonEnabled ? "cursor-not-allowed opacity-60" : ""}`}
                        aria-pressed={customType === "radar"}
                        aria-disabled={!radarAddonEnabled}
                      >
                        Datas
                      </button>
                    </div>
                    {customType === "image" ? (
                      <div className="mt-2 flex w-fit items-center gap-2 rounded-lg border border-dashed border-sky-300 bg-transparent px-2.5 py-1 text-[0.6rem] font-medium text-sky-700 select-none">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-3.5 w-3.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M4 7h3l2-2h6l2 2h3v12H4z" />
                          <circle cx="12" cy="13" r="3" />
                        </svg>
                        Image: upload d images et legendes.
                      </div>
                    ) : customType === "video" ? (
                      <div className="mt-2 flex w-fit items-center gap-2 rounded-lg border border-dashed border-pink-300 bg-transparent px-2.5 py-1 text-[0.6rem] font-medium text-pink-600 select-none">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-3.5 w-3.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M10 8l6 4-6 4V8z" />
                          <rect x="3" y="6" width="18" height="12" rx="2" />
                        </svg>
                        Video: 1 section max par rapport, {VIDEO_PER_SECTION_LIMIT} videos
                        max (max {VIDEO_DURATION_LIMIT_SECONDS}s chacune).
                      </div>
                    ) : customType === "radar" ? (
                      <div className="mt-2 flex w-fit items-center gap-2 rounded-lg border border-dashed border-violet-300 bg-transparent px-2.5 py-1 text-[0.6rem] font-medium text-violet-100/80 select-none">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-3.5 w-3.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="12" cy="12" r="8" />
                          <path d="M12 12l4-4" />
                          <path d="M12 8v-2" />
                          <path d="M16 12h2" />
                        </svg>
                        Datas: import d exports et graphes.
                      </div>
                    ) : (
                      <div className="mt-2 flex w-fit items-center gap-2 rounded-lg border border-dashed border-emerald-300/30 bg-transparent px-2.5 py-1 text-[0.6rem] font-medium text-emerald-100/80 select-none">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-3.5 w-3.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M4 6h16" />
                          <path d="M4 12h16" />
                          <path d="M4 18h10" />
                        </svg>
                        Texte: section ecrite libre.
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleAddCustomSection}
                      className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/10"
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
                        <path d="M12 5v14" />
                        <path d="M5 12h14" />
                      </svg>
                      Ajouter
                    </button>
                  </div>
                  <div className="mt-4 space-y-3">
                    <div className="mt-4 -mx-6 border-y border-white/10 bg-gradient-to-r from-white/5 via-white/5 to-sky-400/10 px-6 py-4">
                      <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                        Recherche
                      </label>
                      <input
                        type="search"
                        value={sectionSearch}
                        onChange={(event) => setSectionSearch(event.target.value)}
                        placeholder="Chercher une section"
                        className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                      />
                    </div>
                    {templatesLoading ? (
                      <p className="text-xs text-[var(--muted)]">
                        Chargement des sections...
                      </p>
                    ) : filteredAvailableSections.length === 0 ? (
                      <p className="text-xs text-[var(--muted)]">
                        Aucune section disponible. Cree-en une ou applique un layout.
                      </p>
                    ) : (
                      visibleAvailableSections.map((section) => {
                        const featureKey = getSectionFeatureKey(section);
                        const tone = featureKey ? featureTones[featureKey] : null;
                        const isLocked = isFeatureLocked(featureKey);
                        return (
                          <div
                            key={`${section.title}-${section.type}`}
                            className={`relative flex flex-col gap-3 rounded-xl border px-4 py-3 pl-11 text-sm text-[var(--text)] sm:flex-row sm:items-center sm:justify-between sm:pr-16 ${
                              tone ? tone.panel : "border-white/5 bg-white/5"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => handleRemoveFromAvailable(section)}
                              className="absolute left-0 top-0 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-[var(--bg-elevated)] text-[var(--muted)] shadow transition hover:border-red-400/40 hover:bg-red-500/20 hover:text-red-300"
                              aria-label="Supprimer la section"
                              title="Supprimer"
                            >
                              <svg
                                viewBox="0 0 24 24"
                                className="h-3 w-3"
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
                            <div className="min-w-0 flex-1">
                              {editingSection === section.title ? (
                                <input
                                  type="text"
                                  value={editingValue}
                                  onChange={(event) =>
                                    setEditingValue(event.target.value)
                                  }
                                  className="w-full rounded-lg border border-white/10 bg-[var(--bg-elevated)] px-3 py-1 text-sm text-[var(--text)]"
                                />
                              ) : (
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="block break-words">
                                    {section.title}
                                  </span>
                                  {renderFeatureBadge(getSectionFeatureKey(section))}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {editingSection === section.title ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={handleSaveEdit}
                                    className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[var(--text)] transition hover:bg-white/20"
                                    aria-label="Valider"
                                    title="Valider"
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
                                      <path d="M5 12l4 4L19 6" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleCancelEdit}
                                    className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)]"
                                    aria-label="Annuler"
                                    title="Annuler"
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
                                      <path d="M15 6l-6 6 6 6" />
                                    </svg>
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (isLocked) {
                                        openFeatureModal(featureKey);
                                        return;
                                      }
                                      handleAddToReport(section);
                                    }}
                                    title={isLocked ? "Option requise" : "Ajouter"}
                                    className={`flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[var(--text)] transition hover:bg-white/20 ${
                                      isLocked ? "cursor-not-allowed opacity-60" : ""
                                    }`}
                                    aria-label="Ajouter au rapport"
                                    aria-disabled={isLocked}
                                  >
                                    {isLocked ? (
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
                                    ) : (
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
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleEditSection(section)}
                                    className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)]"
                                    aria-label="Modifier la section"
                                    title="Modifier"
                                  >
                                    <svg
                                      viewBox="0 0 24 24"
                                      className="h-4 w-4"
                                      fill="currentColor"
                                      aria-hidden="true"
                                    >
                                      <circle cx="5" cy="12" r="1.8" />
                                      <circle cx="12" cy="12" r="1.8" />
                                      <circle cx="19" cy="12" r="1.8" />
                                    </svg>
                                  </button>
                                </>
                              )}
                            </div>
                            {dragEnabled ? (
                              <button
                                type="button"
                                draggable={editingSection !== section.title}
                                disabled={editingSection === section.title}
                                onDragStart={(event) =>
                                  handleAvailableDragStart(section, event)
                                }
                                onDragEnd={handleDragEnd}
                                className={`absolute right-3 top-3 bottom-3 flex w-7 items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/5 text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] ${
                                  editingSection === section.title
                                    ? "cursor-not-allowed opacity-40"
                                    : "cursor-grab"
                                }`}
                                aria-label="Glisser vers le rapport"
                                title="Glisser vers le rapport"
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  className="h-4 w-4"
                                  fill="currentColor"
                                  aria-hidden="true"
                                >
                                  <circle cx="9" cy="6" r="1.4" />
                                  <circle cx="9" cy="12" r="1.4" />
                                  <circle cx="9" cy="18" r="1.4" />
                                  <circle cx="15" cy="6" r="1.4" />
                                  <circle cx="15" cy="12" r="1.4" />
                                  <circle cx="15" cy="18" r="1.4" />
                                </svg>
                              </button>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                    {!normalizedSectionSearch && hiddenAvailableCount > 0 ? (
                      <p className="text-xs text-[var(--muted)]">
                        {hiddenAvailableCount} autres sections disponibles via la
                        recherche.
                      </p>
                    ) : null}
                  </div>
                  {sectionsMessage ? (
                    <p
                      className={`mt-4 text-xs ${
                        sectionsMessageType === "error"
                          ? "text-red-400"
                          : "text-[var(--muted)]"
                      }`}
                    >
                      {sectionsMessage}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {activeBuilderStep === "sections" ? (
                <div className="panel relative rounded-2xl p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-[var(--text)]">
                        Apercu du rapport
                      </h3>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Ecran de verification avant la redaction. Organise les sections si
                        besoin.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBuilderStep("layout")}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                    >
                      Retour layout
                    </button>
                  </div>
                  {selectedLayoutOption ? (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.55rem] uppercase tracking-wide text-[var(--muted)]">
                      Layout: {selectedLayoutOption.title}
                    </div>
                  ) : null}
                  <div className="mt-4 space-y-3">
                    {reportSections.length === 0 ? (
                      <p className="text-xs text-[var(--muted)]">
                        Ajoute des sections a gauche pour demarrer.
                      </p>
                    ) : (
                      reportSections.map((section, index) => (
                        <div
                          key={`preview-section-${section.id}`}
                          ref={(node) => {
                            if (node) {
                              itemRefs.current.set(section.id, node);
                            } else {
                              itemRefs.current.delete(section.id);
                            }
                          }}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--text)]"
                        >
                          <div>
                            <p className="text-sm font-semibold text-[var(--text)]">
                              {section.title}
                            </p>
                            <div className="mt-1">
                              {renderFeatureBadge(getSectionFeatureKey(section)) ?? (
                                <span className="text-[0.55rem] uppercase tracking-wide text-[var(--muted)]">
                                  Texte
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleMoveSection(index, "up")}
                              disabled={index === 0}
                              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-40"
                              aria-label="Monter"
                              title="Monter"
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
                                <path d="M12 19V5" />
                                <path d="M5 12l7-7 7 7" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveSection(index, "down")}
                              disabled={index === reportSections.length - 1}
                              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-40"
                              aria-label="Descendre"
                              title="Descendre"
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
                                <path d="M12 5v14" />
                                <path d="M5 12l7 7 7-7" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveFromReport(section)}
                              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[var(--muted)] transition hover:text-red-200"
                              aria-label="Retirer"
                              title="Retirer"
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
                                <path d="M18 6L6 18" />
                                <path d="M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setBuilderStep("layout")}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                    >
                      Retour
                    </button>
                    <button
                      type="button"
                      onClick={handleContinueFromSections}
                      className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90"
                    >
                      Passer au rapport
                    </button>
                  </div>
                </div>
              ) : (
                <div className="panel relative rounded-2xl p-6">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold text-[var(--text)]">
                      Rapport en cours
                    </h3>
                    <div className="flex items-center gap-2">
                      <span
                        ref={(node) => {
                          if (node) {
                            tooltipRefs.current.set("report", node);
                          } else {
                            tooltipRefs.current.delete("report");
                          }
                        }}
                        className="group relative shrink-0"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setActiveTooltip((prev) =>
                              prev === "report" ? null : "report"
                            )
                          }
                          className="flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[0.7rem] text-[var(--muted)] transition hover:text-[var(--text)]"
                          aria-label="Aide sur le rapport en cours"
                          aria-expanded={activeTooltip === "report"}
                        >
                          ?
                        </button>
                        <span
                          className={`absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text)] shadow-xl transition ${
                            activeTooltip === "report"
                              ? "pointer-events-auto opacity-100"
                              : "pointer-events-none opacity-0"
                          } group-hover:opacity-100 group-focus-within:opacity-100`}
                        >
                          <span className="block text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                            Construction
                          </span>
                          <span className="mt-1 block">
                            Tu saisis des notes de travail en cours. Le rapport se
                            construit au fur et a mesure selon les sections presentes.
                          </span>
                          <span className="mt-2 block text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                            Propagation
                          </span>
                          <span className="mt-1 block">
                            L IA relit, complete et propage les idees pour accelerer la
                            redaction.
                          </span>
                          <span className="mt-2 block text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                            Finalisation
                          </span>
                          <span className="mt-1 block">
                            Le resume et les sections de planification se generent a la
                            fin, selon le titre des sections (ex: plan 3 mois, plan 7
                            jours).
                          </span>
                        </span>
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    Organise les sections et remplis le contenu. Drag & drop actif.
                  </p>
                  {tpiContextLoading ? (
                    <p className="mt-2 text-xs text-[var(--muted)]" aria-live="polite">
                      {tpiLoadingPhrase}
                    </p>
                  ) : null}
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {showPublish ? (
                      <button
                        type="button"
                        disabled={saving || loadingReport || isReportWriteLocked}
                        onClick={() => handleSaveReport(true)}
                        className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
                      >
                        {saving ? "Envoi..." : sendLabel}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={saving || loadingReport || isReportWriteLocked}
                      onClick={() => handleSaveReport(false)}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/10 disabled:opacity-60"
                    >
                      {saving ? "Sauvegarde..." : saveLabel}
                    </button>
                    {isEditing ? (
                      <span
                        className={`rounded-md border border-dashed px-2 py-1 text-[0.55rem] uppercase tracking-wide select-none ${
                          isDraft
                            ? "border-white/15 bg-white/5 text-[var(--muted)]"
                            : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                        }`}
                      >
                        {isDraft ? "Brouillon" : "Envoye"}
                      </span>
                    ) : null}
                  </div>
                  <div className="hidden">
                    {aiFullLocked ? (
                      <button
                        type="button"
                        onClick={() => openPremiumModal()}
                        className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--overlay)] px-6 text-left backdrop-blur-sm"
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
                              <p className="text-xs uppercase tracking-[0.2em]">
                                Assistant IA
                              </p>
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
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                        Assistant IA
                      </p>
                      <span
                        className={`rounded-md border border-dashed px-2 py-1 text-[0.55rem] uppercase tracking-wide select-none ${
                          aiEnabled
                            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                            : "border-amber-300/30 bg-amber-400/10 text-amber-200"
                        }`}
                        onClick={!aiEnabled ? () => openPremiumModal() : undefined}
                        role={!aiEnabled ? "button" : undefined}
                        aria-label={!aiEnabled ? "Voir les offres" : undefined}
                      >
                        {aiStatusLabel}
                      </span>
                    </div>
                    <p className="mt-2 hidden text-xs text-[var(--muted)] md:block">
                      L assistant IA utilise le profil TPI, les datas de seance et tes
                      constats/travaux en cours quand ils sont disponibles.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-white/10 bg-white/5 px-4 py-3">
                      <div>
                        <p className="text-[0.65rem] uppercase tracking-[0.2em] text-[var(--muted)]">
                          Validation apres propagation
                        </p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {aiPropagationReview
                            ? "Le coach valide chaque section avant insertion."
                            : "L IA remplit automatiquement les sections."}
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={aiPropagationReview}
                        aria-label="Basculer la validation apres propagation"
                        onClick={() => setAiPropagationReview((prev) => !prev)}
                        disabled={aiFullLocked}
                        className={`relative inline-flex h-8 w-14 items-center rounded-full border px-1 transition ${
                          aiFullLocked
                            ? "cursor-not-allowed border-white/10 bg-white/5 opacity-60"
                            : "border-white/10 bg-white/10 hover:border-white/30"
                        }`}
                      >
                        <span
                          className={`absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border text-[0.55rem] font-semibold uppercase shadow-[0_6px_12px_rgba(0,0,0,0.25)] transition-transform ${
                            aiPropagationReview
                              ? "translate-x-0 border-emerald-300/40 bg-emerald-400/20 text-emerald-100"
                              : "translate-x-6 border-rose-300/40 bg-rose-400/20 text-rose-100"
                          }`}
                        >
                          {aiPropagationReview ? "On" : "Off"}
                        </span>
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={!!aiBusyId}
                        onClick={() => {
                          if (aiFullLocked) {
                            openPremiumModal();
                            return;
                          }
                          handleAiSummary();
                        }}
                        className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition hover:bg-white/20 disabled:opacity-60 ${
                          aiFullLocked
                            ? "border-amber-300/30 bg-amber-400/10 text-amber-200"
                            : "border-white/10 bg-white/10 text-[var(--text)]"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          {aiFullLocked ? (
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
                          ) : null}
                          {aiBusyId === "summary" ? "IA..." : "Resume du rapport"}
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={radarAiAutoBusy}
                        onClick={() => {
                          if (aiFullLocked) {
                            openPremiumModal();
                            return;
                          }
                          setRadarAiQaAnswers({});
                          setRadarAiQaError("");
                          setRadarAiQaOpen(true);
                          setRadarAiQuestions(DEFAULT_RADAR_AI_QUESTIONS);
                          void loadRadarAiQuestions();
                        }}
                        className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition hover:bg-white/20 disabled:opacity-60 ${
                          aiFullLocked
                            ? "border-amber-300/30 bg-amber-400/10 text-amber-200"
                            : "border-violet-300/40 bg-violet-400/15 text-violet-100"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          {aiFullLocked ? (
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
                          ) : null}
                          {radarAiAutoBusy ? "IA..." : "Auto detect datas graph"}
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={!!aiBusyId}
                        onClick={() => {
                          if (aiFullLocked) {
                            openPremiumModal();
                            return;
                          }
                          handleAiFinalize();
                        }}
                        className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition hover:bg-white/20 disabled:opacity-60 ${
                          aiFullLocked
                            ? "border-amber-300/30 bg-amber-400/10 text-amber-200"
                            : "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          {aiFullLocked ? (
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
                          ) : null}
                          {aiBusyId === "finalize" ? "IA..." : "Finaliser"}
                        </span>
                      </button>
                    </div>
                    {radarAiAutoBusy ? (
                      <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                          <span>
                            Auto detect datas graph
                            <span className="tpi-dots" aria-hidden="true">
                              <span />
                              <span />
                              <span />
                            </span>
                          </span>
                          <span className="min-w-[3ch] text-right text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                            {Math.round(radarAiAutoProgress)}%
                          </span>
                        </div>
                        <div className="mt-1 text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                          Mode:{" "}
                          {radarAiAutoPreset === "ultra"
                            ? "Ultra focus (1 min)"
                            : "Standard (4 min)"}
                        </div>
                        <div className="mt-2 h-2 w-full rounded-full bg-white/10">
                          <div
                            className="h-2 rounded-full bg-violet-300 transition-all duration-700 ease-out"
                            style={{ width: `${radarAiAutoProgress}%` }}
                          />
                        </div>
                      </div>
                    ) : null}
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs uppercase tracking-wide text-[var(--muted)]">
                        Reglages IA
                      </summary>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-[var(--muted)]">
                          Reinitialise les reglages IA aux valeurs par defaut.
                        </p>
                        <button
                          type="button"
                          onClick={resetAiSettings}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                        >
                          Reinitialiser IA
                        </button>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr]">
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
                    </details>
                    {aiError ? (
                      <p className="mt-3 text-xs text-red-400">{aiError}</p>
                    ) : null}
                    <div className="mt-4 rounded-2xl bg-white/5 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                          Travail en cours
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={aiFullLocked || !!aiBusyId}
                            onClick={resetWorkingContext}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-60"
                          >
                            Reinitialiser
                          </button>
                          <button
                            type="button"
                            disabled={!!aiBusyId}
                            onClick={() => {
                              if (aiFullLocked) {
                                openPremiumModal();
                                return;
                              }
                              handleAiPropagateFromWorking();
                            }}
                            className={`rounded-full border px-3.5 py-1.5 text-[0.65rem] font-semibold uppercase tracking-wide transition disabled:opacity-60 ${
                              aiFullLocked
                                ? "border-amber-300/35 bg-amber-400/15 text-amber-200"
                                : "border-emerald-300/40 bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 text-zinc-900 shadow-[0_10px_24px_rgba(16,185,129,0.3)] hover:brightness-105"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              {aiFullLocked ? (
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
                              ) : (
                                <svg
                                  viewBox="0 0 24 24"
                                  className="h-3.5 w-3.5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <path d="M5 12h14" />
                                  <path d="M13 6l6 6-6 6" />
                                </svg>
                              )}
                              {aiBusyId === "propagate" ? "IA..." : "Propager"}
                            </span>
                          </button>
                        </div>
                      </div>
                      {aiBusyId ? (
                        <div className="mt-2 flex items-center gap-2 text-xs text-[var(--muted)]">
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/10 bg-white/10">
                            <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
                          </span>
                          Traitement IA en cours...
                        </div>
                      ) : null}
                      <p className="mt-2 text-xs text-[var(--muted)]">
                        Constats + travail en cours. L IA remplit les sections vides et
                        complete les sections deja remplies.
                      </p>
                      <div className="mt-3 grid gap-3 md:grid-cols-[0.6fr_1.4fr]">
                        <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                          Club concerne
                        </label>
                        <input
                          type="text"
                          value={workingClub}
                          onChange={(event) => setWorkingClub(event.target.value)}
                          placeholder="Ex: Fer 7, Driver, Putter..."
                          className="w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                        />
                      </div>
                      <div className="mt-3 grid gap-3 lg:grid-cols-2">
                        <div>
                          <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                            Constats
                          </label>
                          <textarea
                            ref={(node) => {
                              workingObservationsRef.current = node;
                              if (node) {
                                node.style.height = `${node.scrollHeight}px`;
                              }
                            }}
                            rows={3}
                            placeholder="Ex: chemin de club trop a gauche, perte de posture..."
                            value={workingObservations}
                            onInput={handleWorkingObservationsInput}
                            className="mt-2 w-full resize-none overflow-hidden rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                            Travail en cours
                          </label>
                          <textarea
                            ref={(node) => {
                              workingNotesRef.current = node;
                              if (node) {
                                node.style.height = `${node.scrollHeight}px`;
                              }
                            }}
                            rows={3}
                            placeholder="Ex: stabiliser l'appui pied droit au backswing."
                            value={workingNotes}
                            onInput={handleWorkingNotesInput}
                            className="mt-2 w-full resize-none overflow-hidden rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  {aiSummary ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                        Resume IA
                      </p>
                      <p className="mt-2 text-sm text-[var(--text)] whitespace-pre-wrap">
                        {aiSummary}
                      </p>
                    </div>
                  ) : null}
                  <div className="fixed bottom-24 right-3 z-40 flex flex-col items-end gap-2.5 lg:bottom-32">
                    <button
                      type="button"
                      onClick={() => setStickyActionsExpanded((prev) => !prev)}
                      className="flex h-8 w-11 items-center justify-center text-zinc-600 transition hover:text-zinc-800 lg:h-9 lg:w-12"
                      aria-label={
                        stickyActionsExpanded
                          ? "Replier les actions"
                          : "Afficher les actions"
                      }
                      title={
                        stickyActionsExpanded
                          ? "Replier les actions"
                          : "Afficher les actions"
                      }
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className={`h-5 w-5 transition-transform duration-300 ease-in-out ${
                          stickyActionsExpanded ? "rotate-90" : "rotate-0"
                        }`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiSettingsModalOpen(true)}
                      className={`flex h-11 items-center overflow-hidden rounded-full border border-black/15 bg-white/95 text-zinc-700 shadow-[0_10px_24px_rgba(0,0,0,0.28)] transition-all duration-300 ease-in-out hover:bg-zinc-100 lg:h-12 ${stickyActionShapeClass}`}
                      style={{ transitionDelay: getStickyActionDelay(0) }}
                      aria-label="Ouvrir les reglages IA"
                      title="Reglages IA"
                    >
                      <span className="shrink-0">
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
                      </span>
                      <span
                        className={`inline-flex items-center overflow-hidden whitespace-nowrap text-[0.58rem] font-semibold uppercase leading-none tracking-wide transition-all duration-300 ease-in-out ${stickyActionLabelClass}`}
                        style={{ transitionDelay: getStickyLabelDelay(0) }}
                      >
                        Reglages
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSectionsNotice("", "idle");
                        setSectionSearch("");
                        setSectionLibraryTypeFilter("all");
                        setSectionLibraryOpen(true);
                      }}
                      className={`flex h-11 items-center overflow-hidden rounded-full border border-black/15 bg-white/95 text-zinc-700 shadow-[0_10px_24px_rgba(0,0,0,0.28)] transition-all duration-300 ease-in-out hover:bg-zinc-100 lg:h-12 ${stickyActionShapeClass}`}
                      style={{ transitionDelay: getStickyActionDelay(1) }}
                      aria-label="Ajouter une section"
                      title="Ajouter une section"
                    >
                      <span className="shrink-0">
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
                          <path d="M12 5v14" />
                          <path d="M5 12h14" />
                        </svg>
                      </span>
                      <span
                        className={`inline-flex items-center overflow-hidden whitespace-nowrap text-[0.58rem] font-semibold uppercase leading-none tracking-wide transition-all duration-300 ease-in-out ${stickyActionLabelClass}`}
                        style={{ transitionDelay: getStickyLabelDelay(1) }}
                      >
                        Ajouter section
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={!!aiBusyId}
                      onClick={() => {
                        if (aiFullLocked) {
                          openPremiumModal();
                          return;
                        }
                        handleAiSummary();
                      }}
                      className={`flex h-11 items-center overflow-hidden rounded-full border shadow-[0_10px_24px_rgba(0,0,0,0.28)] transition-all duration-300 ease-in-out disabled:opacity-60 lg:h-12 ${stickyActionShapeClass} ${
                        aiFullLocked
                          ? "border-amber-300 bg-amber-50 text-amber-700"
                          : "border-black/15 bg-white/95 text-zinc-700 hover:bg-zinc-100"
                      }`}
                      style={{ transitionDelay: getStickyActionDelay(2) }}
                      aria-label="Resume du rapport"
                      title={aiBusyId === "summary" ? "IA..." : "Resume du rapport"}
                    >
                      <span className="shrink-0">
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
                          <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
                          <path d="M14 3v5h5" />
                          <path d="M8 13h8" />
                          <path d="M8 17h5" />
                        </svg>
                      </span>
                      <span
                        className={`inline-flex items-center overflow-hidden whitespace-nowrap text-[0.58rem] font-semibold uppercase leading-none tracking-wide transition-all duration-300 ease-in-out ${stickyActionLabelClass}`}
                        style={{ transitionDelay: getStickyLabelDelay(2) }}
                      >
                        Resume rapide
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiAssistantModalOpen(true)}
                      className={`flex h-11 items-center overflow-hidden rounded-full border border-cyan-300 bg-cyan-50 text-cyan-700 shadow-[0_10px_24px_rgba(0,0,0,0.28)] transition-all duration-300 ease-in-out hover:bg-cyan-100 lg:h-12 ${stickyActionShapeClass}`}
                      style={{ transitionDelay: getStickyActionDelay(3) }}
                      aria-label="Ouvrir l assistant IA"
                      title="Assistant IA"
                    >
                      <span className="shrink-0">
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
                          <path d="M12 3l1.6 3.7L17 8.3l-3.4 1.6L12 13.5l-1.6-3.6L7 8.3l3.4-1.6L12 3z" />
                          <path d="M5 14l.8 1.9L7.8 17l-2 1-.8 2-.8-2-2-1 2-.9L5 14z" />
                          <path d="M19 14l.8 1.9 2 1-2 .9-.8 2-.8-2-2-1 2-.9L19 14z" />
                        </svg>
                      </span>
                      <span
                        className={`inline-flex items-center overflow-hidden whitespace-nowrap text-[0.58rem] font-semibold uppercase leading-none tracking-wide transition-all duration-300 ease-in-out ${stickyActionLabelClass}`}
                        style={{ transitionDelay: getStickyLabelDelay(3) }}
                      >
                        Assistant IA
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={radarAiAutoBusy}
                      onClick={() => {
                        if (aiFullLocked) {
                          openPremiumModal();
                          return;
                        }
                        setRadarAiQaAnswers({});
                        setRadarAiQaError("");
                        setRadarAiQaOpen(true);
                        setRadarAiQuestions(DEFAULT_RADAR_AI_QUESTIONS);
                        void loadRadarAiQuestions();
                      }}
                      className={`flex h-11 items-center overflow-hidden rounded-full border shadow-[0_10px_24px_rgba(0,0,0,0.28)] transition-all duration-300 ease-in-out disabled:opacity-60 lg:h-12 ${stickyActionShapeClass} ${
                        aiFullLocked
                          ? "border-amber-300 bg-amber-50 text-amber-700"
                          : "border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"
                      }`}
                      style={{ transitionDelay: getStickyActionDelay(4) }}
                      aria-label="Auto detect datas graphs"
                      title={radarAiAutoBusy ? "IA..." : "Auto detect datas graphs"}
                    >
                      <span className="shrink-0">
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
                          <path d="M4 19h16" />
                          <path d="M7 16l4-4 3 2 4-5" />
                          <circle cx="7" cy="16" r="1" />
                          <circle cx="11" cy="12" r="1" />
                          <circle cx="14" cy="14" r="1" />
                          <circle cx="18" cy="9" r="1" />
                        </svg>
                      </span>
                      <span
                        className={`inline-flex items-center overflow-hidden whitespace-nowrap text-[0.58rem] font-semibold uppercase leading-none tracking-wide transition-all duration-300 ease-in-out ${stickyActionLabelClass}`}
                        style={{ transitionDelay: getStickyLabelDelay(4) }}
                      >
                        Mode datas
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={!!aiBusyId}
                      onClick={() => {
                        if (aiFullLocked) {
                          openPremiumModal();
                          return;
                        }
                        handleAiFinalize();
                      }}
                      className={`flex h-11 items-center overflow-hidden rounded-full border shadow-[0_10px_24px_rgba(0,0,0,0.28)] transition-all duration-300 ease-in-out disabled:opacity-60 lg:h-12 ${stickyActionShapeClass} ${
                        aiFullLocked
                          ? "border-amber-300 bg-amber-50 text-amber-700"
                          : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      }`}
                      style={{ transitionDelay: getStickyActionDelay(5) }}
                      aria-label="Finaliser"
                      title={aiBusyId === "finalize" ? "IA..." : "Finaliser"}
                    >
                      <span className="shrink-0">
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
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      </span>
                      <span
                        className={`inline-flex items-center overflow-hidden whitespace-nowrap text-[0.58rem] font-semibold uppercase leading-none tracking-wide transition-all duration-300 ease-in-out ${stickyActionLabelClass}`}
                        style={{ transitionDelay: getStickyLabelDelay(5) }}
                      >
                        Finition IA
                      </span>
                    </button>
                  </div>
                  <div className="mt-4 space-y-3">
                    {reportSections.map((section, index) => {
                      const isCollapsed = collapsedSections[section.id] ?? false;
                      const trimmedContent = section.content.trim();
                      const contentPreview = trimmedContent
                        ? `${trimmedContent.slice(0, 160)}${
                            trimmedContent.length > 160 ? "..." : ""
                          }`
                        : "Section repliee.";
                      const mediaPreview =
                        section.type === "video"
                          ? section.mediaUrls.length > 0
                            ? `${section.mediaUrls.length} video(s)`
                            : "Aucune video ajoutee."
                          : section.mediaUrls.length > 0
                            ? `${section.mediaUrls.length} image(s)`
                            : "Aucune image ajoutee.";
                      const radarFile = section.radarFileId
                        ? radarFileMap.get(section.radarFileId)
                        : null;
                      const radarFileReady = radarFile?.status === "ready";
                      const radarPreview = radarFile
                        ? `${radarFile.original_name ?? "Fichier datas"} • ${
                            radarFile.shots?.length ?? 0
                          } coups`
                        : "Aucun fichier datas selectionne.";

                      const featureKey = getSectionFeatureKey(section);
                      const tone = featureKey ? featureTones[featureKey] : null;
                      const radarLocked = section.type === "radar" && !radarAddonEnabled;
                      const showSectionBrowseButton =
                        section.type === "image" ||
                        section.type === "video" ||
                        section.type === "radar";

                      return (
                        <div key={`${section.id}-slot`} className="space-y-3">
                          <div
                            onDragOver={handleDragOver}
                            onDragEnter={() => setHoverIndex(index)}
                            onDrop={() => handleDrop(index)}
                            className={`overflow-hidden transition-[height,margin] duration-200 ease-out ${
                              showSlots
                                ? hoverIndex === index
                                  ? "my-2 h-16"
                                  : "my-2 h-2"
                                : "my-0 h-0"
                            }`}
                          >
                            {showSlots && hoverIndex === index ? (
                              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[var(--accent)] bg-[var(--accent)]/10 text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
                                Deposer ici
                              </div>
                            ) : (
                              <div className="h-full rounded-full bg-white/10" />
                            )}
                          </div>

                          <div
                            ref={(node) => {
                              if (node) {
                                itemRefs.current.set(section.id, node);
                              } else {
                                itemRefs.current.delete(section.id);
                              }
                            }}
                            onDragEnd={handleDragEnd}
                            className={`relative rounded-2xl border px-4 py-4 transition ${
                              dragIndex === index
                                ? "border-white/20 bg-white/10 opacity-80 shadow-[0_20px_45px_rgba(0,0,0,0.45)]"
                                : tone
                                  ? tone.panel
                                  : "border-white/10 bg-white/5"
                            }`}
                          >
                            <div className="flex flex-col gap-3 md:flex-row md:items-center">
                              <div className="flex min-w-0 w-full items-center gap-3 md:flex-1">
                                {dragEnabled ? (
                                  <button
                                    type="button"
                                    draggable
                                    onDragStart={(event) => handleDragStart(index, event)}
                                    className="flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)] active:cursor-grabbing"
                                    title="Glisser pour reordonner"
                                  >
                                    <span className="text-xs">|||</span>
                                    Glisser
                                  </button>
                                ) : null}
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                  <p className="truncate text-sm font-semibold text-[var(--text)]">
                                    {section.title}
                                  </p>
                                  {renderFeatureBadge(featureKey)}
                                </div>
                              </div>
                              <div className="flex w-full items-center gap-2 md:w-auto">
                                {showSectionBrowseButton ? (
                                  <div className="relative flex items-center">
                                    {section.type === "radar" ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (radarLocked) {
                                              openRadarAddonModal();
                                              return;
                                            }
                                            openRadarImportModal(section.id);
                                          }}
                                          disabled={radarUploading}
                                          className={`rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide transition hover:opacity-90 ${
                                            radarLocked
                                              ? "cursor-not-allowed border-white/10 bg-white/10 text-[var(--text)] opacity-60"
                                              : "border-purple-300 bg-purple-400/15 text-purple-700"
                                          } disabled:opacity-60`}
                                          aria-disabled={radarLocked}
                                        >
                                          Importer
                                        </button>
                                        <input
                                          id={`radar-upload-${section.id}`}
                                          type="file"
                                          accept="image/*"
                                          multiple
                                          className="hidden"
                                          onChange={(event) => {
                                            const files = Array.from(
                                              event.target.files ?? []
                                            );
                                            if (files.length) {
                                              void handleRadarUploadBatch(files);
                                            }
                                            event.target.value = "";
                                          }}
                                        />
                                      </>
                                    ) : (
                                      <>
                                        <label
                                          htmlFor={`${
                                            section.type === "video"
                                              ? "video-upload"
                                              : "image-upload"
                                          }-${section.id}`}
                                          className={`rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide transition hover:opacity-90 ${
                                            section.type === "video"
                                              ? "border-pink-300/40 bg-pink-400/15 text-pink-400"
                                              : "border-sky-300/40 bg-sky-400/20 text-sky-100"
                                          }`}
                                        >
                                          Importer
                                        </label>
                                        {section.type === "video" ? (
                                          <p className="pointer-events-none absolute left-1/2 top-full mt-1 w-max -translate-x-1/2 text-[0.6rem] text-[var(--muted)]">
                                            {VIDEO_PER_SECTION_LIMIT} max,{" "}
                                            {VIDEO_DURATION_LIMIT_SECONDS}s max.
                                          </p>
                                        ) : null}
                                        <input
                                          id={`${
                                            section.type === "video"
                                              ? "video-upload"
                                              : "image-upload"
                                          }-${section.id}`}
                                          type="file"
                                          accept={
                                            section.type === "video"
                                              ? "video/*"
                                              : "image/*"
                                          }
                                          multiple
                                          onChange={(event) => {
                                            if (!event.target.files) return;
                                            if (section.type === "video") {
                                              handleVideoFiles(
                                                section.id,
                                                event.target.files
                                              );
                                            } else {
                                              handleImageFiles(
                                                section.id,
                                                event.target.files
                                              );
                                            }
                                            event.target.value = "";
                                          }}
                                          className="hidden"
                                        />
                                      </>
                                    )}
                                  </div>
                                ) : null}
                                <div className="ml-auto flex items-center gap-1.5 md:gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleSectionCollapse(section.id)}
                                  className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[var(--muted)] transition hover:text-[var(--text)] md:h-8 md:w-8"
                                  aria-label={isCollapsed ? "Developper" : "Replier"}
                                  title={isCollapsed ? "Developper" : "Replier"}
                                >
                                  <svg
                                    viewBox="0 0 24 24"
                                    className={`h-3.5 w-3.5 transition-transform md:h-4 md:w-4 ${
                                      isCollapsed ? "rotate-180" : ""
                                    }`}
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M6 9l6 6 6-6" />
                                  </svg>
                                </button>
                                {!dragEnabled ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleMoveSection(index, "up")}
                                      disabled={index === 0}
                                      className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-40 md:h-8 md:w-8"
                                      aria-label="Monter"
                                      title="Monter"
                                    >
                                      <svg
                                        viewBox="0 0 24 24"
                                        className="h-3.5 w-3.5 md:h-4 md:w-4"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        <path d="M12 19V5" />
                                        <path d="M5 12l7-7 7 7" />
                                      </svg>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleMoveSection(index, "down")}
                                      disabled={index === reportSections.length - 1}
                                      className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-40 md:h-8 md:w-8"
                                      aria-label="Descendre"
                                      title="Descendre"
                                    >
                                      <svg
                                        viewBox="0 0 24 24"
                                        className="h-3.5 w-3.5 md:h-4 md:w-4"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        <path d="M12 5v14" />
                                        <path d="M5 12l7 7 7-7" />
                                      </svg>
                                    </button>
                                  </>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFromReport(section)}
                                  className="flex h-7 w-7 items-center justify-center rounded-full border border-red-300/30 bg-red-400/10 text-red-300 transition hover:text-red-200 md:h-auto md:w-auto md:border-white/10 md:bg-white/10 md:px-3 md:py-1 md:text-[0.65rem] md:uppercase md:tracking-wide md:text-[var(--muted)] md:hover:text-[var(--text)]"
                                  aria-label="Retirer"
                                  title="Retirer"
                                >
                                  <svg
                                    viewBox="0 0 24 24"
                                    className="h-3.5 w-3.5 md:hidden"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                  >
                                    <path d="M18 6L6 18" />
                                    <path d="M6 6l12 12" />
                                  </svg>
                                  <span className="hidden md:inline">Retirer</span>
                                </button>
                              </div>
                              </div>
                            </div>
                            {isCollapsed ? (
                              <p className="mt-3 text-xs text-[var(--muted)]">
                                {section.type === "text"
                                  ? contentPreview
                                  : section.type === "radar"
                                    ? radarPreview
                                    : mediaPreview}
                              </p>
                            ) : section.type === "text" ? (
                              <>
                                <textarea
                                  rows={4}
                                  placeholder="Ecris le contenu de cette section..."
                                  value={section.content}
                                  onInput={(event) =>
                                    handleSectionInput(section.id, event)
                                  }
                                  ref={(node) => {
                                    if (node) {
                                      textareaRefs.current.set(section.id, node);
                                    } else {
                                      textareaRefs.current.delete(section.id);
                                    }
                                  }}
                                  className="mt-3 w-full resize-none overflow-hidden rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                                />
                                {aiPreviews[section.id] ? (
                                  <div className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <p className="text-[0.7rem] uppercase tracking-[0.2em] text-emerald-200">
                                        {aiPreviews[section.id].mode === "improve"
                                          ? "Corrections IA"
                                          : aiPreviews[section.id].mode === "finalize"
                                            ? "Finalisation IA"
                                            : "Proposition IA"}
                                      </p>
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => handleAiApply(section.id)}
                                          className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-400/20 text-emerald-200 transition hover:bg-emerald-400/30"
                                          aria-label="Valider les corrections"
                                          title="Valider"
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
                                            <path d="M20 6L9 17l-5-5" />
                                          </svg>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleAiReject(section.id)}
                                          className="flex h-7 w-7 items-center justify-center rounded-full border border-rose-300/40 bg-rose-400/10 text-rose-200 transition hover:bg-rose-400/20"
                                          aria-label="Refuser les corrections"
                                          title="Refuser"
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
                                    </div>
                                    <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text)]">
                                      {aiPreviews[section.id].mode === "improve"
                                        ? buildDiffSegments(
                                            aiPreviews[section.id].original,
                                            aiPreviews[section.id].suggestion
                                          ).map((segment, segmentIndex) => {
                                            if (segment.type === "delete") return null;
                                            if (segment.type === "insert") {
                                              return (
                                                <span
                                                  key={`${section.id}-insert-${segmentIndex}`}
                                                  className="rounded bg-emerald-400/30 px-0.5 text-emerald-100"
                                                >
                                                  {segment.text}
                                                </span>
                                              );
                                            }
                                            return (
                                              <span
                                                key={`${section.id}-equal-${segmentIndex}`}
                                              >
                                                {segment.text}
                                              </span>
                                            );
                                          })
                                        : aiPreviews[section.id].suggestion}
                                    </p>
                                  </div>
                                ) : null}
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={!!aiBusyId}
                                    onClick={() => {
                                      if (aiProofreadLocked) {
                                        openPremiumModal();
                                        return;
                                      }
                                      handleAiImprove(section);
                                    }}
                                    className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition hover:bg-white/20 disabled:opacity-60 ${
                                      aiProofreadLocked
                                        ? "border-amber-300/30 bg-amber-400/10 text-amber-200"
                                        : "border-white/10 bg-white/10 text-[var(--text)]"
                                    }`}
                                  >
                                    <span className="flex items-center gap-2">
                                      {aiProofreadLocked ? (
                                        <svg
                                          viewBox="0 0 24 24"
                                          className="h-3.5 w-3.5"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        >
                                          <rect
                                            x="3"
                                            y="11"
                                            width="18"
                                            height="11"
                                            rx="2"
                                          />
                                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                        </svg>
                                      ) : null}
                                      {aiBusyId === section.id ? "IA..." : "IA relire"}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!!aiBusyId}
                                    onClick={() => {
                                      if (aiFullLocked) {
                                        openPremiumModal();
                                        return;
                                      }
                                      handleAiWrite(section);
                                    }}
                                    className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition hover:bg-white/20 disabled:opacity-60 ${
                                      aiFullLocked
                                        ? "border-amber-300/30 bg-amber-400/10 text-amber-200"
                                        : "border-white/10 bg-white/10 text-[var(--text)]"
                                    }`}
                                  >
                                    <span className="flex items-center gap-2">
                                      {aiFullLocked ? (
                                        <svg
                                          viewBox="0 0 24 24"
                                          className="h-3.5 w-3.5"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        >
                                          <rect
                                            x="3"
                                            y="11"
                                            width="18"
                                            height="11"
                                            rx="2"
                                          />
                                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                        </svg>
                                      ) : null}
                                      {aiBusyId === section.id ? "IA..." : "IA completer"}
                                    </span>
                                  </button>
                                </div>
                              </>
                            ) : section.type === "radar" ? (
                              <div className="relative mt-3 space-y-3">
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
                                          <rect
                                            x="5"
                                            y="11"
                                            width="14"
                                            height="9"
                                            rx="2"
                                          />
                                          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                                        </svg>
                                        Plan requis (Pro+)
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
                                <div className="flex flex-wrap items-center gap-2">
                                  <select
                                    value={section.radarFileId ?? ""}
                                    onChange={(event) => {
                                      const nextId = event.target.value || null;
                                      const picked = nextId
                                        ? radarFileMap.get(nextId)
                                        : null;
                                      const base = picked?.config ?? defaultRadarConfig;
                                      const merged: RadarConfig = {
                                        ...defaultRadarConfig,
                                        ...(base ?? {}),
                                        charts: {
                                          ...defaultRadarConfig.charts,
                                          ...(base?.charts ?? {}),
                                        },
                                        thresholds: {
                                          ...defaultRadarConfig.thresholds,
                                          ...(base?.thresholds ?? {}),
                                        },
                                        options: {
                                          ...defaultRadarConfig.options,
                                          ...(base?.options ?? {}),
                                        },
                                      };
                                      setReportSections((prev) =>
                                        prev.map((entry) =>
                                          entry.id === section.id
                                            ? {
                                                ...entry,
                                                radarFileId: nextId,
                                                radarConfig: nextId ? merged : null,
                                              }
                                            : entry
                                        )
                                      );
                                    }}
                                    disabled={radarLocked}
                                    className="min-w-[220px] rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <option value="">
                                      {radarVisibleFiles.length
                                        ? "Choisir un fichier datas"
                                        : "Importer un fichier datas pour cette section"}
                                    </option>
                                    {radarVisibleFiles.map((file) => {
                                      const sourceLabel = formatSourceLabel(
                                        file.org_id,
                                        Array.isArray(file.organizations)
                                          ? file.organizations?.[0]?.name ?? null
                                          : file.organizations?.name ?? null
                                      );
                                      return (
                                        <option key={file.id} value={file.id} disabled={file.status !== "ready"}>
                                          {file.original_name || "Export datas"}
                                          {sourceLabel ? ` • ${sourceLabel}` : ""}{" "}
                                          {file.status === "ready" ? "" : file.status === "review" ? "(a verifier)" : "(analyse)"}
                                        </option>
                                      );
                                    })}
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleOpenRadarSectionConfig(section.id)
                                    }
                                    disabled={!section.radarFileId || radarLocked || !radarFileReady}
                                    className={`rounded-full border px-3 py-2 text-[0.65rem] uppercase tracking-wide transition ${
                                      section.radarFileId && !radarLocked && radarFileReady
                                        ? "border-white/10 bg-white/5 text-[var(--text)] hover:bg-white/10"
                                        : "cursor-not-allowed border-white/5 bg-white/5 text-[var(--muted)]"
                                    }`}
                                  >
                                    Configurer
                                  </button>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--muted)]">
                                  <label className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={radarShowAllFiles}
                                      onChange={(event) =>
                                        setRadarShowAllFiles(event.target.checked)
                                      }
                                      className="h-4 w-4 rounded border border-white/10 bg-[var(--bg-elevated)]"
                                    />
                                    <span>
                                      Afficher l historique des fichiers datas de l eleve
                                      ({radarFiles.length})
                                    </span>
                                  </label>
                                  <span>
                                    {radarShowAllFiles
                                      ? "Tous les fichiers sont visibles."
                                      : "Uniquement les fichiers lies au rapport."}
                                  </span>
                                </div>
                                {radarUploading ? (
                                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                                    <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                                      <span>
                                        Extraction datas
                                        <span className="tpi-dots" aria-hidden="true">
                                          <span />
                                          <span />
                                          <span />
                                        </span>
                                      </span>
                                      <span className="min-w-[3ch] text-right text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                                        {Math.round(radarUploadProgress)}%
                                      </span>
                                    </div>
                                    {radarUploadBatch ? (
                                      <div className="mt-1 text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                                        Fichier {radarUploadBatch.current}/
                                        {radarUploadBatch.total}
                                      </div>
                                    ) : null}
                                    <div className="mt-2 h-2 w-full rounded-full bg-white/10">
                                      <div
                                        className="h-2 rounded-full bg-violet-300 transition-all duration-700 ease-out"
                                        style={{ width: `${radarUploadProgress}%` }}
                                      />
                                    </div>
                                    {radarLoadingPhrase ? (
                                      <p
                                        className="mt-2 text-[0.65rem] text-[var(--muted)]"
                                        aria-live="polite"
                                      >
                                        {radarLoadingPhrase}
                                      </p>
                                    ) : null}
                                  </div>
                                ) : null}
                                {radarError ? (
                                  <p className="text-xs text-red-400">{radarError}</p>
                                ) : null}
                                {radarLoading ? (
                                  <p className="text-xs text-[var(--muted)]">
                                    Chargement des fichiers datas...
                                  </p>
                                ) : null}
                                {radarFile ? (
                                  (() => {
                                    if (radarFile.status === "review") {
                                      return (
                                        <div className="rounded-xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                                          <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>Extraction a verifier avant affichage.</div>
                                            <button
                                              type="button"
                                              onClick={() => setRadarReview(radarFile)}
                                              className="rounded-full border border-amber-300/30 bg-amber-400/20 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-amber-100 transition hover:bg-amber-400/30"
                                            >
                                              Verifier
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    }
                                    if (radarFile.status === "processing") {
                                      return (
                                        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                                          Extraction en cours...
                                        </div>
                                      );
                                    }
                                    if (radarFile.status === "error") {
                                      return (
                                        <div className="rounded-xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                                          Erreur d extraction.
                                        </div>
                                      );
                                    }
                                    const baseConfig =
                                      section.radarConfig ??
                                      radarFile.config ??
                                      defaultRadarConfig;
                                    const aiSelectionKeys =
                                      baseConfig.options?.aiSelectionKeys ?? [];
                                    const aiNeedsSelection =
                                      baseConfig.mode === "ai" &&
                                      aiSelectionKeys.length === 0;
                                    if (aiNeedsSelection) {
                                      return (
                                        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                                          Mode IA actif. Lance &quot;Auto detect datas
                                          graph&quot; pour afficher les graphes.
                                        </div>
                                      );
                                    }
                                    return (
                                      <RadarCharts
                                        columns={radarFile.columns ?? []}
                                        shots={radarFile.shots ?? []}
                                        stats={radarFile.stats}
                                        summary={radarFile.summary}
                                        config={baseConfig}
                                        analytics={radarFile.analytics}
                                        compact
                                      />
                                    );
                                  })()
                                ) : (
                                  <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                                    Selectionne un fichier datas pour previsualiser les
                                    graphes.
                                  </div>
                                )}
                              </div>
                            ) : section.type === "video" ? (
                              <div className="mt-3 space-y-3">
                                {uploadingSections[section.id] ? (
                                  <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                                    Upload en cours
                                    <span className="tpi-dots" aria-hidden="true">
                                      <span />
                                      <span />
                                      <span />
                                    </span>
                                  </div>
                                ) : null}
                                {imageErrors[section.id] ? (
                                  <p className="text-xs text-red-400">
                                    {imageErrors[section.id]}
                                  </p>
                                ) : null}
                                {section.mediaUrls.length > 0 ? (
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    {section.mediaUrls.map((url, index) => (
                                      <div
                                        key={url}
                                        className="relative overflow-hidden rounded-xl border border-white/10 bg-black/30"
                                      >
                                        <video
                                          src={url}
                                          controls
                                          playsInline
                                          className="max-h-40 w-full bg-black/40 object-contain"
                                        />
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleRemoveImage(section.id, index)
                                          }
                                          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/70 transition hover:text-white"
                                          aria-label="Supprimer la video"
                                          title="Supprimer"
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
                                            <path d="M18 6L6 18" />
                                            <path d="M6 6l12 12" />
                                          </svg>
                                        </button>
                                        <div className="bg-black/60 p-2">
                                          <div className="flex items-center gap-2">
                                            <input
                                              type="text"
                                              value={section.mediaCaptions[index] ?? ""}
                                              onChange={(event) =>
                                                handleCaptionChange(
                                                  section.id,
                                                  index,
                                                  event.target.value
                                                )
                                              }
                                              maxLength={CAPTION_LIMIT}
                                              placeholder="Ajouter une legende..."
                                              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-[var(--text)] placeholder:text-zinc-400"
                                            />
                                            <span className="text-[0.6rem] text-white/50">
                                              {
                                                (section.mediaCaptions[index] ?? "")
                                                  .length
                                              }
                                              /{CAPTION_LIMIT}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-[var(--muted)]">
                                    Aucune video ajoutee pour le moment.
                                  </p>
                                )}
                              </div>
                            ) : (
                              <div className="mt-3 space-y-3">
                                {uploadingSections[section.id] ? (
                                  <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                                    Upload en cours
                                    <span className="tpi-dots" aria-hidden="true">
                                      <span />
                                      <span />
                                      <span />
                                    </span>
                                  </div>
                                ) : null}
                                {imageErrors[section.id] ? (
                                  <p className="text-xs text-red-400">
                                    {imageErrors[section.id]}
                                  </p>
                                ) : null}
                                {section.mediaUrls.length > 0 ? (
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    {section.mediaUrls.map((url, index) => (
                                      <div
                                        key={url}
                                        className="relative overflow-hidden rounded-xl border border-white/10 bg-black/30"
                                      >
                                        <img
                                          src={url}
                                          alt={section.title}
                                          className="max-h-40 w-full bg-black/40 object-contain"
                                          loading="lazy"
                                        />
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleRemoveImage(section.id, index)
                                          }
                                          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/70 transition hover:text-white"
                                          aria-label="Supprimer l'image"
                                          title="Supprimer"
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
                                            <path d="M18 6L6 18" />
                                            <path d="M6 6l12 12" />
                                          </svg>
                                        </button>
                                        <div className="bg-black/60 p-2">
                                          <div className="flex items-center gap-2">
                                            <input
                                              type="text"
                                              value={section.mediaCaptions[index] ?? ""}
                                              onChange={(event) =>
                                                handleCaptionChange(
                                                  section.id,
                                                  index,
                                                  event.target.value
                                                )
                                              }
                                              maxLength={CAPTION_LIMIT}
                                              placeholder="Ajouter une description..."
                                              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-[var(--text)] placeholder:text-zinc-400"
                                            />
                                            <span className="text-[0.6rem] text-white/50">
                                              {
                                                (section.mediaCaptions[index] ?? "")
                                                  .length
                                              }
                                              /{CAPTION_LIMIT}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-[var(--muted)]">
                                    Aucune image ajoutee pour le moment.
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div
                      onDragOver={handleDragOver}
                      onDragEnter={() => setHoverIndex(reportSections.length)}
                      onDrop={() => handleDrop(reportSections.length)}
                      className={`overflow-hidden transition-[height,margin] duration-200 ease-out ${
                        showSlots
                          ? hoverIndex === reportSections.length
                            ? "my-2 h-16"
                            : "my-2 h-2"
                          : "my-0 h-0"
                      }`}
                    >
                      {showSlots && hoverIndex === reportSections.length ? (
                        <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[var(--accent)] bg-[var(--accent)]/10 text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
                          Deposer ici
                        </div>
                      ) : (
                        <div className="h-full rounded-full bg-white/10" />
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                    <button
                      type="button"
                      disabled={saving || loadingReport || reportSections.length === 0}
                      onClick={handleClearReportContent}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-50"
                    >
                      Vider le contenu
                    </button>
                    <button
                      type="button"
                      disabled={saving || loadingReport || reportSections.length === 0}
                      onClick={handleClearReportSections}
                      className="rounded-full border border-rose-300/30 bg-rose-400/10 px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-wide text-rose-100 transition hover:bg-rose-400/20 disabled:opacity-50"
                    >
                      Retirer tout
                    </button>
                  </div>
                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    {showPublish ? (
                      <button
                        type="button"
                        disabled={saving || loadingReport || isReportWriteLocked}
                        onClick={() => handleSaveReport(true)}
                        className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
                      >
                        {saving ? "Envoi..." : sendLabel}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={saving || loadingReport || isReportWriteLocked}
                      onClick={() => handleSaveReport(false)}
                      className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/10 disabled:opacity-60"
                    >
                      {saving ? "Sauvegarde..." : saveLabel}
                    </button>
                  </div>
                  {isOrgPublishLocked ? (
                    <p className="mt-3 text-xs text-amber-300">
                      Plan requis (Pro/Entreprise) et assignation pour publier en
                      organisation.
                    </p>
                  ) : null}
                  {isSharedReadOnly ? (
                    <p className="mt-3 text-xs text-amber-300">
                      Rapport partage en lecture seule.
                    </p>
                  ) : null}
                  {isSourceWorkspaceLocked ? (
                    <p className="mt-3 text-xs text-amber-300">
                      Rapport cree dans un autre workspace. Bascule de workspace pour
                      le modifier.
                    </p>
                  ) : null}
                  {statusMessage ? (
                    <p
                      className={`mt-4 text-sm ${
                        statusType === "error" ? "text-red-400" : "text-[var(--muted)]"
                      }`}
                    >
                      {statusMessage}
                    </p>
                  ) : null}
                </div>
              )}
            </section>
          ) : null}
        </div>
        {layoutEditorOpen ? (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 px-4 py-10">
            <div className="mx-auto flex w-full max-w-3xl flex-col rounded-3xl border border-white/10 bg-[var(--bg-elevated)] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
              <div className="flex items-start justify-between gap-4 p-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                    Layout
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-[var(--text)]">
                    {layoutEditingId ? "Modifier le layout" : "Creer un layout"}
                  </h3>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Compose un layout a partir des sections disponibles ou ajoute tes
                    propres sections.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetLayoutEditor}
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
              <div className="space-y-4 px-6 pb-6">
                <div>
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Titre du layout
                  </label>
                  <input
                    type="text"
                    value={layoutTitle}
                    onChange={(event) => setLayoutTitle(event.target.value)}
                    placeholder="Seance practice - jeu de fers"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                  />
                </div>
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Sections du layout
                  </p>
                  {layoutTemplateIds.length === 0 ? (
                    <p className="text-xs text-[var(--muted)]">
                      Aucune section ajoutee pour l instant.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {layoutTemplateIds.map((templateId, index) => {
                        const template = templateById.get(templateId);
                        const label = template?.title ?? "Section inconnue";
                        const featureKey = template
                          ? getSectionFeatureKey(template)
                          : null;
                        const tone = featureKey ? featureTones[featureKey] : null;
                        return (
                          <div
                            key={`layout-item-${templateId}`}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)]"
                          >
                            <span className="inline-flex items-center gap-2">
                              {tone ? (
                                <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
                              ) : null}
                              {label}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleMoveLayoutTemplate(index, "up")}
                                disabled={index === 0}
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-40"
                                aria-label="Monter"
                                title="Monter"
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
                                  <path d="M12 19V5" />
                                  <path d="M5 12l7-7 7 7" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveLayoutTemplate(index, "down")}
                                disabled={index === layoutTemplateIds.length - 1}
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-40"
                                aria-label="Descendre"
                                title="Descendre"
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
                                  <path d="M12 5v14" />
                                  <path d="M5 12l7 7 7-7" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveTemplateFromLayout(templateId)}
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[var(--muted)] transition hover:text-red-200"
                                aria-label="Retirer"
                                title="Retirer"
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
                                  <path d="M18 6L6 18" />
                                  <path d="M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Ajouter une section existante
                  </p>
                  <div className="mt-2 space-y-2">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
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
                          <circle cx="11" cy="11" r="7" />
                          <path d="M21 21l-4.3-4.3" />
                        </svg>
                      </span>
                      <input
                        type="search"
                        role="combobox"
                        value={layoutTemplateSearch}
                        onChange={(event) => {
                          setLayoutTemplateSearch(event.target.value);
                          setLayoutTemplateSearchOpen(true);
                        }}
                        onFocus={() => setLayoutTemplateSearchOpen(true)}
                        onBlur={() => {
                          window.setTimeout(() => setLayoutTemplateSearchOpen(false), 120);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            setLayoutTemplateSearchOpen(false);
                            return;
                          }
                          if (event.key !== "Enter") return;
                          const first = layoutTemplateSuggestions[0];
                          if (!first?.id) return;
                          event.preventDefault();
                          handleAddTemplateToLayout(first.id as string);
                          setLayoutTemplateSearch("");
                          setLayoutTemplateSearchOpen(false);
                        }}
                        disabled={layoutAvailableTemplates.length === 0}
                        placeholder="Rechercher une section..."
                        aria-label="Rechercher une section"
                        aria-autocomplete="list"
                        aria-haspopup="listbox"
                        aria-expanded={
                          layoutTemplateSearchOpen && layoutTemplateSuggestions.length > 0
                        }
                        aria-controls="layout-template-suggestions"
                        className="w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] py-2 pl-10 pr-10 text-sm text-[var(--text)] placeholder:text-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-60"
                      />
                      {layoutTemplateSearch ? (
                        <button
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setLayoutTemplateSearch("");
                            setLayoutTemplateSearchOpen(false);
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)]"
                          aria-label="Effacer la recherche"
                          title="Effacer"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M18 6L6 18" />
                            <path d="M6 6l12 12" />
                          </svg>
                        </button>
                      ) : null}

                      {layoutTemplateSearchOpen && layoutTemplateSuggestions.length > 0 ? (
                        <div
                          id="layout-template-suggestions"
                          role="listbox"
                          className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg-elevated)] shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
                        >
                          <div className="max-h-64 overflow-auto p-2">
                            {layoutTemplateSuggestions.map((template) => {
                              const featureKey = getSectionFeatureKey(template);
                              const tone = featureKey ? featureTones[featureKey] : null;
                              const isLocked = isFeatureLocked(featureKey);
                              return (
                                <button
                                  key={`layout-suggest-${template.id}`}
                                  type="button"
                                  role="option"
                                  aria-selected={false}
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    handleAddTemplateToLayout(template.id as string);
                                    setLayoutTemplateSearch("");
                                    setLayoutTemplateSearchOpen(false);
                                  }}
                                  className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm text-[var(--text)] transition hover:bg-white/5"
                                  aria-disabled={isLocked}
                                >
                                  <span className="flex min-w-0 items-center gap-2">
                                    {tone ? (
                                      <span
                                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`}
                                      />
                                    ) : null}
                                    <span className="min-w-0 truncate">
                                      {template.title}
                                    </span>
                                  </span>
                                  {isLocked ? (
                                    <svg
                                      viewBox="0 0 24 24"
                                      className="h-4 w-4 shrink-0 text-[var(--muted)]"
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
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {layoutAvailableTemplates.length === 0 ? (
                      <span className="text-xs text-[var(--muted)]">
                        Toutes les sections sont deja dans ce layout.
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {filteredLayoutAvailableTemplates.length === 0 ? (
                          <span className="text-xs text-[var(--muted)]">
                            Aucune section ne correspond.
                          </span>
                        ) : (
                          filteredLayoutAvailableTemplates.map((template) => {
                        const featureKey = getSectionFeatureKey(template);
                        const tone = featureKey ? featureTones[featureKey] : null;
                        const isLocked = isFeatureLocked(featureKey);
                        return (
                          <button
                            key={`layout-add-${template.id}`}
                            type="button"
                            onClick={() =>
                              handleAddTemplateToLayout(template.id as string)
                            }
                            title={isLocked ? "Option requise" : "Ajouter au layout"}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition hover:bg-white/20 ${
                              tone
                                ? tone.button
                                : "border-white/10 bg-white/10 text-[var(--text)]"
                            } ${isLocked ? "cursor-not-allowed opacity-60" : ""}`}
                            aria-disabled={isLocked}
                          >
                            {tone ? (
                              <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                            ) : null}
                            {template.title}
                            {isLocked ? (
                              <svg
                                viewBox="0 0 24 24"
                                className="h-3.5 w-3.5 text-[var(--muted)]"
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
                            ) : null}
                          </button>
                        );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                    Nouvelle section
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Un titre clair guide la generation IA.
                  </p>
                  <label className="mt-3 block text-xs uppercase tracking-wide text-[var(--muted)]">
                    Nom de la section
                  </label>
                  <input
                    type="text"
                    value={layoutCustomTitle}
                    onChange={(event) => setLayoutCustomTitle(event.target.value)}
                    placeholder="Routine pre-shot"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setLayoutCustomType("text")}
                      className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition ${
                        layoutCustomType === "text"
                          ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
                          : "border-white/10 bg-white/5 text-[var(--muted)]"
                      }`}
                      aria-pressed={layoutCustomType === "text"}
                    >
                      Texte
                    </button>
                    <button
                      type="button"
                      onClick={() => setLayoutCustomType("image")}
                      className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition ${
                        layoutCustomType === "image"
                          ? "border-sky-300/30 bg-sky-400/10 text-sky-100"
                          : "border-white/10 bg-white/5 text-[var(--muted)]"
                      }`}
                      aria-pressed={layoutCustomType === "image"}
                    >
                      Image
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!radarAddonEnabled) {
                          openRadarAddonModal();
                          return;
                        }
                        setLayoutCustomType("radar");
                      }}
                      className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition ${
                        layoutCustomType === "radar"
                          ? "border-violet-300/30 bg-violet-400/10 text-violet-100"
                          : "border-white/10 bg-white/5 text-[var(--muted)]"
                      } ${!radarAddonEnabled ? "cursor-not-allowed opacity-60" : ""}`}
                      aria-pressed={layoutCustomType === "radar"}
                      aria-disabled={!radarAddonEnabled}
                    >
                      Datas
                    </button>
                  </div>
                  {layoutCustomType === "image" ? (
                    <p className="mt-2 text-[0.6rem] text-[var(--muted)]">
                      Les images seront ajoutees a la fin du rapport.
                    </p>
                  ) : layoutCustomType === "radar" ? (
                    <p className="mt-2 text-[0.6rem] text-[var(--muted)]">
                      Les graphes datas apparaissent dans le rapport.
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAddCustomTemplateToLayout}
                      className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
                    >
                      Ajouter au layout
                    </button>
                  </div>
                </div>
                {layoutMessage ? (
                  <p
                    className={`text-xs ${
                      layoutMessageType === "error"
                        ? "text-red-400"
                        : "text-[var(--muted)]"
                    }`}
                  >
                    {layoutMessage}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-white/10 px-6 py-4">
                {layoutEditingId ? (
                  <button
                    type="button"
                    onClick={async () => {
                      const layout = layouts.find((item) => item.id === layoutEditingId);
                      if (!layout) return;
                      const deleted = await handleDeleteLayout(layout);
                      if (deleted) {
                        resetLayoutEditor();
                      }
                    }}
                    className="rounded-full border border-red-400/30 bg-red-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-red-200 transition hover:bg-red-500/20"
                  >
                    Supprimer
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={resetLayoutEditor}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleSaveLayout}
                  disabled={layoutSaving}
                  className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
                >
                  {layoutSaving ? "Sauvegarde..." : "Enregistrer le layout"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {aiLayoutOpen ? (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 px-4 py-10">
            <div className="mx-auto flex w-full max-w-3xl flex-col rounded-3xl border border-white/10 bg-[var(--bg-elevated)] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
              <div className="flex items-start justify-between gap-4 p-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                    Assistant IA
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-[var(--text)]">
                    Layout optimise
                  </h3>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Reponds a quelques questions pour obtenir un layout pertinent.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAiLayoutOpen(false)}
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
              <div className="grid gap-4 px-6 pb-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      Objectif principal
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[
                        { id: "synthese", label: "Synthese" },
                        { id: "technique", label: "Technique" },
                        { id: "mental", label: "Mental" },
                        { id: "performance", label: "Performance" },
                      ].map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() =>
                            setAiLayoutAnswers((prev) => ({
                              ...prev,
                              goal: option.id,
                            }))
                          }
                          className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition ${
                            aiLayoutAnswers.goal === option.id
                              ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-100"
                              : "border-white/10 bg-white/5 text-[var(--muted)] hover:text-[var(--text)]"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      Type de seance (secteur de jeu)
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[
                        { id: "swing", label: "Swing" },
                        { id: "short_game", label: "Petit jeu" },
                        { id: "putting", label: "Putting" },
                        { id: "parcours", label: "Parcours" },
                        { id: "physique", label: "Physique" },
                      ].map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() =>
                            setAiLayoutAnswers((prev) => ({
                              ...prev,
                              sector: option.id,
                            }))
                          }
                          className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition ${
                            aiLayoutAnswers.sector === option.id
                              ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-100"
                              : "border-white/10 bg-white/5 text-[var(--muted)] hover:text-[var(--text)]"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      Focus secondaire
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[
                        { id: "plan", label: "Plan" },
                        { id: "exercices", label: "Exercices" },
                        { id: "objectifs", label: "Objectifs" },
                        { id: "images", label: "Visuel" },
                      ].map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() =>
                            setAiLayoutAnswers((prev) => ({
                              ...prev,
                              focus: option.id,
                            }))
                          }
                          className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition ${
                            aiLayoutAnswers.focus === option.id
                              ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-100"
                              : "border-white/10 bg-white/5 text-[var(--muted)] hover:text-[var(--text)]"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      Niveau de detail
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[
                        { id: "quick", label: "Rapide" },
                        { id: "standard", label: "Standard" },
                        { id: "complete", label: "Complet" },
                      ].map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            setAiLayoutCountTouched(false);
                            setAiLayoutAnswers((prev) => ({
                              ...prev,
                              detail: option.id as AiLayoutAnswers["detail"],
                            }));
                          }}
                          className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition ${
                            aiLayoutAnswers.detail === option.id
                              ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-100"
                              : "border-white/10 bg-white/5 text-[var(--muted)] hover:text-[var(--text)]"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                        Nombre de sections
                      </p>
                      <span className="text-[0.65rem] text-[var(--muted)]">
                        {aiLayoutSectionCount} section
                        {aiLayoutSectionCount > 1 ? "s" : ""}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={minAiLayoutCount}
                      max={maxAiLayoutCount}
                      step={1}
                      value={aiLayoutSectionCount}
                      onChange={(event) => {
                        setAiLayoutCountTouched(true);
                        setAiLayoutAnswers((prev) => ({
                          ...prev,
                          sectionCount: clampAiLayoutCount(Number(event.target.value)),
                        }));
                      }}
                      className="mt-3 w-full accent-emerald-300"
                      aria-label="Nombre de sections"
                    />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      Sections images
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[
                        { id: "auto", label: "Auto" },
                        { id: "yes", label: "Oui" },
                        { id: "no", label: "Non" },
                      ].map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() =>
                            setAiLayoutAnswers((prev) => ({
                              ...prev,
                              images: option.id as AiLayoutAnswers["images"],
                            }))
                          }
                          className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition ${
                            aiLayoutAnswers.images === option.id
                              ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-100"
                              : "border-white/10 bg-white/5 text-[var(--muted)] hover:text-[var(--text)]"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                    Layout propose
                  </p>
                  {aiLayoutSuggestion ? (
                    <>
                      <label className="mt-3 block text-xs uppercase tracking-wide text-[var(--muted)]">
                        Titre
                      </label>
                      <input
                        type="text"
                        value={aiLayoutTitle}
                        onChange={(event) => setAiLayoutTitle(event.target.value)}
                        placeholder={aiLayoutSuggestion.title}
                        className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                      />
                      <div className="mt-4 space-y-2">
                        {aiLayoutSuggestion.templates.map((template) => {
                          const featureKey = getSectionFeatureKey(template);
                          return (
                            <div
                              key={`ai-layout-${template.id ?? template.title}`}
                              className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)]"
                            >
                              <span>{template.title}</span>
                              {featureKey ? (
                                renderFeatureBadge(featureKey)
                              ) : (
                                <span className="text-[0.55rem] uppercase tracking-wide text-[var(--muted)]">
                                  Texte
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <p className="mt-3 text-xs text-[var(--muted)]">
                      Aucune section sauvegardee pour generer un layout.
                    </p>
                  )}
                  {aiLayoutMessage ? (
                    <p className="mt-3 text-xs text-red-400">{aiLayoutMessage}</p>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-white/10 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setAiLayoutOpen(false)}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleUseAiLayout}
                  disabled={!aiLayoutSuggestion}
                  className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-400/20 disabled:opacity-60"
                >
                  Utiliser ce layout
                </button>
                <button
                  type="button"
                  onClick={handleSaveAiLayout}
                  disabled={!aiLayoutSuggestion || aiLayoutSaving}
                  className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
                >
                  {aiLayoutSaving ? "Sauvegarde..." : "Sauvegarder"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {radarConfigOpen ? (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4">
            <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                    Datas
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-[var(--text)]">
                    Affichage du bloc datas
                  </h3>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Choisis le rendu visible dans le rapport.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseRadarSectionConfig}
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
                                    charts: Object.fromEntries(
                                      Array.from(
                                        new Set([
                                          ...Object.keys(defaultRadarConfig.charts),
                                          ...RADAR_CHART_DEFINITIONS.map(
                                            (definition) => definition.key
                                          ),
                                        ])
                                      ).map((key) => [key, false])
                                    ) as RadarConfig["charts"],
                                    options: {
                                      ...prev.options,
                                      aiSelectionKeys: [],
                                      aiNarratives: undefined,
                                      aiSelectionSummary: null,
                                      aiSessionSummary: null,
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
                                  (radarConfigDraft.options?.aiPreset ?? "standard") ===
                                  option.id
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
                        Le bouton Auto detect datas graph utilisera ces reglages.
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
                        description: "Evolution des vitesses pour estimer l efficacite.",
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
                          radarConfigDraft.mode === "custom" &&
                          radarConfigDraft.charts[item.key as keyof RadarConfig["charts"]]
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
                                        [definition.key]: !prev.charts[definition.key],
                                      },
                                    }))
                                  }
                                  className={`rounded-2xl border px-3 py-3 text-left text-[0.7rem] transition ${
                                    radarConfigDraft.mode === "custom" &&
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
                  onClick={handleCloseRadarSectionConfig}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                  disabled={radarConfigSaving}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleSaveRadarSectionConfig}
                  disabled={radarConfigSaving}
                  className="rounded-full bg-gradient-to-r from-violet-300 via-violet-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
                >
                  {radarConfigSaving ? "Sauvegarde..." : "Sauvegarder"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {radarAiQaOpen ? (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 px-4 py-10">
            <div className="mx-auto flex w-full max-w-2xl flex-col rounded-3xl border border-white/10 bg-[var(--bg-elevated)] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
              <div className="flex items-start justify-between gap-4 p-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                    IA Datas
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-[var(--text)]">
                    Q&A rapide
                  </h3>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    1 a 3 questions pour affiner le choix des graphes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRadarAiQaOpen(false)}
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
              <div className="flex flex-col gap-4 px-6 pb-6">
                {radarAiQuestionsLoading ? (
                  <p className="text-sm text-[var(--muted)]">
                    Chargement des questions IA...
                  </p>
                ) : radarAiQuestions.length ? (
                  radarAiQuestions.map((item) => (
                    <div key={item.id} className="space-y-2">
                      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                        {item.question}
                        {item.required ? " *" : ""}
                      </p>
                      {item.type === "choices" ? (
                        <div className="flex flex-wrap gap-2">
                          {item.choices?.map((choice) => (
                            <button
                              key={choice}
                              type="button"
                              onClick={() =>
                                setRadarAiQaAnswers((prev) => ({
                                  ...prev,
                                  [item.id]: choice,
                                }))
                              }
                              className={`rounded-full border px-3 py-1 text-[0.6rem] uppercase tracking-wide transition ${
                                radarAiQaAnswers[item.id] === choice
                                  ? "border-violet-300/40 bg-violet-400/10 text-violet-100"
                                  : "border-white/10 bg-white/5 text-[var(--muted)] hover:text-[var(--text)]"
                              }`}
                            >
                              {choice}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <textarea
                          value={radarAiQaAnswers[item.id] ?? ""}
                          onChange={(event) =>
                            setRadarAiQaAnswers((prev) => ({
                              ...prev,
                              [item.id]: event.target.value,
                            }))
                          }
                          placeholder={item.placeholder}
                          rows={2}
                          className="w-full resize-none rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                        />
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[var(--muted)]">
                    Aucune question supplementaire pour cette seance.
                  </p>
                )}
                {radarAiQaError ? (
                  <p className="text-xs text-red-400">{radarAiQaError}</p>
                ) : null}
                <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setRadarAiQaOpen(false)}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                    disabled={radarAiAutoBusy}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAutoDetectRadarGraphs(radarAiQaAnswers)}
                    className="rounded-full bg-gradient-to-r from-violet-300 via-violet-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
                    disabled={
                      radarAiAutoBusy ||
                      radarAiQuestionsLoading ||
                      radarAiQuestions.some(
                        (item) => item.required && !radarAiQaAnswers[item.id]
                      )
                    }
                  >
                    {radarAiAutoBusy ? (
                      <span className="flex items-center gap-1">
                        Analyse
                        <span className="tpi-dots" aria-hidden="true">
                          <span />
                          <span />
                          <span />
                        </span>
                      </span>
                    ) : (
                      "Lancer l IA"
                    )}
                  </button>
                </div>
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
        <PremiumOfferModal
          open={premiumModalOpen}
          onClose={closePremiumModal}
          notice={premiumNotice}
        />
        {aiAssistantModalOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby={aiAssistantTitleId}
          >
            <button
              type="button"
              aria-label="Fermer"
              className="absolute inset-0 bg-black/35 backdrop-blur-sm"
              onClick={() => setAiAssistantModalOpen(false)}
            />
            <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg-elevated)] shadow-[var(--shadow-strong)]">
              <div className="relative border-b border-white/10 px-6 py-4">
                <h3
                  id={aiAssistantTitleId}
                  className="text-center text-base font-semibold text-[var(--text)]"
                >
                  Assistant IA
                </h3>
                <button
                  type="button"
                  onClick={() => setAiAssistantModalOpen(false)}
                  className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)]"
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
                    aria-hidden="true"
                  >
                    <path d="M18 6L6 18" />
                    <path d="M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                    Assistant IA
                  </p>
                  <span
                    className={`rounded-md border border-dashed px-2 py-1 text-[0.55rem] uppercase tracking-wide select-none ${
                      aiEnabled
                        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                        : "border-amber-300/30 bg-amber-400/10 text-amber-200"
                    }`}
                    onClick={!aiEnabled ? () => openPremiumModal() : undefined}
                    role={!aiEnabled ? "button" : undefined}
                    aria-label={!aiEnabled ? "Voir les offres" : undefined}
                  >
                    {aiStatusLabel}
                  </span>
                </div>
                {radarAiAutoBusy ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                      <span>
                        Auto detect datas graph
                        <span className="tpi-dots" aria-hidden="true">
                          <span />
                          <span />
                          <span />
                        </span>
                      </span>
                      <span className="min-w-[3ch] text-right text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                        {Math.round(radarAiAutoProgress)}%
                      </span>
                    </div>
                    <div className="mt-1 text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                      Mode:{" "}
                      {radarAiAutoPreset === "ultra"
                        ? "Ultra focus (1 min)"
                        : "Standard (4 min)"}
                    </div>
                    <div className="mt-2 h-2 w-full rounded-full bg-white/10">
                      <div
                        className="h-2 rounded-full bg-violet-300 transition-all duration-700 ease-out"
                        style={{ width: `${radarAiAutoProgress}%` }}
                      />
                    </div>
                  </div>
                ) : null}
                {aiError ? <p className="text-xs text-red-400">{aiError}</p> : null}
                <div className="rounded-2xl bg-white/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                      Travail en cours
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={aiFullLocked || !!aiBusyId}
                        onClick={resetWorkingContext}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-60"
                      >
                        Reinitialiser
                      </button>
                      <button
                        type="button"
                        disabled={!!aiBusyId}
                        onClick={() => {
                          if (aiFullLocked) {
                            openPremiumModal();
                            return;
                          }
                          handleAiPropagateFromWorking();
                        }}
                        className={`rounded-full border px-3.5 py-1.5 text-[0.65rem] font-semibold uppercase tracking-wide transition disabled:opacity-60 ${
                          aiFullLocked
                            ? "border-amber-300/35 bg-amber-400/15 text-amber-200"
                            : "border-emerald-300/40 bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 text-zinc-900 shadow-[0_10px_24px_rgba(16,185,129,0.3)] hover:brightness-105"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          {aiFullLocked ? (
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
                          ) : (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M5 12h14" />
                              <path d="M13 6l6 6-6 6" />
                            </svg>
                          )}
                          {aiBusyId === "propagate" ? "IA..." : "Propager"}
                        </span>
                      </button>
                    </div>
                  </div>
                  {aiBusyId ? (
                    <div className="mt-2 flex items-center gap-2 text-xs text-[var(--muted)]">
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/10 bg-white/10">
                        <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
                      </span>
                      Traitement IA en cours...
                    </div>
                  ) : null}
                  <div className="mt-3 grid gap-3">
                    <div>
                      <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                        Club concerne
                      </label>
                      <input
                        type="text"
                        value={workingClub}
                        onChange={(event) => setWorkingClub(event.target.value)}
                        placeholder="Ex: Fer 7, Driver, Putter..."
                        className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                        Constats
                      </label>
                      <textarea
                        ref={(node) => {
                          workingObservationsRef.current = node;
                          if (node) {
                            node.style.height = `${node.scrollHeight}px`;
                          }
                        }}
                        rows={3}
                        placeholder="Ex: chemin de club trop a gauche, perte de posture..."
                        value={workingObservations}
                        onInput={handleWorkingObservationsInput}
                        className="mt-2 w-full resize-none overflow-hidden rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                        Travail en cours
                      </label>
                      <textarea
                        ref={(node) => {
                          workingNotesRef.current = node;
                          if (node) {
                            node.style.height = `${node.scrollHeight}px`;
                          }
                        }}
                        rows={3}
                        placeholder="Ex: stabiliser l'appui pied droit au backswing."
                        value={workingNotes}
                        onInput={handleWorkingNotesInput}
                        className="mt-2 w-full resize-none overflow-hidden rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                      />
                    </div>
                  </div>
                </div>
                {aiSummary ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                      Resume IA
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text)]">
                      {aiSummary}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
        {aiSettingsModalOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby={aiSettingsTitleId}
          >
            <button
              type="button"
              aria-label="Fermer"
              className="absolute inset-0 bg-black/35 backdrop-blur-sm"
              onClick={() => setAiSettingsModalOpen(false)}
            />
            <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg-elevated)] shadow-[var(--shadow-strong)]">
              <div className="relative border-b border-white/10 px-6 py-4">
                <h3
                  id={aiSettingsTitleId}
                  className="text-center text-base font-semibold text-[var(--text)]"
                >
                  Reglages IA
                </h3>
                <button
                  type="button"
                  onClick={() => setAiSettingsModalOpen(false)}
                  className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)]"
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
                    aria-hidden="true"
                  >
                    <path d="M18 6L6 18" />
                    <path d="M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-5">
                <div className="flex items-center justify-between gap-3 rounded-2xl border-white/10 bg-white/5 px-4 py-3">
                  <div>
                    <p className="text-[0.65rem] uppercase tracking-[0.2em] text-[var(--muted)]">
                      Validation apres propagation
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {aiPropagationReview
                        ? "Le coach valide chaque section avant insertion."
                        : "L IA remplit automatiquement les sections."}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={aiPropagationReview}
                    aria-label="Basculer la validation apres propagation"
                    onClick={() => setAiPropagationReview((prev) => !prev)}
                    disabled={aiFullLocked}
                    className={`relative inline-flex h-8 w-14 items-center rounded-full border px-1 transition ${
                      aiFullLocked
                        ? "cursor-not-allowed border-white/10 bg-white/5 opacity-60"
                        : "border-white/10 bg-white/10 hover:border-white/30"
                    }`}
                  >
                    <span
                      className={`absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border text-[0.55rem] font-semibold uppercase shadow-[0_6px_12px_rgba(0,0,0,0.25)] transition-transform ${
                        aiPropagationReview
                          ? "translate-x-0 border-emerald-300/40 bg-emerald-400/20 text-emerald-100"
                          : "translate-x-6 border-rose-300/40 bg-rose-400/20 text-rose-100"
                      }`}
                    >
                      {aiPropagationReview ? "On" : "Off"}
                    </span>
                  </button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-[var(--muted)]">
                    Reinitialise les reglages IA aux valeurs par defaut.
                  </p>
                  <button
                    type="button"
                    onClick={resetAiSettings}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                  >
                    Reinitialiser IA
                  </button>
                </div>
                <div className="grid gap-3">
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
            </div>
          </div>
        ) : null}
        {sectionLibraryOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby={sectionLibraryTitleId}
          >
            <button
              type="button"
              aria-label="Fermer"
              className="absolute inset-0 bg-black/35 backdrop-blur-sm"
              onClick={() => {
                if (sectionCreateModalOpen) return;
                setSectionLibraryOpen(false);
              }}
            />

            <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg-elevated)] shadow-[var(--shadow-strong)]">
              <div className="relative border-b border-white/10 px-6 py-4">
                <h3
                  id={sectionLibraryTitleId}
                  className="text-center text-base font-semibold text-[var(--text)]"
                >
                  Sections disponibles
                </h3>
                <button
                  type="button"
                  onClick={() => setSectionLibraryOpen(false)}
                  className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)]"
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
                    aria-hidden="true"
                  >
                    <path d="M18 6L6 18" />
                    <path d="M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-[var(--muted)]">
                    Ajoute une section au rapport ou cree une nouvelle section.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSectionsNotice("", "idle");
                      setCustomSection("");
                      setCustomType("text");
                      setSectionCreateModalOpen(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/10"
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
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>
                    Creer une section
                  </button>
                </div>

                <div className="mt-4">
                  <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Filtre par type de section
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {SECTION_LIBRARY_FILTERS.map((filterOption) => {
                      const isActive = sectionLibraryTypeFilter === filterOption.value;
                      const tone =
                        filterOption.value === "text"
                          ? {
                              active:
                                "border-emerald-300/50 bg-emerald-400/25 text-emerald-100",
                              idle:
                                "border-emerald-300/40 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20",
                            }
                          : filterOption.value === "image"
                            ? {
                                active:
                                  "border-sky-300/50 bg-sky-400/30 text-sky-100",
                                idle:
                                  "border-sky-300/40 bg-sky-400/15 text-sky-100 hover:bg-sky-400/25",
                              }
                            : filterOption.value === "video"
                              ? {
                                active:
                                    "border-rose-300/40 bg-rose-400/20 text-rose-100",
                                idle:
                                    "border-rose-300/35 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20",
                                }
                              : filterOption.value === "radar"
                                ? {
                                    active:
                                      "border-violet-300/50 bg-violet-400/25 text-violet-100",
                                    idle:
                                      "border-violet-300/40 bg-violet-400/15 text-violet-200 hover:bg-violet-400/25",
                                  }
                                : {
                                    active:
                                      "border-white/20 bg-white/10 text-[var(--text)]",
                                    idle:
                                      "border-white/10 bg-white/5 text-[var(--muted)] hover:text-[var(--text)]",
                                  };
                      return (
                        <button
                          key={`section-library-filter-${filterOption.value}`}
                          type="button"
                          onClick={() => setSectionLibraryTypeFilter(filterOption.value)}
                          className={`rounded-full border px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-wide transition ${
                            isActive ? tone.active : tone.idle
                          }`}
                          aria-pressed={isActive}
                        >
                          {filterOption.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4">
                  <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Recherche
                  </label>
                  <input
                    type="search"
                    value={sectionSearch}
                    onChange={(event) => setSectionSearch(event.target.value)}
                    placeholder="Chercher une section"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                  />
                </div>

                <div className="mt-4 space-y-3">
                  {templatesLoading ? (
                    <p className="text-xs text-[var(--muted)]">Chargement des sections...</p>
                  ) : filteredSectionLibrarySections.length === 0 ? (
                    <p className="text-xs text-[var(--muted)]">
                      Aucune section pour ce filtre.
                    </p>
                  ) : (
                    filteredSectionLibrarySections.map((section) => {
                      const featureKey = getSectionFeatureKey(section);
                      const isLocked = isFeatureLocked(featureKey);
                      return (
                        <div
                          key={`library-${section.title}-${section.type}`}
                          className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm text-[var(--text)]">{section.title}</p>
                            <div className="mt-1">
                              {renderFeatureBadge(featureKey) ?? (
                                <span className="text-[0.55rem] uppercase tracking-wide text-[var(--muted)]">
                                  Texte
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (isLocked) {
                                openFeatureModal(featureKey);
                                return;
                              }
                              handleAddToReport(section);
                            }}
                            title={isLocked ? "Option requise" : "Ajouter"}
                            className={`flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[var(--text)] transition hover:bg-white/20 ${
                              isLocked ? "cursor-not-allowed opacity-60" : ""
                            }`}
                            aria-label="Ajouter au rapport"
                            aria-disabled={isLocked}
                          >
                            {isLocked ? (
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
                            ) : (
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
                            )}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                {sectionsMessage ? (
                  <p
                    className={`mt-4 text-xs ${
                      sectionsMessageType === "error" ? "text-red-400" : "text-[var(--muted)]"
                    }`}
                  >
                    {sectionsMessage}
                  </p>
                ) : null}
              </div>
            </div>

            {sectionCreateModalOpen ? (
              <div
                className="fixed inset-0 z-[60] flex items-center justify-center p-4"
                role="dialog"
                aria-modal="true"
                aria-labelledby={sectionCreateTitleId}
              >
                <button
                  type="button"
                  aria-label="Fermer"
                  className="absolute inset-0 bg-black/45 backdrop-blur-sm"
                  onClick={() => setSectionCreateModalOpen(false)}
                />
                <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg-elevated)] shadow-[var(--shadow-strong)]">
                  <div className="relative border-b border-white/10 px-6 py-4">
                    <h3
                      id={sectionCreateTitleId}
                      className="text-center text-base font-semibold text-[var(--text)]"
                    >
                      Creer une section
                    </h3>
                    <button
                      type="button"
                      onClick={() => setSectionCreateModalOpen(false)}
                      className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)]"
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
                        aria-hidden="true"
                      >
                        <path d="M18 6L6 18" />
                        <path d="M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="space-y-4 px-6 py-5">
                    <label className="block text-xs uppercase tracking-wide text-[var(--muted)]">
                      Nom de la section
                    </label>
                    <input
                      type="text"
                      value={customSection}
                      onChange={(event) => setCustomSection(event.target.value)}
                      placeholder="Ex: Routine pre-shot"
                      className="-mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
                        Type
                      </span>
                      <button
                        type="button"
                        onClick={() => setCustomType("text")}
                        className={`rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide transition ${
                          customType === "text"
                            ? "border-emerald-300/40 bg-emerald-400/15 text-emerald-100"
                            : "border-white/10 bg-white/5 text-[var(--muted)]"
                        }`}
                        aria-pressed={customType === "text"}
                      >
                        Texte
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomType("image")}
                        className={`rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide transition ${
                          customType === "image"
                            ? "border-sky-300/40 bg-sky-400/20 text-sky-100"
                            : "border-white/10 bg-white/5 text-[var(--muted)]"
                        }`}
                        aria-pressed={customType === "image"}
                      >
                        Image
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomType("video")}
                        className={`rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide transition ${
                          customType === "video"
                            ? "border-pink-400 bg-pink-200 text-pink-700"
                            : "border-white/10 bg-white/5 text-[var(--muted)]"
                        }`}
                        aria-pressed={customType === "video"}
                      >
                        Video
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!radarAddonEnabled) {
                            openRadarAddonModal();
                            return;
                          }
                          setCustomType("radar");
                        }}
                        className={`rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide transition ${
                          customType === "radar"
                            ? "border-violet-300/40 bg-violet-400/20 text-violet-100"
                            : "border-white/10 bg-white/5 text-[var(--muted)]"
                        }`}
                        aria-pressed={customType === "radar"}
                      >
                        Datas
                      </button>
                    </div>
                    {customType === "image" ? (
                      <p className="text-[0.7rem] text-[var(--muted)]">
                        Image: upload d images et legendes.
                      </p>
                    ) : customType === "video" ? (
                      <p className="text-[0.7rem] text-[var(--muted)]">
                        Video: 1 section max par rapport, {VIDEO_PER_SECTION_LIMIT} videos max
                        (max {VIDEO_DURATION_LIMIT_SECONDS}s chacune).
                      </p>
                    ) : customType === "radar" ? (
                      <p className="text-[0.7rem] text-[var(--muted)]">
                        Datas: import d exports et graphes.
                      </p>
                    ) : (
                      <p className="text-[0.7rem] text-[var(--muted)]">
                        Texte: section ecrite libre.
                      </p>
                    )}
                    {sectionsMessage ? (
                      <p
                        className={`text-xs ${
                          sectionsMessageType === "error" ? "text-red-400" : "text-[var(--muted)]"
                        }`}
                      >
                        {sectionsMessage}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-end gap-3 border-t border-white/10 px-6 py-4">
                    <button
                      type="button"
                      onClick={() => setSectionCreateModalOpen(false)}
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-[var(--text)] transition hover:bg-white/10"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const created = await handleAddCustomSection();
                        if (!created) return;
                        setSectionCreateModalOpen(false);
                      }}
                      className="rounded-xl bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-5 py-2 text-sm font-semibold text-zinc-900 transition hover:opacity-90"
                    >
                      Creer
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {studentPickerOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby={studentPickerTitleId}
          >
            <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" />

            <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg-elevated)] shadow-[var(--shadow-strong)]">
              <div className="border-b border-white/10 px-6 py-4">
                <h3
                  id={studentPickerTitleId}
                  className="text-center text-base font-semibold text-[var(--text)]"
                >
                  Choisir un eleve
                </h3>
                <p className="mt-1 text-center text-xs text-[var(--muted)]">
                  Selection obligatoire pour continuer la creation du rapport.
                </p>
              </div>

              <div className="px-6 py-5">
                <label className="text-xs font-medium text-[var(--text)]">
                  Rechercher
                </label>
                <input
                  type="text"
                  value={studentPickerQuery}
                  onChange={(event) => setStudentPickerQuery(event.target.value)}
                  placeholder="Nom ou email..."
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                />

                <div className="mt-4 max-h-[45vh] overflow-y-auto rounded-2xl border border-white/10 bg-white/5 p-2">
                  {studentsLoading && !studentsLoaded ? (
                    <div className="px-3 py-8 text-center text-sm text-[var(--muted)]">
                      Chargement des eleves...
                    </div>
                  ) : studentPickerCandidates.length === 0 ? (
                    <div className="px-3 py-8 text-center text-sm text-[var(--muted)]">
                      Aucun eleve trouve.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {studentPickerCandidates.map((student) => (
                        <button
                          key={student.id}
                          type="button"
                          onClick={() => {
                            setStudentId(student.id);
                            setStudentPickerOpen(false);
                            setStudentPickerQuery("");
                          }}
                          className="w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-3 text-left text-sm text-[var(--text)] transition hover:bg-white/10"
                        >
                          <p className="font-semibold">
                            {student.first_name} {student.last_name ?? ""}
                          </p>
                          {student.email ? (
                            <p className="mt-1 text-xs text-[var(--muted)]">
                              {student.email}
                            </p>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStudentPickerOpen(false);
                      setStudentPickerQuery("");
                      setBuilderStep("sections");
                    }}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                  >
                    Retour
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/app/coach/rapports")}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {radarImportOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby={radarImportTitleId}
          >
            <button
              type="button"
              aria-label="Fermer"
              className="absolute inset-0 bg-black/35 backdrop-blur-sm"
              onClick={closeRadarImportModal}
            />

            <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg-elevated)] shadow-[var(--shadow-strong)]">
              <div className="relative border-b border-white/10 px-6 py-4">
                <h3
                  id={radarImportTitleId}
                  className="text-center text-base font-semibold text-[var(--text)]"
                >
                  Importer un fichier datas
                </h3>
                <button
                  type="button"
                  onClick={closeRadarImportModal}
                  className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)]"
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
                    aria-hidden="true"
                  >
                    <path d="M18 6L6 18" />
                    <path d="M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="px-6 py-5">
                <label className="text-xs font-medium text-[var(--text)]">
                  Technologie
                </label>
                <select
                  value={radarImportTech}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (!isRadarTech(next)) {
                      setRadarImportError("Technologie datas invalide.");
                      return;
                    }
                    setRadarImportError("");
                    setRadarImportTech(next);
                  }}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text)]"
                >
                  {RADAR_TECH_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {radarImportError ? (
                  <p className="mt-2 text-xs text-red-400">{radarImportError}</p>
                ) : null}

                <div className="mt-6 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeRadarImportModal}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!radarImportSectionId) {
                        setRadarImportError("Section datas introuvable.");
                        return;
                      }
                      if (!isRadarTech(radarImportTech)) {
                        setRadarImportError("Technologie datas invalide.");
                        return;
                      }
                      radarTechRef.current = radarImportTech;
                      setRadarTech(radarImportTech);
                      const input = document.getElementById(
                        `radar-upload-${radarImportSectionId}`
                      );
                      if (input instanceof HTMLInputElement) {
                        input.click();
                      } else {
                        setRadarImportError("Import indisponible.");
                        return;
                      }
                      closeRadarImportModal();
                    }}
                    className="rounded-full bg-gradient-to-r from-amber-300 via-amber-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90"
                  >
                    Continuer
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {clarifyOpen ? (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 px-4 py-10">
            <div className="mx-auto flex w-full max-w-2xl flex-col rounded-3xl border border-white/10 bg-[var(--bg-elevated)] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
              <div className="flex items-start justify-between gap-4 p-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                    Assistant IA
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-[var(--text)]">
                    Precisions rapides
                  </h3>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Quelques questions pour affiner la propagation et eviter toute
                    approximation.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeClarifyModal}
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
              <div className="flex flex-wrap items-center gap-2 px-6 text-xs text-[var(--muted)]">
                <Badge tone="muted" size="sm">
                  {clarifyQuestions.length} question
                  {clarifyQuestions.length > 1 ? "s" : ""}
                </Badge>
                {clarifyConfidence !== null ? (
                  <Badge
                    size="sm"
                    className={
                      clarifyConfidence >= CLARIFY_THRESHOLD
                        ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200"
                        : "border-amber-300/30 bg-amber-400/10 text-amber-200"
                    }
                  >
                    Certitude {Math.round(clarifyConfidence * 100)}%
                  </Badge>
                ) : null}
              </div>
              <div className="mt-5 max-h-[60vh] space-y-4 overflow-y-auto px-6 pb-6">
                {clarifyQuestions.map((question, index) => {
                  const value = clarifyAnswers[question.id];
                  const customValue = clarifyCustomAnswers[question.id] ?? "";
                  return (
                    <div
                      key={question.id}
                      className="rounded-2xl border border-white/10 bg-white/5 p-4"
                    >
                      <p className="text-sm font-semibold text-[var(--text)]">
                        {index + 1}. {question.question}
                      </p>
                      {question.type === "choices" &&
                      question.choices &&
                      question.choices.length > 0 ? (
                        <div className="mt-3 space-y-3">
                          <div className="flex flex-wrap gap-2">
                            {question.choices.map((choice) => {
                              const selected = Array.isArray(value)
                                ? value.includes(choice)
                                : value === choice;
                              return (
                                <button
                                  key={`${question.id}-${choice}`}
                                  type="button"
                                  onClick={() => {
                                    setClarifyAnswers((prev) => {
                                      const current = prev[question.id];
                                      if (question.multi) {
                                        const list = Array.isArray(current)
                                          ? current
                                          : [];
                                        const next = list.includes(choice)
                                          ? list.filter((item) => item !== choice)
                                          : [...list, choice];
                                        return { ...prev, [question.id]: next };
                                      }
                                      return { ...prev, [question.id]: choice };
                                    });
                                  }}
                                  className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition ${
                                    selected
                                      ? "border-emerald-300/40 bg-emerald-400/20 text-emerald-100"
                                      : "border-white/10 bg-white/5 text-[var(--muted)] hover:text-[var(--text)]"
                                  }`}
                                >
                                  {choice}
                                </button>
                              );
                            })}
                          </div>
                          <div>
                            <label className="text-[0.65rem] uppercase tracking-wide text-[var(--muted)]">
                              Autre (optionnel)
                            </label>
                            <input
                              type="text"
                              value={customValue}
                              onChange={(event) =>
                                setClarifyCustomAnswers((prev) => ({
                                  ...prev,
                                  [question.id]: event.target.value,
                                }))
                              }
                              placeholder="Ta reponse perso..."
                              className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                            />
                          </div>
                        </div>
                      ) : (
                        <textarea
                          rows={2}
                          value={typeof value === "string" ? value : ""}
                          onChange={(event) =>
                            setClarifyAnswers((prev) => ({
                              ...prev,
                              [question.id]: event.target.value,
                            }))
                          }
                          placeholder={question.placeholder ?? "Ta reponse..."}
                          className="mt-3 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-white/10 px-6 py-4">
                <button
                  type="button"
                  onClick={closeClarifyModal}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleConfirmClarify}
                  disabled={!isClarifyComplete || aiBusyId === "propagate"}
                  className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
                >
                  {aiBusyId === "propagate"
                    ? "Propagation..."
                    : "Continuer la propagation"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {axesOpen ? (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 px-4 py-10">
            <div className="mx-auto flex w-full max-w-3xl flex-col rounded-3xl border border-white/10 bg-[var(--bg-elevated)] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
              <div className="flex items-start justify-between gap-4 p-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                    Assistant IA
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-[var(--text)]">
                    Choisir un axe par section
                  </h3>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Selectionne l angle de reponse le plus pertinent pour chaque section.
                    L IA generera ensuite le contenu.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeAxesModal}
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
              <div className="mt-2 max-h-[60vh] space-y-4 overflow-y-auto px-6 pb-6">
                {axesBySection.map((entry) => (
                  <div
                    key={entry.section}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <p className="text-sm font-semibold text-[var(--text)]">
                      {entry.section}
                    </p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {entry.options.map((option) => {
                        const selected = axesSelection[entry.section] === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() =>
                              setAxesSelection((prev) => ({
                                ...prev,
                                [entry.section]: option.id,
                              }))
                            }
                            className={`rounded-2xl border p-3 text-left text-sm transition ${
                              selected
                                ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-100"
                                : "border-white/10 bg-white/5 text-[var(--muted)] hover:text-[var(--text)]"
                            }`}
                          >
                            <p className="text-sm font-semibold text-[var(--text)]">
                              {option.title}
                            </p>
                            <p className="mt-1 text-xs text-[var(--muted)]">
                              {option.summary}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-white/10 px-6 py-4">
                <button
                  type="button"
                  onClick={closeAxesModal}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAxes}
                  disabled={aiBusyId === "propagate"}
                  className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
                >
                  {aiBusyId === "propagate" ? "Propagation..." : "Lancer la propagation"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {hasGlobalProcessingOverlay ? (
          <div
            className="fixed inset-0 z-[90] flex cursor-wait items-center justify-center bg-[var(--overlay)] backdrop-blur-md"
            aria-live="polite"
            aria-busy="true"
          >
            <div
              role="status"
              className="flex min-w-[17rem] flex-col items-center gap-4 rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-5 text-[var(--text)] shadow-[var(--shadow-strong)]"
            >
              <span className="global-loader-spinner" aria-hidden="true">
                <span className="global-loader-ring-base" />
                <span className="global-loader-ring-outer" />
                <span className="global-loader-ring-inner" />
                <span className="global-loader-core" />
              </span>
              <p className="text-center text-sm font-semibold tracking-wide text-[var(--text)]">
                {globalProcessingLabel}
                <span className="global-loader-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </p>
              <span className="text-[0.62rem] uppercase tracking-[0.2em] text-[var(--muted)]">
                Merci de patienter
              </span>
            </div>
          </div>
        ) : null}
      </>
    </RoleGuard>
  );
}
