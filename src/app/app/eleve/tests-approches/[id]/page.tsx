"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import RoleGuard from "../../../_components/role-guard";
import PageHeader from "../../../_components/page-header";
import PelzResponsiveAccordion from "../../../_components/pelz-responsive-accordion";
import PelzDiagramModal from "../../../_components/pelz-diagram-modal";
import TestResultModal from "../../../_components/test-result-modal";
import {
  PELZ_APPROCHES_DIAGRAM_ALT_TEXT,
  PELZ_APPROCHES_DIAGRAM_BY_SUBTEST,
  PELZ_APPROCHES_DIAGRAM_EXTENSION,
} from "@/lib/normalized-tests/pelz-approches-diagrams";
import {
  PELZ_APPROCHES_TEST,
  PELZ_APPROCHES_SLUG,
  type PelzApprochesResultValue,
  type PelzApprochesSubtestKey,
  computePelzApprochesSubtestScore,
  computePelzApprochesTotalIndex,
  getPelzApprochesResultOptions,
  isPelzApprochesResultValue,
} from "@/lib/normalized-tests/pelz-approches";

type AssignmentRow = {
  id: string;
  test_slug: string;
  status: "assigned" | "in_progress" | "finalized";
  assigned_at: string;
  finalized_at: string | null;
  index_or_flag_label?: string | null;
};

type AttemptValue = PelzApprochesResultValue | null;
type AttemptsBySubtest = Record<PelzApprochesSubtestKey, AttemptValue[]>;

const createEmptyAttempts = (): AttemptsBySubtest => {
  const entries = PELZ_APPROCHES_TEST.subtests.map((subtest) => [
    subtest.key,
    Array(PELZ_APPROCHES_TEST.attemptsPerSubtest).fill(null) as AttemptValue[],
  ]);
  return Object.fromEntries(entries) as AttemptsBySubtest;
};

const distanceLabelByKey: Record<PelzApprochesSubtestKey, string> = {
  approche_levee: "A=15m, B=20m, C=10m",
  chip_long: "A=15m, B=20m, C=10m",
  chip_court: "A=15m, B=20m, C=10m",
  wedging_50m: "D=50m, E=10m, F=30m",
  bunker_court: "D=50m, E=10m, F=30m",
  wedging_30m: "D=50m, E=10m, F=30m",
  bunker_long: "G=25m, H=20m, I=15m",
  approche_mi_distance: "G=25m, H=20m, I=15m",
  approche_rough: "G=25m, H=20m, I=15m",
};
const distanceItemsByKey: Record<
  PelzApprochesSubtestKey,
  { slot: string; distance: string }[]
> = {
  approche_levee: [
    { slot: "A", distance: "15m" },
    { slot: "B", distance: "20m" },
    { slot: "C", distance: "10m" },
  ],
  chip_long: [
    { slot: "A", distance: "15m" },
    { slot: "B", distance: "20m" },
    { slot: "C", distance: "10m" },
  ],
  chip_court: [
    { slot: "A", distance: "15m" },
    { slot: "B", distance: "20m" },
    { slot: "C", distance: "10m" },
  ],
  wedging_50m: [
    { slot: "D", distance: "50m" },
    { slot: "E", distance: "10m" },
    { slot: "F", distance: "30m" },
  ],
  bunker_court: [
    { slot: "D", distance: "50m" },
    { slot: "E", distance: "10m" },
    { slot: "F", distance: "30m" },
  ],
  wedging_30m: [
    { slot: "D", distance: "50m" },
    { slot: "E", distance: "10m" },
    { slot: "F", distance: "30m" },
  ],
  bunker_long: [
    { slot: "G", distance: "25m" },
    { slot: "H", distance: "20m" },
    { slot: "I", distance: "15m" },
  ],
  approche_mi_distance: [
    { slot: "G", distance: "25m" },
    { slot: "H", distance: "20m" },
    { slot: "I", distance: "15m" },
  ],
  approche_rough: [
    { slot: "G", distance: "25m" },
    { slot: "H", distance: "20m" },
    { slot: "I", distance: "15m" },
  ],
};
const slotColorClassByLetter: Record<string, string> = {
  A: "text-sky-300",
  B: "text-amber-300",
  C: "text-emerald-300",
  D: "text-violet-300",
  E: "text-rose-300",
  F: "text-cyan-300",
  G: "text-teal-300",
  H: "text-orange-300",
  I: "text-fuchsia-300",
};

const getSlotColorClass = (slot: string) =>
  slotColorClassByLetter[slot] ?? "text-[var(--muted)]";

const renderDistanceLabel = (key: PelzApprochesSubtestKey) => {
  const items = distanceItemsByKey[key];
  if (!items?.length) {
    return distanceLabelByKey[key] ?? "";
  }
  return (
    <span>
      {items.map((item, index) => (
        <span key={`${key}-${item.slot}`}>
          <span className={`font-semibold ${getSlotColorClass(item.slot)}`}>
            {item.slot}
          </span>
          <span className={getSlotColorClass(item.slot)}>=</span>
          <span className={getSlotColorClass(item.slot)}>{item.distance}</span>
          {index < items.length - 1 ? ", " : ""}
        </span>
      ))}
    </span>
  );
};

const getDistanceForSlot = (key: PelzApprochesSubtestKey, slot: string) =>
  distanceItemsByKey[key]?.find((item) => item.slot === slot)?.distance ?? "";

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("fr-FR");
};

export default function StudentTestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const assignmentId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [assignment, setAssignment] = useState<AssignmentRow | null>(null);
  const [attempts, setAttempts] = useState<AttemptsBySubtest>(createEmptyAttempts);
  const [indexLabel, setIndexLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [diagramSubtest, setDiagramSubtest] = useState<PelzApprochesSubtestKey | null>(
    null
  );
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
        .select("id, test_slug, status, assigned_at, finalized_at, index_or_flag_label")
        .eq("id", assignmentId)
        .maybeSingle();

      if (assignmentError || !assignmentData) {
        setLoadError("Test introuvable.");
        setLoading(false);
        return;
      }

      if (assignmentData.test_slug !== PELZ_APPROCHES_SLUG) {
        setLoadError("Test non supporte.");
        setLoading(false);
        return;
      }

      setAssignment(assignmentData as AssignmentRow);
      setIndexLabel(assignmentData.index_or_flag_label ?? "");

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
        const subtestKey = row.subtest_key as PelzApprochesSubtestKey;
        const definition = PELZ_APPROCHES_TEST.subtests.find(
          (subtest) => subtest.key === subtestKey
        );
        if (!definition) return;
        if (
          row.attempt_index < 1 ||
          row.attempt_index > PELZ_APPROCHES_TEST.attemptsPerSubtest
        ) {
          return;
        }
        if (!isPelzApprochesResultValue(subtestKey, row.result_value)) return;
        nextAttempts[subtestKey][row.attempt_index - 1] =
          row.result_value as PelzApprochesResultValue;
      });

      setAttempts(nextAttempts);
      setLoading(false);
    };

    loadAssignment();
  }, [assignmentId]);

  const subtestScores = useMemo(
    () =>
      PELZ_APPROCHES_TEST.subtests.map((subtest) => ({
        key: subtest.key,
        ...computePelzApprochesSubtestScore(subtest.key, attempts[subtest.key]),
      })),
    [attempts]
  );

  const totalPoints = subtestScores.reduce((acc, score) => acc + score.totalPoints, 0);
  const isComplete = subtestScores.every((score) => score.indexValue !== null);
  const totalIndex = isComplete ? computePelzApprochesTotalIndex(totalPoints) : null;
  const diagramMeta = useMemo(() => {
    if (!diagramSubtest) return null;
    const subtest = PELZ_APPROCHES_TEST.subtests.find(
      (item) => item.key === diagramSubtest
    );
    return {
      title: subtest?.label ?? "Schema",
      alt: PELZ_APPROCHES_DIAGRAM_ALT_TEXT[diagramSubtest],
      diagramKey: PELZ_APPROCHES_DIAGRAM_BY_SUBTEST[diagramSubtest],
    };
  }, [diagramSubtest]);

  const handleResultChange = (
    key: PelzApprochesSubtestKey,
    index: number,
    value: string
  ) => {
    if (!isPelzApprochesResultValue(key, value)) return;
    setAttempts((prev) => {
      const next = { ...prev };
      const clone = [...next[key]];
      clone[index] = value as PelzApprochesResultValue;
      next[key] = clone;
      return next;
    });
  };

  const handleClearAttempt = (key: PelzApprochesSubtestKey, index: number) => {
    setAttempts((prev) => {
      const next = { ...prev };
      const clone = [...next[key]];
      clone[index] = null;
      next[key] = clone;
      return next;
    });
  };

  const summarySection = (
    <section className="panel-soft rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[var(--text)]">Resume</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {isComplete
              ? "Tous les sous-tests sont complets."
              : "Complete tous les sous-tests pour obtenir l index final."}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
            Total points
          </p>
          <p className="mt-1 text-2xl font-semibold text-[var(--text)]">{totalPoints}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Index final: {totalIndex ?? "-"}
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {subtestScores.map((score) => (
          <div
            key={score.key}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              {PELZ_APPROCHES_TEST.subtests.find((s) => s.key === score.key)?.label}
            </p>
            <p className="mt-2 text-lg font-semibold text-[var(--text)]">
              {score.totalPoints} pts
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Index: {score.indexValue ?? "-"}
            </p>
          </div>
        ))}
      </div>
    </section>
  );

  const labelSection = (
    <section className="panel-soft rounded-2xl p-6">
      <div className="flex flex-col gap-2">
        <label className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
          Label optionnel
        </label>
        <input
          type="text"
          value={indexLabel}
          onChange={(event) => setIndexLabel(event.target.value)}
          disabled={isFinalized}
          placeholder="Ex: Index 12 ou etiquette libre"
          className="w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500 disabled:opacity-70"
        />
        <p className="text-xs text-[var(--muted)]">
          Champ libre pour noter un indicateur ou un contexte.
        </p>
      </div>
    </section>
  );

  const subtestItems = PELZ_APPROCHES_TEST.subtests.map((subtest) => ({
    id: subtest.key,
    label: subtest.label,
    content: (
      <section className="panel rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text)]">{subtest.label}</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Distances: {renderDistanceLabel(subtest.key)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDiagramSubtest(subtest.key)}
              className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
              aria-label={`Ouvrir schema ${subtest.label}`}
            >
              Schema
            </button>
            <span className="rounded-full border border-white/5 bg-white/5 px-2 py-1 text-[0.55rem] uppercase tracking-wide text-[var(--muted)] opacity-70">
              {subtest.sequence.length} tentatives
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-flow-col md:grid-cols-2 md:grid-rows-5">
          {subtest.sequence.map((slot, index) => (
            <div
              key={`${subtest.key}-${index}`}
              className="flex flex-col gap-2 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--text)]"
            >
              <div className="flex items-center justify-between gap-2">
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
                    ({getDistanceForSlot(subtest.key, slot)})
                  </span>
                </span>
                {attempts[subtest.key][index] ? (
                  <button
                    type="button"
                    onClick={() => handleClearAttempt(subtest.key, index)}
                    disabled={isFinalized}
                    className="text-[0.6rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-50"
                  >
                    Effacer
                  </button>
                ) : null}
              </div>
              <select
                value={attempts[subtest.key][index] ?? ""}
                onChange={(event) =>
                  handleResultChange(subtest.key, index, event.target.value)
                }
                disabled={isFinalized}
                className="w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
              >
                <option value="">Choisir un resultat</option>
                {getPelzApprochesResultOptions(subtest.key).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} ({option.points} pts)
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </section>
    ),
  }));

  const buildPayload = (finalize: boolean) => ({
    assignmentId,
    finalize,
    indexLabel,
    subtests: PELZ_APPROCHES_TEST.subtests.map((subtest) => ({
      key: subtest.key,
      attempts: attempts[subtest.key]
        .map((value, index) => (value ? { index: index + 1, result: value } : null))
        .filter((value): value is { index: number; result: PelzApprochesResultValue } =>
          Boolean(value)
        ),
    })),
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
          <PageHeader
            overline={
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                Test normalise
              </p>
            }
            title={PELZ_APPROCHES_TEST.title}
            subtitle={`Assigne le ${formatDate(assignment.assigned_at)}.`}
            meta={
              assignment.status === "finalized" ? (
                <span className="inline-flex rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-emerald-200">
                  Finalise
                </span>
              ) : null
            }
            actions={
              <button
                type="button"
                onClick={() => router.push("/app/eleve/tests")}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
              >
                Retour
              </button>
            }
          />

          <PelzResponsiveAccordion
            mobileItems={[
              {
                id: "bilan",
                label: "Bilan",
                content: (
                  <>
                    {summarySection}
                    {labelSection}
                  </>
                ),
              },
              ...subtestItems,
            ]}
            defaultOpenId={subtestItems[0]?.id ?? null}
          />
          <div className="hidden md:block space-y-6">
            <section className="panel-soft rounded-2xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--text)]">Resume</h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {isComplete
                      ? "Tous les sous-tests sont complets."
                      : "Complete tous les sous-tests pour obtenir l index final."}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                    Total points
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-[var(--text)]">
                    {totalPoints}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Index final: {totalIndex ?? "-"}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {subtestScores.map((score) => (
                  <div
                    key={score.key}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                  >
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                      {
                        PELZ_APPROCHES_TEST.subtests.find((s) => s.key === score.key)
                          ?.label
                      }
                    </p>
                    <p className="mt-2 text-lg font-semibold text-[var(--text)]">
                      {score.totalPoints} pts
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Index: {score.indexValue ?? "-"}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel-soft rounded-2xl p-6">
              <div className="flex flex-col gap-2">
                <label className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  Label optionnel
                </label>
                <input
                  type="text"
                  value={indexLabel}
                  onChange={(event) => setIndexLabel(event.target.value)}
                  disabled={isFinalized}
                  placeholder="Ex: Index 12 ou etiquette libre"
                  className="w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-zinc-500 disabled:opacity-70"
                />
                <p className="text-xs text-[var(--muted)]">
                  Champ libre pour noter un indicateur ou un contexte.
                </p>
              </div>
            </section>

            {PELZ_APPROCHES_TEST.subtests.map((subtest) => (
              <section key={subtest.key} className="panel rounded-2xl p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--text)]">
                      {subtest.label}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Distances: {renderDistanceLabel(subtest.key)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDiagramSubtest(subtest.key)}
                      className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
                      aria-label={`Ouvrir schema ${subtest.label}`}
                    >
                      Schema
                    </button>
                    <span className="rounded-full border border-white/5 bg-white/5 px-2 py-1 text-[0.55rem] uppercase tracking-wide text-[var(--muted)] opacity-70">
                      {subtest.sequence.length} tentatives
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-flow-col md:grid-cols-2 md:grid-rows-5">
                  {subtest.sequence.map((slot, index) => (
                    <div
                      key={`${subtest.key}-${index}`}
                      className="flex flex-col gap-2 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--text)]"
                    >
                      <div className="flex items-center justify-between gap-2">
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
                            ({getDistanceForSlot(subtest.key, slot)})
                          </span>
                        </span>
                        {attempts[subtest.key][index] ? (
                          <button
                            type="button"
                            onClick={() => handleClearAttempt(subtest.key, index)}
                            disabled={isFinalized}
                            className="text-[0.6rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-50"
                          >
                            Effacer
                          </button>
                        ) : null}
                      </div>
                      <select
                        value={attempts[subtest.key][index] ?? ""}
                        onChange={(event) =>
                          handleResultChange(subtest.key, index, event.target.value)
                        }
                        disabled={isFinalized}
                        className="w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                      >
                        <option value="">Choisir un resultat</option>
                        {getPelzApprochesResultOptions(subtest.key).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label} ({option.points} pts)
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

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
        open={diagramSubtest !== null}
        onClose={() => setDiagramSubtest(null)}
        title={diagramMeta?.title ?? "Schema"}
        alt={diagramMeta?.alt ?? "Schema du sous-test"}
        diagramKey={diagramMeta?.diagramKey ?? null}
        extension={PELZ_APPROCHES_DIAGRAM_EXTENSION}
      />
      <TestResultModal
        open={resultModalOpen}
        onClose={handleResultModalClose}
        title="Resultat du test"
        description="Bravo ! Voici ton index final base sur le total de points."
        items={[
          { label: "Total points", value: totalPoints.toString() },
          { label: "Index final", value: totalIndex?.toString() ?? "-" },
        ]}
      />
    </RoleGuard>
  );
}
