"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase/client";
import AdminGuard from "../_components/admin-guard";
import PageBack from "../_components/page-back";

type OverviewPayload = {
  orgsCount: number;
  coachesCount: number;
  studentsCount: number;
  aiRequests30d: number;
};

type TempoPreviewModalId = "propagation_qa" | "axes_choice" | "decision_qa" | null;

type TempoPreviewQuestion = {
  id: string;
  question: string;
  type: "choices" | "text";
  choices?: string[];
  multi?: boolean;
};

type TempoPreviewAxisSection = {
  section: string;
  options: Array<{
    id: string;
    title: string;
    summary: string;
    selected: boolean;
    tpiReasoning: {
      tpiLink: string;
      playerLimitation: string;
      golfCompensation: string;
    };
  }>;
};

const TEMPO_PREVIEW_PROPAGATION_QUESTIONS: ReadonlyArray<TempoPreviewQuestion> = [
  {
    id: "objective",
    question: "Quel est l objectif principal de cette propagation ?",
    type: "choices",
    choices: ["Clarifier la priorite", "Rendre le feedback plus actionnable", "Mieux relier TPI"],
  },
  {
    id: "constraints",
    question: "Contraintes a respecter pour la seance suivante ?",
    type: "text",
  },
  {
    id: "tone",
    question: "Niveau de precision attendu dans les sections cibles ?",
    type: "choices",
    choices: ["Court", "Intermediaire", "Detaille"],
  },
];

const TEMPO_PREVIEW_DECISION_QUESTIONS: ReadonlyArray<TempoPreviewQuestion> = [
  {
    id: "session_goal",
    question: "Objectif principal de la seance en cours",
    type: "choices",
    choices: ["Contact centre", "Stabilite directionnelle", "Gain de distance"],
  },
  {
    id: "shot_shape",
    question: "Balle dominante observee",
    type: "choices",
    choices: ["Push", "Pull", "Fade", "Draw"],
    multi: true,
  },
  {
    id: "coach_intent",
    question: "Intention coach (optionnel)",
    type: "text",
  },
];

const createDecisionPreviewAnswers = (): Record<string, string | string[]> =>
  TEMPO_PREVIEW_DECISION_QUESTIONS.reduce(
    (accumulator, question) => {
      if (question.type === "choices" && question.choices?.length) {
        accumulator[question.id] = question.multi
          ? question.choices.slice(0, Math.min(2, question.choices.length))
          : question.choices[0];
      } else {
        accumulator[question.id] = "";
      }
      return accumulator;
    },
    {} as Record<string, string | string[]>
  );

const TEMPO_PREVIEW_AXES: ReadonlyArray<TempoPreviewAxisSection> = [
  {
    section: "Diagnostic swing",
    options: [
      {
        id: "diag-1",
        selected: true,
        title: "Axe Rouge: stabiliser la posture au sommet",
        summary:
          "Prioriser le maintien de posture pour reduire la perte d angle et mieux recaler le chemin.",
        tpiReasoning: {
          tpiLink: "Rotation thoracique limitee, compensation en extension.",
          playerLimitation: "Difficulte a conserver l inclinaison dans la transition.",
          golfCompensation: "Mise en place d un drill tempo + repere visuel d appui.",
        },
      },
      {
        id: "diag-2",
        selected: false,
        title: "Axe Orange: regularite des appuis",
        summary:
          "Mettre l accent sur la gestion des appuis pour limiter les variations de face et de chemin.",
        tpiReasoning: {
          tpiLink: "Controle lombo-pelvien variable sous fatigue.",
          playerLimitation: "Instabilite pied droit sur la fin du backswing.",
          golfCompensation: "Routine d ancrage + cadence de transition plus progressive.",
        },
      },
    ],
  },
  {
    section: "Plan 7 jours",
    options: [
      {
        id: "plan-1",
        selected: false,
        title: "Axe Vert: transfert progressif parcours",
        summary:
          "Consolider sur practice puis transferer en situation parcours avec un objectif simple.",
        tpiReasoning: {
          tpiLink: "Mobilite satisfaisante mais variabilite de rythme.",
          playerLimitation: "Difficulte a reproduire sous pression.",
          golfCompensation: "Progression en 3 blocs: technique, cible, decision.",
        },
      },
      {
        id: "plan-2",
        selected: true,
        title: "Axe Rouge: priorite contact fer moyen",
        summary:
          "Structurer la semaine autour du contact fer 7 avant d ouvrir a d autres clubs.",
        tpiReasoning: {
          tpiLink: "Sequence segmentaire desynchronisee en acceleration.",
          playerLimitation: "Point bas instable avec variation de profondeur.",
          golfCompensation: "Blocage des variables: balle, stance, tempo, feedback video court.",
        },
      },
    ],
  },
];

const renderTrafficWords = (text: string): ReactNode => {
  const tokens = text.split(/(Rouge|Orange|Vert)/gi);
  return tokens.map((token, index) => {
    const lower = token.toLowerCase();
    if (lower === "rouge") {
      return (
        <span key={`traffic-${index}`} className="font-semibold text-red-600 dark:text-red-400">
          {token}
        </span>
      );
    }
    if (lower === "orange") {
      return (
        <span key={`traffic-${index}`} className="font-semibold text-orange-600 dark:text-orange-400">
          {token}
        </span>
      );
    }
    if (lower === "vert") {
      return (
        <span key={`traffic-${index}`} className="font-semibold text-green-700 dark:text-green-400">
          {token}
        </span>
      );
    }
    return <span key={`traffic-${index}`}>{token}</span>;
  });
};

export default function AdminDashboardPage() {
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tempoPreviewModal, setTempoPreviewModal] = useState<TempoPreviewModalId>(null);
  const [tempoPreviewDecisionAnswers, setTempoPreviewDecisionAnswers] = useState<
    Record<string, string | string[]>
  >(createDecisionPreviewAnswers);

  useEffect(() => {
    const loadOverview = async () => {
      setLoading(true);
      setError("");

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        setError("Session invalide. Reconnecte toi.");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/admin/overview", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json()) as OverviewPayload & {
        error?: string;
      };

      if (!response.ok) {
        if (response.status === 423) {
          setLoading(false);
          return;
        }
        setError(payload.error ?? "Chargement impossible.");
        setLoading(false);
        return;
      }

      setOverview(payload);
      setLoading(false);
    };

    void loadOverview();

    const handleBackofficeUnlocked = () => {
      void loadOverview();
    };
    window.addEventListener("backoffice:unlocked", handleBackofficeUnlocked);

    return () => {
      window.removeEventListener("backoffice:unlocked", handleBackofficeUnlocked);
    };
  }, []);

  return (
    <AdminGuard>
      <div className="space-y-6">
        <section className="panel rounded-2xl p-6">
          <div className="flex items-center gap-2">
            <PageBack />
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Admin
            </p>
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
            Backoffice central
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Pilote les prix, les acces coach, et le suivi IA.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          {[
            {
              label: "Organisations",
              value: !loading && overview ? `${overview.orgsCount}` : "-",
            },
            {
              label: "Coachs",
              value: !loading && overview ? `${overview.coachesCount}` : "-",
            },
            {
              label: "Eleves",
              value: !loading && overview ? `${overview.studentsCount}` : "-",
            },
            {
              label: "IA 30 jours",
              value: !loading && overview ? `${overview.aiRequests30d}` : "-",
            },
          ].map((item) => (
            <div key={item.label} className="panel-soft rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                {item.label}
              </p>
              <p className="mt-3 text-2xl font-semibold text-[var(--text)]">
                {item.value}
              </p>
              <p className="mt-2 text-xs text-[var(--muted)]">Donnees internes</p>
            </div>
          ))}
        </section>

        {error ? (
          <section className="panel rounded-2xl p-6">
            <p className="text-sm text-red-400">{error}</p>
          </section>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-5">
          {[
            {
              title: "Tarifs & features",
              description: "Modifie les prix et les listes de features visibles.",
              href: "/app/admin/pricing",
              cta: "Ouvrir les tarifs",
            },
            {
              title: "Acces coach",
              description: "Active ou coupe le premium et choisis le modele IA.",
              href: "/app/admin/coaches",
              cta: "Gerer les coachs",
            },
            {
              title: "Analytics IA",
              description: "Suivi des appels IA, tokens et activite par coach.",
              href: "/app/admin/analytics",
              cta: "Voir les analytics",
            },
            {
              title: "Support utilisateurs",
              description: "Centralise bugs, questions, facturation et demandes features.",
              href: "/app/admin/bugs",
              cta: "Voir le support",
            },
            {
              title: "Logs applicatifs",
              description: "Monitor les actions clefs des coachs et du systeme.",
              href: "/app/admin/logs",
              cta: "Voir les logs",
            },
          ].map((card) => (
            <div key={card.title} className="panel rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-[var(--text)]">{card.title}</h3>
              <p className="mt-2 text-sm text-[var(--muted)]">{card.description}</p>
              <Link
                href={card.href}
                className="mt-4 inline-flex rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
              >
                {card.cta}
              </Link>
            </div>
          ))}
        </section>

        <section className="panel rounded-2xl p-6">
          <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted)]">
            Tempo IA
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--text)]">
            Preview modales generiques
          </h3>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Ouvre des modales de test visuel sans lancer de vraie propagation.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTempoPreviewModal("propagation_qa")}
              className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
            >
              Modal Q&A propagation
            </button>
            <button
              type="button"
              onClick={() => setTempoPreviewModal("axes_choice")}
              className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
            >
              Modal choix d axe
            </button>
            <button
              type="button"
              onClick={() => {
                setTempoPreviewDecisionAnswers(createDecisionPreviewAnswers());
                setTempoPreviewModal("decision_qa");
              }}
              className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
            >
              Modal Q&A 3 axes
            </button>
          </div>
        </section>

        {tempoPreviewModal === "propagation_qa" ? (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 px-4 py-10">
            <div className="relative mx-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-[var(--bg-elevated)] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
              <span className="pointer-events-none absolute -left-20 -top-16 h-56 w-56 rounded-full bg-emerald-300/20 blur-3xl" />
              <span className="pointer-events-none absolute -right-24 top-10 h-56 w-56 rounded-full bg-sky-300/20 blur-3xl" />
              <div className="flex items-start justify-between gap-4 p-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                    <span className="normal-case">Tempo IA</span>
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-[var(--text)]">
                    Q&A rapide - propagation
                  </h3>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Exemple generique pour valider le design avant branchage metier.
                  </p>
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-[var(--text)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    3 questions - flow express
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTempoPreviewModal(null)}
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
              <div className="mt-5 max-h-[60vh] space-y-4 overflow-y-auto px-6 pb-6">
                {TEMPO_PREVIEW_PROPAGATION_QUESTIONS.map((question, index) => (
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
                    {question.type === "choices" && question.choices ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {question.choices.map((choice, choiceIndex) => (
                          <span
                            key={choice}
                            className={`rounded-full px-3 py-1 text-[0.65rem] uppercase tracking-wide ${
                              choiceIndex === 0
                                ? "bg-gradient-to-r from-emerald-300/40 via-emerald-200/30 to-sky-300/35 text-[var(--text)] shadow-[0_6px_14px_rgba(16,185,129,0.24)]"
                                : "bg-white/18 text-[var(--text)]"
                            }`}
                          >
                            {choice}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <textarea
                        rows={2}
                        defaultValue="Exemple de contrainte coach: garder des consignes courtes et actionnables."
                        className="mt-3 w-full rounded-xl bg-white/16 px-3 py-2 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
                        readOnly
                      />
                    )}
                  </article>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setTempoPreviewModal(null)}
                  className="rounded-full bg-white/18 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/24"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {tempoPreviewModal === "axes_choice" ? (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 px-4 py-10">
            <div className="mx-auto flex w-full max-w-3xl flex-col rounded-3xl bg-[var(--bg-elevated)] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
              <div className="flex items-start justify-between gap-4 p-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                    <span className="normal-case">Tempo IA</span>
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-[var(--text)]">
                    Choix d axe par section
                  </h3>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Preview generique du rendu final de la modal d axes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTempoPreviewModal(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-[var(--muted)] transition hover:bg-white/15 hover:text-[var(--text)]"
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
                {TEMPO_PREVIEW_AXES.map((entry) => (
                  <div
                    key={entry.section}
                    className="rounded-2xl bg-gradient-to-br from-white/16 via-white/10 to-transparent p-4 shadow-[0_12px_30px_rgba(2,6,23,0.3)]"
                  >
                    <p className="text-sm font-semibold text-[var(--text)]">{entry.section}</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {entry.options.map((option) => (
                        <article
                          key={option.id}
                          className={`group flex h-full flex-col rounded-2xl p-3 text-left text-sm transition ${
                            option.selected
                              ? "bg-gradient-to-br from-emerald-300/32 via-cyan-300/24 to-sky-300/22 text-[var(--text)] shadow-[0_12px_28px_rgba(16,185,129,0.2)]"
                              : "bg-white/12 text-[var(--text)]"
                          }`}
                        >
                          <div className="flex min-h-[3.25rem] items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-[var(--text)]">
                              {renderTrafficWords(option.title)}
                            </p>
                            <span
                              className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] ${
                                option.selected
                                  ? "bg-emerald-300/35 text-[var(--text)]"
                                  : "bg-white/25 text-[var(--muted)]"
                              }`}
                              aria-hidden="true"
                            >
                              {option.selected ? "OK" : "+"}
                            </span>
                          </div>
                          <p className="mt-1 min-h-[4.4rem] text-xs leading-relaxed text-[var(--muted)]">
                            {renderTrafficWords(option.summary)}
                          </p>
                          <div className="mt-3 rounded-xl bg-gradient-to-br from-cyan-300/28 via-emerald-300/18 to-sky-200/10 p-2.5">
                            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-[var(--text)]/80">
                              Raisonnement TPI - limitation - compensation golf
                            </p>
                            <div className="mt-2 min-h-[6.8rem] space-y-1.5 text-[0.72rem] leading-relaxed text-[var(--text)]">
                              <p>
                                <span className="font-semibold text-sky-100">TPI:</span>{" "}
                                {renderTrafficWords(option.tpiReasoning.tpiLink)}
                              </p>
                              <p>
                                <span className="font-semibold text-sky-100">
                                  Limitation joueur:
                                </span>{" "}
                                {renderTrafficWords(option.tpiReasoning.playerLimitation)}
                              </p>
                              <p>
                                <span className="font-semibold text-sky-100">
                                  Compensation golf:
                                </span>{" "}
                                {renderTrafficWords(option.tpiReasoning.golfCompensation)}
                              </p>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setTempoPreviewModal(null)}
                  className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)] transition hover:bg-white/15 hover:text-[var(--text)]"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {tempoPreviewModal === "decision_qa" ? (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 px-4 py-10">
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
                    Preview generique du flow aide a la decision/coaching Tempo.
                  </p>
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-[var(--text)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {TEMPO_PREVIEW_DECISION_QUESTIONS.length} questions - flow express
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTempoPreviewModal(null)}
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
                {TEMPO_PREVIEW_DECISION_QUESTIONS.map((question, questionIndex) => {
                  const currentValue = tempoPreviewDecisionAnswers[question.id];
                  const selectedValues = Array.isArray(currentValue) ? currentValue : [];
                  const textValue = typeof currentValue === "string" ? currentValue : "";

                  return (
                    <article
                      key={question.id}
                      className="rounded-2xl bg-gradient-to-br from-white/20 via-white/12 to-transparent p-4 shadow-[0_10px_24px_rgba(15,23,42,0.14)]"
                    >
                      <div className="flex items-start gap-3">
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-300/45 to-sky-300/35 text-[0.62rem] font-semibold text-[var(--text)]">
                          {questionIndex + 1}
                        </span>
                        <p className="pt-0.5 text-sm font-semibold text-[var(--text)]">
                          {question.question}
                        </p>
                      </div>
                      {question.type === "choices" && question.choices ? (
                        <div className="mt-3 grid gap-2">
                          {question.choices.map((choice) => {
                            const checked = question.multi
                              ? selectedValues.includes(choice)
                              : textValue === choice;

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
                                  type={question.multi ? "checkbox" : "radio"}
                                  name={question.multi ? undefined : `preview-${question.id}`}
                                  checked={checked}
                                  onChange={() => {
                                    setTempoPreviewDecisionAnswers((previous) => {
                                      const existing = previous[question.id];
                                      if (question.multi) {
                                        const existingList = Array.isArray(existing)
                                          ? existing
                                          : [];
                                        const next = checked
                                          ? existingList.filter((item) => item !== choice)
                                          : [...existingList, choice];
                                        return { ...previous, [question.id]: next };
                                      }
                                      return { ...previous, [question.id]: choice };
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
                        <textarea
                          rows={3}
                          value={textValue}
                          onChange={(event) =>
                            setTempoPreviewDecisionAnswers((previous) => ({
                              ...previous,
                              [question.id]: event.target.value,
                            }))
                          }
                          placeholder="Exemple: confirmer un axe simple a appliquer des la prochaine seance."
                          className="mt-3 w-full rounded-xl bg-white/16 px-3 py-2 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
                        />
                      )}
                    </article>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setTempoPreviewModal(null)}
                  className="rounded-full bg-white/18 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/24"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => setTempoPreviewModal(null)}
                  className="rounded-full bg-gradient-to-r from-emerald-300 via-emerald-200 to-sky-200 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-wide text-zinc-900 transition hover:opacity-90"
                >
                  Generer les axes
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AdminGuard>
  );
}
