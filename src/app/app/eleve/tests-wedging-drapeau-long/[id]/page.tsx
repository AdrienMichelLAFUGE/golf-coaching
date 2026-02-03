"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import RoleGuard from "../../../_components/role-guard";
import PelzDiagramModal from "../../../_components/pelz-diagram-modal";
import TestResultModal from "../../../_components/test-result-modal";
import {
  WEDGING_DRAPEAU_LONG_DIAGRAM_ALT_TEXT,
  WEDGING_DRAPEAU_LONG_DIAGRAM_BUCKET,
  WEDGING_DRAPEAU_LONG_DIAGRAM_EXTENSION,
  WEDGING_DRAPEAU_LONG_DIAGRAM_KEY,
} from "@/lib/normalized-tests/wedging-drapeau-long-diagrams";
import {
  WEDGING_DRAPEAU_LONG_SEQUENCE,
  WEDGING_DRAPEAU_LONG_SLUG,
  WEDGING_DRAPEAU_LONG_SUBTEST_KEY,
  WEDGING_DRAPEAU_LONG_TEST,
  type WedgingDrapeauLongResultValue,
  type WedgingDrapeauLongSituation,
  computeWedgingDrapeauLongObjectivation,
  getWedgingDrapeauLongEquivalentIndexLabel,
  computeWedgingDrapeauLongTotalScore,
  getWedgingDrapeauLongResultOptions,
  isWedgingDrapeauLongResultValue,
} from "@/lib/normalized-tests/wedging-drapeau-long";

type AssignmentRow = {
  id: string;
  test_slug: string;
  status: "assigned" | "in_progress" | "finalized";
  assigned_at: string;
  started_at: string | null;
  finalized_at: string | null;
  index_or_flag_label?: string | null;
  clubs_used?: string | null;
};

type AttemptValue = WedgingDrapeauLongResultValue | null;

const createEmptyAttempts = () =>
  Array(WEDGING_DRAPEAU_LONG_TEST.attemptsPerSubtest).fill(null) as AttemptValue[];

const slotColorClassByLetter: Record<string, string> = {
  A: "text-sky-300",
  B: "text-amber-300",
  C: "text-emerald-300",
  D: "text-violet-300",
  E: "text-rose-300",
  F: "text-lime-300",
  G: "text-cyan-300",
  H: "text-fuchsia-300",
  I: "text-orange-300",
};

const getSlotColorClass = (slot: string) =>
  slotColorClassByLetter[slot] ?? "text-[var(--muted)]";

const wedgingDistanceItems = [
  { slot: "A", distance: "30m" },
  { slot: "B", distance: "35m" },
  { slot: "C", distance: "40m" },
  { slot: "D", distance: "45m" },
  { slot: "E", distance: "50m" },
  { slot: "F", distance: "55m" },
  { slot: "G", distance: "60m" },
  { slot: "H", distance: "65m" },
  { slot: "I", distance: "70m" },
];

const wedgingDistanceBySlot = Object.fromEntries(
  wedgingDistanceItems.map((item) => [item.slot, item.distance])
) as Record<string, string>;

const renderDistanceLabel = () => (
  <span>
    {wedgingDistanceItems.map((item, index) => (
      <span key={item.slot}>
        <span className={`font-semibold ${getSlotColorClass(item.slot)}`}>
          {item.slot}
        </span>
        <span className={getSlotColorClass(item.slot)}>=</span>
        <span className={getSlotColorClass(item.slot)}>{item.distance}</span>
        {index < wedgingDistanceItems.length - 1 ? ", " : ""}
      </span>
    ))}
  </span>
);

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("fr-FR");
};

const formatScore = (value: number) => value.toFixed(1);

export default function StudentWedgingDrapeauLongPage() {
  const params = useParams();
  const router = useRouter();
  const assignmentId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [assignment, setAssignment] = useState<AssignmentRow | null>(null);
  const [attempts, setAttempts] = useState<AttemptValue[]>(createEmptyAttempts);
  const [indexLabel, setIndexLabel] = useState("");
  const [clubsUsed, setClubsUsed] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [diagramOpen, setDiagramOpen] = useState(false);
  const [resultModalOpen, setResultModalOpen] = useState(false);

  const isFinalized = assignment?.status === "finalized";

  useEffect(() => {
    const loadAssignment = async () => {
      if (!assignmentId || typeof assignmentId !== "string") {
        setLoadError("Test introuvable.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError("");
      setNotice("");

      const { data: assignmentData, error: assignmentError } = await supabase
        .from("normalized_test_assignments")
        .select(
          "id, test_slug, status, assigned_at, started_at, finalized_at, index_or_flag_label, clubs_used"
        )
        .eq("id", assignmentId)
        .maybeSingle();

      if (assignmentError || !assignmentData) {
        setLoadError("Test introuvable.");
        setLoading(false);
        return;
      }

      if (assignmentData.test_slug !== WEDGING_DRAPEAU_LONG_SLUG) {
        setLoadError("Test non supporte.");
        setLoading(false);
        return;
      }

      setAssignment(assignmentData as AssignmentRow);
      setIndexLabel(assignmentData.index_or_flag_label ?? "");
      setClubsUsed(assignmentData.clubs_used ?? "");

      const { data: attemptsData, error: attemptsError } = await supabase
        .from("normalized_test_attempts")
        .select("subtest_key, attempt_index, result_value")
        .eq("assignment_id", assignmentId);

      if (attemptsError) {
        setLoadError(attemptsError.message);
        setLoading(false);
        return;
      }

      const nextAttempts = createEmptyAttempts();
      (attemptsData ?? []).forEach((row) => {
        if (row.subtest_key !== WEDGING_DRAPEAU_LONG_SUBTEST_KEY) return;
        if (row.attempt_index < 1 || row.attempt_index > nextAttempts.length) return;
        if (!isWedgingDrapeauLongResultValue(row.result_value)) return;
        nextAttempts[row.attempt_index - 1] =
          row.result_value as WedgingDrapeauLongResultValue;
      });

      setAttempts(nextAttempts);
      setLoading(false);
    };

    loadAssignment();
  }, [assignmentId]);

  const totalScore = useMemo(
    () => computeWedgingDrapeauLongTotalScore(attempts),
    [attempts]
  );
  const isComplete = attempts.every(Boolean);
  const objectivation = useMemo(
    () => computeWedgingDrapeauLongObjectivation(indexLabel, totalScore),
    [indexLabel, totalScore]
  );

  const handleResultChange = (index: number, value: string) => {
    if (!isWedgingDrapeauLongResultValue(value)) return;
    setAttempts((prev) => {
      const next = [...prev];
      next[index] = value as WedgingDrapeauLongResultValue;
      return next;
    });
  };

  const handleClearAttempt = (index: number) => {
    setAttempts((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
  };

  const buildPayload = (finalize: boolean) => ({
    assignmentId,
    finalize,
    indexLabel,
    clubsUsed,
    subtests: [
      {
        key: WEDGING_DRAPEAU_LONG_SUBTEST_KEY,
        attempts: attempts
          .map((value, index) =>
            value
              ? {
                  index: index + 1,
                  situation: WEDGING_DRAPEAU_LONG_SEQUENCE[index],
                  result: value,
                }
              : null
          )
          .filter(
            (
              value
            ): value is {
              index: number;
              situation: WedgingDrapeauLongSituation;
              result: WedgingDrapeauLongResultValue;
            } => Boolean(value)
          ),
      },
    ],
  });

  const handleSave = async (finalize: boolean) => {
    if (!assignmentId || typeof assignmentId !== "string") return;
    if (finalize && !isComplete) {
      setActionError("Complete toutes les tentatives avant de finaliser.");
      return;
    }

    setSaving(true);
    setActionError("");
    setNotice("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setActionError("Session invalide.");
      setSaving(false);
      return;
    }

    const response = await fetch("/api/normalized-tests/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(buildPayload(finalize)),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setActionError(payload.error ?? "Enregistrement impossible.");
      setSaving(false);
      return;
    }

    setAssignment((prev) =>
      prev
        ? {
            ...prev,
            status: payload.assignment?.status ?? prev.status,
            finalized_at: payload.assignment?.finalized_at ?? prev.finalized_at,
          }
        : prev
    );
    setNotice(finalize ? "Test finalise." : "Sauvegarde terminee.");
    setSaving(false);
    if (finalize) {
      setResultModalOpen(true);
    }
  };

  const handleResultModalClose = () => {
    setResultModalOpen(false);
    router.refresh();
  };

  return (
    <RoleGuard allowedRoles={["student"]}>
      {loading ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-[var(--muted)]">Chargement du test...</p>
        </section>
      ) : loadError ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-red-400">{loadError}</p>
        </section>
      ) : assignment ? (
        <div className="space-y-6">
          <section className="panel rounded-2xl p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Test normalise
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold text-[var(--text)]">
                  {WEDGING_DRAPEAU_LONG_TEST.title}
                </h2>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {WEDGING_DRAPEAU_LONG_TEST.description}
                </p>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Pris le {formatDate(assignment.started_at ?? assignment.assigned_at)}.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => router.push("/app/eleve/tests")}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                >
                  Retour
                </button>
                <button
                  type="button"
                  onClick={() => setDiagramOpen(true)}
                  className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
                  aria-label="Ouvrir schema Wedging drapeau long"
                >
                  Schema
                </button>
                {assignment.status === "finalized" ? (
                  <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-emerald-200">
                    Finalise
                  </span>
                ) : null}
              </div>
            </div>
          </section>

          <section className="panel-soft rounded-2xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text)]">Total</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Somme des 18 tentatives.
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  Total score
                </p>
                <p className="mt-1 text-2xl font-semibold text-[var(--text)]">
                  {totalScore}
                </p>
              </div>
            </div>
            {objectivation ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--text)]">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  Objectivation
                </p>
                <p className="mt-2">
                  Moyenne attendue (index/drapeau):{" "}
                  <span className="font-semibold">
                    {formatScore(objectivation.expectedAvgScore)}
                  </span>
                </p>
                <p className="mt-1">
                  Ecart:{" "}
                  <span className="font-semibold">
                    {objectivation.delta > 0 ? "+" : ""}
                    {formatScore(objectivation.delta)}
                  </span>
                </p>
                <p className="mt-1">
                  Verdict:{" "}
                  <span className="font-semibold capitalize">
                    {objectivation.verdict}
                  </span>
                </p>
              </div>
            ) : null}
          </section>

          <section className="panel-soft rounded-2xl p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  Index / drapeau
                </label>
                <input
                  type="text"
                  value={indexLabel}
                  onChange={(event) => setIndexLabel(event.target.value)}
                  disabled={isFinalized}
                  placeholder="Ex: 12 ou Drapeau Blanc"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500 disabled:opacity-70"
                />
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Accepte un index numeric [-5..54] ou un drapeau
                  (Blanc/Jaune/Bleu/Rouge).
                </p>
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  Clubs utilises
                </label>
                <input
                  type="text"
                  value={clubsUsed}
                  onChange={(event) => setClubsUsed(event.target.value)}
                  disabled={isFinalized}
                  placeholder="Ex: SW 56°, PW"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500 disabled:opacity-70"
                />
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Champ libre pour noter les clubs utilises.
                </p>
              </div>
            </div>
          </section>

          <section className="panel rounded-2xl p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text)]">
                  Carte de score
                </h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  6 categories de resultat.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {getWedgingDrapeauLongResultOptions().map((option) => (
                <div
                  key={option.value}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                    {option.label}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-[var(--text)]">
                    {option.points > 0 ? "+" : ""}
                    {option.points}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="panel rounded-2xl p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text)]">
                  Saisie des 18 balles
                </h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Situations: {renderDistanceLabel()}.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {WEDGING_DRAPEAU_LONG_SEQUENCE.map((slot, index) => (
                <div
                  key={`attempt-${slot}-${index}`}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                      Tentative{" "}
                      <span className={`font-semibold ${getSlotColorClass(slot)}`}>
                        {index + 1}
                      </span>{" "}
                      -{" "}
                      <span className={`font-semibold ${getSlotColorClass(slot)}`}>
                        {slot}
                      </span>{" "}
                      <span className="text-[var(--muted)]">
                        ({wedgingDistanceBySlot[slot] ?? "-"})
                      </span>
                    </span>
                    {attempts[index] ? (
                      <button
                        type="button"
                        onClick={() => handleClearAttempt(index)}
                        disabled={isFinalized}
                        className="text-[0.6rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-50"
                      >
                        Effacer
                      </button>
                    ) : null}
                  </div>
                  <select
                    value={attempts[index] ?? ""}
                    onChange={(event) => handleResultChange(index, event.target.value)}
                    disabled={isFinalized}
                    className="mt-3 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                  >
                    <option value="">Choisir un resultat</option>
                    {getWedgingDrapeauLongResultOptions().map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label} ({option.points > 0 ? "+" : ""}
                        {option.points})
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>

          {notice ? (
            <section className="panel-soft rounded-2xl p-4">
              <p className="text-sm text-emerald-200">{notice}</p>
            </section>
          ) : null}
          {actionError ? (
            <section className="panel-soft rounded-2xl p-4">
              <p className="text-sm text-red-400">{actionError}</p>
            </section>
          ) : null}

          <section className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => router.push("/app/eleve/tests")}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
            >
              Retour
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleSave(false)}
                disabled={saving || isFinalized}
                className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20 disabled:opacity-60"
              >
                {saving ? "Sauvegarde..." : "Enregistrer"}
              </button>
              <button
                type="button"
                onClick={() => handleSave(true)}
                disabled={saving || isFinalized || !isComplete}
                className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-xs uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-400/20 disabled:opacity-60"
              >
                Finaliser
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <PelzDiagramModal
        open={diagramOpen}
        onClose={() => setDiagramOpen(false)}
        title="Schema - Wedging drapeau long"
        alt={WEDGING_DRAPEAU_LONG_DIAGRAM_ALT_TEXT}
        diagramKey={diagramOpen ? WEDGING_DRAPEAU_LONG_DIAGRAM_KEY : null}
        bucket={WEDGING_DRAPEAU_LONG_DIAGRAM_BUCKET}
        extension={WEDGING_DRAPEAU_LONG_DIAGRAM_EXTENSION}
      />
      <TestResultModal
        open={resultModalOpen}
        onClose={handleResultModalClose}
        title="Resultat du test"
        description="Voici l index equivalent estime a partir de ton total de points."
        items={[
          { label: "Total points", value: totalScore.toString() },
          {
            label: "Index equivalent",
            value: getWedgingDrapeauLongEquivalentIndexLabel(totalScore),
          },
        ]}
      />
    </RoleGuard>
  );
}
