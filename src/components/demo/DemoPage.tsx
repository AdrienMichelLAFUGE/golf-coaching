"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
} from "react";
import CalendarMock from "./CalendarMock";
import CoachDashboardMock from "./CoachDashboardMock";
import DataPipelineMock from "./DataPipelineMock";
import HorizontalCarousel from "./HorizontalCarousel";
import LayoutSelectorMock from "./LayoutSelectorMock";
import MediaGalleryMock from "./MediaGalleryMock";
import ProgressDots from "./ProgressDots";
import PropagationFlowMock from "./PropagationFlowMock";
import ReportEditorMock from "./ReportEditorMock";
import ReportReadMock from "./ReportReadMock";
import Section from "./Section";
import Toast, { type DemoToast } from "./Toast";
import TpiProfileMock from "./TpiProfileMock";
import VideoStudioMock from "./VideoStudioMock";
import styles from "./demo.module.css";
import {
  DEMO_COACH_DASHBOARD,
  DEMO_IA_SUGGESTIONS,
  DEMO_LAYOUT_PRESETS,
  DEMO_MEDIA_FIXTURE,
  DEMO_REPORT,
  DEMO_SMART2MOVE,
  DEMO_STUDENT,
  DEMO_TPI_PROFILE,
  INITIAL_SCENARIO_STATE,
  SECTION_LABELS,
  SECTION_ORDER,
  type DataTechnology,
  type ScenarioState,
  type SectionId,
} from "./fixtures";

type SlideMap = Record<SectionId, number>;

const CTA_BASE_CLASS =
  "inline-flex items-center justify-center rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 active:scale-[0.98]";
const PRIMARY_BUTTON_CLASS =
  `${CTA_BASE_CLASS} ${styles.ctaPulse} border border-emerald-200/70 bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 text-slate-900 shadow-[0_10px_28px_rgba(16,185,129,0.34)] hover:brightness-105 hover:shadow-[0_14px_36px_rgba(56,189,248,0.32)] focus-visible:ring-emerald-300/75`;
const SECONDARY_BUTTON_CLASS =
  `${CTA_BASE_CLASS} ${styles.ctaPulseSoft} border border-sky-200/65 bg-gradient-to-r from-sky-200 via-cyan-100 to-emerald-100 text-slate-900 shadow-[0_10px_28px_rgba(56,189,248,0.28)] hover:brightness-105 hover:shadow-[0_14px_36px_rgba(14,165,233,0.3)] focus-visible:ring-sky-300/75`;
const TEMPO_BUTTON_CLASS = `${CTA_BASE_CLASS} ${styles.tempoFeatureButton} ${styles.tempoFeatureButtonCompact}`;

const initialSlidesState = SECTION_ORDER.reduce<SlideMap>((acc, sectionId) => {
  acc[sectionId] = 0;
  return acc;
}, {} as SlideMap);

function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-white/15 bg-slate-900/55 p-4">{children}</div>;
}

function renderSectionRef(
  refs: MutableRefObject<Record<SectionId, HTMLElement | null>>,
  sectionId: SectionId
) {
  return (node: HTMLElement | null) => {
    refs.current[sectionId] = node;
  };
}

function TypingField({
  label,
  value,
  animate,
}: {
  label: string;
  value: string;
  animate: boolean;
}) {
  return (
    <label className="block text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
      {label}
      <span className="mt-1 block w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm normal-case tracking-normal text-[var(--text)]">
        <span
          className={animate ? styles.typewriterText : ""}
          style={
            animate
              ? ({ "--typing-steps": String(Math.max(8, value.length)) } as CSSProperties)
              : undefined
          }
        >
          {value}
        </span>
      </span>
    </label>
  );
}

export default function DemoPage() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const timersRef = useRef<number[]>([]);
  const sectionRefs = useRef<Record<SectionId, HTMLElement | null>>(
    SECTION_ORDER.reduce((acc, sectionId) => {
      acc[sectionId] = null;
      return acc;
    }, {} as Record<SectionId, HTMLElement | null>)
  );

  const [activeSection, setActiveSection] = useState<SectionId>("hero");
  const [activeSlides, setActiveSlides] = useState<SlideMap>(initialSlidesState);
  const [scenarioState, setScenarioStateState] =
    useState<ScenarioState>(INITIAL_SCENARIO_STATE);
  const [toasts, setToasts] = useState<DemoToast[]>([]);
  const [tpiImportState, setTpiImportState] = useState<{
    loading: boolean;
    phase: "idle" | "upload" | "analyze";
    progress: number;
  }>({
    loading: false,
    phase: "idle",
    progress: 0,
  });
  const [publishState, setPublishState] = useState<"idle" | "publishing" | "done">("idle");
  const [propagationRunning, setPropagationRunning] = useState(false);
  const [propagationActiveCount, setPropagationActiveCount] = useState(0);

  useEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.getAttribute("data-theme");
    root.setAttribute("data-theme", "dark");

    return () => {
      if (previousTheme === null) {
        root.removeAttribute("data-theme");
      } else {
        root.setAttribute("data-theme", previousTheme);
      }
    };
  }, []);

  const setScenarioState = useCallback((patch: Partial<ScenarioState>) => {
    setScenarioStateState((previous) => ({ ...previous, ...patch }));
  }, []);

  const scheduleTimeout = useCallback((callback: () => void, delayMs: number) => {
    if (typeof window === "undefined") return;
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((timerId) => timerId !== id);
      callback();
    }, delayMs);
    timersRef.current.push(id);
  }, []);

  const pushToast = useCallback(
    (message: string, tone: "success" | "info" = "info") => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((previous) => [...previous, { id, message, tone }]);
      scheduleTimeout(() => {
        setToasts((previous) => previous.filter((toast) => toast.id !== id));
      }, 2200);
    },
    [scheduleTimeout]
  );

  const scrollToSection = useCallback((sectionId: SectionId) => {
    const node =
      sectionRefs.current[sectionId] ??
      rootRef.current?.querySelector<HTMLElement>(`[data-demo-section-id="${sectionId}"]`) ??
      null;
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const scrollToSlide = useCallback((sectionId: SectionId, slideIndex: number) => {
    const root = rootRef.current;
    if (!root) return;
    const carousel = root.querySelector<HTMLElement>(`[data-demo-carousel-id="${sectionId}"]`);
    if (!carousel) return;
    const slide = carousel.querySelector<HTMLElement>(`[data-demo-slide-index="${slideIndex}"]`);
    if (!slide) return;
    slide.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  }, []);

  const updateSlideIndex = useCallback((sectionId: SectionId, slideIndex: number) => {
    setActiveSlides((previous) =>
      previous[sectionId] === slideIndex ? previous : { ...previous, [sectionId]: slideIndex }
    );
  }, []);

  const selectedAxis =
    DEMO_IA_SUGGESTIONS.find((axis) => axis.id === scenarioState.selectedIaAxisId) ?? null;
  const isStudentCalendarSlideActive =
    activeSection === "season-calendar" && activeSlides["season-calendar"] === 0;
  const isCoachCalendarSlideActive =
    activeSection === "season-calendar" && activeSlides["season-calendar"] === 1;

  const shouldTypeStudentFields =
    activeSection === "add-student" &&
    activeSlides["add-student"] === 1 &&
    !scenarioState.createdStudent;

  const handleStartImportTpi = useCallback(() => {
    if (tpiImportState.loading || scenarioState.importedTpi) return;

    setTpiImportState({
      loading: true,
      phase: "upload",
      progress: 12,
    });

    scheduleTimeout(() => {
      setTpiImportState({
        loading: true,
        phase: "upload",
        progress: 46,
      });
    }, 260);

    scheduleTimeout(() => {
      setTpiImportState({
        loading: true,
        phase: "analyze",
        progress: 74,
      });
    }, 640);

    scheduleTimeout(() => {
      setTpiImportState({
        loading: false,
        phase: "idle",
        progress: 100,
      });
      setScenarioState({ importedTpi: true });
      pushToast("Profil TPI importé.", "success");
    }, 1180);
  }, [
    pushToast,
    scenarioState.importedTpi,
    scheduleTimeout,
    setScenarioState,
    tpiImportState.loading,
  ]);

  const handleSelectDataTechnology = useCallback(
    (technology: DataTechnology) => {
      setScenarioState({
        dataTechnology: technology,
        dataImported: false,
        dataPreprocessed: false,
        dataAnalyzed: false,
      });
    },
    [setScenarioState]
  );

  const handleImportData = useCallback(() => {
    if (scenarioState.dataImported) return;
    if (scenarioState.dataTechnology !== "smart2move") {
      handleSelectDataTechnology("smart2move");
    }
    pushToast("Import Smart2Move lancé.", "info");
    scheduleTimeout(() => {
      setScenarioState({ dataImported: true });
      pushToast("Données Smart2Move importées.", "success");
    }, 420);
  }, [
    handleSelectDataTechnology,
    pushToast,
    scenarioState.dataImported,
    scenarioState.dataTechnology,
    scheduleTimeout,
    setScenarioState,
  ]);

  const handleExtractData = useCallback(() => {
    if (!scenarioState.dataImported || scenarioState.dataAnalyzed) return;
    pushToast("Pré-traitement des points en cours...", "info");
    scheduleTimeout(() => {
      setScenarioState({ dataPreprocessed: true });
    }, 260);
    scheduleTimeout(() => {
      setScenarioState({ dataAnalyzed: true });
      pushToast("Extraction terminée : analyse Smart2Move disponible.", "success");
    }, 820);
  }, [
    pushToast,
    scenarioState.dataAnalyzed,
    scenarioState.dataImported,
    scheduleTimeout,
    setScenarioState,
  ]);

  const handleStartPropagation = useCallback(() => {
    if (propagationRunning) return;
    const axisForPropagation = selectedAxis ?? DEMO_IA_SUGGESTIONS[0] ?? null;
    if (!axisForPropagation) return;

    setPropagationRunning(true);
    setPropagationActiveCount(0);
    if (!selectedAxis) {
      setScenarioState({ selectedIaAxisId: axisForPropagation.id });
    }
    setScenarioState({ propagated: false, reportFilled: false });
    scrollToSlide("editor-ai", 2);

    axisForPropagation.sectionPayload.forEach((_, index) => {
      scheduleTimeout(() => {
        setPropagationActiveCount(index + 1);
      }, 480 + index * 760);
    });

    scheduleTimeout(
      () => {
        setPropagationRunning(false);
        setScenarioState({ propagated: true, reportFilled: true });
        pushToast("Contenu propagé dans le rapport.", "success");
        scrollToSlide("editor-ai", 3);
      },
      480 + axisForPropagation.sectionPayload.length * 760 + 450
    );
  }, [
    propagationRunning,
    pushToast,
    scheduleTimeout,
    scrollToSlide,
    selectedAxis,
    setScenarioState,
  ]);

  const startPublishingFlow = useCallback(() => {
    if (publishState !== "idle") return;

    setPublishState("publishing");
    scheduleTimeout(() => {
      setPublishState("done");
      setScenarioState({ published: true });
      pushToast("Rapport publié avec succès.", "success");
      scrollToSlide("publish-read", 1);
    }, 600);
  }, [publishState, pushToast, scheduleTimeout, scrollToSlide, setScenarioState]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;

    const nodes = SECTION_ORDER.map((sectionId) => sectionRefs.current[sectionId]).filter(
      (node): node is HTMLElement => node !== null
    );
    if (nodes.length === 0) return;

    let rafId = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.length === 0) return;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
          if (!visible) return;
          const id = (visible.target as HTMLElement).dataset.demoSectionId as SectionId | undefined;
          if (!id) return;
          setActiveSection((previous) => (previous === id ? previous : id));
        });
      },
      {
        root,
        threshold: [0.35, 0.55, 0.75],
      }
    );

    nodes.forEach((node) => observer.observe(node));

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      timersRef.current = [];
    };
  }, []);

  const demoStudentName = `${DEMO_STUDENT.firstName} ${DEMO_STUDENT.lastName}`;

  return (
    <main className="relative">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(16,185,129,0.12),transparent_45%),radial-gradient(circle_at_100%_10%,rgba(56,189,248,0.16),transparent_48%)]" />

      <ProgressDots
        sectionOrder={SECTION_ORDER}
        labels={SECTION_LABELS}
        activeSection={activeSection}
        onSelect={scrollToSection}
      />

      <Toast toasts={toasts} />

      <div ref={rootRef} className={styles.demoRoot}>
        <Section id="hero" sectionLabel={SECTION_LABELS.hero} ref={renderSectionRef(sectionRefs, "hero")}>
          <HorizontalCarousel
            sectionId="hero"
            activeIndex={activeSlides.hero}
            onActiveIndexChange={(index) => updateSlideIndex("hero", index)}
            showLocalDots={false}
          >
            <div className="relative flex h-full w-full flex-col justify-between gap-6 p-2 md:p-6">
              <div className="space-y-4">
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">SwingFlow Demo</p>
                <h1 className="max-w-3xl text-3xl font-semibold leading-tight text-[var(--text)] md:text-5xl">
                  Démo interactive, en moins de 90 secondes.
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className={PRIMARY_BUTTON_CLASS}
                  onClick={() => scrollToSection("add-student")}
                >
                  Démarrer la démo
                </button>
              </div>
            </div>
          </HorizontalCarousel>
        </Section>

        <Section
          id="add-student"
          sectionLabel={SECTION_LABELS["add-student"]}
          ref={renderSectionRef(sectionRefs, "add-student")}
        >
          <HorizontalCarousel
            sectionId="add-student"
            activeIndex={activeSlides["add-student"]}
            onActiveIndexChange={(index) => updateSlideIndex("add-student", index)}
          >
            <div className="flex h-full w-full flex-col justify-between gap-4">
              <header className="space-y-2">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Étape 1</p>
                <h2 className="text-2xl font-semibold text-[var(--text)]">Ajouter un élève</h2>
              </header>
              <Card>
                <p className="text-sm text-[var(--muted)]">Annuaire élèves</p>
                <ul className="mt-3 space-y-2 text-sm">
                  <li className="rounded-xl border border-white/10 bg-white/10 px-3 py-2">Camille Renoir</li>
                  <li className="rounded-xl border border-white/10 bg-white/10 px-3 py-2">Nathan Soler</li>
                </ul>
              </Card>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className={PRIMARY_BUTTON_CLASS}
                  onClick={() => scrollToSlide("add-student", 1)}
                >
                  Ajouter un élève
                </button>
              </div>
            </div>

            <div className="flex h-full w-full flex-col justify-between gap-4">
              <header className="space-y-2">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Nouveau profil</p>
                <h3 className="text-xl font-semibold text-[var(--text)]">Création guidée</h3>
              </header>
              <Card>
                <div className="space-y-2">
                  <TypingField
                    label="Prénom"
                    value={DEMO_STUDENT.firstName}
                    animate={shouldTypeStudentFields}
                  />
                  <TypingField
                    label="Nom"
                    value={DEMO_STUDENT.lastName}
                    animate={shouldTypeStudentFields}
                  />
                  <TypingField
                    label="Email"
                    value={DEMO_STUDENT.email}
                    animate={shouldTypeStudentFields}
                  />
                </div>
              </Card>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className={PRIMARY_BUTTON_CLASS}
                  onClick={() => {
                    setScenarioState({ createdStudent: true });
                    pushToast("Élève créé.", "success");
                    scrollToSlide("add-student", 2);
                  }}
                >
                  Créer
                </button>
              </div>
            </div>

            <div className="flex h-full w-full flex-col justify-between gap-4">
              <header className="space-y-2">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Création confirmée</p>
                <h3 className="text-xl font-semibold text-[var(--text)]">Élève prêt à suivre</h3>
              </header>
              <Card>
                <p className="text-base font-semibold text-[var(--text)]">
                  {scenarioState.createdStudent ? demoStudentName : "Léo Martin"}
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">{DEMO_STUDENT.email}</p>
              </Card>
              <button
                type="button"
                className={PRIMARY_BUTTON_CLASS}
                onClick={() => scrollToSection("student-dashboard")}
              >
                Voir dashboard
              </button>
            </div>
          </HorizontalCarousel>
        </Section>

        <Section
          id="student-dashboard"
          sectionLabel={SECTION_LABELS["student-dashboard"]}
          ref={renderSectionRef(sectionRefs, "student-dashboard")}
        >
          <HorizontalCarousel
            sectionId="student-dashboard"
            activeIndex={activeSlides["student-dashboard"]}
            onActiveIndexChange={(index) => updateSlideIndex("student-dashboard", index)}
          >
            <div className="flex h-full w-full flex-col justify-between gap-4">
              <header className="space-y-2">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Étape 2</p>
                <h2 className="text-2xl font-semibold text-[var(--text)]">Dashboard élève + Import TPI</h2>
              </header>
              <TpiProfileMock
                profile={DEMO_TPI_PROFILE}
                imported={scenarioState.importedTpi}
                isImporting={tpiImportState.loading}
                importPhase={tpiImportState.phase}
                importProgress={tpiImportState.progress}
              />
              <div className="flex items-center gap-3">
                {!scenarioState.importedTpi ? (
                  <button
                    type="button"
                    className={PRIMARY_BUTTON_CLASS}
                    disabled={tpiImportState.loading}
                    onClick={handleStartImportTpi}
                  >
                    Lancer l&apos;import
                  </button>
                ) : (
                  <button
                    type="button"
                    className={PRIMARY_BUTTON_CLASS}
                    onClick={() => scrollToSection("create-report")}
                  >
                    Nouveau rapport
                  </button>
                )}
              </div>
            </div>
          </HorizontalCarousel>
        </Section>
        <Section
          id="create-report"
          sectionLabel={SECTION_LABELS["create-report"]}
          ref={renderSectionRef(sectionRefs, "create-report")}
        >
          <HorizontalCarousel
            sectionId="create-report"
            activeIndex={activeSlides["create-report"]}
            onActiveIndexChange={(index) => updateSlideIndex("create-report", index)}
          >
            <div className="flex h-full w-full flex-col justify-between gap-4">
              <header className="space-y-2">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Étape 3</p>
                <h2 className="text-2xl font-semibold text-[var(--text)]">Créer un rapport</h2>
              </header>
              <Card>
                <p className="text-sm text-[var(--muted)]">
                  Élève sélectionné: <span className="font-semibold text-[var(--text)]">{demoStudentName}</span>
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Démarrez un nouveau rapport de séance avec un layout adapté.
                </p>
              </Card>
              <button
                type="button"
                className={PRIMARY_BUTTON_CLASS}
                onClick={() => {
                  setScenarioState({
                    layoutPresetId: "quick",
                    layoutSelected: true,
                  });
                  scrollToSlide("create-report", 1);
                }}
              >
                Nouveau rapport
              </button>
            </div>

            <div className="flex h-full w-full flex-col justify-between gap-4">
              <header className="space-y-2">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Choix du layout</p>
                <h3 className="text-xl font-semibold text-[var(--text)]">Sélection de structure</h3>
              </header>
              <LayoutSelectorMock
                presets={DEMO_LAYOUT_PRESETS}
                selectedId={scenarioState.layoutPresetId}
                forcedId="quick"
                onSelect={() => {
                  setScenarioState({
                    layoutPresetId: "quick",
                    layoutSelected: true,
                  });
                }}
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className={PRIMARY_BUTTON_CLASS}
                  disabled={!scenarioState.layoutPresetId}
                  onClick={() => scrollToSection("editor-ai")}
                >
                  Continuer
                </button>
              </div>
            </div>
          </HorizontalCarousel>
        </Section>

        <Section
          id="editor-ai"
          sectionLabel={SECTION_LABELS["editor-ai"]}
          ref={renderSectionRef(sectionRefs, "editor-ai")}
        >
          <HorizontalCarousel
            sectionId="editor-ai"
            activeIndex={activeSlides["editor-ai"]}
            onActiveIndexChange={(index) => updateSlideIndex("editor-ai", index)}
            showLocalDots={false}
          >
            <div className="flex h-full w-full min-w-0 flex-col justify-between gap-4 overflow-y-auto pb-12 pr-1 sm:pb-10">
              <header className="space-y-2">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Étape 4</p>
                <h2 className="text-2xl font-semibold text-[var(--text)]">
                  Éditeur +{" "}
                  <span className={styles.tempoFeatureInline}>
                    <span className={styles.tempoFeatureLabel}>Tempo</span>
                    <span className={styles.tempoFeatureChip}>IA</span>
                  </span>
                </h2>
              </header>
              <ReportEditorMock
                report={DEMO_REPORT}
                axis={selectedAxis}
                showPropagationResult={false}
                animateTyping={true}
              />
              <button
                type="button"
                className={`${TEMPO_BUTTON_CLASS} self-center`}
                aria-label="Assistant Tempo IA"
                onClick={() => scrollToSlide("editor-ai", 1)}
              >
                <span className={styles.tempoFeatureLabel}>Assistant Tempo</span>
                <span className={styles.tempoFeatureChip}>IA</span>
              </button>
            </div>

            <div className="flex h-full w-full min-w-0 flex-col justify-between gap-4 overflow-y-auto pb-12 pr-1 sm:pb-10">
              <header className="space-y-2">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
                  Suggestions Tempo IA
                </p>
                <h3 className="text-xl font-semibold text-[var(--text)]">
                  Choisissez l’axe à propager
                </h3>
              </header>
              <div className="grid min-w-0 gap-3 xl:grid-cols-2">
                {DEMO_IA_SUGGESTIONS.map((suggestion) => {
                  const selected = scenarioState.selectedIaAxisId === suggestion.id;
                  return (
                    <button
                      key={suggestion.id}
                      type="button"
                      onClick={() => {
                        setPropagationRunning(false);
                        setPropagationActiveCount(0);
                        setScenarioState({
                          selectedIaAxisId: suggestion.id,
                          propagated: false,
                          reportFilled: false,
                        });
                      }}
                      className={`min-w-0 rounded-2xl border px-4 py-4 text-left transition ${
                        selected
                          ? "border-cyan-300/55 bg-cyan-400/12"
                          : "border-white/12 bg-white/8 hover:border-white/25"
                      }`}
                    >
                      <p className="text-sm font-semibold text-[var(--text)]">{suggestion.title}</p>
                      <ul className="mt-2 space-y-1 break-words text-xs text-[var(--muted)]">
                        {suggestion.bullets.map((bullet) => (
                          <li key={bullet}>⬢ {bullet}</li>
                        ))}
                      </ul>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className={`${TEMPO_BUTTON_CLASS} self-center`}
                  onClick={handleStartPropagation}
                >
                  <span className={styles.tempoFeatureLabel}>Propagation</span>
                  <span className={styles.tempoFeatureChip}>IA</span>
                </button>
              </div>
            </div>

            <div className="flex h-full w-full min-w-0 flex-col justify-between gap-4 overflow-y-auto pb-12 pr-1 sm:pb-10">
              <header className="space-y-2">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Propagation</p>
                <h3 className="text-xl font-semibold text-[var(--text)]">
                  Injection section par section
                </h3>
              </header>
              <PropagationFlowMock
                key={selectedAxis?.id ?? "axis-none"}
                axis={selectedAxis}
                running={propagationRunning}
                activeCount={propagationActiveCount}
                completed={scenarioState.propagated}
              />
            </div>

            <div className="flex h-full w-full min-w-0 flex-col justify-between gap-4 overflow-y-auto pb-12 pr-1 sm:pb-10">
              <header className="space-y-2">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Rapport rempli</p>
                <h3 className="text-xl font-semibold text-[var(--text)]">Version finale de l’édition</h3>
              </header>
              <ReportEditorMock
                report={DEMO_REPORT}
                axis={selectedAxis}
                showPropagationResult={scenarioState.propagated}
                animateTyping={true}
                animatePropagation={true}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={SECONDARY_BUTTON_CLASS}
                  onClick={() => scrollToSection("media-data")}
                >
                  Ajouter image
                </button>
                <button
                  type="button"
                  className={SECONDARY_BUTTON_CLASS}
                  onClick={() => scrollToSection("media-data")}
                >
                  Ajouter vidéo
                </button>
                <button
                  type="button"
                  className={PRIMARY_BUTTON_CLASS}
                  onClick={() => scrollToSection("media-data")}
                >
                  Ajouter data
                </button>
              </div>
            </div>
          </HorizontalCarousel>
        </Section>

        <Section
          id="media-data"
          sectionLabel={SECTION_LABELS["media-data"]}
          ref={renderSectionRef(sectionRefs, "media-data")}
        >
          <HorizontalCarousel
            sectionId="media-data"
            activeIndex={activeSlides["media-data"]}
            onActiveIndexChange={(index) => updateSlideIndex("media-data", index)}
          >
            <div className="flex h-full w-full flex-col justify-between gap-4">
              <header className="space-y-2">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Étape 5</p>
                <h2 className="text-2xl font-semibold text-[var(--text)]">Ajout d’image</h2>
              </header>
              <MediaGalleryMock
                assets={DEMO_MEDIA_FIXTURE.imageGallery}
                ready={scenarioState.mediaImageReady}
                onMarkReady={() => {
                  setScenarioState({ mediaImageReady: true });
                  pushToast("Image ajoutée au rapport.", "success");
                  scrollToSlide("media-data", 1);
                }}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  className={PRIMARY_BUTTON_CLASS}
                  onClick={() => scrollToSlide("media-data", 1)}
                >
                  Suivant
                </button>
              </div>
            </div>

            <div className="flex h-full w-full flex-col justify-between gap-4">
              <header className="space-y-2">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Ajout vidéo</p>
                <h3 className="text-xl font-semibold text-[var(--text)]">Studio vidéo intégré</h3>
              </header>
              <VideoStudioMock
                thumb={DEMO_MEDIA_FIXTURE.videoScene.thumb}
                mobilePreview={DEMO_MEDIA_FIXTURE.videoScene.mobilePreview}
                ready={scenarioState.mediaVideoReady}
                onMarkReady={() => {
                  setScenarioState({ mediaVideoReady: true });
                  pushToast("Vidéo ajoutée au rapport.", "success");
                  scrollToSlide("media-data", 2);
                }}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  className={PRIMARY_BUTTON_CLASS}
                  onClick={() => scrollToSlide("media-data", 2)}
                >
                  Suivant
                </button>
              </div>
            </div>

            <div className="flex h-full w-full flex-col justify-between gap-4">
              <header className="space-y-2">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Data Smart2Move</p>
                <h3 className="text-xl font-semibold text-[var(--text)]">Import + pré-traitement + analyse</h3>
              </header>
              <DataPipelineMock
                importVisual={DEMO_MEDIA_FIXTURE.dataScene.importVisual}
                technology={scenarioState.dataTechnology}
                imported={scenarioState.dataImported}
                preprocessed={scenarioState.dataPreprocessed}
                analyzed={scenarioState.dataAnalyzed}
                smart2move={DEMO_SMART2MOVE}
                onSelectTechnology={handleSelectDataTechnology}
                onImport={handleImportData}
                onExtract={handleExtractData}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  className={PRIMARY_BUTTON_CLASS}
                  disabled={!scenarioState.dataAnalyzed}
                  onClick={() => {
                    setScenarioState({ mediaReady: true });
                    startPublishingFlow();
                    scrollToSection("publish-read");
                  }}
                >
                  Publier
                </button>
              </div>
            </div>
          </HorizontalCarousel>
        </Section>
        <Section
          id="publish-read"
          sectionLabel={SECTION_LABELS["publish-read"]}
          ref={renderSectionRef(sectionRefs, "publish-read")}
        >
          <HorizontalCarousel
            sectionId="publish-read"
            activeIndex={activeSlides["publish-read"]}
            onActiveIndexChange={(index) => updateSlideIndex("publish-read", index)}
          >
            <div className="flex h-full w-full flex-col justify-center gap-6">
              <header className="space-y-2 text-center">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Étape 6</p>
                <h2 className="text-3xl font-semibold text-[var(--text)]">
                  {publishState === "done" ? "Publié" : "Publishing..."}
                </h2>
              </header>
              <Card>
                {publishState === "done"
                  ? "Le rapport est publié et disponible en lecture."
                  : "Publication en cours, génération de la version partagée..."}
              </Card>
            </div>

            <div className="flex h-full w-full flex-col gap-4">
              <header className="space-y-2">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Lecture rapport</p>
                <h3 className="text-xl font-semibold text-[var(--text)]">Version finale partagée</h3>
              </header>
              <ReportReadMock
                studentName={demoStudentName}
                report={DEMO_REPORT}
                axis={selectedAxis}
                media={DEMO_MEDIA_FIXTURE}
                smart2move={DEMO_SMART2MOVE}
              />
              <div>
                <button
                  type="button"
                  className={PRIMARY_BUTTON_CLASS}
                  onClick={() => scrollToSection("coach-dashboard")}
                >
                  Voir dashboard coach
                </button>
              </div>
            </div>
          </HorizontalCarousel>
        </Section>

        <Section
          id="coach-dashboard"
          sectionLabel={SECTION_LABELS["coach-dashboard"]}
          ref={renderSectionRef(sectionRefs, "coach-dashboard")}
        >
          <HorizontalCarousel
            sectionId="coach-dashboard"
            activeIndex={activeSlides["coach-dashboard"]}
            onActiveIndexChange={(index) => updateSlideIndex("coach-dashboard", index)}
          >
            <div className="flex h-full w-full flex-col justify-between gap-4">
              <header className="space-y-2">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Étape 7</p>
                <h2 className="text-2xl font-semibold text-[var(--text)]">Dashboard coach</h2>
              </header>
              <CoachDashboardMock fixture={DEMO_COACH_DASHBOARD} />
              <button
                type="button"
                className={PRIMARY_BUTTON_CLASS}
                onClick={() => scrollToSection("season-calendar")}
              >
                Suivi saison
              </button>
            </div>

            <div className="flex h-full w-full flex-col justify-between gap-4">
              <header className="space-y-2">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Récap</p>
                <h3 className="text-xl font-semibold text-[var(--text)]">
                  Même logique que le dashboard réel
                </h3>
              </header>
              <div className="relative aspect-[16/9] overflow-hidden rounded-2xl border border-white/12">
                <Image
                  src="/landing/screenshots/dashboard-coach.png"
                  alt="Dashboard coach SwingFlow"
                  fill
                  sizes="(max-width: 1024px) 100vw, 920px"
                  className="object-cover"
                />
              </div>
              <button
                type="button"
                className={SECONDARY_BUTTON_CLASS}
                onClick={() => scrollToSection("season-calendar")}
              >
                Continuer
              </button>
            </div>
          </HorizontalCarousel>
        </Section>

        <Section
          id="season-calendar"
          sectionLabel={SECTION_LABELS["season-calendar"]}
          ref={renderSectionRef(sectionRefs, "season-calendar")}
        >
          <HorizontalCarousel
            sectionId="season-calendar"
            activeIndex={activeSlides["season-calendar"]}
            onActiveIndexChange={(index) => updateSlideIndex("season-calendar", index)}
          >
            <div className="flex h-full w-full flex-col justify-between gap-4">
              <header className="space-y-2">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Étape 8</p>
                <h2 className="text-2xl font-semibold text-[var(--text)]">Suivi saison élève</h2>
              </header>
              <CalendarMock
                key={`demo-calendar-student-${isStudentCalendarSlideActive ? "active" : "idle"}`}
                mode="student"
                animated={isStudentCalendarSlideActive}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  className={PRIMARY_BUTTON_CLASS}
                  onClick={() => scrollToSlide("season-calendar", 1)}
                >
                  Vue coach
                </button>
              </div>
            </div>

            <div className="flex h-full w-full flex-col justify-between gap-4">
              <header className="space-y-2">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Agrégation coach</p>
                <h3 className="text-xl font-semibold text-[var(--text)]">Calendrier multi-élèves</h3>
              </header>
              <CalendarMock
                key={`demo-calendar-coach-${isCoachCalendarSlideActive ? "active" : "idle"}`}
                mode="coach"
                animated={isCoachCalendarSlideActive}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  className={PRIMARY_BUTTON_CLASS}
                  onClick={() => scrollToSection("structure-mode")}
                >
                  Mode structure
                </button>
              </div>
            </div>
          </HorizontalCarousel>
        </Section>

        <Section
          id="structure-mode"
          sectionLabel={SECTION_LABELS["structure-mode"]}
          ref={renderSectionRef(sectionRefs, "structure-mode")}
        >
          <HorizontalCarousel
            sectionId="structure-mode"
            activeIndex={activeSlides["structure-mode"]}
            onActiveIndexChange={(index) => updateSlideIndex("structure-mode", index)}
            showLocalDots={false}
          >
            <div className="flex h-full w-full flex-col justify-between gap-5">
              <header className="space-y-2">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Étape 9</p>
                <h2 className="text-2xl font-semibold text-[var(--text)]">Mode structure (miroir)</h2>
              </header>
              <div className="grid gap-3 md:grid-cols-2">
                <Card>
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Coach</p>
                  <ul className="mt-2 space-y-1 text-sm text-[var(--text)]">
                    <li>⬢ Vue individualisée par élève</li>
                    <li>⬢ Rapport et priorités de séance</li>
                    <li>⬢ Décision rapide sur le terrain</li>
                  </ul>
                </Card>
                <Card>
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Structure</p>
                  <ul className="mt-2 space-y-1 text-sm text-[var(--text)]">
                    <li>⬢ Calendrier mutualisé multi-coachs/multi-élèves</li>
                    <li>⬢ Continuité pédagogique d’équipe</li>
                    <li>⬢ Valeur perçue premium à grande échelle</li>
                  </ul>
                </Card>
              </div>
              <button
                type="button"
                className={PRIMARY_BUTTON_CLASS}
                onClick={() => scrollToSection("final-cta")}
              >
                Terminer
              </button>
            </div>
          </HorizontalCarousel>
        </Section>

        <Section
          id="final-cta"
          sectionLabel={SECTION_LABELS["final-cta"]}
          ref={renderSectionRef(sectionRefs, "final-cta")}
        >
          <HorizontalCarousel
            sectionId="final-cta"
            activeIndex={activeSlides["final-cta"]}
            onActiveIndexChange={(index) => updateSlideIndex("final-cta", index)}
            showLocalDots={false}
          >
            <div className="flex h-full w-full flex-col justify-between">
              <header className="space-y-3">
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--muted)]">Final</p>
                <h2 className="max-w-3xl text-3xl font-semibold leading-tight text-[var(--text)] md:text-5xl">
                  Passez d’un suivi subi à un coaching réellement piloté.
                </h2>
                <p className="max-w-2xl text-sm text-[var(--muted)] md:text-base">
                  Vous venez de parcourir la version guidée. Le même flux existe ensuite avec vos
                  vraies données élèves.
                </p>
              </header>
              <div className="flex flex-wrap gap-3">
                <Link href="/login/coach?mode=signup" className={PRIMARY_BUTTON_CLASS}>
                  Créer mon compte coach
                </Link>
              </div>
              <footer className="pt-4 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                SwingFlow ⬢ Démo scrollytelling interactive
              </footer>
            </div>
          </HorizontalCarousel>
        </Section>
      </div>
    </main>
  );
}


