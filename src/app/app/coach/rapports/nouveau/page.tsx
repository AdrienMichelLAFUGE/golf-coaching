"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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

const createSection = (title: string): ReportSection => ({
  id:
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  title,
  content: "",
});

export default function CoachReportBuilderPage() {
  const [availableSections, setAvailableSections] =
    useState<string[]>(defaultSections);
  const [reportSections, setReportSections] =
    useState<ReportSection[]>(defaultReportSections.map(createSection));
  const [customSection, setCustomSection] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement | null>());
  const positions = useRef(new Map<string, DOMRect>());
  const shouldAnimate = useRef(false);
  const showSlots = dragIndex !== null;
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentId, setStudentId] = useState("");
  const [title, setTitle] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState<"idle" | "error" | "success">(
    "idle"
  );
  const [saving, setSaving] = useState(false);

  const handleAddCustomSection = () => {
    const next = customSection.trim();
    if (!next) return;

    const exists = availableSections.some(
      (section) => section.toLowerCase() === next.toLowerCase()
    );

    if (!exists) {
      setAvailableSections((prev) => [...prev, next]);
    }

    setCustomSection("");
  };

  const handleAddToReport = (section: string) => {
    setReportSections((prev) => {
      const exists = prev.some(
        (item) => item.title.toLowerCase() === section.toLowerCase()
      );
      if (exists) return prev;
      return [...prev, createSection(section)];
    });
    shouldAnimate.current = true;
  };

  const handleRemoveFromReport = (id: string) => {
    setReportSections((prev) => prev.filter((item) => item.id !== id));
    shouldAnimate.current = true;
  };

  const handleRemoveFromAvailable = (section: string) => {
    setAvailableSections((prev) => prev.filter((item) => item !== section));
    setReportSections((prev) =>
      prev.filter((item) => item.title !== section)
    );
    shouldAnimate.current = true;
  };

  const handleDragStart = (
    index: number,
    event: React.DragEvent<HTMLElement>
  ) => {
    setDragIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", reportSections[index].id);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleDrop = (index: number) => {
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

  return (
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
                className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--text)]"
              >
                <span>{section}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddToReport(section)}
                    className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
                  >
                    Ajouter
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveFromAvailable(section)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
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
                  onDragEnd={() => {
                    setDragIndex(null);
                    setHoverIndex(null);
                  }}
                  className={`rounded-2xl border bg-white/5 px-4 py-4 transition ${
                    dragIndex === index
                      ? "border-white/20 bg-white/10 opacity-80 shadow-[0_20px_45px_rgba(0,0,0,0.45)]"
                      : "border-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
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
                      <p className="text-sm font-semibold text-[var(--text)]">
                        {section.title}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFromReport(section.id)}
                      className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                    >
                      Retirer
                    </button>
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
  );
}
