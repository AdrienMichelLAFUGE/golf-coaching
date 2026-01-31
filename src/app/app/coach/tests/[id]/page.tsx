"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import RoleGuard from "../../../_components/role-guard";
import PelzResponsiveAccordion from "../../../_components/pelz-responsive-accordion";
import PelzDiagramModal from "../../../_components/pelz-diagram-modal";
import {
  PELZ_DIAGRAM_ALT_TEXT,
  PELZ_DIAGRAM_BY_SUBTEST,
} from "@/lib/normalized-tests/pelz-diagrams";
import {
  PELZ_PUTTING_TEST,
  PELZ_PUTTING_SLUG,
  type PelzResultValue,
  type PelzSubtestKey,
  computePelzSubtestScore,
  computePelzTotalIndex,
  getPelzResultLabel,
  isPelzResultValue,
} from "@/lib/normalized-tests/pelz-putting";

type AssignmentRow = {
  id: string;
  test_slug: string;
  status: "assigned" | "in_progress" | "finalized";
  assigned_at: string;
  finalized_at: string | null;
  student_id: string;
  index_or_flag_label?: string | null;
};

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string | null;
};

type AttemptValue = PelzResultValue | null;
type AttemptsBySubtest = Record<PelzSubtestKey, AttemptValue[]>;

const createEmptyAttempts = (): AttemptsBySubtest => {
  const entries = PELZ_PUTTING_TEST.subtests.map((subtest) => [
    subtest.key,
    Array(PELZ_PUTTING_TEST.attemptsPerSubtest).fill(null) as AttemptValue[],
  ]);
  return Object.fromEntries(entries) as AttemptsBySubtest;
};

const distanceLabelByKey: Record<PelzSubtestKey, string> = {
  putt_long: "A=13m, B=19m, C=25m",
  putt_moyen: "A=7m, B=9m, C=11m",
  putt_pente: "A=4m, B=6m, C=8m, D=10m, E=12m",
  putt_offensif: "A=3m, B=4m, C=5m, D=6m, E=7m",
  putt_court_1m: "A=1m, B=1m, C=1m, D=1m, E=1m",
  putt_court_2m: "A=2m, B=2m, C=2m, D=2m, E=2m",
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("fr-FR");
};

const formatStudentName = (student?: StudentRow | null) => {
  if (!student) return "Eleve";
  return `${student.first_name} ${student.last_name ?? ""}`.trim();
};

const statusLabel: Record<AssignmentRow["status"], string> = {
  assigned: "Assigne",
  in_progress: "En cours",
  finalized: "Finalise",
};

export default function CoachTestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const assignmentId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [assignment, setAssignment] = useState<AssignmentRow | null>(null);
  const [student, setStudent] = useState<StudentRow | null>(null);
  const [attempts, setAttempts] = useState<AttemptsBySubtest>(createEmptyAttempts);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [diagramSubtest, setDiagramSubtest] = useState<PelzSubtestKey | null>(null);

  useEffect(() => {
    const loadAssignment = async () => {
      if (!assignmentId || typeof assignmentId !== "string") {
        setError("Test introuvable.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      const { data: assignmentData, error: assignmentError } = await supabase
        .from("normalized_test_assignments")
        .select(
          "id, test_slug, status, assigned_at, finalized_at, student_id, index_or_flag_label"
        )
        .eq("id", assignmentId)
        .maybeSingle();

      if (assignmentError || !assignmentData) {
        setError("Test introuvable.");
        setLoading(false);
        return;
      }

      if (assignmentData.test_slug !== PELZ_PUTTING_SLUG) {
        setError("Test non supporte.");
        setLoading(false);
        return;
      }

      setAssignment(assignmentData as AssignmentRow);

      const { data: studentData } = await supabase
        .from("students")
        .select("id, first_name, last_name")
        .eq("id", assignmentData.student_id)
        .maybeSingle();
      if (studentData) setStudent(studentData as StudentRow);

      const { data: attemptsData, error: attemptsError } = await supabase
        .from("normalized_test_attempts")
        .select("subtest_key, attempt_index, result_value")
        .eq("assignment_id", assignmentId);

      if (attemptsError) {
        setError(attemptsError.message);
        setLoading(false);
        return;
      }

      const nextAttempts = createEmptyAttempts();
      (attemptsData ?? []).forEach((row) => {
        const subtestKey = row.subtest_key as PelzSubtestKey;
        const definition = PELZ_PUTTING_TEST.subtests.find(
          (subtest) => subtest.key === subtestKey
        );
        if (!definition) return;
        if (
          row.attempt_index < 1 ||
          row.attempt_index > PELZ_PUTTING_TEST.attemptsPerSubtest
        ) {
          return;
        }
        if (!isPelzResultValue(subtestKey, row.result_value)) return;
        nextAttempts[subtestKey][row.attempt_index - 1] =
          row.result_value as PelzResultValue;
      });

      setAttempts(nextAttempts);
      setLoading(false);
    };

    loadAssignment();
  }, [assignmentId]);

  const subtestScores = useMemo(
    () =>
      PELZ_PUTTING_TEST.subtests.map((subtest) => ({
        key: subtest.key,
        ...computePelzSubtestScore(subtest.key, attempts[subtest.key]),
      })),
    [attempts]
  );

  const totalPoints = subtestScores.reduce((acc, score) => acc + score.totalPoints, 0);
  const isComplete = subtestScores.every((score) => score.indexValue !== null);
  const totalIndex = isComplete ? computePelzTotalIndex(totalPoints) : null;
  const diagramMeta = useMemo(() => {
    if (!diagramSubtest) return null;
    const subtest = PELZ_PUTTING_TEST.subtests.find(
      (item) => item.key === diagramSubtest
    );
    return {
      title: subtest?.label ?? "Schema",
      alt: PELZ_DIAGRAM_ALT_TEXT[diagramSubtest],
      diagramKey: PELZ_DIAGRAM_BY_SUBTEST[diagramSubtest],
    };
  }, [diagramSubtest]);

  const summarySection = (
    <section className="panel-soft rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[var(--text)]">Resume</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {isComplete
              ? "Tous les sous-tests sont complets."
              : "Test en cours de completion."}
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
              {PELZ_PUTTING_TEST.subtests.find((s) => s.key === score.key)?.label}
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
      {assignment?.index_or_flag_label ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--text)]">
          <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
            Label
          </span>
          <p className="mt-2 font-medium">{assignment.index_or_flag_label}</p>
        </div>
      ) : null}
    </section>
  );

  const subtestItems = PELZ_PUTTING_TEST.subtests.map((subtest) => ({
    id: subtest.key,
    label: subtest.label,
    content: (
      <section className="panel rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text)]">{subtest.label}</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Distances: {distanceLabelByKey[subtest.key] ?? subtest.distanceLabel}
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

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {subtest.sequence.map((slot, index) => (
            <div
              key={`${subtest.key}-${index}`}
              className="flex flex-col gap-2 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--text)]"
            >
              <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                Tentative {index + 1} - {slot}
              </span>
              <p className="text-sm">
                Resultat:{" "}
                <span className="font-medium">
                  {attempts[subtest.key][index]
                    ? getPelzResultLabel(
                        subtest.key,
                        attempts[subtest.key][index] as PelzResultValue
                      )
                    : "-"}
                </span>
              </p>
            </div>
          ))}
        </div>
      </section>
    ),
  }));

  return (
    <RoleGuard allowedRoles={["owner", "coach", "staff"]}>
      {loading ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-[var(--muted)]">Chargement du test...</p>
        </section>
      ) : error ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-red-400">{error}</p>
        </section>
      ) : assignment ? (
        <div className="space-y-6">
          <section className="panel rounded-2xl p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Test normalise
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
              {PELZ_PUTTING_TEST.title}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Eleve: {formatStudentName(student)} • Assigne le{" "}
              {formatDate(assignment.assigned_at)}
            </p>
            <span className="mt-3 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
              {statusLabel[assignment.status]}
            </span>
          </section>

          <PelzResponsiveAccordion
            mobileItems={[
              { id: "bilan", label: "Bilan", content: summarySection },
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
                      : "Test en cours de completion."}
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
                      {PELZ_PUTTING_TEST.subtests.find((s) => s.key === score.key)?.label}
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
              {assignment.index_or_flag_label ? (
                <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--text)]">
                  <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                    Label
                  </span>
                  <p className="mt-2 font-medium">{assignment.index_or_flag_label}</p>
                </div>
              ) : null}
            </section>

            {PELZ_PUTTING_TEST.subtests.map((subtest) => (
              <section key={subtest.key} className="panel rounded-2xl p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--text)]">
                      {subtest.label}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Distances:{" "}
                      {distanceLabelByKey[subtest.key] ?? subtest.distanceLabel}
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

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {subtest.sequence.map((slot, index) => (
                    <div
                      key={`${subtest.key}-${index}`}
                      className="flex flex-col gap-2 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--text)]"
                    >
                      <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                        Tentative {index + 1} • {slot}
                      </span>
                      <p className="text-sm">
                        Resultat:{" "}
                        <span className="font-medium">
                          {attempts[subtest.key][index]
                            ? getPelzResultLabel(
                                subtest.key,
                                attempts[subtest.key][index] as PelzResultValue
                              )
                            : "-"}
                        </span>
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <section className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => router.push("/app/coach/tests")}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
            >
              Retour
            </button>
          </section>
        </div>
      ) : null}
      <PelzDiagramModal
        open={diagramSubtest !== null}
        onClose={() => setDiagramSubtest(null)}
        title={diagramMeta?.title ?? "Schema"}
        alt={diagramMeta?.alt ?? "Schema du sous-test"}
        diagramKey={diagramMeta?.diagramKey ?? null}
      />
    </RoleGuard>
  );
}
