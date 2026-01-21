"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import RoleGuard from "../../../_components/role-guard";

const defaultSections = [
  "Resume de la seance",
  "Objectifs prioritaires",
  "Technique",
  "Exercices recommandes",
  "Feedback mental",
  "Statistiques",
  "Plan pour la semaine",
];

type ReportSection = {
  id: string;
  title: string;
  content: string;
};

type StudentOption = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
};

const defaultReportSections = [
  "Resume de la seance",
  "Technique",
  "Plan pour la semaine",
];

const initialAvailableSections = defaultSections.filter(
  (section) =>
    !defaultReportSections.some(
      (reportSection) =>
        reportSection.toLowerCase() === section.toLowerCase()
    )
);

const createSection = (title: string): ReportSection => ({
  id:
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  title,
  content: "",
});

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function CoachReportBuilderPage() {
  const searchParams = useSearchParams();
  const [availableSections, setAvailableSections] =
    useState<string[]>(initialAvailableSections);
  const [reportSections, setReportSections] =
    useState<ReportSection[]>(defaultReportSections.map(createSection));
  const [customSection, setCustomSection] = useState("");
  const [draggingAvailable, setDraggingAvailable] = useState<string | null>(
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
  const itemRefs = useRef(new Map<string, HTMLDivElement | null>());
  const positions = useRef(new Map<string, DOMRect>());
  const shouldAnimate = useRef(false);
  const showSlots = dragEnabled && (dragIndex !== null || draggingAvailable !== null);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentId, setStudentId] = useState("");
  const [title, setTitle] = useState("");
  const [reportDate, setReportDate] = useState(() =>
    formatDateInput(new Date())
  );
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState<"idle" | "error" | "success">(
    "idle"
  );
  const [saving, setSaving] = useState(false);

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
      (section) => section.toLowerCase() === next.toLowerCase()
    );

    if (exists) {
      setSectionsNotice("Cette section existe deja.", "error");
      return;
    }

    setAvailableSections((prev) => [...prev, next]);
    setSectionsNotice("Section ajoutee.", "success");
    setCustomSection("");
  };

  const handleEditSection = (section: string) => {
    setEditingSection(section);
    setEditingValue(section);
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
        section.toLowerCase() === next.toLowerCase() &&
        section !== editingSection
    );

    if (conflict) {
      setSectionsNotice("Cette section existe deja.", "error");
      return;
    }

    setAvailableSections((prev) =>
      prev.map((section) => (section === editingSection ? next : section))
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

  const handleAddToReport = (section: string) => {
    const normalized = section.toLowerCase();
    setReportSections((prev) => {
      const exists = prev.some(
        (item) => item.title.toLowerCase() === normalized
      );
      if (exists) return prev;
      return [...prev, createSection(section)];
    });
    setAvailableSections((prev) =>
      prev.filter((item) => item.toLowerCase() !== normalized)
    );
    shouldAnimate.current = true;
  };

  const handleRemoveFromReport = (id: string, title: string) => {
    setReportSections((prev) => prev.filter((item) => item.id !== id));
    setAvailableSections((prev) => {
      const exists = prev.some(
        (section) => section.toLowerCase() === title.toLowerCase()
      );
      if (exists) return prev;
      return [...prev, title];
    });
    shouldAnimate.current = true;
  };

  const handleRemoveFromAvailable = (section: string) => {
    setAvailableSections((prev) => prev.filter((item) => item !== section));
    setReportSections((prev) =>
      prev.filter((item) => item.title !== section)
    );
    if (editingSection === section) {
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
    section: string,
    event: React.DragEvent<HTMLElement>
  ) => {
    if (!dragEnabled) {
      event.preventDefault();
      return;
    }
    setDraggingAvailable(section);
    setDragIndex(null);
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", section);
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
      const droppedTitle = draggingAvailable;
      const normalized = droppedTitle.toLowerCase();
      shouldAnimate.current = true;
      setReportSections((prev) => {
        const exists = prev.some(
          (item) => item.title.toLowerCase() === normalized
        );
        if (exists) return prev;
        const next = [...prev];
        next.splice(index, 0, createSection(droppedTitle));
        return next;
      });
      setAvailableSections((prev) =>
        prev.filter((item) => item.toLowerCase() !== normalized)
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

  const handleSaveReport = async (send: boolean) => {
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

    setSaving(true);
    setStatusMessage("");
    setStatusType("idle");

    const { data: report, error: reportError } = await supabase
      .from("reports")
      .insert([
        {
          student_id: studentId,
          title: title.trim(),
          report_date: reportDate ? reportDate : null,
          sent_at: send ? new Date().toISOString() : null,
        },
      ])
      .select("id")
      .single();

    if (reportError) {
      setStatusMessage(reportError.message);
      setStatusType("error");
      setSaving(false);
      return;
    }

    const sectionsPayload = reportSections.map((section, index) => ({
      report_id: report.id,
      title: section.title,
      content: section.content || null,
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
      send ? "Rapport envoye avec succes." : "Brouillon sauvegarde."
    );
    setStatusType("success");
    setSaving(false);
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
          Nouveau rapport
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Compose le rapport avec des sections predefinies, puis remplis le
          contenu.
        </p>
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
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={customSection}
                onChange={(event) => setCustomSection(event.target.value)}
                placeholder="Ex: Routine pre-shot"
                className="w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
              />
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
                key={section}
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
                  {editingSection === section ? (
                    <input
                      type="text"
                      value={editingValue}
                      onChange={(event) => setEditingValue(event.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-[var(--bg-elevated)] px-3 py-1 text-sm text-[var(--text)]"
                    />
                  ) : (
                    <span className="block break-words">{section}</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {editingSection === section ? (
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
                    draggable={editingSection !== section}
                    disabled={editingSection === section}
                    onDragStart={(event) =>
                      handleAvailableDragStart(section, event)
                    }
                    onDragEnd={handleDragEnd}
                    className={`absolute right-3 top-3 bottom-3 flex w-7 items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/5 text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] ${
                      editingSection === section
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
          <div className="mt-4 space-y-3">
            {reportSections.map((section, index) => (
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
                      <p className="text-sm font-semibold text-[var(--text)] break-words">
                        {section.title}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
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
                        onClick={() =>
                          handleRemoveFromReport(section.id, section.title)
                        }
                        className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                      >
                        Retirer
                      </button>
                    </div>
                  </div>
                  <textarea
                    rows={4}
                    placeholder="Ecris le contenu de cette section..."
                    value={section.content}
                    onInput={(event) => handleSectionInput(section.id, event)}
                    className="mt-3 w-full resize-none overflow-hidden rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500"
                  />
                </div>
              </div>
            ))}
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
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveReport(true)}
              className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Envoi..." : "Envoyer le rapport"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveReport(false)}
              className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/10 disabled:opacity-60"
            >
              Sauvegarder le brouillon
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
