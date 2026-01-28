"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { defaultSectionTemplates } from "@/lib/default-section-templates";
import RoleGuard from "../../../_components/role-guard";
import { useProfile } from "../../../_components/profile-context";
import PageBack from "../../../_components/page-back";
import PremiumOfferModal from "../../../_components/premium-offer-modal";
import RadarCharts, {
  defaultRadarConfig,
  type RadarConfig,
  type RadarColumn,
  type RadarShot,
  type RadarStats,
} from "../../../_components/radar-charts";
import {
  RADAR_CHART_DEFINITIONS,
  RADAR_CHART_GROUPS,
} from "@/lib/radar/charts/registry";
import type { RadarAnalytics } from "@/lib/radar/types";

type SectionType = "text" | "image" | "radar";

type SectionTemplate = {
  id?: string;
  title: string;
  type: SectionType;
  tags?: string[];
};

const starterSections: SectionTemplate[] = defaultSectionTemplates;

const sectionTagMap = new Map(
  starterSections.map((section) => [
    section.title.toLowerCase(),
    section.tags ?? [],
  ])
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
  mediaUrls: string[];
  mediaCaptions: string[];
  radarFileId?: string | null;
  radarConfig?: RadarConfig | null;
};

type RadarFile = {
  id: string;
  status: "processing" | "ready" | "error";
  original_name: string | null;
  columns: RadarColumn[];
  shots: RadarShot[];
  stats: RadarStats | null;
  summary: string | null;
  config: RadarConfig | null;
  analytics?: RadarAnalytics | null;
  created_at: string;
  error: string | null;
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
  savedAt: string;
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
    question: "Objectif principal de la seance radar ?",
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

const isSummaryTitle = (title: string) =>
  /resume|synthese|bilan/i.test(title);

const isPlanTitle = (title: string) =>
  /plan|planning|programme|routine|semaine/i.test(title);

const normalizeSectionType = (value?: string | null): SectionType =>
  value === "image" ? "image" : value === "radar" ? "radar" : "text";

type FeatureKey = "ai" | "image" | "radar" | "tpi";

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
  radar: {
    label: "Radar",
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
  const table: Uint16Array[] = Array.from(
    { length: rows },
    () => new Uint16Array(cols)
  );

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
  const { organization, userEmail } = useProfile();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const isEditing = Boolean(editingReportId);
  const isNewReport = !editingReportId;
  const draftKey = "gc.reportDraft.new";
  const draftTimer = useRef<number | null>(null);
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
  const [layoutCustomType, setLayoutCustomType] =
    useState<SectionType>("text");
  const initialBuilderStep = searchParams.get("reportId")
    ? "report"
    : "layout";
  const [builderStep, setBuilderStep] = useState<
    "layout" | "sections" | "report"
  >(initialBuilderStep);
  const [selectedLayoutOptionId, setSelectedLayoutOptionId] = useState("");
  const [sectionsPanelCollapsed, setSectionsPanelCollapsed] = useState(true);
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
  const [aiLayoutOption, setAiLayoutOption] = useState<LayoutOption | null>(
    null
  );
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
  const [reportSections, setReportSections] =
    useState<ReportSection[]>(defaultReportSections.map(createSection));
  const [customSection, setCustomSection] = useState("");
  const [customType, setCustomType] = useState<SectionType>("text");
  const [sectionSearch, setSectionSearch] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [draggingAvailable, setDraggingAvailable] =
    useState<SectionTemplate | null>(null);
  const [sectionsMessage, setSectionsMessage] = useState("");
  const [sectionsMessageType, setSectionsMessageType] = useState<
    "idle" | "error" | "success"
  >("idle");
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [dragEnabled, setDragEnabled] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({});
  const itemRefs = useRef(new Map<string, HTMLDivElement | null>());
  const positions = useRef(new Map<string, DOMRect>());
  const shouldAnimate = useRef(false);
  const skipResetRef = useRef(false);
  const showSlots = dragEnabled && (dragIndex !== null || draggingAvailable !== null);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [radarFiles, setRadarFiles] = useState<RadarFile[]>([]);
  const [radarLoading, setRadarLoading] = useState(false);
  const [radarError, setRadarError] = useState("");
  const [radarUploading, setRadarUploading] = useState(false);
  const [radarUploadProgress, setRadarUploadProgress] = useState(0);
  const [radarUploadBatch, setRadarUploadBatch] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const radarUploadTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const radarInputRef = useRef<HTMLInputElement | null>(null);
  const [radarSessionFileIds, setRadarSessionFileIds] = useState<string[]>([]);
  const [radarConfigOpen, setRadarConfigOpen] = useState(false);
  const [radarConfigDraft, setRadarConfigDraft] =
    useState<RadarConfig>(defaultRadarConfig);
  const [radarConfigSectionId, setRadarConfigSectionId] = useState<string | null>(
    null
  );
  const [radarConfigSaving, setRadarConfigSaving] = useState(false);
  const [radarConfigError, setRadarConfigError] = useState("");
  const [tpiContext, setTpiContext] = useState("");
  const [studentId, setStudentId] = useState("");
  const [title, setTitle] = useState("");
  const [reportDate, setReportDate] = useState(() =>
    formatDateInput(new Date())
  );
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState<"idle" | "error" | "success">(
    "idle"
  );
  const [saving, setSaving] = useState(false);
  const [aiTone, setAiTone] = useState("bienveillant");
  const [aiTechLevel, setAiTechLevel] = useState("intermediaire");
  const [aiStyle, setAiStyle] = useState("redactionnel");
  const [aiLength, setAiLength] = useState("normal");
  const [aiImagery, setAiImagery] = useState("equilibre");
  const [aiFocus, setAiFocus] = useState("mix");
  const [aiSummary, setAiSummary] = useState("");
  const [aiError, setAiError] = useState("");
  const [aiBusyId, setAiBusyId] = useState<string | null>(null);
  const [radarAiQaOpen, setRadarAiQaOpen] = useState(false);
  const [radarAiQaAnswers, setRadarAiQaAnswers] = useState<
    Record<string, string>
  >({});
  const [radarAiQuestions, setRadarAiQuestions] = useState<RadarAiQuestion[]>(
    DEFAULT_RADAR_AI_QUESTIONS
  );
  const [radarAiQuestionsLoading, setRadarAiQuestionsLoading] = useState(false);
  const [radarAiQaError, setRadarAiQaError] = useState("");
  const [radarAiAutoBusy, setRadarAiAutoBusy] = useState(false);
  const [aiPreviews, setAiPreviews] = useState<Record<string, AiPreview>>({});
  const [clarifyOpen, setClarifyOpen] = useState(false);
  const [clarifyQuestions, setClarifyQuestions] = useState<ClarifyQuestion[]>(
    []
  );
  const [clarifyAnswers, setClarifyAnswers] = useState<
    Record<string, ClarifyAnswerValue>
  >({});
  const [clarifyCustomAnswers, setClarifyCustomAnswers] = useState<
    Record<string, string>
  >({});
  const [clarifyConfidence, setClarifyConfidence] = useState<number | null>(
    null
  );
  const [pendingPropagation, setPendingPropagation] = useState<{
    payloads: PropagationPayload[];
    clarifications?: { question: string; answer: string }[];
  } | null>(null);
  const [axesOpen, setAxesOpen] = useState(false);
  const [axesLoading, setAxesLoading] = useState(false);
  const [axesBySection, setAxesBySection] = useState<AxesForSection[]>([]);
  const [axesSelection, setAxesSelection] = useState<Record<string, string>>(
    {}
  );
  const [axesPayloads, setAxesPayloads] = useState<PropagationPayload[] | null>(
    null
  );
  const [axesClarifications, setAxesClarifications] = useState<
    { question: string; answer: string }[]
  >([]);
  const textareaRefs = useRef(new Map<string, HTMLTextAreaElement | null>());
  const [workingObservations, setWorkingObservations] = useState("");
  const [workingNotes, setWorkingNotes] = useState("");
  const [workingClub, setWorkingClub] = useState("");
  const workingObservationsRef = useRef<HTMLTextAreaElement | null>(null);
  const workingNotesRef = useRef<HTMLTextAreaElement | null>(null);
  const [uploadingSections, setUploadingSections] = useState<
    Record<string, boolean>
  >({});
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
  const aiEnabled = organization?.ai_enabled ?? false;
  const radarAddonEnabled = isAdmin || organization?.radar_enabled;
  const tpiAddonEnabled = isAdmin || organization?.tpi_enabled;
  const aiLocked = !aiEnabled;
  const canUseAi = aiEnabled && !aiBusyId;
  const isDraft = !sentAt;
  const showPublish = isDraft;
  const sendLabel = "Publier le rapport";
  const saveLabel = isDraft
    ? "Enregistrer le brouillon"
    : "Enregistrer les modifications";

  const openPremiumModal = useCallback(
    (notice?: {
      title: string;
      description: string;
      tags?: string[];
      status?: { label: string; value: string }[];
    } | null) => {
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
    const needsPremium = !aiEnabled;
    openPremiumModal({
      title: "Acces radar bloque",
      description: needsPremium
        ? "Cette section est reservee aux coachs Premium IA avec l add-on Radar."
        : "Ajoute l add-on Radar pour debloquer cette section.",
      tags: needsPremium ? ["Premium IA", "Add-on Radar"] : ["Add-on Radar"],
      status: [
        {
          label: "Premium IA",
          value: aiEnabled ? "Actif" : "Inactif",
        },
        {
          label: "Add-on Radar",
          value: radarAddonEnabled ? "Actif" : "Inactif",
        },
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
        {
          label: "Premium IA",
          value: aiEnabled ? "Actif" : "Inactif",
        },
        {
          label: "Add-on TPI",
          value: tpiAddonEnabled ? "Actif" : "Inactif",
        },
      ],
    });
  }, [aiEnabled, openPremiumModal, tpiAddonEnabled]);

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

  const radarActiveFileIds = useMemo(() => {
    const ids = new Set(radarSessionFileIds);
    reportSections.forEach((section) => {
      if (section.type === "radar" && section.radarFileId) {
        ids.add(section.radarFileId);
      }
    });
    return ids;
  }, [radarSessionFileIds, reportSections]);

  const radarVisibleFiles = useMemo(
    () => radarFiles.filter((file) => radarActiveFileIds.has(file.id)),
    [radarFiles, radarActiveFileIds]
  );


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
        (template) =>
          !!template.id && !layoutTemplateIds.includes(template.id)
      ),
    [sectionTemplates, layoutTemplateIds]
  );

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
      let templates = dedupeTemplates([
        ...pickTitles(titles),
        ...pickTags(tags),
      ]);

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
    return [
      aiLayoutOption,
      ...base.filter((option) => option.id !== aiLayoutOption.id),
    ];
  }, [layouts, sectionTemplates, templateById, aiLayoutOption]);

  const selectedLayoutOption = useMemo(() => {
    const direct = layoutOptions.find(
      (option) => option.id === selectedLayoutOptionId
    );
    if (direct) return direct;
    return layoutOptions[0] ?? null;
  }, [layoutOptions, selectedLayoutOptionId]);

  const maxAiLayoutCount = useMemo(
    () => Math.max(1, Math.min(12, sectionTemplates.length)),
    [sectionTemplates.length]
  );
  const minAiLayoutCount = Math.min(3, maxAiLayoutCount);
  const clampAiLayoutCount = useCallback(
    (value: number) =>
      Math.min(maxAiLayoutCount, Math.max(minAiLayoutCount, value)),
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
  }, [
    aiLayoutAnswers.detail,
    aiLayoutCountTouched,
    getAiLayoutDefaultCount,
  ]);

  const aiLayoutSectionCount = clampAiLayoutCount(
    aiLayoutAnswers.sectionCount ||
      getAiLayoutDefaultCount(aiLayoutAnswers.detail)
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
      keywords.some((keyword) =>
        section.title.toLowerCase().includes(keyword)
      );
    const matchesTag = (section: SectionTemplate) =>
      targetTags.size > 0 &&
      (section.tags ?? []).some((tag) => targetTags.has(tag));

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
      aiLayoutAnswers.sectionCount > 0
        ? aiLayoutAnswers.sectionCount
        : defaultLimit;
    const limit = Math.min(
      clampAiLayoutCount(requestedLimit),
      candidates.length
    );

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

  const setSectionsNotice = (
    message: string,
    type: "idle" | "error" | "success"
  ) => {
    setSectionsMessage(message);
    setSectionsMessageType(type);
  };

  const setLayoutNotice = (
    message: string,
    type: "idle" | "error" | "success"
  ) => {
    setLayoutMessage(message);
    setLayoutMessageType(type);
  };

  const createSectionTemplate = async (
    title: string,
    type: SectionType
  ) => {
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

    setSectionTemplates((prev) =>
      prev.filter((section) => section.id !== template.id)
    );
    return true;
  };

  const handleAddCustomSection = async () => {
    const next = customSection.trim();
    if (!next) {
      setSectionsNotice("Saisis un nom de section.", "error");
      return;
    }
    if (customType === "radar" && !radarAddonEnabled) {
      setSectionsNotice("Add-on Radar requis pour cette section.", "error");
      openRadarAddonModal();
      return;
    }

    const exists = sectionTemplates.some(
      (section) => section.title.toLowerCase() === next.toLowerCase()
    );

    if (exists) {
      setSectionsNotice("Cette section existe deja.", "error");
      return;
    }

    const created = await createSectionTemplate(next, customType);
    if (!created) return;
    setCustomSection("");
    setCustomType("text");
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
      const exists = prev.some(
        (item) => item.title.toLowerCase() === normalized
      );
      if (exists) return prev;
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
    setReportSections((prev) =>
      prev.filter((item) => item.title !== section.title)
    );
    if (editingSection === section.title) {
      setEditingSection(null);
      setEditingValue("");
      setEditingTemplateId(null);
    }
    shouldAnimate.current = true;
  };

  const handleDragStart = (
    index: number,
    event: React.DragEvent<HTMLElement>
  ) => {
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
        const exists = prev.some(
          (item) => item.title.toLowerCase() === normalized
        );
        if (exists) return prev;
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
        section.id === id ? { ...section, content: value } : section
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

  const handleImageFiles = async (
    sectionId: string,
    files: FileList | File[]
  ) => {
    if (!organization?.id) {
      setImageErrors((prev) => ({
        ...prev,
        [sectionId]: "Organisation introuvable.",
      }));
      return;
    }

    const list = Array.from(files).filter((file) =>
      file.type.startsWith("image/")
    );
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
            mediaCaptions: [
              ...section.mediaCaptions,
              ...uploaded.map(() => ""),
            ],
          };
        })
      );
    }

    setUploadingSections((prev) => ({ ...prev, [sectionId]: false }));
  };

  const handleImageDrop = (
    sectionId: string,
    event: React.DragEvent<HTMLDivElement>
  ) => {
    event.preventDefault();
    if (event.dataTransfer.files?.length) {
      handleImageFiles(sectionId, event.dataTransfer.files);
    }
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

  const handleCaptionChange = (
    sectionId: string,
    index: number,
    value: string
  ) => {
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

  const handleWorkingNotesInput = (
    event: React.FormEvent<HTMLTextAreaElement>
  ) => {
    const target = event.currentTarget;
    const value = target.value;
    target.style.height = "auto";
    target.style.height = `${target.scrollHeight}px`;
    setWorkingNotes(value);
  };

  const handleWorkingObservationsInput = (
    event: React.FormEvent<HTMLTextAreaElement>
  ) => {
    const target = event.currentTarget;
    const value = target.value;
    target.style.height = "auto";
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
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name, email, tpi_report_id")
        .order("created_at", { ascending: false });

    if (error) {
      setStatusMessage(error.message);
      setStatusType("error");
      return;
    }

    setStudents(data ?? []);
  };

  const loadRadarFiles = async (student?: string) => {
    const targetStudentId = student ?? studentId;
    if (!targetStudentId) {
      setRadarFiles([]);
      return;
    }
    setRadarLoading(true);
    setRadarError("");

      const { data, error } = await supabase
        .from("radar_files")
        .select(
          "id, status, original_name, columns, shots, stats, summary, config, analytics, created_at, error"
        )
      .eq("student_id", targetStudentId)
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
        stats:
          file.stats && typeof file.stats === "object" ? file.stats : null,
        config:
          file.config && typeof file.config === "object" ? file.config : null,
        analytics:
          file.analytics && typeof file.analytics === "object"
            ? file.analytics
            : null,
      })) ?? [];

    setRadarFiles(normalized as RadarFile[]);
    setRadarLoading(false);
  };

  const stopRadarUploadProgress = () => {
    if (radarUploadTimer.current) {
      clearInterval(radarUploadTimer.current);
      radarUploadTimer.current = null;
    }
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
      setRadarError("Add-on Radar requis pour importer un fichier.");
      openRadarAddonModal();
      return false;
    }
    if (!studentId || !organization?.id) {
      setRadarError("Choisis un eleve avant d importer un fichier radar.");
      return false;
    }
    if (!isRadarImageFile(file)) {
      setRadarError("Importe une image Flightscope (jpg, png, heic...).");
      return false;
    }

    setRadarError("");
    setRadarUploadProgress(8);
    runRadarUploadProgress(45, 1.5, 350);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
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
          source: "flightscope",
          status: "processing",
          original_name: file.name,
          file_url: path,
          file_mime: file.type,
        },
      ])
      .select("id")
      .single();

    if (insertError || !radarRow) {
      setRadarError(insertError?.message ?? "Erreur d enregistrement radar.");
      stopRadarUploadProgress();
      setRadarUploadProgress(0);
      return false;
    }

    setRadarSessionFileIds((prev) =>
      Array.from(new Set([...prev, radarRow.id]))
    );

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
      setRadarError(payload.error ?? "Erreur lors de l extraction radar.");
      stopRadarUploadProgress();
      setRadarUploadProgress(0);
      await loadRadarFiles();
      return false;
    }

    await loadRadarFiles();
    stopRadarUploadProgress();
    setRadarUploadProgress(100);
    return true;
  };

  const handleRadarUpload = async (file: File) => {
    setRadarUploading(true);
    setRadarUploadBatch({ current: 1, total: 1 });
    await processRadarFile(file);
    setRadarUploading(false);
    setRadarUploadBatch(null);
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
  };

  const loadSectionTemplates = async () => {
    if (!organization?.id) return;
    setTemplatesLoading(true);
    setSectionsNotice("", "idle");

    const seedDefaultTemplates = async (includeTags: boolean) => {
      const payload = starterSections.map((section) => ({
        org_id: organization.id,
        title: section.title,
        type: section.type,
        tags:
          section.tags ??
          sectionTagMap.get(section.title.toLowerCase()) ??
          [],
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
            setSectionsNotice(
              "Pack initial sauvegarde pour demarrer.",
              "success"
            );
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
              ? (item as { tags?: string[] }).tags ?? []
              : sectionTagMap.get(item.title.toLowerCase()) ?? [];
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
          ? (item as { tags?: string[] }).tags ?? []
          : sectionTagMap.get(item.title.toLowerCase()) ?? [];
        return {
          id: item.id,
          title: item.title,
          type: normalizeSectionType(item.type),
          tags: itemTags,
        };
      })
    );
    setTemplatesLoading(false);
  };

  const loadLayouts = async () => {
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
  };

  const resetLayoutEditor = () => {
    setLayoutEditingId(null);
    setLayoutTitle("");
    setLayoutTemplateIds([]);
    setLayoutCustomTitle("");
    setLayoutCustomType("text");
    setLayoutEditorOpen(false);
    setLayoutNotice("", "idle");
  };

  const startCreateLayout = () => {
    setLayoutEditingId(null);
    setLayoutTitle("");
    setLayoutTemplateIds([]);
    setLayoutCustomTitle("");
    setLayoutCustomType("text");
    setLayoutEditorOpen(true);
    setLayoutNotice("", "idle");
  };

  const startEditLayout = (layout: SectionLayout) => {
    setLayoutEditingId(layout.id);
    setLayoutTitle(layout.title);
    setLayoutTemplateIds(layout.templateIds);
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

      await supabase
        .from("section_layout_items")
        .delete()
        .eq("layout_id", layoutId);
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
    const confirmed = window.confirm(
      `Supprimer le layout "${layout.title}" ?`
    );
    if (!confirmed) return false;

    const { error: itemsError } = await supabase
      .from("section_layout_items")
      .delete()
      .eq("layout_id", layout.id);

    if (itemsError) {
      setLayoutNotice(itemsError.message, "error");
      return false;
    }

    const { error } = await supabase
      .from("section_layouts")
      .delete()
      .eq("id", layout.id);

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
    if (mode === "replace") {
      setReportSections(templates.map(createSection));
      setAiPreviews({});
      setCollapsedSections({});
      setImageErrors({});
      setUploadingSections({});
      shouldAnimate.current = true;
      return;
    }

    setReportSections((prev) => {
      const existing = new Set(
        prev.map((section) => section.title.toLowerCase())
      );
      const next = [...prev];
      templates.forEach((template) => {
        const key = template.title.toLowerCase();
        if (existing.has(key)) return;
        next.push(createSection(template));
        existing.add(key);
      });
      return next;
    });
    shouldAnimate.current = true;
  };

  const applyLayoutOption = (
    option: LayoutOption,
    mode: "append" | "replace"
  ) => {
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
    setSectionsPanelCollapsed(true);
    setBuilderStep("report");
  };

  const handleSkipSetup = () => {
    setSectionsPanelCollapsed(true);
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
    if (aiLocked) {
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

  const handleReportSectionsToggle = useCallback(() => {
    setSectionsPanelCollapsed((prev) => !prev);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleToggle = () => handleReportSectionsToggle();
    window.addEventListener("gc:toggle-report-sections", handleToggle);
    return () => {
      window.removeEventListener("gc:toggle-report-sections", handleToggle);
    };
  }, [handleReportSectionsToggle]);

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
      setLayoutNotice("Add-on Radar requis pour cette section.", "error");
      openRadarAddonModal();
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

  const loadLocalDraft = () => {
    if (typeof window === "undefined") return;
    if (!isNewReport || loadingReport) return;
    const raw = window.localStorage.getItem(draftKey);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw) as LocalDraft;
      if (!draft || !Array.isArray(draft.reportSections)) return;
      setStudentId(draft.studentId ?? "");
      setTitle(draft.title ?? "");
      setReportDate(draft.reportDate ?? formatDateInput(new Date()));
      setReportSections(draft.reportSections);
      setWorkingObservations(draft.workingObservations ?? "");
      setWorkingNotes(draft.workingNotes ?? "");
      setWorkingClub(draft.workingClub ?? "");
    } catch {
      window.localStorage.removeItem(draftKey);
    }
  };

  const persistLocalDraft = () => {
    if (typeof window === "undefined") return;
    if (!isNewReport || loadingReport) return;
    const payload: LocalDraft = {
      studentId,
      title,
      reportDate,
      reportSections,
      workingObservations,
      workingNotes,
      workingClub,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(draftKey, JSON.stringify(payload));
  };

  const loadReportForEdit = async (reportId: string) => {
    setLoadingReport(true);
    setStatusMessage("");
    setStatusType("idle");

    const { data: reportData, error: reportError } = await supabase
      .from("reports")
      .select(
        "id, title, report_date, created_at, student_id, sent_at, coach_observations, coach_work, coach_club"
      )
      .eq("id", reportId)
      .single();

    if (reportError) {
      setStatusMessage(reportError.message);
      setStatusType("error");
      setLoadingReport(false);
      return;
    }

    const { data: sectionsData, error: sectionsError } = await supabase
      .from("report_sections")
      .select(
        "id, title, content, position, type, media_urls, media_captions, radar_file_id, radar_config"
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
          content: type === "text" ? section.content ?? "" : "",
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

  const resetWorkingContext = () => {
    setWorkingClub("");
    setWorkingObservations("");
    setWorkingNotes("");
    setAiError("");
  };

  const handleClearReportContent = () => {
    if (reportSections.length === 0) return;
    if (
      !window.confirm(
        "Vider le contenu de toutes les sections sans les retirer ?"
      )
    )
      return;
    setReportSections((prev) =>
      prev.map((section) => ({
        ...section,
        content: "",
        mediaUrls: [],
        mediaCaptions: [],
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
    const contextBlocks = [
      ...textSections,
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
      setRadarAiQaError(
        error instanceof Error ? error.message : "Erreur IA."
      );
      setRadarAiQuestions(DEFAULT_RADAR_AI_QUESTIONS);
    } finally {
      setRadarAiQuestionsLoading(false);
    }
  };

  const handleAutoDetectRadarGraphs = async (
    answers: Record<string, string> = {}
  ) => {
    if (aiLocked) {
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
    const radarSections = reportSections.filter(
      (section) => section.type === "radar"
    );
    const aiSections = radarSections.filter((section) => {
      const config = section.radarConfig ?? defaultRadarConfig;
      return config.mode === "ai";
    });

    if (!aiSections.length) {
      setRadarAiQaError("Aucune section radar en mode IA.");
      setRadarAiAutoBusy(false);
      return;
    }

    const missingFiles = aiSections
      .filter((section) => !section.radarFileId)
      .map((section) => section.title);
    if (missingFiles.length) {
      setRadarAiQaError(
        `Selectionne un fichier radar pour: ${missingFiles.join(", ")}.`
      );
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
          radarSections: aiSections.map((section) => ({
            id: section.id,
            radarFileId: section.radarFileId,
            preset: section.radarConfig?.options?.aiPreset ?? "standard",
            syntax:
              section.radarConfig?.options?.aiSyntax ?? "exp-tech-solution",
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
          solution?: string;
        }>;
      }>;

      const updatedSections = reportSections.map((section) => {
        if (section.type !== "radar") return section;
        const baseConfig =
          section.radarConfig ??
          (section.radarFileId
            ? radarFileMap.get(section.radarFileId)?.config
            : null) ??
          defaultRadarConfig;
        if (baseConfig.mode !== "ai") return section;

        const result = results.find((item) => item.sectionId === section.id);
        if (!result) return section;

        const selectedKeys = (result.charts ?? []).map((chart) => chart.key);
        const nextCharts: Record<string, boolean> = {
          ...defaultRadarConfig.charts,
        };
        Object.keys(nextCharts).forEach((key) => {
          nextCharts[key] = selectedKeys.includes(key);
        });

        const aiNarratives = (result.charts ?? []).reduce<
          Record<string, { reason?: string | null; solution?: string | null }>
        >((acc, chart) => {
          acc[chart.key] = {
            reason: chart.reason ?? null,
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

      setReportSections(updatedSections);
      setRadarAiQaError("");
      setRadarAiQaOpen(false);
    } catch (error) {
      setRadarAiQaError(
        error instanceof Error ? error.message : "Erreur IA."
      );
    } finally {
      setRadarAiAutoBusy(false);
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
      setStatusMessage("Attends la fin des uploads d images.");
      setStatusType("error");
      return;
    }

    setSaving(true);
    setStatusMessage("");
    setStatusType("idle");

    let reportId = editingReportId;

    if (isEditing && reportId) {
      const nextSentAt = send ? new Date().toISOString() : sentAt;
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

      if (send) {
        updatePayload.sent_at = nextSentAt ?? new Date().toISOString();
      }

      const { error: updateError } = await supabase
        .from("reports")
        .update(updatePayload)
        .eq("id", reportId);

      if (updateError) {
        setStatusMessage(updateError.message);
        setStatusType("error");
        setSaving(false);
        return;
      }

      const { error: deleteError } = await supabase
        .from("report_sections")
        .delete()
        .eq("report_id", reportId);

      if (deleteError) {
        setStatusMessage(deleteError.message);
        setStatusType("error");
        setSaving(false);
        return;
      }

      setSentAt(nextSentAt ?? null);
    } else {
      const createdSentAt = send ? new Date().toISOString() : null;
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
            sent_at: createdSentAt,
          },
        ])
        .select("id")
        .single();

      if (reportError || !report) {
        setStatusMessage(reportError?.message ?? "Erreur de creation.");
        setStatusType("error");
        setSaving(false);
        return;
      }

      reportId = report.id;
      setEditingReportId(reportId);
      skipResetRef.current = true;
      router.replace(`/app/coach/rapports/nouveau?reportId=${reportId}`);
      setSentAt(createdSentAt);
    }

    if (!reportId) {
      setStatusMessage("Rapport introuvable.");
      setStatusType("error");
      setSaving(false);
      return;
    }

    const sectionsPayload = reportSections.map((section, index) => ({
      report_id: reportId,
      title: section.title,
      type: section.type,
      content: section.type === "text" ? section.content || null : null,
      media_urls: section.type === "image" ? section.mediaUrls : null,
      media_captions: section.type === "image" ? section.mediaCaptions : null,
      radar_file_id: section.type === "radar" ? section.radarFileId ?? null : null,
      radar_config: section.type === "radar" ? section.radarConfig ?? null : null,
      position: index,
    }));

    const { error: sectionsError } = await supabase
      .from("report_sections")
      .insert(sectionsPayload);

    if (sectionsError) {
      setStatusMessage(sectionsError.message);
      setStatusType("error");
      setSaving(false);
      return;
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
    setSaving(false);
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
          tpiContext: tpiContext || undefined,
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
          tpiContext: tpiContext || undefined,
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
          tpiContext: tpiContext || undefined,
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
          tpiContext: tpiContext || undefined,
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
    if (!canUseAi) return;
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
    if (!canUseAi) return;
    if (!section.content.trim()) {
      const hasContext = reportSections.some(
        (item) =>
          item.id !== section.id &&
          item.type === "text" &&
          item.content.trim()
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
          item.id === section.id ? { ...item, content: text } : item
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
    setAxesLoading(true);
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
    setAxesLoading(false);
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
        ? axesSelections.filter((item) =>
            payload.targetSections.includes(item.section)
          )
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
      if (!canUseAi) return;
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
        question:
          "Quel travail veux-tu mettre en place ? (objectif, consigne, exercice)",
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
    if (!canUseAi) return;
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
    if (!canUseAi) return;
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
          const selected = Array.isArray(value)
            ? value
            : value
            ? [String(value)]
            : [];
          const combined = customValue
            ? [...selected, customValue]
            : selected;
          if (combined.length === 0) return null;
          return { question: question.question, answer: combined.join(", ") };
        }
        const text = Array.isArray(value)
          ? value.join(", ")
          : value ?? customValue ?? "";
        return { question: question.question, answer: text };
      })
      .filter(
        (item): item is { question: string; answer: string } => item !== null
      );

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
          entry.options.find((item) => item.id === selectedId) ??
          entry.options[0];
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
        item.id === id &&
        item.content.trim() === preview.original.trim()
          ? { ...item, content: preview.suggestion }
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
            element.style.transition =
              "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)";
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
  }, [studentId]);

  useEffect(() => {
    setRadarSessionFileIds([]);
  }, [studentId, editingReportId]);

  useEffect(() => {
    return () => {
      stopRadarUploadProgress();
    };
  }, []);

  useEffect(() => {
    loadLocalDraft();
  }, [isNewReport, loadingReport]);

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
  }, [
    studentId,
    title,
    reportDate,
    reportSections,
    workingNotes,
    workingObservations,
    workingClub,
    isNewReport,
    loadingReport,
  ]);

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

  useLayoutEffect(() => {
    if (!workingNotesRef.current) return;
    workingNotesRef.current.style.height = "auto";
    workingNotesRef.current.style.height = `${workingNotesRef.current.scrollHeight}px`;
  }, [workingNotes]);

  useLayoutEffect(() => {
    if (!workingObservationsRef.current) return;
    workingObservationsRef.current.style.height = "auto";
    workingObservationsRef.current.style.height = `${workingObservationsRef.current.scrollHeight}px`;
  }, [workingObservations]);

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
  }, [organization?.id]);

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
    const studentFromQuery = searchParams.get("studentId");
    if (!studentFromQuery || studentId) return;
    const match = students.find((student) => student.id === studentFromQuery);
    if (match) {
      setStudentId(match.id);
    }
  }, [searchParams, students, studentId]);

  useEffect(() => {
    if (!studentId) {
      setTpiContext("");
      return;
    }
    const match = students.find((student) => student.id === studentId);
    if (!match) {
      setTpiContext("");
      return;
    }
    loadTpiContext(match.tpi_report_id);
  }, [studentId, students]);

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === studentId) ?? null,
    [students, studentId]
  );
  const hasReportId = Boolean(searchParams.get("reportId"));
  const activeBuilderStep =
    hasReportId || isEditing ? "report" : builderStep;
  const showLayoutTools = false;
  const isReportStep = activeBuilderStep === "report";
  const showSectionsPanel = !isReportStep || !sectionsPanelCollapsed;
  const reportGridClass =
    isReportStep && sectionsPanelCollapsed
      ? "lg:grid-cols-1"
      : "lg:grid-cols-[0.9fr_1.1fr]";

  return (
    <RoleGuard allowedRoles={["owner", "coach", "staff"]}>
      <>
        <div className="space-y-6">
        <section className="panel rounded-2xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <PageBack />
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                Rapport
              </p>
            </div>
            {!isEditing && activeBuilderStep !== "report" ? (
              <button
                type="button"
                onClick={handleSkipSetup}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
              >
                Passer
              </button>
            ) : null}
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
            {isEditing ? "Modifier le rapport" : "Nouveau rapport"}
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {isEditing
              ? "Mets a jour les sections et le contenu du rapport."
              : activeBuilderStep === "layout"
              ? "Choisis un layout de depart pour structurer le rapport."
              : activeBuilderStep === "sections"
              ? "Selectionne et organise les sections avant la redaction."
              : "Remplis le contenu et ajuste les sections au fil du rapport."}
          </p>
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
        </section>

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
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                >
                  Creer un layout
                </button>
                <button
                  type="button"
                  onClick={handleAiLayoutClick}
                  aria-disabled={aiLocked}
                  className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition ${
                    aiLocked
                      ? "border-amber-300/30 bg-amber-400/10 text-amber-200"
                      : "border-emerald-300/30 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/20"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {aiLocked ? (
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
                <span className="text-[0.6rem] uppercase tracking-[0.2em] text-[var(--muted)]">
                  {layoutOptions.length} option
                  {layoutOptions.length > 1 ? "s" : ""}
                </span>
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
                      className={`rounded-2xl border p-4 text-left transition ${
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
                            .map((template) =>
                              renderTemplateChip(template, option.id)
                            )}
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
                      Pack de sections preconfigure (ex: seance practice, parcours).
                    </span>
                    <span className="mt-2 block text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                      Usage
                    </span>
                    <span className="mt-1 block">
                      Un clic pour charger la structure, puis tu ajustes au cas par
                      cas.
                    </span>
                    <span className="mt-2 block text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                      Impact
                    </span>
                    <span className="mt-1 block">
                      Rapports coherents et ultra-personnalises sans repartir de
                      zero.
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
                      const tone = featureKey ? featureTones[featureKey] : null;
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
                      const tone = featureKey ? featureTones[featureKey] : null;
                      const isLocked = isFeatureLocked(featureKey);
                      return (
                        <button
                          key={`layout-add-${template.id}`}
                          type="button"
                          onClick={() =>
                            handleAddTemplateToLayout(template.id as string)
                          }
                          title={
                            isLocked
                              ? "Option requise"
                              : "Ajouter au layout"
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
                              <rect x="5" y="11" width="14" height="9" rx="2" />
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
                  onChange={(event) => setLayoutCustomTitle(event.target.value)}
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
                    Radar
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
                    Radar: import d exports et graphes.
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
                Radar
              </button>
            </div>
            {customType === "image" ? (
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
            ) : customType === "radar" ? (
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
                Radar: import d exports et graphes.
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
                        onChange={(event) => setEditingValue(event.target.value)}
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
                          title={
                            isLocked
                              ? "Option requise"
                              : "Ajouter"
                          }
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
                Ecran de verification avant la redaction. Organise les sections
                si besoin.
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
              <button
                type="button"
                onClick={() => setBuilderStep("layout")}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--muted)] transition hover:text-[var(--text)]"
                aria-label="Revenir aux layouts"
                title="Layouts"
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
                  <rect x="3" y="4" width="7" height="7" rx="1.5" />
                  <rect x="14" y="4" width="7" height="7" rx="1.5" />
                  <rect x="3" y="13" width="7" height="7" rx="1.5" />
                  <rect x="14" y="13" width="7" height="7" rx="1.5" />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleReportSectionsToggle}
                className={`flex h-9 w-9 items-center justify-center rounded-full border transition ${
                  sectionsPanelCollapsed
                    ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-100"
                    : "border-white/10 bg-white/5 text-[var(--muted)] hover:text-[var(--text)]"
                }`}
                aria-label="Afficher les sections"
                title="Sections"
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
                  <rect x="3" y="5" width="7" height="14" rx="1.5" />
                  <rect x="14" y="5" width="7" height="14" rx="1.5" />
                </svg>
              </button>
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
                    Tu saisis des notes de travail en cours. Le rapport se construit
                    au fur et a mesure selon les sections presentes.
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
                    Le resume et les sections de planification se generent a la fin,
                    selon le titre des sections (ex: plan 3 mois, plan 7 jours).
                  </span>
                </span>
              </span>
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Organise les sections et remplis le contenu. Drag & drop actif.
          </p>
          {tpiContext ? (
            <div className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-full border border-rose-300/20 bg-rose-400/10 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-rose-100">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-300" />
              Profil TPI detecte
              {selectedStudent ? (
                <span className="text-[0.55rem] text-rose-100/80">
                  - {selectedStudent.first_name}{" "}
                  {selectedStudent.last_name ?? ""}
                </span>
              ) : null}
              <span className="text-[0.55rem] text-rose-100/80">
                L assistant IA l utilisera pour ses recommandations.
              </span>
            </div>
          ) : null}
          <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-dashed border-white/20 bg-white/5 px-3 py-1 text-[0.55rem] uppercase tracking-wide text-[var(--muted)] select-none">
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="4" width="6" height="10" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0" />
              <path d="M12 18v2" />
              <path d="M8 20h8" />
            </svg>
            Dictee vocale compatible: redaction ultra-rapide sur mobile.
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {showPublish ? (
              <button
                type="button"
                disabled={saving || loadingReport}
                onClick={() => handleSaveReport(true)}
                className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
              >
                {saving ? "Envoi..." : sendLabel}
              </button>
            ) : null}
            <button
              type="button"
              disabled={saving || loadingReport}
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
          <div className="relative mt-5 -mx-6 border-y border-white/10 bg-gradient-to-r from-white/5 via-white/5 to-emerald-400/10 px-6 py-4">
            {aiLocked ? (
              <button
                type="button"
                onClick={openPremiumModal}
                className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--overlay)] px-6 text-left backdrop-blur-sm"
                aria-label="Decouvrir Premium"
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
                        Debloque le mode Premium
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full border border-amber-300/40 bg-amber-400/20 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-amber-200">
                    Voir les offres
                  </span>
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
                onClick={!aiEnabled ? openPremiumModal : undefined}
                role={!aiEnabled ? "button" : undefined}
                aria-label={!aiEnabled ? "Decouvrir Premium" : undefined}
              >
                {aiEnabled ? "Actif" : "Premium"}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!!aiBusyId}
                  onClick={() => {
                    if (aiLocked) {
                      openPremiumModal();
                      return;
                    }
                    handleAiSummary();
                  }}
                  className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition hover:bg-white/20 disabled:opacity-60 ${
                  aiLocked
                    ? "border-amber-300/30 bg-amber-400/10 text-amber-200"
                    : "border-white/10 bg-white/10 text-[var(--text)]"
                }`}
              >
                <span className="flex items-center gap-2">
                  {aiLocked ? (
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
                    if (aiLocked) {
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
                    aiLocked
                      ? "border-amber-300/30 bg-amber-400/10 text-amber-200"
                      : "border-violet-300/40 bg-violet-400/15 text-violet-100"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {aiLocked ? (
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
                    {radarAiAutoBusy ? "IA..." : "Auto detect radar graph"}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={!!aiBusyId}
                  onClick={() => {
                    if (aiLocked) {
                      openPremiumModal();
                      return;
                    }
                    handleAiFinalize();
                  }}
                  className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition hover:bg-white/20 disabled:opacity-60 ${
                  aiLocked
                    ? "border-amber-300/30 bg-amber-400/10 text-amber-200"
                    : "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
                }`}
              >
                <span className="flex items-center gap-2">
                  {aiLocked ? (
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
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  Travail en cours
                </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={aiLocked || !!aiBusyId}
                      onClick={resetWorkingContext}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-60"
                    >
                      Reinitialiser
                    </button>
                    <button
                      type="button"
                      disabled={!!aiBusyId}
                      onClick={() => {
                        if (aiLocked) {
                          openPremiumModal();
                          return;
                        }
                        handleAiPropagateFromWorking();
                      }}
                    className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition hover:bg-white/20 disabled:opacity-60 ${
                      aiLocked
                        ? "border-amber-300/30 bg-amber-400/10 text-amber-200"
                        : "border-white/10 bg-white/10 text-[var(--text)]"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {aiLocked ? (
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
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
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
          <div className="mt-4 space-y-3">
            {reportSections.map((section, index) => {
              const isCollapsed = collapsedSections[section.id] ?? false;
              const trimmedContent = section.content.trim();
              const contentPreview = trimmedContent
                ? `${trimmedContent.slice(0, 160)}${
                    trimmedContent.length > 160 ? "..." : ""
                  }`
                : "Section repliee.";
              const imagePreview =
                section.mediaUrls.length > 0
                  ? `${section.mediaUrls.length} image(s)`
                  : "Aucune image ajoutee.";
              const radarFile = section.radarFileId
                ? radarFileMap.get(section.radarFileId)
                : null;
              const radarPreview = radarFile
                ? `${radarFile.original_name ?? "Fichier radar"} • ${
                    radarFile.shots?.length ?? 0
                  } coups`
                : "Aucun fichier radar selectionne.";

              const featureKey = getSectionFeatureKey(section);
              const tone = featureKey ? featureTones[featureKey] : null;
              const radarLocked = section.type === "radar" && !radarAddonEnabled;

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
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
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
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-[var(--text)] break-words">
                          {section.title}
                        </p>
                        {renderFeatureBadge(featureKey)}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleSectionCollapse(section.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[var(--muted)] transition hover:text-[var(--text)]"
                        aria-label={
                          isCollapsed ? "Developper" : "Replier"
                        }
                        title={isCollapsed ? "Developper" : "Replier"}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className={`h-4 w-4 transition-transform ${
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
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-40"
                            aria-label="Monter"
                            title="Monter"
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
                              <path d="M12 19V5" />
                              <path d="M5 12l7-7 7 7" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveSection(index, "down")}
                            disabled={index === reportSections.length - 1}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-40"
                            aria-label="Descendre"
                            title="Descendre"
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
                              <path d="M5 12l7 7 7-7" />
                            </svg>
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleRemoveFromReport(section)}
                        className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                      >
                        Retirer
                      </button>
                    </div>
                  </div>
                  {isCollapsed ? (
                    <p className="mt-3 text-xs text-[var(--muted)]">
                      {section.type === "text"
                        ? contentPreview
                        : section.type === "radar"
                          ? radarPreview
                          : imagePreview}
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
                            if (aiLocked) {
                              openPremiumModal();
                              return;
                            }
                            handleAiImprove(section);
                          }}
                          className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition hover:bg-white/20 disabled:opacity-60 ${
                            aiLocked
                              ? "border-amber-300/30 bg-amber-400/10 text-amber-200"
                              : "border-white/10 bg-white/10 text-[var(--text)]"
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            {aiLocked ? (
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
                            {aiBusyId === section.id ? "IA..." : "IA relire"}
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={!!aiBusyId}
                          onClick={() => {
                            if (aiLocked) {
                              openPremiumModal();
                              return;
                            }
                            handleAiWrite(section);
                          }}
                          className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition hover:bg-white/20 disabled:opacity-60 ${
                            aiLocked
                              ? "border-amber-300/30 bg-amber-400/10 text-amber-200"
                              : "border-white/10 bg-white/10 text-[var(--text)]"
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            {aiLocked ? (
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
                                <rect x="5" y="11" width="14" height="9" rx="2" />
                                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                              </svg>
                              Add-on Radar requis
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
                            const picked = nextId ? radarFileMap.get(nextId) : null;
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
                              ? "Choisir un fichier radar"
                              : "Importer un fichier radar pour cette section"}
                          </option>
                          {radarVisibleFiles.map((file) => (
                            <option key={file.id} value={file.id}>
                              {file.original_name || "Export Flightscope"}{" "}
                              {file.status === "ready" ? "" : "(analyse)"}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            if (radarLocked) {
                              openRadarAddonModal();
                              return;
                            }
                            radarInputRef.current?.click();
                          }}
                          disabled={radarUploading}
                          className={`rounded-full border border-white/10 bg-white/10 px-3 py-2 text-[0.65rem] uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20 ${
                            radarLocked ? "cursor-not-allowed opacity-60" : ""
                          } disabled:opacity-60`}
                          aria-disabled={radarLocked}
                        >
                          Importer
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenRadarSectionConfig(section.id)}
                          disabled={!section.radarFileId || radarLocked}
                          className={`rounded-full border px-3 py-2 text-[0.65rem] uppercase tracking-wide transition ${
                            section.radarFileId && !radarLocked
                              ? "border-white/10 bg-white/5 text-[var(--text)] hover:bg-white/10"
                              : "cursor-not-allowed border-white/5 bg-white/5 text-[var(--muted)]"
                          }`}
                        >
                          Configurer
                        </button>
                        <input
                          ref={radarInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(event) => {
                            const files = Array.from(event.target.files ?? []);
                            if (files.length) void handleRadarUploadBatch(files);
                            event.target.value = "";
                          }}
                        />
                      </div>
                      <p className="text-xs text-[var(--muted)]">
                        Seuls les fichiers importes dans ce rapport sont listes.
                        Tu peux en importer plusieurs, ils seront ajoutes a la
                        liste.
                      </p>
                      {radarUploading ? (
                        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                          <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                            <span>
                              Extraction radar
                              <span className="tpi-dots" aria-hidden="true" />
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
                        </div>
                      ) : null}
                      {radarError ? (
                        <p className="text-xs text-red-400">{radarError}</p>
                      ) : null}
                      {radarLoading ? (
                        <p className="text-xs text-[var(--muted)]">
                          Chargement des fichiers radar...
                        </p>
                      ) : null}
                        {radarFile ? (
                          <RadarCharts
                            columns={radarFile.columns ?? []}
                            shots={radarFile.shots ?? []}
                            stats={radarFile.stats}
                            summary={radarFile.summary}
                            config={section.radarConfig ?? radarFile.config}
                            analytics={radarFile.analytics}
                            compact
                          />
                      ) : (
                        <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                          Selectionne un fichier radar pour previsualiser les
                          graphes.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <div
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => handleImageDrop(section.id, event)}
                        className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/5 px-4 py-6 text-center text-xs text-[var(--muted)]"
                      >
                        <p>Glisse des images ici</p>
                        <label
                          htmlFor={`image-upload-${section.id}`}
                          className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
                        >
                          Parcourir
                        </label>
                        <input
                          id={`image-upload-${section.id}`}
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(event) => {
                            if (event.target.files) {
                              handleImageFiles(section.id, event.target.files);
                              event.target.value = "";
                            }
                          }}
                          className="hidden"
                        />
                      </div>
                      {uploadingSections[section.id] ? (
                        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/10 bg-white/10">
                            <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
                          </span>
                          Upload en cours...
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
                                className="h-40 w-full object-cover"
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
                                    {(section.mediaCaptions[index] ?? "").length}/
                                    {CAPTION_LIMIT}
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
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {showPublish ? (
              <button
                type="button"
                disabled={saving || loadingReport}
                onClick={() => handleSaveReport(true)}
                className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
              >
                {saving ? "Envoi..." : sendLabel}
              </button>
            ) : null}
            <button
              type="button"
              disabled={saving || loadingReport}
              onClick={() => handleSaveReport(false)}
              className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/10 disabled:opacity-60"
            >
              {saving ? "Sauvegarde..." : saveLabel}
            </button>
          </div>
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
                    Compose un layout a partir des sections disponibles ou ajoute
                    tes propres sections.
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
                <div>
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
                      const tone = featureKey ? featureTones[featureKey] : null;
                      const isLocked = isFeatureLocked(featureKey);
                      return (
                        <button
                          key={`layout-add-${template.id}`}
                          type="button"
                          onClick={() =>
                            handleAddTemplateToLayout(template.id as string)
                          }
                          title={
                            isLocked
                              ? "Option requise"
                              : "Ajouter au layout"
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
                              <rect x="5" y="11" width="14" height="9" rx="2" />
                              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                            </svg>
                          ) : null}
                        </button>
                      );
                    })
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
                      Radar
                    </button>
                  </div>
                  {layoutCustomType === "image" ? (
                    <p className="mt-2 text-[0.6rem] text-[var(--muted)]">
                      Les images seront ajoutees a la fin du rapport.
                    </p>
                  ) : layoutCustomType === "radar" ? (
                    <p className="mt-2 text-[0.6rem] text-[var(--muted)]">
                      Les graphes radar apparaissent dans le rapport.
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
                      const layout = layouts.find(
                        (item) => item.id === layoutEditingId
                      );
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
                    Reponds a quelques questions pour obtenir un layout
                    pertinent.
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
                          sectionCount: clampAiLayoutCount(
                            Number(event.target.value)
                          ),
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
                    <p className="mt-3 text-xs text-red-400">
                      {aiLayoutMessage}
                    </p>
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
                    Radar
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-[var(--text)]">
                    Affichage du bloc radar
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
                                  options: {
                                    ...prev.options,
                                    aiPreset:
                                      prev.options?.aiPreset ?? "standard",
                                    aiSyntax:
                                      prev.options?.aiSyntax ??
                                      "exp-tech-solution",
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
                        Reglages IA radar
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
                        Le bouton Auto detect radar graph utilisera ces reglages.
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
                          [item.key]: !prev[
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
                                          [definition.key]: !prev.charts[definition.key],
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
                    IA Radar
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
                              className={`rounded-full border px-3 py-1 text-[0.6rem] uppercase tracking-wide ${
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
                    {radarAiAutoBusy ? "Analyse..." : "Lancer l IA"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        <PremiumOfferModal
          open={premiumModalOpen}
          onClose={closePremiumModal}
          notice={premiumNotice}
        />
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
                    Quelques questions pour affiner la propagation et eviter
                    toute approximation.
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
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 uppercase tracking-wide">
                  {clarifyQuestions.length} question
                  {clarifyQuestions.length > 1 ? "s" : ""}
                </span>
                {clarifyConfidence !== null ? (
                  <span
                    className={`rounded-full border px-3 py-1 uppercase tracking-wide ${
                      clarifyConfidence >= CLARIFY_THRESHOLD
                        ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200"
                        : "border-amber-300/30 bg-amber-400/10 text-amber-200"
                    }`}
                  >
                    Certitude {Math.round(clarifyConfidence * 100)}%
                  </span>
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
                                          ? list.filter(
                                              (item) => item !== choice
                                            )
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
                    Selectionne l angle de reponse le plus pertinent pour chaque
                    section. L IA generera ensuite le contenu.
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
                        const selected =
                          axesSelection[entry.section] === option.id;
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
                  {aiBusyId === "propagate"
                    ? "Propagation..."
                    : "Lancer la propagation"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    </RoleGuard>
  );
}
