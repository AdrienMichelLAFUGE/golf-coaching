"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import RoleGuard from "../../../_components/role-guard";
import { useProfile } from "../../../_components/profile-context";

type SectionType = "text" | "image";

type SectionTemplate = {
  title: string;
  type: SectionType;
};

const defaultSections: SectionTemplate[] = [
  { title: "Resume de la seance", type: "text" },
  { title: "Objectifs prioritaires", type: "text" },
  { title: "Technique", type: "text" },
  { title: "Exercices recommandes", type: "text" },
  { title: "Feedback mental", type: "text" },
  { title: "Statistiques", type: "text" },
  { title: "Plan pour la semaine", type: "text" },
  { title: "Images", type: "image" },
];

const CAPTION_LIMIT = 150;

type ReportSection = {
  id: string;
  title: string;
  type: SectionType;
  content: string;
  mediaUrls: string[];
  mediaCaptions: string[];
};

type StudentOption = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
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

const defaultReportSections: SectionTemplate[] = [
  { title: "Resume de la seance", type: "text" },
  { title: "Technique", type: "text" },
  { title: "Plan pour la semaine", type: "text" },
];

const initialAvailableSections = defaultSections.filter(
  (section) =>
    !defaultReportSections.some(
      (reportSection) =>
        reportSection.title.toLowerCase() === section.title.toLowerCase()
    )
);

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
});

const buildAvailableSections = (sections: ReportSection[]) => {
  const existing = new Set(
    sections.map((section) => section.title.toLowerCase())
  );
  return defaultSections.filter(
    (section) => !existing.has(section.title.toLowerCase())
  );
};

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
  const { organization } = useProfile();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const isEditing = Boolean(editingReportId);
  const [availableSections, setAvailableSections] =
    useState<SectionTemplate[]>(initialAvailableSections);
  const [reportSections, setReportSections] =
    useState<ReportSection[]>(defaultReportSections.map(createSection));
  const [customSection, setCustomSection] = useState("");
  const [customIsImage, setCustomIsImage] = useState(false);
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
  const [aiPreviews, setAiPreviews] = useState<Record<string, AiPreview>>({});
  const textareaRefs = useRef(new Map<string, HTMLTextAreaElement | null>());
  const [workingNotes, setWorkingNotes] = useState("");
  const workingNotesRef = useRef<HTMLTextAreaElement | null>(null);
  const [propagateAppend, setPropagateAppend] = useState(false);
  const [uploadingSections, setUploadingSections] = useState<
    Record<string, boolean>
  >({});
  const [imageErrors, setImageErrors] = useState<Record<string, string>>({});
  const [draftId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  const aiEnabled = organization?.ai_enabled ?? false;
  const aiLocked = !aiEnabled;
  const canUseAi = aiEnabled && !aiBusyId;
  const isDraft = !sentAt;
  const showPublish = isDraft;
  const sendLabel = "Publier le rapport";
  const saveLabel = isDraft
    ? "Enregistrer le brouillon"
    : "Enregistrer les modifications";

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

  const handleAddCustomSection = () => {
    const next = customSection.trim();
    if (!next) {
      setSectionsNotice("Saisis un nom de section.", "error");
      return;
    }

    const exists = availableSections.some(
      (section) => section.title.toLowerCase() === next.toLowerCase()
    );

    if (exists) {
      setSectionsNotice("Cette section existe deja.", "error");
      return;
    }

    setAvailableSections((prev) => [
      ...prev,
      { title: next, type: customIsImage ? "image" : "text" },
    ]);
    setSectionsNotice("Section ajoutee.", "success");
    setCustomSection("");
    setCustomIsImage(false);
  };

  const handleEditSection = (section: SectionTemplate) => {
    setEditingSection(section.title);
    setEditingValue(section.title);
    setSectionsNotice("", "idle");
  };

  const handleCancelEdit = () => {
    setEditingSection(null);
    setEditingValue("");
  };

  const handleSaveEdit = () => {
    if (!editingSection) return;
    const next = editingValue.trim();

    if (!next) {
      setSectionsNotice("Saisis un nom de section.", "error");
      return;
    }

    const conflict = availableSections.some(
      (section) =>
        section.title.toLowerCase() === next.toLowerCase() &&
        section.title !== editingSection
    );

    if (conflict) {
      setSectionsNotice("Cette section existe deja.", "error");
      return;
    }

    setAvailableSections((prev) =>
      prev.map((section) =>
        section.title === editingSection
          ? { ...section, title: next }
          : section
      )
    );
    setReportSections((prev) =>
      prev.map((section) =>
        section.title === editingSection ? { ...section, title: next } : section
      )
    );
    setSectionsNotice("Section modifiee.", "success");
    setEditingSection(null);
    setEditingValue("");
  };

  const handleAddToReport = (section: SectionTemplate) => {
    const normalized = section.title.toLowerCase();
    setReportSections((prev) => {
      const exists = prev.some(
        (item) => item.title.toLowerCase() === normalized
      );
      if (exists) return prev;
      return [...prev, createSection(section)];
    });
    setAvailableSections((prev) =>
      prev.filter((item) => item.title.toLowerCase() !== normalized)
    );
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
    setAvailableSections((prev) => {
      const exists = prev.some(
        (item) => item.title.toLowerCase() === section.title.toLowerCase()
      );
      if (exists) return prev;
      return [...prev, { title: section.title, type: section.type }];
    });
    shouldAnimate.current = true;
  };

  const handleRemoveFromAvailable = (section: SectionTemplate) => {
    setAvailableSections((prev) =>
      prev.filter((item) => item.title !== section.title)
    );
    setReportSections((prev) =>
      prev.filter((item) => item.title !== section.title)
    );
    if (editingSection === section.title) {
      setEditingSection(null);
      setEditingValue("");
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
      setAvailableSections((prev) =>
        prev.filter((item) => item.title.toLowerCase() !== normalized)
      );
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
      .select("id, first_name, last_name, email")
      .order("created_at", { ascending: false });

    if (error) {
      setStatusMessage(error.message);
      setStatusType("error");
      return;
    }

    setStudents(data ?? []);
  };

  const loadReportForEdit = async (reportId: string) => {
    setLoadingReport(true);
    setStatusMessage("");
    setStatusType("idle");

    const { data: reportData, error: reportError } = await supabase
      .from("reports")
      .select("id, title, report_date, created_at, student_id, sent_at")
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
      .select("id, title, content, position, type, media_urls, media_captions")
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
        const type = section.type === "image" ? "image" : "text";
        const mediaUrls = section.media_urls ?? [];
        const captions = section.media_captions ?? [];
        return {
          id: section.id,
          title: section.title,
          type,
          content: type === "image" ? "" : section.content ?? "",
          mediaUrls,
          mediaCaptions: mediaUrls.map((_, index) =>
            (captions[index] ?? "").slice(0, CAPTION_LIMIT)
          ),
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
    setReportDate(
      reportData.report_date
        ? formatDateInputValue(reportData.report_date)
        : formatDateInputValue(reportData.created_at)
    );
    setReportSections(nextSections);
    setAvailableSections(buildAvailableSections(nextSections));
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
    setAvailableSections(initialAvailableSections);
    setWorkingNotes("");
    setAiPreviews({});
    setAiSummary("");
    setAiError("");
    setSectionsMessage("");
    setSectionsMessageType("idle");
    setStatusMessage("");
    setStatusType("idle");
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
        sent_at?: string;
      } = {
        student_id: studentId,
        title: title.trim(),
        report_date: reportDate ? reportDate : null,
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
      content: section.type === "image" ? null : section.content || null,
      media_urls: section.type === "image" ? section.mediaUrls : null,
      media_captions: section.type === "image" ? section.mediaCaptions : null,
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

  const callAiPropagation = async (payload: {
    sectionTitle: string;
    sectionContent: string;
    allSections: { title: string; content: string }[];
    targetSections: string[];
    propagateMode: "empty" | "append";
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
          action: "propagate",
          sectionTitle: payload.sectionTitle,
          sectionContent: payload.sectionContent,
          allSections: payload.allSections,
          targetSections: payload.targetSections,
          propagateMode: payload.propagateMode,
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

  const handleAiPropagateFromWorking = async () => {
    if (!canUseAi) return;
    if (!workingNotes.trim()) {
      setAiError("Ajoute des notes dans Travail en cours.");
      return;
    }
    const targets = reportSections
      .filter((item) => !aiPreviews[item.id])
      .filter((item) => item.type === "text")
      .filter((item) => !isSummaryTitle(item.title))
      .filter((item) => !isPlanTitle(item.title))
      .filter((item) => (propagateAppend ? true : !item.content.trim()))
      .map((item) => item.title);

    if (targets.length === 0) {
      setAiError(
        propagateAppend
          ? "Aucune section disponible."
          : "Aucune section vide a remplir. Active Ajouter pour completer."
      );
      return;
    }

    setAiBusyId("propagate");
    const suggestions = await callAiPropagation({
      sectionTitle: "Travail en cours",
      sectionContent: workingNotes,
      allSections: reportSections
        .filter((item) => item.type === "text")
        .map((item) => ({
          title: item.title,
          content: item.content,
        })),
      targetSections: targets,
      propagateMode: propagateAppend ? "append" : "empty",
    });

    if (suggestions) {
      setAiPreviews((prev) => {
        const next = { ...prev };
        suggestions.forEach((suggestion) => {
          const target = reportSections.find(
            (item) =>
              item.title.toLowerCase() === suggestion.title.toLowerCase()
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
    }
    setAiBusyId(null);
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

    if (contextSections.length === 0) {
      setAiError("Ajoute du contenu avant de finaliser.");
      return;
    }

    setAiBusyId("finalize");
    const summaryText =
      summaryTargets.length > 0
        ? await callAi({ action: "summary", allSections: contextSections })
        : null;
    const planText =
      planTargets.length > 0
        ? await callAi({ action: "plan", allSections: contextSections })
        : null;

    setAiPreviews((prev) => {
      const next = { ...prev };
      if (summaryText) {
        summaryTargets.forEach((target) => {
          next[target.id] = {
            original: target.content,
            suggestion: summaryText,
            mode: "finalize",
          };
        });
      }
      if (planText) {
        planTargets.forEach((target) => {
          next[target.id] = {
            original: target.content,
            suggestion: planText,
            mode: "finalize",
          };
        });
      }
      return next;
    });

    setAiBusyId(null);
  };

  const handleAiSummary = async () => {
    if (!canUseAi) return;
    setAiBusyId("summary");
    const text = await callAi({
      action: "summary",
      allSections: reportSections
        .filter((item) => item.type === "text")
        .map((item) => ({
          title: item.title,
          content: item.content,
        })),
    });
    if (text) {
      setAiSummary(text);
    }
    setAiBusyId(null);
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

  return (
    <RoleGuard allowedRoles={["owner", "coach", "staff"]}>
    <div className="space-y-6">
      <section className="panel rounded-2xl p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
          Rapport
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
          {isEditing ? "Modifier le rapport" : "Nouveau rapport"}
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {isEditing
            ? "Mets a jour les sections et le contenu du rapport."
            : "Compose le rapport avec des sections predefinies, puis remplis le contenu."}
        </p>
        {loadingReport ? (
          <p className="mt-3 text-sm text-[var(--muted)]">
            Chargement du rapport...
          </p>
        ) : null}
      </section>

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

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="panel rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-[var(--text)]">
            Sections disponibles
          </h3>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Clique pour ajouter une section au rapport ou cree la tienne.
          </p>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
              Nouvelle section
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                value={customSection}
                onChange={(event) => setCustomSection(event.target.value)}
                placeholder="Ex: Routine pre-shot"
                className="w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
              />
              <button
                type="button"
                onClick={() => setCustomIsImage((prev) => !prev)}
                className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                  customIsImage
                    ? "border-sky-300/40 bg-sky-400/20 text-sky-100"
                    : "border-white/10 bg-white/10 text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                Image
              </button>
              <button
                type="button"
                onClick={handleAddCustomSection}
                className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
              >
                Ajouter
              </button>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {availableSections.map((section) => (
              <div
                key={`${section.title}-${section.type}`}
                className="relative flex flex-col gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3 pl-11 text-sm text-[var(--text)] sm:flex-row sm:items-center sm:justify-between sm:pr-16"
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
                      <span className="block break-words">{section.title}</span>
                      {section.type === "image" ? (
                        <span className="rounded-full border border-sky-300/40 bg-sky-400/10 px-2 py-0.5 text-[0.6rem] uppercase tracking-wide text-sky-100">
                          Image
                        </span>
                      ) : null}
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
                        onClick={() => handleAddToReport(section)}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[var(--text)] transition hover:bg-white/20"
                        aria-label="Ajouter au rapport"
                        title="Ajouter"
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
            ))}
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

        <div className="panel rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-[var(--text)]">
            Rapport en cours
          </h3>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Organise les sections et remplis le contenu. Drag & drop actif.
          </p>
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
                className={`rounded-full border px-2 py-1 text-[0.6rem] uppercase tracking-wide ${
                  isDraft
                    ? "border-white/10 bg-white/5 text-[var(--muted)]"
                    : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                }`}
              >
                {isDraft ? "Brouillon" : "Envoye"}
              </span>
            ) : null}
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                Assistant IA
              </p>
              <span
                className={`rounded-full border px-2 py-1 text-[0.6rem] uppercase tracking-wide ${
                  aiEnabled
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                    : "border-amber-300/30 bg-amber-400/10 text-amber-200"
                }`}
              >
                {aiEnabled ? "Actif" : "Premium"}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={aiLocked || !!aiBusyId}
                onClick={handleAiSummary}
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
                disabled={aiLocked || !!aiBusyId}
                onClick={handleAiFinalize}
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
              <button
                type="button"
                onClick={resetAiSettings}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
              >
                Reinitialiser
              </button>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs uppercase tracking-wide text-[var(--muted)]">
                Reglages IA
              </summary>
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
                    onClick={() => setWorkingNotes("")}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-60"
                  >
                    Reinitialiser
                  </button>
                  <button
                    type="button"
                    disabled={aiLocked || !!aiBusyId}
                    onClick={() => setPropagateAppend((prev) => !prev)}
                    className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-wide transition disabled:opacity-60 ${
                      propagateAppend
                        ? "border-sky-300/40 bg-sky-400/20 text-sky-100"
                        : "border-white/10 bg-white/5 text-[var(--muted)] hover:text-[var(--text)]"
                    }`}
                  >
                    {propagateAppend ? "Ajouter actif" : "Ajouter"}
                  </button>
                  <button
                    type="button"
                    disabled={aiLocked || !!aiBusyId}
                    onClick={handleAiPropagateFromWorking}
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
                Notes rapides de la seance. L IA propage vers les sections vides.
              </p>
              <textarea
                ref={(node) => {
                  workingNotesRef.current = node;
                }}
                rows={3}
                placeholder="Ex: Travail sur les appuis: pied droit interieur au backswing pour eviter le sway."
                value={workingNotes}
                onInput={handleWorkingNotesInput}
                className="mt-3 w-full resize-none overflow-hidden rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
              />
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
                  className={`rounded-2xl border bg-white/5 px-4 py-4 transition ${
                    dragIndex === index
                      ? "border-white/20 bg-white/10 opacity-80 shadow-[0_20px_45px_rgba(0,0,0,0.45)]"
                      : "border-white/10"
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
                        {section.type === "image" ? (
                          <span className="rounded-full border border-sky-300/40 bg-sky-400/10 px-2 py-0.5 text-[0.6rem] uppercase tracking-wide text-sky-100">
                            Image
                          </span>
                        ) : null}
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
                      {section.type === "text" ? contentPreview : imagePreview}
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
                          disabled={aiLocked || !!aiBusyId}
                          onClick={() => handleAiImprove(section)}
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
                          disabled={aiLocked || !!aiBusyId}
                          onClick={() => handleAiWrite(section)}
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
      </section>
    </div>
    </RoleGuard>
  );
}
