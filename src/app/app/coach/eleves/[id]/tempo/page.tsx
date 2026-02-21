"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { z } from "zod";
import { supabase } from "@/lib/supabase/client";
import RoleGuard from "../../../../_components/role-guard";
import PageHeader from "../../../../_components/page-header";
import PageBack from "../../../../_components/page-back";
import ToastStack from "../../../../_components/toast-stack";
import useToastStack from "../../../../_components/use-toast-stack";
import TempoIntroHintModal from "../../../../_components/tempo-intro-hint-modal";
import StudentTabs from "../student-tabs";
import {
  dismissDidacticHint,
  getDidacticHintState,
  markDidacticHintSeen,
} from "@/lib/didactic-hints";
import {
  TempoContextResponseSchema,
  TempoCreateDraftReportResponseSchema,
  TempoDecisionAxesResponseSchema,
  TempoDecisionRunSchema,
  TempoNoteCardSchema,
  TempoNoteCardTypeSchema,
  TempoSessionSchema,
  type TempoDecisionAxis,
  type TempoMode,
  type TempoNoteCardType,
  type TempoSession,
} from "@/lib/tempo/types";

const ClarifyQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  type: z.enum(["text", "choices"]),
  choices: z.array(z.string()).optional(),
  multi: z.boolean().optional(),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
});

const ClarifyResponseSchema = z.object({
  confidence: z.number().min(0).max(1),
  questions: z.array(ClarifyQuestionSchema),
});

type ClarifyQuestion = z.infer<typeof ClarifyQuestionSchema>;

const NOTE_TYPE_LABELS: Record<TempoNoteCardType, string> = {
  constat: "Constat",
  consigne: "Consigne",
  objectif: "Objectif",
  mesure: "Mesure",
  libre: "Note",
};

const NOTE_TYPE_OPTIONS: Array<{ value: TempoNoteCardType; label: string; hint: string }> = [
  { value: "constat", label: "Constat", hint: "Observation factuelle en seance" },
  { value: "consigne", label: "Consigne", hint: "Instruction a donner a l eleve" },
  { value: "objectif", label: "Objectif", hint: "Cible de travail prioritaire" },
  { value: "mesure", label: "Mesure", hint: "Valeur/repere chiffres" },
  { value: "libre", label: "Note", hint: "Information complementaire" },
];

const TEMPO_OVERVIEW_HINT_ID = "tempo_overview_three_modes";

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const buildSessionLabel = (session: TempoSession) =>
  `${session.title} - ${formatDate(session.updated_at)}`;

const arrayFromRecord = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) return [value];
  return [];
};

const extractAxesFromJson = (value: unknown): TempoDecisionAxis[] => {
  const parsed = z.array(TempoDecisionAxesResponseSchema.shape.axes.element).safeParse(value);
  return parsed.success ? parsed.data : [];
};

const clampText = (value: string | null | undefined, max: number) => {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return text.slice(0, Math.max(1, max)).trimEnd();
};

const compactLine = (value: string, max = 130) =>
  clampText(value.replace(/\n+/g, " "), max) || "Aucune donnee";

const normalizeDecisionField = (value: string | null | undefined) =>
  (value ?? "").replace(/\s+/g, " ").trim();

const toDecisionPoints = (value: string | null | undefined, maxItems: number, maxChars: number) => {
  const normalized = (value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\.{3,}/g, " ")
    .replace(/\s*\|\s*/g, "\n")
    .replace(/\s*\*\s*/g, "\n")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return [];

  let parts = normalized
    .split(/\n+|;\s+/g)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    parts = normalized
      .split(/\. +/g)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  const cleaned = parts
    .map((part) => part.replace(/^[-\s]+/, "").replace(/\.+$/, "").trim())
    .filter(Boolean)
    .map((part) => clampText(part, maxChars))
    .slice(0, maxItems);

  if (cleaned.length > 0) return cleaned;
  return [clampText(normalized, maxChars)];
};

type DecisionDetailSection = "summary" | "rationale" | "caution";

const DECISION_SECTION_LABELS: Record<DecisionDetailSection, string> = {
  summary: "Cap de seance",
  rationale: "Pourquoi prioritaire",
  caution: "Vigilance",
};

const toDecisionCompactPoint = (value: string) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const firstClause = normalized.split(/(?:,|;|:|\(|\s[-â€“â€”]\s)/g)[0]?.trim();
  return firstClause || normalized;
};

const splitPointLead = (value: string, leadWordCount: number) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return { lead: "", rest: "" };

  const words = normalized.split(" ").filter(Boolean);
  if (words.length <= leadWordCount) {
    return { lead: normalized, rest: "" };
  }

  return {
    lead: words.slice(0, leadWordCount).join(" "),
    rest: words.slice(leadWordCount).join(" "),
  };
};

const DecisionAxesLooseSchema = z.object({
  axes: z.array(
    z.object({
      priority: z.number().optional(),
      title: z.string().optional(),
      summary: z.string().optional(),
      rationale: z.string().optional(),
      caution: z.string().optional(),
    })
  ),
});

const sanitizeDecisionAxes = (
  axes: Array<{
    priority?: number;
    title?: string;
    summary?: string;
    rationale?: string;
    caution?: string;
  }>
): TempoDecisionAxis[] => {
  const normalized = axes
    .map((axis, index) => ({
      priority:
        typeof axis.priority === "number" && Number.isFinite(axis.priority)
          ? Math.max(1, Math.min(3, Math.round(axis.priority)))
          : index + 1,
      title: clampText(axis.title, 140),
      summary: normalizeDecisionField(axis.summary),
      rationale: normalizeDecisionField(axis.rationale),
      caution: normalizeDecisionField(axis.caution),
    }))
    .filter(
      (axis) =>
        axis.title.length > 0 &&
        axis.summary.length > 0 &&
        axis.rationale.length > 0 &&
        axis.caution.length > 0
    )
    .slice(0, 3)
    .map((axis, index) => ({
      ...axis,
      priority: index + 1,
    }));
  return normalized.length === 3 ? normalized : [];
};

const parseDecisionAxesPayload = (
  payload: unknown
): { axes: TempoDecisionAxis[]; normalized: boolean } => {
  const strict = TempoDecisionAxesResponseSchema.safeParse(payload);
  if (strict.success) return { axes: strict.data.axes, normalized: false };

  const loose = DecisionAxesLooseSchema.safeParse(payload);
  if (!loose.success) return { axes: [], normalized: false };

  return {
    axes: sanitizeDecisionAxes(loose.data.axes),
    normalized: true,
  };
};

const getDecisionPriorityMeta = (priority: number) => {
  if (priority === 1) {
    return {
      label: "Priorite immediate",
      cardClass: "tempo-axis-priority-1",
      pillClass: "tempo-axis-pill-1",
    };
  }
  if (priority === 2) {
    return {
      label: "Priorite de consolidation",
      cardClass: "tempo-axis-priority-2",
      pillClass: "tempo-axis-pill-2",
    };
  }
  return {
    label: "Priorite de stabilisation",
    cardClass: "tempo-axis-priority-3",
    pillClass: "tempo-axis-pill-3",
  };
};

export default function StudentTempoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const studentId = typeof params?.id === "string" ? params.id : "";
  const { toasts, pushToast, dismissToast } = useToastStack(7600);

  const [pageLoading, setPageLoading] = useState(true);
  const [accessError, setAccessError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [tempoMode, setTempoMode] = useState<TempoMode>("notes");
  const [tempoContext, setTempoContext] = useState<z.infer<typeof TempoContextResponseSchema> | null>(
    null
  );

  const [sessions, setSessions] = useState<TempoSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedNotesSessionId, setSelectedNotesSessionId] = useState<string>("");
  const [selectedDecisionSessionId, setSelectedDecisionSessionId] = useState<string>("");

  const [notes, setNotes] = useState<Array<z.infer<typeof TempoNoteCardSchema>>>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteType, setNoteType] = useState<TempoNoteCardType>("constat");
  const [noteContent, setNoteContent] = useState("");
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteType, setEditingNoteType] = useState<TempoNoteCardType>("libre");
  const [editingNoteContent, setEditingNoteContent] = useState("");
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [draftCreating, setDraftCreating] = useState(false);

  const [decisionClub, setDecisionClub] = useState("");
  const [decisionConstat, setDecisionConstat] = useState("");
  const [decisionIntent, setDecisionIntent] = useState("");
  const [decisionGenerating, setDecisionGenerating] = useState(false);
  const [decisionPhase, setDecisionPhase] = useState<"idle" | "clarify" | "axes">("idle");
  const [decisionAxes, setDecisionAxes] = useState<TempoDecisionAxis[]>([]);
  const [decisionRuns, setDecisionRuns] = useState<Array<z.infer<typeof TempoDecisionRunSchema>>>(
    []
  );
  const [decisionRunsLoading, setDecisionRunsLoading] = useState(false);
  const [decisionComposerCollapsed, setDecisionComposerCollapsed] = useState(false);
  const [decisionHistoryCollapsed, setDecisionHistoryCollapsed] = useState(true);
  const [decisionCarouselIndex, setDecisionCarouselIndex] = useState(0);
  const [decisionSettledIndex, setDecisionSettledIndex] = useState(0);
  const [decisionPopIndex, setDecisionPopIndex] = useState<number>(-1);
  const [decisionDragOffset, setDecisionDragOffset] = useState(0);
  const [decisionDragging, setDecisionDragging] = useState(false);
  const decisionDragStartXRef = useRef<number | null>(null);
  const decisionDragPointerIdRef = useRef<number | null>(null);
  const decisionPreviousCarouselIndexRef = useRef(0);

  const [clarifyOpen, setClarifyOpen] = useState(false);
  const [clarifyQuestions, setClarifyQuestions] = useState<ClarifyQuestion[]>([]);
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<string, string | string[]>>({});
  const [pendingDecisionSessionId, setPendingDecisionSessionId] = useState<string>("");
  const [pendingDecisionSource, setPendingDecisionSource] = useState<string>("");
  const [showContextDetails, setShowContextDetails] = useState(false);
  const [decisionDetails, setDecisionDetails] = useState<{
    axis: TempoDecisionAxis;
    section: DecisionDetailSection;
  } | null>(null);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [tempoOverviewHintVisible, setTempoOverviewHintVisible] = useState(false);
  const [tempoOverviewHintDismissed, setTempoOverviewHintDismissed] = useState(false);
  const [tempoOverviewHintDontShowAgain, setTempoOverviewHintDontShowAgain] = useState(false);
  const [tempoOverviewHintLoaded, setTempoOverviewHintLoaded] = useState(false);

  const getAuthenticatedCoachId = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    return sessionData.session?.user.id ?? null;
  }, []);

  const notesSessions = useMemo(
    () => sessions.filter((session) => session.mode === "notes").slice(0, 4),
    [sessions]
  );
  const decisionSessions = useMemo(
    () => sessions.filter((session) => session.mode === "decision").slice(0, 4),
    [sessions]
  );
  const activeDecisionRun = decisionRuns[0] ?? null;
  const hasDecisionPlan = decisionAxes.length === 3;
  const draftSessionCandidateId = selectedNotesSessionId;
  const selectedDecisionSessionLabel = useMemo(() => {
    const selected = decisionSessions.find((session) => session.id === selectedDecisionSessionId);
    return selected ? buildSessionLabel(selected) : "Session non selectionnee";
  }, [decisionSessions, selectedDecisionSessionId]);
  const decisionSummaryClub = clampText(
    decisionClub.trim() || activeDecisionRun?.club || "Club non renseigne",
    80
  );
  const decisionSummaryConstat =
    clampText(decisionConstat.trim() || activeDecisionRun?.constat || "", 180) ||
    "Constat non renseigne";

  const loadTempoContext = useCallback(async () => {
    if (!studentId) return;
    setPageLoading(true);
    setAccessError("");
    setStatusMessage("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setAccessError("Session invalide.");
        setPageLoading(false);
        return;
      }

      const response = await fetch(`/api/tempo/context?studentId=${studentId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        const errorMessage =
          (payload as { error?: string } | null)?.error ??
          "Tempo indisponible sur cet acces.";
        setAccessError(errorMessage);
        setPageLoading(false);
        return;
      }

      const parsedPayload = TempoContextResponseSchema.safeParse(payload);
      if (!parsedPayload.success) {
        setAccessError("Contexte Tempo invalide.");
        setPageLoading(false);
        return;
      }

      setTempoContext(parsedPayload.data);
      setPageLoading(false);
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : "Chargement Tempo impossible.");
      setPageLoading(false);
    }
  }, [studentId]);

  const loadSessions = useCallback(async () => {
    if (!studentId) return;
    setSessionsLoading(true);
    const { data, error } = await supabase
      .from("tempo_sessions")
      .select("*")
      .eq("student_id", studentId)
      .order("updated_at", { ascending: false });

    if (error) {
      setStatusMessage(error.message ?? "Chargement des sessions impossible.");
      setSessionsLoading(false);
      return;
    }

    const parsed = z.array(TempoSessionSchema).safeParse(data ?? []);
    if (!parsed.success) {
      setStatusMessage("Sessions Tempo invalides.");
      setSessionsLoading(false);
      return;
    }

    setSessions(parsed.data);
    setSessionsLoading(false);
  }, [studentId]);

  const loadNotes = useCallback(async (sessionId: string) => {
    if (!sessionId) {
      setNotes([]);
      return;
    }
    setNotesLoading(true);
    const { data, error } = await supabase
      .from("tempo_note_cards")
      .select("*")
      .eq("session_id", sessionId)
      .order("order_index", { ascending: true })
      .order("occurred_at", { ascending: true });

    if (error) {
      setStatusMessage(error.message ?? "Chargement des notes impossible.");
      setNotesLoading(false);
      return;
    }

    const parsed = z.array(TempoNoteCardSchema).safeParse(data ?? []);
    if (!parsed.success) {
      setStatusMessage("Notes Tempo invalides.");
      setNotesLoading(false);
      return;
    }

    setNotes(parsed.data);
    setNotesLoading(false);
  }, []);

  const loadDecisionRuns = useCallback(async (sessionId: string) => {
    if (!sessionId) {
      setDecisionRuns([]);
      return;
    }
    setDecisionRunsLoading(true);
    const { data, error } = await supabase
      .from("tempo_decision_runs")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(12);

    if (error) {
      setStatusMessage(error.message ?? "Chargement des decisions impossible.");
      setDecisionRunsLoading(false);
      return;
    }

    const parsed = z.array(TempoDecisionRunSchema).safeParse(data ?? []);
    if (!parsed.success) {
      setStatusMessage("Decisions Tempo invalides.");
      setDecisionRunsLoading(false);
      return;
    }

    setDecisionRuns(parsed.data);
    setDecisionRunsLoading(false);
  }, []);

  const createSession = useCallback(
    async (mode: "notes" | "decision", title: string, club?: string | null) => {
      const coachId = await getAuthenticatedCoachId();
      if (!coachId) {
        throw new Error("Session invalide.");
      }
      const insertPayload = {
        student_id: studentId,
        coach_id: coachId,
        mode,
        title,
        status: "active",
        club: club?.trim() || null,
      };
      const { data, error } = await supabase
        .from("tempo_sessions")
        .insert([insertPayload])
        .select("*")
        .single();

      if (error) {
        throw new Error(error.message ?? "Creation de session impossible.");
      }

      const parsed = TempoSessionSchema.safeParse(data);
      if (!parsed.success) {
        throw new Error("Session Tempo invalide.");
      }

      setSessions((previous) => [parsed.data, ...previous.filter((item) => item.id !== parsed.data.id)]);
      return parsed.data;
    },
    [studentId, getAuthenticatedCoachId]
  );

  const getNotesSession = useCallback(async () => {
    if (selectedNotesSessionId) {
      const found = sessions.find((session) => session.id === selectedNotesSessionId);
      if (found) return found;
    }
    const first = notesSessions[0];
    if (first) return first;
    const created = await createSession("notes", "Prise de notes");
    setSelectedNotesSessionId(created.id);
    return created;
  }, [selectedNotesSessionId, sessions, notesSessions, createSession]);

  const getDecisionSession = useCallback(async () => {
    if (selectedDecisionSessionId) {
      const found = sessions.find((session) => session.id === selectedDecisionSessionId);
      if (found) return found;
    }
    const first = decisionSessions[0];
    if (first) return first;
    const created = await createSession(
      "decision",
      "Aide a la decision",
      decisionClub.trim() || null
    );
    setSelectedDecisionSessionId(created.id);
    return created;
  }, [selectedDecisionSessionId, sessions, decisionSessions, createSession, decisionClub]);

  const createDraftReport = useCallback(
    async (sessionId: string, title?: string) => {
      if (!sessionId) return;
      setDraftCreating(true);
      setStatusMessage("");
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          setStatusMessage("Session invalide.");
          setDraftCreating(false);
          return;
        }

        const response = await fetch(`/api/tempo/sessions/${sessionId}/draft-report`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(title?.trim() ? { title: title.trim() } : {}),
        });

        const payload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          const message =
            (payload as { error?: string } | null)?.error ??
            "Creation du brouillon impossible.";
          setStatusMessage(message);
          pushToast(message, "error");
          setDraftCreating(false);
          return;
        }

        const parsed = TempoCreateDraftReportResponseSchema.safeParse(payload);
        if (!parsed.success) {
          setStatusMessage("Reponse brouillon invalide.");
          pushToast("Reponse brouillon invalide.", "error");
          setDraftCreating(false);
          return;
        }

        pushToast("Brouillon cree depuis Tempo.", "success");
        router.push(`/app/coach/rapports/nouveau?reportId=${parsed.data.reportId}&source=tempo`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Creation du brouillon impossible.";
        setStatusMessage(message);
        pushToast(message, "error");
      } finally {
        setDraftCreating(false);
      }
    },
    [pushToast, router]
  );

  const runDecisionAxes = useCallback(
    async (
      sessionId: string,
      sourceContent: string,
      clarifications: Array<{ question: string; answer: string }>
    ) => {
      if (!tempoContext) return;
      setDecisionGenerating(true);
      setDecisionPhase("axes");
      setStatusMessage("");
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        const coachId = sessionData.session?.user.id ?? "";
        if (!token || !coachId) {
          setStatusMessage("Session invalide.");
          setDecisionGenerating(false);
          setDecisionPhase("idle");
          return;
        }

        const response = await fetch("/api/ai", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: "decision_axes",
            sectionTitle: "Aide a la decision",
            sectionContent: sourceContent,
            allSections: [
              {
                title: "Contexte eleve",
                content: tempoContext.aiContext,
              },
            ],
            clarifications,
            tpiContext: tempoContext.summaries.tpi,
          }),
        });

        const payload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          const message = (payload as { error?: string } | null)?.error ?? "Generation IA impossible.";
          setStatusMessage(message);
          pushToast(message, "error");
          setDecisionGenerating(false);
          setDecisionPhase("idle");
          return;
        }

        const parsedAxes = parseDecisionAxesPayload(payload);
        const axes = parsedAxes.axes;
        if (axes.length !== 3) {
          setStatusMessage("Axes IA invalides.");
          pushToast("Axes IA invalides, reessaie la generation.", "error");
          setDecisionGenerating(false);
          setDecisionPhase("idle");
          return;
        }

        const { error: insertError } = await supabase.from("tempo_decision_runs").insert([
          {
            session_id: sessionId,
            coach_id: coachId,
            club: decisionClub.trim(),
            constat: decisionConstat.trim(),
            coach_intent: decisionIntent.trim() || null,
            clarifications_json: clarifications,
            axes_json: axes,
            context_snapshot_json: {
              generated_at: new Date().toISOString(),
              context: tempoContext.summaries,
            },
          },
        ]);
        if (insertError) {
          setStatusMessage(insertError.message ?? "Sauvegarde decision impossible.");
          pushToast("Generation terminee, mais sauvegarde impossible. Relance la generation.", "error");
          setDecisionAxes([]);
          setDecisionGenerating(false);
          return;
        }

        setDecisionAxes(axes);
        if (parsedAxes.normalized) {
          pushToast("Axes normalises automatiquement pour affichage.", "info");
        }

        await supabase
          .from("tempo_sessions")
          .update({ club: decisionClub.trim() || null })
          .eq("id", sessionId)
          .then(() => null);

        await loadDecisionRuns(sessionId);
        await loadSessions();
        pushToast("3 axes prioritaires generes et sauvegardes.", "success");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Generation IA impossible.";
        setStatusMessage(message);
        pushToast(message, "error");
      } finally {
        setDecisionGenerating(false);
        setDecisionPhase("idle");
      }
    },
    [
      tempoContext,
      decisionClub,
      decisionConstat,
      decisionIntent,
      loadDecisionRuns,
      loadSessions,
      pushToast,
    ]
  );

  const handleGenerateDecision = useCallback(async () => {
    if (!decisionClub.trim() || !decisionConstat.trim()) {
      const message = "Renseigne au minimum le club et le constat.";
      setStatusMessage(message);
      pushToast(message, "error");
      return;
    }
    if (!tempoContext) {
      setStatusMessage("Contexte eleve indisponible.");
      return;
    }

    setDecisionAxes([]);
    setStatusMessage("");
    setDecisionPhase("clarify");
    const session = await getDecisionSession();
    setSelectedDecisionSessionId(session.id);

    const sourceContent = [
      `Club: ${decisionClub.trim()}`,
      `Constat: ${decisionConstat.trim()}`,
      decisionIntent.trim() ? `Travail souhaite: ${decisionIntent.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    setDecisionGenerating(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setStatusMessage("Session invalide.");
        setDecisionGenerating(false);
        setDecisionPhase("idle");
        return;
      }

      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "clarify",
          sectionTitle: "Aide a la decision",
          sectionContent: sourceContent,
          allSections: [{ title: "Contexte eleve", content: tempoContext.aiContext }],
          targetSections: ["Axes prioritaires"],
          tpiContext: tempoContext.summaries.tpi,
        }),
      });

      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        const message = (payload as { error?: string } | null)?.error ?? "Clarification IA impossible.";
        setStatusMessage(message);
        pushToast(message, "error");
        setDecisionGenerating(false);
        setDecisionPhase("idle");
        return;
      }

      const parsed = ClarifyResponseSchema.safeParse(payload);
      if (!parsed.success) {
        setStatusMessage("Reponse de clarification invalide.");
        pushToast("Reponse de clarification invalide.", "error");
        setDecisionGenerating(false);
        setDecisionPhase("idle");
        return;
      }

      if (parsed.data.questions.length === 0) {
        await runDecisionAxes(session.id, sourceContent, []);
        setDecisionGenerating(false);
        setDecisionPhase("idle");
        return;
      }

      const answerState: Record<string, string | string[]> = {};
      parsed.data.questions.forEach((question) => {
        answerState[question.id] = question.multi ? [] : "";
      });
      setClarifyAnswers(answerState);
      setClarifyQuestions(parsed.data.questions);
      setPendingDecisionSessionId(session.id);
      setPendingDecisionSource(sourceContent);
      setClarifyOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Clarification IA impossible.";
      setStatusMessage(message);
      pushToast(message, "error");
    } finally {
      setDecisionGenerating(false);
      setDecisionPhase("idle");
    }
  }, [
    decisionClub,
    decisionConstat,
    decisionIntent,
    tempoContext,
    getDecisionSession,
    pushToast,
    runDecisionAxes,
  ]);

  const confirmClarifications = useCallback(async () => {
    if (!pendingDecisionSessionId || !pendingDecisionSource) return;
    const clarifications = clarifyQuestions
      .map((question) => {
        const rawValue = clarifyAnswers[question.id];
        const values = arrayFromRecord(rawValue)
          .map((value) => value.trim())
          .filter(Boolean);
        if (values.length === 0) return null;
        return {
          question: question.question,
          answer: values.join(", "),
        };
      })
      .filter((item): item is { question: string; answer: string } => item !== null);

    setClarifyOpen(false);
    setClarifyQuestions([]);
    setClarifyAnswers({});
    setPendingDecisionSessionId("");
    setPendingDecisionSource("");
    await runDecisionAxes(pendingDecisionSessionId, pendingDecisionSource, clarifications);
  }, [
    pendingDecisionSessionId,
    pendingDecisionSource,
    clarifyQuestions,
    clarifyAnswers,
    runDecisionAxes,
  ]);

  const copyAxes = useCallback(async () => {
    if (decisionAxes.length === 0) return;
    const content = decisionAxes
      .map(
        (axis) =>
          `${axis.priority}. ${axis.title}\n${axis.summary}\nPourquoi: ${axis.rationale}\nVigilance: ${axis.caution}`
      )
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(content);
      pushToast("Axes copies dans le presse-papiers.", "success");
    } catch {
      pushToast("Copie impossible.", "error");
    }
  }, [decisionAxes, pushToast]);

  const closeTempoOverviewHint = useCallback(() => {
    if (tempoOverviewHintDontShowAgain && !tempoOverviewHintDismissed) {
      dismissDidacticHint(TEMPO_OVERVIEW_HINT_ID);
      setTempoOverviewHintDismissed(true);
    }
    setTempoOverviewHintVisible(false);
    setTempoOverviewHintDontShowAgain(false);
  }, [tempoOverviewHintDontShowAgain, tempoOverviewHintDismissed]);

  useEffect(() => {
    if (!studentId) return;
    void loadTempoContext();
    void loadSessions();
  }, [studentId, loadTempoContext, loadSessions]);

  useEffect(() => {
    const state = getDidacticHintState(TEMPO_OVERVIEW_HINT_ID);
    setTempoOverviewHintDismissed(Boolean(state.dismissedAt));
    setTempoOverviewHintLoaded(true);
  }, []);

  useEffect(() => {
    if (!tempoOverviewHintLoaded) return;
    if (pageLoading || Boolean(accessError)) return;
    if (tempoOverviewHintDismissed) return;
    markDidacticHintSeen(TEMPO_OVERVIEW_HINT_ID);
    setTempoOverviewHintVisible(true);
  }, [tempoOverviewHintLoaded, pageLoading, accessError, tempoOverviewHintDismissed]);

  useEffect(() => {
    if (!selectedNotesSessionId && notesSessions.length > 0) {
      setSelectedNotesSessionId(notesSessions[0].id);
    }
  }, [selectedNotesSessionId, notesSessions]);

  useEffect(() => {
    if (!selectedDecisionSessionId && decisionSessions.length > 0) {
      setSelectedDecisionSessionId(decisionSessions[0].id);
    }
  }, [selectedDecisionSessionId, decisionSessions]);

  useEffect(() => {
    if (!selectedNotesSessionId) {
      setNotes([]);
      return;
    }
    void loadNotes(selectedNotesSessionId);
  }, [selectedNotesSessionId, loadNotes]);

  useEffect(() => {
    if (!selectedDecisionSessionId) {
      setDecisionRuns([]);
      return;
    }
    void loadDecisionRuns(selectedDecisionSessionId);
  }, [selectedDecisionSessionId, loadDecisionRuns]);

  useEffect(() => {
    if (!activeDecisionRun) {
      setDecisionAxes([]);
      return;
    }
    const axes = extractAxesFromJson(activeDecisionRun.axes_json);
    setDecisionAxes(axes.length === 3 ? axes : []);
  }, [activeDecisionRun]);

  useEffect(() => {
    if (hasDecisionPlan) {
      setDecisionComposerCollapsed(true);
      setDecisionHistoryCollapsed(true);
      return;
    }
    setDecisionComposerCollapsed(false);
  }, [hasDecisionPlan]);

  useEffect(() => {
    setDecisionHistoryCollapsed(true);
  }, [selectedDecisionSessionId]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const sync = () => setIsCompactViewport(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => {
      media.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    decisionDragPointerIdRef.current = null;
    decisionDragStartXRef.current = null;
    setDecisionDragOffset(0);
    setDecisionDragging(false);
    setDecisionPopIndex(-1);
    setDecisionDetails(null);
    if (decisionAxes.length === 0) {
      setDecisionCarouselIndex(0);
      setDecisionSettledIndex(0);
      decisionPreviousCarouselIndexRef.current = 0;
      return;
    }
    setDecisionCarouselIndex((previous) => {
      const next = Math.min(previous, decisionAxes.length - 1);
      setDecisionSettledIndex(next);
      decisionPreviousCarouselIndexRef.current = next;
      return next;
    });
  }, [decisionAxes.length]);

  useEffect(() => {
    if (decisionDragging) {
      setDecisionPopIndex(-1);
      return;
    }
    const hasCarouselChanged =
      decisionPreviousCarouselIndexRef.current !== decisionCarouselIndex;
    const timeoutId = window.setTimeout(() => {
      setDecisionSettledIndex(decisionCarouselIndex);
      if (hasCarouselChanged) {
        setDecisionPopIndex(decisionCarouselIndex);
      } else {
        setDecisionPopIndex(-1);
      }
      decisionPreviousCarouselIndexRef.current = decisionCarouselIndex;
    }, 560);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [decisionCarouselIndex, decisionDragging]);

  const handleAddNote = async () => {
    if (!noteContent.trim()) {
      setStatusMessage("Ajoute un contenu de note.");
      return;
    }
    setNoteSubmitting(true);
    setStatusMessage("");
    try {
      const session = await getNotesSession();
      const coachId = await getAuthenticatedCoachId();
      if (!coachId) {
        throw new Error("Session invalide.");
      }
      const payload = {
        session_id: session.id,
        coach_id: coachId,
        card_type: noteType,
        content: noteContent.trim(),
        order_index: notes.length,
        occurred_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("tempo_note_cards").insert([payload]);
      if (error) {
        setStatusMessage(error.message ?? "Ajout de note impossible.");
        pushToast(error.message ?? "Ajout de note impossible.", "error");
        setNoteSubmitting(false);
        return;
      }
      setNoteContent("");
      await loadNotes(session.id);
      await loadSessions();
      pushToast("Note ajoutee.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ajout de note impossible.";
      setStatusMessage(message);
      pushToast(message, "error");
    } finally {
      setNoteSubmitting(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    setDeletingNoteId(noteId);
    const { error } = await supabase.from("tempo_note_cards").delete().eq("id", noteId);
    if (error) {
      setStatusMessage(error.message ?? "Suppression impossible.");
      pushToast(error.message ?? "Suppression impossible.", "error");
      setDeletingNoteId(null);
      return;
    }
    await loadNotes(selectedNotesSessionId);
    await loadSessions();
    pushToast("Note supprimee.", "info");
    setDeletingNoteId(null);
  };

  const handleSaveNoteEdit = async () => {
    if (!editingNoteId || !editingNoteContent.trim()) return;
    const { error } = await supabase
      .from("tempo_note_cards")
      .update({
        content: editingNoteContent.trim(),
        card_type: editingNoteType,
      })
      .eq("id", editingNoteId);
    if (error) {
      setStatusMessage(error.message ?? "Modification impossible.");
      pushToast(error.message ?? "Modification impossible.", "error");
      return;
    }
    setEditingNoteId(null);
    await loadNotes(selectedNotesSessionId);
    await loadSessions();
    pushToast("Note modifiee.", "success");
  };

  const startNewNotesSession = async () => {
    try {
      const created = await createSession("notes", "Prise de notes");
      setSelectedNotesSessionId(created.id);
      setTempoMode("notes");
      setNotes([]);
      pushToast("Nouvelle session de notes creee.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Creation de session impossible.";
      setStatusMessage(message);
      pushToast(message, "error");
    }
  };

  const startNewDecisionSession = async () => {
    try {
      const created = await createSession(
        "decision",
        "Aide a la decision",
        decisionClub.trim() || null
      );
      setSelectedDecisionSessionId(created.id);
      setDecisionAxes([]);
      setDecisionRuns([]);
      setDecisionCarouselIndex(0);
      setDecisionSettledIndex(0);
      setDecisionPopIndex(-1);
      decisionPreviousCarouselIndexRef.current = 0;
      setTempoMode("decision");
      setDecisionComposerCollapsed(false);
      setDecisionHistoryCollapsed(true);
      pushToast("Nouvelle session decision creee.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Creation de session impossible.";
      setStatusMessage(message);
      pushToast(message, "error");
    }
  };

  const stepDecisionCarousel = useCallback(
    (direction: 1 | -1) => {
      setDecisionCarouselIndex((previous) => {
        const total = Math.max(1, decisionAxes.length);
        if (direction === 1) return (previous + 1) % total;
        return (previous - 1 + total) % total;
      });
    },
    [decisionAxes.length]
  );

  const stopDecisionDrag = useCallback((target?: HTMLDivElement | null) => {
    const pointerId = decisionDragPointerIdRef.current;
    if (target && pointerId !== null && target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId);
    }
    decisionDragPointerIdRef.current = null;
    decisionDragStartXRef.current = null;
    setDecisionDragging(false);
    setDecisionDragOffset(0);
  }, []);

  const handleDecisionStagePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (decisionAxes.length <= 1) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const targetNode = event.target as HTMLElement;
      if (targetNode.closest("button")) return;
      const stage = event.currentTarget;
      stage.setPointerCapture(event.pointerId);
      decisionDragStartXRef.current = event.clientX;
      decisionDragPointerIdRef.current = event.pointerId;
      setDecisionDragging(true);
      setDecisionDragOffset(0);
      setDecisionPopIndex(-1);
    },
    [decisionAxes.length]
  );

  const handleDecisionStagePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!decisionDragging) return;
      if (decisionDragPointerIdRef.current !== event.pointerId) return;
      const startX = decisionDragStartXRef.current;
      if (startX === null) return;
      const deltaX = event.clientX - startX;
      const maxOffset = 260;
      const clampedOffset = Math.max(-maxOffset, Math.min(maxOffset, deltaX));
      setDecisionDragOffset(clampedOffset);
    },
    [decisionDragging]
  );

  const handleDecisionStagePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (decisionDragPointerIdRef.current !== event.pointerId) return;
      const startX = decisionDragStartXRef.current;
      const deltaX = startX === null ? 0 : event.clientX - startX;
      const threshold = 56;
      if (deltaX <= -threshold) {
        stepDecisionCarousel(1);
      } else if (deltaX >= threshold) {
        stepDecisionCarousel(-1);
      }
      stopDecisionDrag(event.currentTarget);
    },
    [stepDecisionCarousel, stopDecisionDrag]
  );

  const handleDecisionStagePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (decisionDragPointerIdRef.current !== event.pointerId) return;
      stopDecisionDrag(event.currentTarget);
    },
    [stopDecisionDrag]
  );

  if (!studentId) {
    return (
      <RoleGuard allowedRoles={["owner", "coach", "staff"]}>
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-red-400">Eleve introuvable.</p>
        </section>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={["owner", "coach", "staff"]}>
      {pageLoading ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-[var(--muted)]">Chargement de Tempo...</p>
        </section>
      ) : accessError ? (
        <div className="space-y-4">
          <PageHeader
            overline={
              <div className="flex items-center gap-2">
                <PageBack />
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Eleve</p>
              </div>
            }
            title="Tempo"
            subtitle="Assistant de seance"
            meta={
              <StudentTabs
                studentId={studentId}
                activeTab="tempo"
                tempoDisabled
                tempoDisabledReason={accessError}
              />
            }
          />
          <section className="panel rounded-2xl p-6">
            <p className="text-sm text-red-400">{accessError}</p>
            <button
              type="button"
              onClick={() => router.push(`/app/coach/eleves/${studentId}`)}
              className="mt-4 rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-800 transition hover:bg-slate-200"
            >
              Retour fiche eleve
            </button>
          </section>
        </div>
      ) : (
        <div className="space-y-5">
          <PageHeader
            overline={
              <div className="flex items-center gap-2">
                <PageBack />
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Eleve</p>
              </div>
            }
            title={`${tempoContext?.student.firstName ?? ""} ${
              tempoContext?.student.lastName ?? ""
            }`.trim() || "Tempo"}
            subtitle={tempoContext?.student.email || "Assistant Tempo"}
            titleBadges={
              <span className="tempo-brand-badge">
                <span className="tempo-brand-dot" aria-hidden="true" />
                <span>TEMPO</span>
              </span>
            }
            meta={<StudentTabs studentId={studentId} activeTab="tempo" />}
            actions={
              <button
                type="button"
                onClick={() => router.push(`/app/coach/rapports/nouveau?studentId=${studentId}`)}
                className="rounded-full bg-emerald-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-900 transition hover:bg-emerald-200"
              >
                Ouvrir le builder
              </button>
            }
          />

          <section className="tempo-mode-switcher rounded-2xl p-4 shadow-[0_10px_28px_rgba(15,23,42,0.08)]">
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: "notes" as const, label: "Prise de notes" },
                { id: "decision" as const, label: "Aide a la decision" },
                { id: "report" as const, label: "Redaction rapport" },
              ].map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setTempoMode(mode.id)}
                  className={`tempo-mode-pill rounded-full px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-wide transition ${
                    tempoMode === mode.id
                      ? "tempo-mode-pill-active"
                      : "tempo-mode-pill-idle"
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            {sessionsLoading ? (
              <p className="mt-3 text-sm text-slate-600">Synchronisation des sessions...</p>
            ) : null}
            {statusMessage ? <p className="mt-3 text-sm text-red-500">{statusMessage}</p> : null}
          </section>

          {tempoMode === "notes" ? (
            <section className="tempo-surface-panel space-y-4 rounded-2xl bg-white/80 p-5 shadow-[0_10px_28px_rgba(15,23,42,0.08)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Prise de notes</h2>
                  <p className="text-sm text-slate-600">
                    Cartes horodatees pour preparer le rapport de fin de seance.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void startNewNotesSession()}
                    className="rounded-full bg-slate-100 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-wide text-slate-800 transition hover:bg-slate-200"
                  >
                    Nouvelle session
                  </button>
                  <button
                    type="button"
                    onClick={() => void createDraftReport(selectedNotesSessionId)}
                    disabled={!selectedNotesSessionId || draftCreating}
                    className="rounded-full bg-emerald-100 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-wide text-emerald-900 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {draftCreating ? "Creation..." : "Creer brouillon rapport"}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Session notes
                  </label>
                  <select
                    value={selectedNotesSessionId}
                    onChange={(event) => setSelectedNotesSessionId(event.target.value)}
                    className="w-full rounded-lg bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  >
                    {notesSessions.length === 0 ? (
                      <option value="">Aucune session</option>
                    ) : (
                      notesSessions.map((session) => (
                        <option key={session.id} value={session.id}>
                          {buildSessionLabel(session)}
                        </option>
                      ))
                    )}
                  </select>
                  <div className="grid gap-2">
                    <select
                      value={noteType}
                      onChange={(event) => {
                        const parsed = TempoNoteCardTypeSchema.safeParse(event.target.value);
                        if (parsed.success) setNoteType(parsed.data);
                      }}
                      className="w-full rounded-lg bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    >
                      {NOTE_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <textarea
                      value={noteContent}
                      onChange={(event) => setNoteContent(event.target.value)}
                      rows={5}
                      placeholder="Note rapide, constats, consignes, objectifs..."
                      className="w-full rounded-xl bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    />
                    <button
                      type="button"
                      onClick={() => void handleAddNote()}
                      disabled={noteSubmitting}
                      className="rounded-full bg-emerald-100 px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-wide text-emerald-900 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {noteSubmitting ? "Ajout..." : "Ajouter la carte"}
                    </button>
                  </div>
                </div>
                <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Timeline de notes
                  </p>
                  {notesLoading ? (
                    <p className="text-sm text-slate-600">Chargement des notes...</p>
                  ) : notes.length === 0 ? (
                    <p className="text-sm text-slate-600">Aucune note pour cette session.</p>
                  ) : (
                    <div className="space-y-2">
                      {notes.map((note) => (
                        <article key={note.id} className="rounded-xl bg-white p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-emerald-100 px-2 py-1 text-[0.62rem] font-semibold uppercase tracking-wide text-emerald-900">
                                {NOTE_TYPE_LABELS[note.card_type]}
                              </span>
                              <span className="text-xs text-slate-500">{formatDate(note.occurred_at)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingNoteId(note.id);
                                  setEditingNoteType(note.card_type);
                                  setEditingNoteContent(note.content);
                                }}
                                className="rounded-full bg-slate-100 px-2 py-1 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-700 transition hover:bg-slate-200"
                              >
                                Editer
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteNote(note.id)}
                                disabled={deletingNoteId === note.id}
                                className="rounded-full bg-rose-100 px-2 py-1 text-[0.6rem] font-semibold uppercase tracking-wide text-rose-800 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {deletingNoteId === note.id ? "..." : "Supprimer"}
                              </button>
                            </div>
                          </div>
                          {editingNoteId === note.id ? (
                            <div className="mt-2 space-y-2">
                              <select
                                value={editingNoteType}
                                onChange={(event) => {
                                  const parsed = TempoNoteCardTypeSchema.safeParse(event.target.value);
                                  if (parsed.success) setEditingNoteType(parsed.data);
                                }}
                                className="w-full rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-900"
                              >
                                {NOTE_TYPE_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <textarea
                                value={editingNoteContent}
                                onChange={(event) => setEditingNoteContent(event.target.value)}
                                rows={3}
                                className="w-full rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-900"
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleSaveNoteEdit()}
                                  className="rounded-full bg-emerald-100 px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-wide text-emerald-900 transition hover:bg-emerald-200"
                                >
                                  Sauvegarder
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingNoteId(null)}
                                  className="rounded-full bg-slate-100 px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-wide text-slate-700 transition hover:bg-slate-200"
                                >
                                  Annuler
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{note.content}</p>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          ) : null}

          {tempoMode === "decision" ? (
            <section className="tempo-surface-panel space-y-4 rounded-2xl bg-white/80 p-5 shadow-[0_10px_28px_rgba(15,23,42,0.08)]">
              <div className="tempo-decision-hero relative overflow-hidden rounded-2xl p-4 sm:p-5">
                <span className="tempo-decision-orb tempo-decision-orb-a" aria-hidden="true" />
                <span className="tempo-decision-orb tempo-decision-orb-b" aria-hidden="true" />
                <div className="relative z-[1] flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-2xl">
                    <p className="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-emerald-900/80">
                      Plan de seance guide
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-slate-900">Aide a la decision</h2>
                    <p className="mt-1 text-sm text-slate-700">
                      Mode dedie a la seance en direct: genere 2 ou 3 axes prioritaires sans
                      publier de rapport.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void startNewDecisionSession()}
                      className="rounded-full bg-white/80 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-wide text-slate-900 transition hover:bg-white"
                    >
                      Nouvelle session
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyAxes()}
                      disabled={decisionAxes.length === 0}
                      className="rounded-full bg-slate-900/90 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-wide text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Copier le plan
                    </button>
                  </div>
                </div>
              </div>

              <div
                className={`grid gap-3 ${
                  hasDecisionPlan
                    ? "xl:grid-cols-[minmax(0,0.42fr)_minmax(0,1.58fr)]"
                    : "xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]"
                }`}
              >
                <div className="tempo-slide-in-left space-y-2 rounded-2xl bg-slate-50 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Session decision
                    </label>
                    {hasDecisionPlan ? (
                      <button
                        type="button"
                        onClick={() => setDecisionComposerCollapsed((previous) => !previous)}
                        className="rounded-full bg-white px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-800 transition hover:bg-slate-100"
                      >
                        {decisionComposerCollapsed ? "Afficher brief" : "Minimiser brief"}
                      </button>
                    ) : null}
                  </div>
                  <select
                    value={selectedDecisionSessionId}
                    onChange={(event) => setSelectedDecisionSessionId(event.target.value)}
                    className="w-full rounded-lg bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  >
                    {decisionSessions.length === 0 ? (
                      <option value="">Aucune session</option>
                    ) : (
                      decisionSessions.map((session) => (
                        <option key={session.id} value={session.id}>
                          {buildSessionLabel(session)}
                        </option>
                      ))
                    )}
                  </select>

                  {decisionComposerCollapsed ? (
                    <article className="rounded-xl bg-white p-3 ">
                      <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-700">
                        Section minimisee
                      </p>
                      <p className="mt-1 text-xs text-slate-600">{selectedDecisionSessionLabel}</p>
                      <p className="mt-2 text-xs text-slate-700">
                        <span className="font-semibold text-slate-900">Club:</span> {decisionSummaryClub}
                      </p>
                      <p className="mt-1 text-sm text-slate-800">{decisionSummaryConstat}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setDecisionComposerCollapsed(false)}
                          className="rounded-full bg-slate-100 px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-wide text-slate-800 transition hover:bg-slate-200"
                        >
                          Modifier le brief
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleGenerateDecision()}
                          disabled={decisionGenerating}
                          className="rounded-full bg-emerald-500 px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-wide text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {decisionGenerating ? "Generation..." : "Regenerer"}
                        </button>
                      </div>
                    </article>
                  ) : (
                    <>
                      <input
                        value={decisionClub}
                        onChange={(event) => setDecisionClub(event.target.value)}
                        placeholder="Club (obligatoire)"
                        className="w-full rounded-lg bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      />
                      <textarea
                        value={decisionConstat}
                        onChange={(event) => setDecisionConstat(event.target.value)}
                        rows={4}
                        placeholder="Constat de seance (obligatoire)"
                        className="w-full rounded-lg bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      />
                      <textarea
                        value={decisionIntent}
                        onChange={(event) => setDecisionIntent(event.target.value)}
                        rows={3}
                        placeholder="Travail souhaite (optionnel)"
                        className="w-full rounded-lg bg-white px-3 py-2 text-sm text-slate-900  focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      />
                      <button
                        type="button"
                        onClick={() => void handleGenerateDecision()}
                        disabled={decisionGenerating}
                        className="rounded-full bg-emerald-500 px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-wide text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {decisionGenerating
                          ? decisionPhase === "clarify"
                            ? "Analyse..."
                            : "Generation..."
                          : "Generer les 3 axes"}
                      </button>
                      <p className="text-[0.7rem] text-slate-600">
                        Ce mode sert a preparer la seance. La redaction de rapport se fait dans l onglet
                        dedie.
                      </p>
                    </>
                  )}

                  <div className="rounded-xl bg-white p-3">
                    <button
                      type="button"
                      onClick={() => setDecisionHistoryCollapsed((previous) => !previous)}
                      className="flex w-full items-center justify-between gap-2 text-left"
                    >
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                        Historique decision
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[0.58rem] font-semibold uppercase tracking-wide text-slate-700">
                        {decisionHistoryCollapsed ? "Afficher" : "Masquer"}
                      </span>
                    </button>
                    {!decisionHistoryCollapsed ? (
                      decisionRunsLoading ? (
                        <p className="mt-2 text-sm text-slate-600">Chargement...</p>
                      ) : decisionRuns.length === 0 ? (
                        <p className="mt-2 text-sm text-slate-600">Aucune decision sauvegardee.</p>
                      ) : (
                        <ul className="mt-2 space-y-1 text-sm text-slate-800">
                          {decisionRuns.slice(0, 4).map((run) => (
                            <li key={run.id} className="rounded-lg bg-slate-50 px-2 py-1">
                              {formatDate(run.created_at)} - {run.club}
                            </li>
                          ))}
                        </ul>
                      )
                    ) : null}
                  </div>
                </div>

                <div className="tempo-axis-pane tempo-slide-in-right space-y-3 rounded-2xl bg-slate-50 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Axes prioritaires de la seance
                    </p>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-wide text-slate-700">
                      {decisionAxes.length}/3 axes
                    </span>
                  </div>

                  {decisionAxes.length === 0 ? (
                    <article className="rounded-2xl bg-white px-4 py-5 text-center">
                      <p className="text-sm font-semibold text-slate-900">
                        Aucun plan actif pour cette session.
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Lance la generation pour obtenir 3 axes actionnables en seance.
                      </p>
                    </article>
                  ) : (
                    <>
                      <div className="tempo-axis-carousel">
                        <div
                          className={`tempo-axis-carousel-stage ${
                            decisionDragging ? "tempo-axis-carousel-stage-dragging" : ""
                          }`}
                          onPointerDown={handleDecisionStagePointerDown}
                          onPointerMove={handleDecisionStagePointerMove}
                          onPointerUp={handleDecisionStagePointerUp}
                          onPointerCancel={handleDecisionStagePointerCancel}
                        >
                          <button
                            type="button"
                            onClick={() => stepDecisionCarousel(-1)}
                            aria-label="Carte precedente"
                            className="tempo-axis-nav tempo-axis-nav-left"
                          />
                          <button
                            type="button"
                            onClick={() => stepDecisionCarousel(1)}
                            aria-label="Carte suivante"
                            className="tempo-axis-nav tempo-axis-nav-right"
                          />
                          <div
                            className={`tempo-axis-track ${
                              decisionDragging ? "tempo-axis-track-dragging" : ""
                            }`}
                            style={{
                              transform: `translateX(calc(var(--tempo-track-center-offset) - ${decisionCarouselIndex} * (var(--tempo-slide-width) + var(--tempo-slide-gap)) + ${decisionDragOffset}px))`,
                            }}
                          >
                            {decisionAxes.map((axis, index) => {
                              const meta = getDecisionPriorityMeta(axis.priority);
                              const isActive = index === decisionCarouselIndex;
                              const isSettledActive =
                                isActive && decisionSettledIndex === index && !decisionDragging;
                              const isPoppingActive =
                                isSettledActive && decisionPopIndex === index;
                              const displayTitle = axis.title.replace(/\.{3,}$/g, "").trim();
                              const summaryDetailedPoints = toDecisionPoints(axis.summary, 6, 2000);
                              const rationaleDetailedPoints = toDecisionPoints(axis.rationale, 8, 2000);
                              const cautionDetailedPoints = toDecisionPoints(axis.caution, 6, 2000);
                              const summaryPoints = isCompactViewport
                                ? summaryDetailedPoints.map(toDecisionCompactPoint).slice(0, 3)
                                : summaryDetailedPoints.slice(0, 4);
                              const rationalePoints = isCompactViewport
                                ? rationaleDetailedPoints.map(toDecisionCompactPoint).slice(0, 3)
                                : rationaleDetailedPoints.slice(0, 4);
                              const cautionPoints = isCompactViewport
                                ? cautionDetailedPoints.map(toDecisionCompactPoint).slice(0, 3)
                                : cautionDetailedPoints.slice(0, 4);
                              return (
                                <article
                                  key={`${axis.priority}-${axis.title}`}
                                  className={`tempo-axis-card tempo-axis-slide ${meta.cardClass} ${
                                    isActive
                                      ? "tempo-axis-slide-active"
                                      : "tempo-axis-slide-peek"
                                  } ${isSettledActive ? "tempo-axis-slide-settled" : ""} ${
                                    isPoppingActive ? "tempo-axis-slide-pop" : ""
                                  } flex flex-col rounded-2xl p-4`}
                                  onClick={() => setDecisionCarouselIndex(index)}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span
                                      className={`rounded-full px-2.5 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.16em] ${meta.pillClass}`}
                                    >
                                      P{axis.priority}
                                    </span>
                                    <span className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-600">
                                      {meta.label}
                                    </span>
                                  </div>
                                  <h3 className="mt-3 text-[1.02rem] font-semibold leading-6 tracking-tight text-slate-950">
                                    {displayTitle}
                                  </h3>
                                  <div className="mt-3 flex flex-1 flex-col gap-2.5 text-[0.79rem]">
                                    <div className="rounded-xl bg-white/92 px-3 py-2 text-slate-800">
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-600">
                                          Cap de seance
                                        </p>
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            setDecisionDetails({ axis, section: "summary" });
                                          }}
                                          className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[0.58rem] font-semibold text-slate-700 transition hover:bg-slate-200"
                                          aria-label="Voir le detail du cap de seance"
                                        >
                                          &#8599;
                                        </button>
                                      </div>
                                      <ul className="mt-2 space-y-1.5">
                                        {summaryPoints.map((point, pointIndex) => {
                                          const { lead, rest } = splitPointLead(
                                            point,
                                            isCompactViewport ? 2 : 3
                                          );
                                          return (
                                            <li
                                              key={`${axis.priority}-summary-${pointIndex}`}
                                              className="flex items-start gap-2.5"
                                            >
                                              <span className="mt-[0.42rem] h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                                              <span className="text-[0.78rem] leading-5">
                                                <span className="font-semibold text-slate-950">
                                                  {lead}
                                                </span>
                                                {rest ? (
                                                  <span className="text-slate-700"> {rest}</span>
                                                ) : null}
                                              </span>
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    </div>
                                    <div className="rounded-xl bg-white/88 px-3 py-2 text-slate-800">
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-600">
                                          Pourquoi prioritaire
                                        </p>
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            setDecisionDetails({ axis, section: "rationale" });
                                          }}
                                          className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[0.58rem] font-semibold text-slate-700 transition hover:bg-slate-200"
                                          aria-label="Voir le detail du pourquoi prioritaire"
                                        >
                                          &#8599;
                                        </button>
                                      </div>
                                      <ul className="mt-2 space-y-1.5">
                                        {rationalePoints.map((point, pointIndex) => {
                                          const { lead, rest } = splitPointLead(
                                            point,
                                            isCompactViewport ? 2 : 3
                                          );
                                          return (
                                            <li
                                              key={`${axis.priority}-why-${pointIndex}`}
                                              className="flex items-start gap-2.5"
                                            >
                                              <span className="mt-[0.42rem] h-2 w-2 shrink-0 rounded-full bg-sky-500" />
                                              <span className="text-[0.78rem] leading-5">
                                                <span className="font-semibold text-slate-950">
                                                  {lead}
                                                </span>
                                                {rest ? (
                                                  <span className="text-slate-700"> {rest}</span>
                                                ) : null}
                                              </span>
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    </div>
                                    <div className="rounded-xl bg-white/88 px-3 py-2 text-slate-800">
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-600">
                                          Vigilance
                                        </p>
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            setDecisionDetails({ axis, section: "caution" });
                                          }}
                                          className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[0.58rem] font-semibold text-slate-700 transition hover:bg-slate-200"
                                          aria-label="Voir le detail de vigilance"
                                        >
                                          &#8599;
                                        </button>
                                      </div>
                                      <ul className="mt-2 space-y-1.5">
                                        {cautionPoints.map((point, pointIndex) => {
                                          const { lead, rest } = splitPointLead(
                                            point,
                                            isCompactViewport ? 2 : 3
                                          );
                                          return (
                                            <li
                                              key={`${axis.priority}-risk-${pointIndex}`}
                                              className="flex items-start gap-2.5"
                                            >
                                              <span className="mt-[0.42rem] h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                                              <span className="text-[0.78rem] leading-5">
                                                <span className="font-semibold text-slate-950">
                                                  {lead}
                                                </span>
                                                {rest ? (
                                                  <span className="text-slate-700"> {rest}</span>
                                                ) : null}
                                              </span>
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    </div>
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        </div>
                        <div className="relative z-20 mt-4 flex items-center justify-center gap-2">
                          {decisionAxes.map((axis, index) => {
                            const active = index === decisionCarouselIndex;
                            return (
                              <button
                                key={`anchor-${axis.priority}-${axis.title}`}
                                type="button"
                                onClick={() => setDecisionCarouselIndex(index)}
                                aria-label={`Afficher priorite ${axis.priority}`}
                                className={`tempo-axis-anchor-dot ${
                                  active ? "tempo-axis-anchor-dot-active" : ""
                                }`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}

                </div>
              </div>
            </section>
          ) : null}

          {tempoMode === "report" ? (
            <section className="tempo-surface-panel space-y-4 rounded-2xl bg-white/80 p-5 shadow-[0_10px_28px_rgba(15,23,42,0.08)]">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Redaction du rapport</h2>
                <p className="text-sm text-slate-600">
                  Tempo garde le builder actuel pour la publication. Tu peux ouvrir directement une
                  redaction vide ou creer d abord un brouillon depuis la session de notes active.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => router.push(`/app/coach/rapports/nouveau?studentId=${studentId}`)}
                  className="rounded-xl bg-emerald-100 px-4 py-3 text-left transition hover:bg-emerald-200"
                >
                  <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-emerald-900">
                    Ouvrir redaction
                  </p>
                  <p className="mt-1 text-sm text-emerald-900">
                    Demarre un rapport avec l eleve preselectionne.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => void createDraftReport(draftSessionCandidateId)}
                  disabled={!draftSessionCandidateId || draftCreating}
                  className="rounded-xl bg-slate-100 px-4 py-3 text-left transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-slate-900">
                    {draftCreating ? "Creation..." : "Brouillon depuis notes"}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    Convertit les notes de la session active en brouillon puis ouvre le builder.
                  </p>
                </button>
              </div>
              {!draftSessionCandidateId ? (
                <p className="text-xs text-slate-600">
                  Cree d abord une session dans Prise de notes pour generer un brouillon auto.
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="tempo-surface-panel space-y-3 rounded-2xl bg-white/75 p-4 shadow-[0_10px_28px_rgba(15,23,42,0.08)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-900">
                Contexte IA exploite
              </h2>
              <button
                type="button"
                onClick={() => setShowContextDetails((previous) => !previous)}
                className="rounded-full bg-slate-100 px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-wide text-slate-800 transition hover:bg-slate-200"
              >
                {showContextDetails ? "Masquer details" : "Voir details"}
              </button>
            </div>
            <p className="text-xs text-slate-600">
              Contexte compacte pour limiter le cout tokens.
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              <article className="rounded-xl bg-slate-50 p-3">
                <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-700">
                  TPI / CPI
                </p>
                <p className="mt-1 text-sm text-slate-900">
                  {compactLine(tempoContext?.summaries.tpi || "")}
                </p>
              </article>
              <article className="rounded-xl bg-slate-50 p-3">
                <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-700">
                  Rapports publies
                </p>
                <p className="mt-1 text-sm text-slate-900">
                  {compactLine(tempoContext?.summaries.reports || "")}
                </p>
              </article>
              <article className="rounded-xl bg-slate-50 p-3">
                <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-700">
                  Datas radar
                </p>
                <p className="mt-1 text-sm text-slate-900">
                  {compactLine(tempoContext?.summaries.radar || "")}
                </p>
              </article>
              <article className="rounded-xl bg-slate-50 p-3">
                <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-700">
                  Tests normalises
                </p>
                <p className="mt-1 text-sm text-slate-900">
                  {compactLine(tempoContext?.summaries.tests || "")}
                </p>
              </article>
            </div>
            {showContextDetails ? (
              <div className="grid gap-3 md:grid-cols-2">
                <article className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-700">
                    TPI / CPI - detail
                  </p>
                  <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-line text-sm text-slate-900">
                    {tempoContext?.summaries.tpi || "Aucune donnee"}
                  </p>
                </article>
                <article className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-700">
                    Rapports - detail
                  </p>
                  <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-line text-sm text-slate-900">
                    {tempoContext?.summaries.reports || "Aucune donnee"}
                  </p>
                </article>
                <article className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-700">
                    Radar - detail
                  </p>
                  <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-line text-sm text-slate-900">
                    {tempoContext?.summaries.radar || "Aucune donnee"}
                  </p>
                </article>
                <article className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-700">
                    Tests - detail
                  </p>
                  <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-line text-sm text-slate-900">
                    {tempoContext?.summaries.tests || "Aucune donnee"}
                  </p>
                </article>
              </div>
            ) : null}
          </section>
        </div>
      )}

      <TempoIntroHintModal
        open={tempoOverviewHintVisible}
        dontShowAgain={tempoOverviewHintDontShowAgain}
        onDontShowAgainChange={setTempoOverviewHintDontShowAgain}
        onClose={closeTempoOverviewHint}
      />

      {decisionDetails ? (
        <div className="fixed inset-0 z-[121] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-3xl rounded-3xl bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.35)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  Axe prioritaire P{decisionDetails.axis.priority}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">
                  {decisionDetails.axis.title.replace(/\.{3,}$/g, "").trim()}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDecisionDetails(null)}
                className="rounded-full bg-slate-100 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-wide text-slate-800 transition hover:bg-slate-200"
              >
                Fermer
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <article className="rounded-xl bg-slate-50 p-3">
                <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-700">
                  {DECISION_SECTION_LABELS[decisionDetails.section]} - contenu complet
                </p>
                <ul className="mt-2 max-h-[48vh] space-y-2 overflow-y-auto pr-1 text-sm text-slate-900">
                  {toDecisionPoints(
                    decisionDetails.axis[decisionDetails.section],
                    12,
                    420
                  ).map((point, pointIndex) => {
                    const { lead, rest } = splitPointLead(point, 4);
                    return (
                      <li key={`detail-full-${pointIndex}`} className="flex items-start gap-2.5">
                        <span
                          className={`mt-[0.48rem] h-2 w-2 shrink-0 rounded-full ${
                            decisionDetails.section === "summary"
                              ? "bg-emerald-500"
                              : decisionDetails.section === "rationale"
                                ? "bg-sky-500"
                                : "bg-rose-500"
                          }`}
                        />
                        <span className="leading-relaxed">
                          <span className="font-semibold text-slate-950">{lead}</span>
                          {rest ? <span className="text-slate-700"> {rest}</span> : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </article>
            </div>
          </div>
        </div>
      ) : null}

      {clarifyOpen ? (
        <div className="fixed inset-0 z-[120] overflow-y-auto bg-black/70 px-4 py-10">
          <div className="relative mx-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-[var(--bg-elevated)] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
            <span className="pointer-events-none absolute -left-20 -top-16 h-56 w-56 rounded-full bg-emerald-300/20 blur-3xl" />
            <span className="pointer-events-none absolute -right-24 top-10 h-56 w-56 rounded-full bg-sky-300/20 blur-3xl" />
            <div className="flex items-start justify-between gap-4 p-6">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                  Etape de clarification
                </p>
                <h3 className="mt-2 text-xl font-semibold text-[var(--text)]">
                  Quelques questions avant de proposer les 3 axes
                </h3>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Reponds rapidement pour que Tempo priorise les recommandations.
                </p>
                <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-[var(--text)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {clarifyQuestions.length} question
                  {clarifyQuestions.length > 1 ? "s" : ""} - flow express
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setClarifyOpen(false);
                  setClarifyQuestions([]);
                  setClarifyAnswers({});
                  setPendingDecisionSessionId("");
                  setPendingDecisionSource("");
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-[var(--muted)] transition hover:bg-white/20 hover:text-[var(--text)]"
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

            <div className="max-h-[60vh] space-y-4 overflow-y-auto px-6 pb-6">
              {clarifyQuestions.map((question, index) => {
                const currentValue = clarifyAnswers[question.id];
                const selectedValues = arrayFromRecord(currentValue);
                const textValue = Array.isArray(currentValue)
                  ? currentValue.join(", ")
                  : (currentValue ?? "");

                return (
                  <article
                    key={question.id}
                    className="rounded-2xl bg-gradient-to-br from-white/20 via-white/12 to-transparent p-4 shadow-[0_10px_24px_rgba(15,23,42,0.14)]"
                  >
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-300/45 to-sky-300/35 text-[0.62rem] font-semibold text-[var(--text)]">
                        {index + 1}
                      </span>
                      <p className="pt-0.5 text-sm font-semibold text-[var(--text)]">
                        {question.question}
                      </p>
                    </div>
                    {question.type === "choices" && (question.choices?.length ?? 0) > 0 ? (
                      question.multi ? (
                        <div className="mt-3 grid gap-2">
                          {question.choices?.map((choice) => {
                            const checked = selectedValues.includes(choice);
                            return (
                              <label
                                key={choice}
                                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
                                  checked
                                    ? "bg-gradient-to-r from-emerald-300/40 via-emerald-200/30 to-sky-300/35 text-[var(--text)] shadow-[0_6px_14px_rgba(16,185,129,0.24)]"
                                    : "bg-white/18 text-[var(--text)] hover:bg-white/24"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => {
                                    setClarifyAnswers((previous) => {
                                      const existing = arrayFromRecord(previous[question.id]);
                                      const next = event.target.checked
                                        ? [...existing, choice]
                                        : existing.filter((item) => item !== choice);
                                      return { ...previous, [question.id]: next };
                                    });
                                  }}
                                  className="accent-emerald-500"
                                />
                                <span>{choice}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="mt-3 grid gap-2">
                          {question.choices?.map((choice) => {
                            const checked = textValue === choice;
                            return (
                              <label
                                key={choice}
                                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
                                  checked
                                    ? "bg-gradient-to-r from-emerald-300/40 via-emerald-200/30 to-sky-300/35 text-[var(--text)] shadow-[0_6px_14px_rgba(16,185,129,0.24)]"
                                    : "bg-white/18 text-[var(--text)] hover:bg-white/24"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`clarify-${question.id}`}
                                  checked={checked}
                                  onChange={() =>
                                    setClarifyAnswers((previous) => ({
                                      ...previous,
                                      [question.id]: choice,
                                    }))
                                  }
                                  className="accent-emerald-500"
                                />
                                <span>{choice}</span>
                              </label>
                            );
                          })}
                        </div>
                      )
                    ) : (
                      <textarea
                        value={textValue}
                        onChange={(event) =>
                          setClarifyAnswers((previous) => ({
                            ...previous,
                            [question.id]: event.target.value,
                          }))
                        }
                        rows={3}
                        placeholder={question.placeholder || "Reponse rapide"}
                        className="mt-3 w-full rounded-xl bg-white/16 px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] focus:outline-none"
                      />
                    )}
                  </article>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  setClarifyOpen(false);
                  setClarifyQuestions([]);
                  setClarifyAnswers({});
                  setPendingDecisionSessionId("");
                  setPendingDecisionSource("");
                }}
                className="rounded-full bg-white/18 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/24"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void confirmClarifications()}
                disabled={decisionGenerating}
                className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {decisionGenerating ? "Generation..." : "Generer les axes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {decisionGenerating ? (
        <div
          className="fixed inset-0 z-[119] flex cursor-wait items-center justify-center bg-[var(--overlay)] backdrop-blur-md"
          aria-live="polite"
          aria-busy="true"
        >
          <div
            role="status"
            className="flex min-w-[17rem] flex-col items-center gap-4 rounded-3xl bg-[var(--bg-elevated)] px-6 py-5 text-[var(--text)] shadow-[var(--shadow-strong)]"
          >
            <span className="global-loader-spinner" aria-hidden="true">
              <span className="global-loader-ring-base" />
              <span className="global-loader-ring-outer" />
              <span className="global-loader-ring-inner" />
              <span className="global-loader-core" />
            </span>
            <p className="text-center text-sm font-semibold tracking-wide text-[var(--text)]">
              {decisionPhase === "clarify"
                ? "Analyse de la seance en cours"
                : "Generation des 3 axes priorises"}
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

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <style jsx global>{`
        @keyframes tempo-slide-left {
          from {
            opacity: 0;
            transform: translateX(-18px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes tempo-slide-right {
          from {
            opacity: 0;
            transform: translateX(18px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes tempo-rise {
          from {
            opacity: 0;
            transform: translateY(14px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes tempo-decision-orb {
          0%,
          100% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          50% {
            transform: translate3d(0, -8px, 0) scale(1.05);
          }
        }
        @keyframes tempo-gradient-pan {
          0% {
            background-position: 0% 50%;
          }
          100% {
            background-position: 100% 50%;
          }
        }
        @keyframes tempo-brand-pulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.95;
          }
          50% {
            transform: scale(1.14);
            opacity: 1;
          }
        }
        @keyframes tempo-slide-settle-pop {
          0% {
            transform: translateY(0) scale(1);
          }
          68% {
            transform: translateY(-0.36rem) scale(1.115);
          }
          100% {
            transform: translateY(-0.28rem) scale(1.095);
          }
        }
        @keyframes globalLoaderSpin {
          0% {
            transform: rotate(0deg);
          }
          100% {
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
        .tempo-slide-in-left {
          animation: tempo-slide-left 260ms ease both;
        }
        .tempo-slide-in-right {
          animation: tempo-slide-right 260ms ease both;
        }
        .tempo-brand-badge {
          position: relative;
          overflow: hidden;
          isolation: isolate;
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          border-radius: 9999px;
          padding: 0.3rem 0.68rem;
          font-size: 0.64rem;
          font-weight: 700;
          letter-spacing: 0.16em;
          color: rgb(6, 95, 70);
          background:
            radial-gradient(circle at 18% 50%, rgba(16, 185, 129, 0.24), transparent 55%),
            radial-gradient(circle at 82% 50%, rgba(14, 165, 233, 0.22), transparent 58%),
            linear-gradient(130deg, rgba(236, 253, 245, 0.92), rgba(224, 242, 254, 0.95));
          box-shadow:
            0 0 0 1px rgba(16, 185, 129, 0.22) inset,
            0 10px 22px rgba(14, 165, 233, 0.2);
        }
        .tempo-brand-dot {
          width: 0.45rem;
          height: 0.45rem;
          border-radius: 9999px;
          background: linear-gradient(145deg, rgb(16, 185, 129), rgb(14, 165, 233));
          box-shadow:
            0 0 0 2px rgba(255, 255, 255, 0.95),
            0 0 10px rgba(16, 185, 129, 0.55);
          animation: tempo-brand-pulse 1.7s ease-in-out infinite;
          flex-shrink: 0;
        }
        .tempo-mode-switcher {
          position: relative;
          overflow: hidden;
          isolation: isolate;
          background:
            radial-gradient(circle at 6% 20%, rgba(16, 185, 129, 0.12), transparent 35%),
            radial-gradient(circle at 96% 8%, rgba(14, 165, 233, 0.12), transparent 35%),
            linear-gradient(145deg, rgba(255, 255, 255, 0.88), rgba(248, 250, 252, 0.84));
        }
        .tempo-mode-pill {
          position: relative;
          overflow: hidden;
        }
        .tempo-mode-pill-active {
          color: rgb(6, 95, 70);
          background: linear-gradient(
            135deg,
            rgba(209, 250, 229, 0.96),
            rgba(219, 234, 254, 0.95)
          );
          box-shadow:
            0 0 0 1px rgba(16, 185, 129, 0.28) inset,
            0 10px 24px rgba(14, 165, 233, 0.16);
        }
        .tempo-mode-pill-idle {
          color: rgb(51, 65, 85);
          background: rgba(241, 245, 249, 0.9);
        }
        .tempo-mode-pill-idle:hover {
          background: rgba(226, 232, 240, 0.95);
          color: rgb(15, 23, 42);
          transform: translateY(-1px);
        }
        .tempo-decision-hero {
          background:
            radial-gradient(circle at 18% 24%, rgba(16, 185, 129, 0.2), transparent 48%),
            radial-gradient(circle at 88% 18%, rgba(59, 130, 246, 0.22), transparent 52%),
            linear-gradient(120deg, rgba(236, 253, 245, 0.95), rgba(239, 246, 255, 0.96));
          background-size: 170% 170%;
          animation: tempo-gradient-pan 4.8s ease-in-out infinite alternate;
         
        }
        .tempo-decision-orb {
          pointer-events: none;
          position: absolute;
          border-radius: 999px;
          filter: blur(1px);
          opacity: 0.85;
          animation: tempo-decision-orb 4s ease-in-out infinite;
        }
        .tempo-decision-orb-a {
          width: 120px;
          height: 120px;
          left: -24px;
          top: -44px;
          background: radial-gradient(circle, rgba(16, 185, 129, 0.26), rgba(16, 185, 129, 0));
        }
        .tempo-decision-orb-b {
          width: 150px;
          height: 150px;
          right: -26px;
          bottom: -62px;
          background: radial-gradient(circle, rgba(59, 130, 246, 0.24), rgba(59, 130, 246, 0));
          animation-delay: 0.35s;
        }
        .tempo-axis-card {
          animation: tempo-rise 280ms ease both;
          background: linear-gradient(150deg, rgba(255, 255, 255, 0.92), rgba(248, 250, 252, 0.9));
        
        }
        .tempo-axis-pane {
          width: 100%;
          max-width: 100%;
        }
        .tempo-axis-carousel {
          --tempo-slide-width: 76%;
          --tempo-slide-gap: 4%;
          --tempo-track-center-offset: calc((100% - var(--tempo-slide-width)) / 2);
          position: relative;
          width: 100%;
          max-width: 100%;
          overflow: hidden;
          border-radius: 1.25rem;
          background:
            radial-gradient(circle at 14% 18%, rgba(16, 185, 129, 0.1), transparent 46%),
            radial-gradient(circle at 86% 20%, rgba(59, 130, 246, 0.11), transparent 52%),
            linear-gradient(160deg, rgba(255, 255, 255, 0.78), rgba(248, 250, 252, 0.86));
          
          padding: 2rem 1.2rem 1.3rem;
        }
        .tempo-axis-carousel-stage {
          position: relative;
          min-height: 27rem;
          overflow: hidden;
          width: 100%;
          max-width: 100%;
          border-radius: 1rem;
          padding: 2.05rem 13.5% 1.7rem;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          touch-action: pan-y;
          user-select: none;
          cursor: grab;
          isolation: isolate;
          -webkit-mask-image: linear-gradient(
            to right,
            transparent 0%,
            #000 5%,
            #000 95%,
            transparent 100%
          );
          mask-image: linear-gradient(
            to right,
            transparent 0%,
            #000 5%,
            #000 95%,
            transparent 100%
          );
          -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
        }
        .tempo-axis-carousel-stage::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 2.6rem;
          pointer-events: none;
          background: linear-gradient(
            to bottom,
            rgba(248, 250, 252, 0),
            rgba(248, 250, 252, 0.94)
          );
          z-index: 5;
        }
        .tempo-axis-carousel-stage-dragging {
          cursor: grabbing;
        }
        .tempo-axis-track {
          display: flex;
          align-items: flex-start;
          width: 100%;
          gap: var(--tempo-slide-gap);
          padding: 2.5rem 0 1rem;
          transition: transform 520ms cubic-bezier(0.2, 0.84, 0.24, 1.04);
          will-change: transform;
        }
        .tempo-axis-track-dragging {
          transition: none;
        }
        .tempo-axis-slide {
          flex: 0 0 var(--tempo-slide-width);
          min-height: 19.5rem;
          position: relative;
          transform-origin: center center;
          cursor: pointer;
          transition:
            transform 420ms cubic-bezier(0.22, 1, 0.36, 1),
            opacity 320ms ease,
            filter 320ms ease,
            box-shadow 420ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .tempo-axis-slide-active {
          z-index: 3;
          transform: translateY(0) scale(1);
          box-shadow: 0 14px 30px rgba(15, 23, 42, 0.16);
        }
        .tempo-axis-slide-peek {
          z-index: 1;
          transform: translateY(0.32rem) scale(0.94);
          opacity: 0.8;
          filter: saturate(0.86) brightness(0.98);
        }
        .tempo-axis-slide-settled {
          will-change: transform, box-shadow;
        }
        .tempo-axis-slide-settled.tempo-axis-slide-active {
          transform: translateY(-0.28rem) scale(1.095);
        }
        .tempo-axis-slide-pop.tempo-axis-slide-active {
          animation: tempo-slide-settle-pop 380ms cubic-bezier(0.2, 0.84, 0.24, 1.04) 1 both;
        }
        .tempo-axis-nav {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 11%;
          z-index: 10;
          background: transparent;
        }
        .tempo-axis-nav-left {
          left: 0;
        }
        .tempo-axis-nav-right {
          right: 0;
        }
        .tempo-axis-anchor-dot {
          width: 0.66rem;
          height: 0.66rem;
          border-radius: 9999px;
          background: rgba(148, 163, 184, 0.45);
          transition:
            transform 220ms ease,
            background-color 220ms ease,
            box-shadow 220ms ease;
        }
        .tempo-axis-anchor-dot:hover {
          background: rgba(71, 85, 105, 0.7);
          transform: scale(1.08);
        }
        .tempo-axis-anchor-dot-active {
          background: rgb(16, 185, 129);
          transform: scale(1.2);
          box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.22);
        }
        .tempo-axis-priority-1 {
          background:
            radial-gradient(circle at 88% 14%, rgba(248, 113, 113, 0.2), transparent 36%),
            linear-gradient(150deg, rgba(255, 251, 251, 0.95), rgba(255, 243, 243, 0.92));
        }
        .tempo-axis-priority-2 {
          background:
            radial-gradient(circle at 88% 14%, rgba(251, 191, 36, 0.2), transparent 36%),
            linear-gradient(150deg, rgba(255, 253, 245, 0.95), rgba(254, 249, 225, 0.92));
        }
        .tempo-axis-priority-3 {
          background:
            radial-gradient(circle at 88% 14%, rgba(52, 211, 153, 0.2), transparent 36%),
            linear-gradient(150deg, rgba(245, 253, 250, 0.95), rgba(236, 253, 245, 0.9));
        }
        .tempo-axis-pill-1 {
          color: rgb(127, 29, 29);
          background: rgba(254, 226, 226, 0.92);
        }
        .tempo-axis-pill-2 {
          color: rgb(120, 53, 15);
          background: rgba(254, 243, 199, 0.92);
        }
        .tempo-axis-pill-3 {
          color: rgb(6, 95, 70);
          background: rgba(209, 250, 229, 0.9);
        }
        :global(:root[data-theme="dark"]) .tempo-surface-panel {
          background: linear-gradient(
            160deg,
            rgba(15, 23, 42, 0.9),
            rgba(30, 41, 59, 0.86)
          ) !important;
          border: 1px solid rgba(148, 163, 184, 0.2);
          box-shadow: 0 14px 30px rgba(2, 6, 23, 0.45) !important;
        }
        :global(:root[data-theme="dark"]) .tempo-surface-panel [class~="bg-white"],
        :global(:root[data-theme="dark"]) .tempo-surface-panel [class~="bg-white/92"],
        :global(:root[data-theme="dark"]) .tempo-surface-panel [class~="bg-white/88"],
        :global(:root[data-theme="dark"]) .tempo-surface-panel [class~="bg-white/80"],
        :global(:root[data-theme="dark"]) .tempo-surface-panel [class~="bg-slate-50"],
        :global(:root[data-theme="dark"]) .tempo-surface-panel [class~="bg-slate-100"] {
          background-color: rgba(30, 41, 59, 0.84) !important;
        }
        :global(:root[data-theme="dark"]) .tempo-surface-panel [class~="text-slate-900"] {
          color: rgb(241, 245, 249) !important;
        }
        :global(:root[data-theme="dark"]) .tempo-surface-panel [class~="text-slate-800"] {
          color: rgb(226, 232, 240) !important;
        }
        :global(:root[data-theme="dark"]) .tempo-surface-panel [class~="text-slate-700"] {
          color: rgb(203, 213, 225) !important;
        }
        :global(:root[data-theme="dark"]) .tempo-surface-panel [class~="text-slate-600"] {
          color: rgb(148, 163, 184) !important;
        }
        :global(:root[data-theme="dark"]) .tempo-surface-panel [class~="text-slate-500"] {
          color: rgb(148, 163, 184) !important;
        }
        :global(:root[data-theme="dark"]) .tempo-mode-switcher {
          border: 1px solid rgba(148, 163, 184, 0.22);
          background:
            radial-gradient(circle at 6% 20%, rgba(16, 185, 129, 0.16), transparent 35%),
            radial-gradient(circle at 96% 8%, rgba(14, 165, 233, 0.17), transparent 35%),
            linear-gradient(145deg, rgba(15, 23, 42, 0.88), rgba(30, 41, 59, 0.86));
        }
        :global(:root[data-theme="dark"]) .tempo-mode-pill-active {
          color: rgb(209, 250, 229);
          background: linear-gradient(
            135deg,
            rgba(16, 185, 129, 0.26),
            rgba(14, 165, 233, 0.22)
          );
          box-shadow:
            0 0 0 1px rgba(52, 211, 153, 0.28) inset,
            0 10px 24px rgba(14, 165, 233, 0.2);
        }
        :global(:root[data-theme="dark"]) .tempo-mode-pill-idle {
          color: rgb(203, 213, 225);
          background: rgba(51, 65, 85, 0.74);
        }
        :global(:root[data-theme="dark"]) .tempo-mode-pill-idle:hover {
          background: rgba(71, 85, 105, 0.84);
          color: rgb(241, 245, 249);
        }
        :global(:root[data-theme="dark"]) .tempo-mode-switcher [class~="text-slate-600"] {
          color: rgb(148, 163, 184) !important;
        }
        :global(:root[data-theme="dark"]) .tempo-decision-hero {
          background:
            radial-gradient(circle at 18% 24%, rgba(16, 185, 129, 0.22), transparent 48%),
            radial-gradient(circle at 88% 18%, rgba(59, 130, 246, 0.24), transparent 52%),
            linear-gradient(120deg, rgba(15, 23, 42, 0.92), rgba(30, 41, 59, 0.9));
        }
        :global(:root[data-theme="dark"]) .tempo-axis-card {
          background: linear-gradient(
            150deg,
            rgba(15, 23, 42, 0.9),
            rgba(30, 41, 59, 0.86)
          );
          box-shadow: 0 14px 30px rgba(2, 6, 23, 0.42);
        }
        :global(:root[data-theme="dark"]) .tempo-axis-carousel {
          background:
            radial-gradient(circle at 14% 18%, rgba(16, 185, 129, 0.14), transparent 46%),
            radial-gradient(circle at 86% 20%, rgba(59, 130, 246, 0.16), transparent 52%),
            linear-gradient(160deg, rgba(15, 23, 42, 0.86), rgba(30, 41, 59, 0.84));
          border: 1px solid rgba(148, 163, 184, 0.18);
        }
        :global(:root[data-theme="dark"]) .tempo-axis-carousel-stage::after {
          background: linear-gradient(
            to bottom,
            rgba(15, 23, 42, 0),
            rgba(15, 23, 42, 0.96)
          );
        }
        :global(:root[data-theme="dark"]) .tempo-axis-priority-1 {
          background:
            radial-gradient(circle at 88% 14%, rgba(248, 113, 113, 0.34), transparent 40%),
            linear-gradient(150deg, rgba(153, 27, 27, 0.42), rgba(248, 113, 113, 0.22));
        }
        :global(:root[data-theme="dark"]) .tempo-axis-priority-2 {
          background:
            radial-gradient(circle at 88% 14%, rgba(251, 191, 36, 0.33), transparent 40%),
            linear-gradient(150deg, rgba(154, 52, 18, 0.4), rgba(251, 191, 36, 0.22));
        }
        :global(:root[data-theme="dark"]) .tempo-axis-priority-3 {
          background:
            radial-gradient(circle at 88% 14%, rgba(52, 211, 153, 0.33), transparent 40%),
            linear-gradient(150deg, rgba(6, 95, 70, 0.42), rgba(52, 211, 153, 0.2));
        }
        :global(:root[data-theme="dark"]) .tempo-axis-pill-1 {
          color: rgb(254, 202, 202);
          background: rgba(185, 28, 28, 0.35);
        }
        :global(:root[data-theme="dark"]) .tempo-axis-pill-2 {
          color: rgb(254, 215, 170);
          background: rgba(180, 83, 9, 0.34);
        }
        :global(:root[data-theme="dark"]) .tempo-axis-pill-3 {
          color: rgb(167, 243, 208);
          background: rgba(5, 150, 105, 0.3);
        }
        @media (max-width: 1600px) {
          .tempo-axis-carousel {
            --tempo-slide-width: 78%;
          }
        }
        @media (max-width: 900px) {
          .tempo-axis-pane {
            width: 100vw;
            max-width: 100vw;
            margin-left: calc(50% - 50vw);
            margin-right: calc(50% - 50vw);
            border-radius: 0.95rem;
            padding-left: 0.75rem;
            padding-right: 0.75rem;
            overflow: hidden;
          }
          .tempo-axis-carousel {
            --tempo-slide-width: 70%;
            --tempo-slide-gap: 2.75%;
            padding: 1.35rem 0.65rem 1rem;
            border-radius: 1rem;
          }
          .tempo-axis-carousel-stage {
            min-height: 23.6rem;
            padding: 1.75rem 4.5% 1.2rem;
          }
          .tempo-axis-nav {
            width: 6%;
          }
        }
        @media (max-width: 640px) {
          .tempo-axis-pane {
            border-radius: 0.85rem;
            padding-left: 0.5rem;
            padding-right: 0.5rem;
          }
          .tempo-axis-carousel {
            --tempo-slide-width: 72%;
            --tempo-slide-gap: 2.5%;
            padding: 1.2rem 0.45rem 0.95rem;
            border-radius: 0.95rem;
          }
          .tempo-axis-carousel-stage {
            min-height: 23rem;
            padding: 1.6rem 3.5% 1.1rem;
            border-radius: 0.85rem;
          }
          .tempo-axis-nav {
            width: 5%;
          }
        }
      `}</style>
    </RoleGuard>
  );
}
