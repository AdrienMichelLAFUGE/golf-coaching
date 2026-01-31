"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import RoleGuard from "../../../_components/role-guard";
import PelzDiagramModal from "../../../_components/pelz-diagram-modal";
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
  computeWedgingDrapeauLongObjectivation,
  computeWedgingDrapeauLongTotalScore,
  getWedgingDrapeauLongResultLabel,
  isWedgingDrapeauLongResultValue,
} from "@/lib/normalized-tests/wedging-drapeau-long";

type AssignmentRow = {
  id: string;
  test_slug: string;
  status: "assigned" | "in_progress" | "finalized";
  assigned_at: string;
  started_at: string | null;
  finalized_at: string | null;
  student_id: string;
  index_or_flag_label?: string | null;
  clubs_used?: string | null;
};

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string | null;
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

const WEDGING_DRAPEAU_LONG_SEQUENCE_GROUPS = [
  WEDGING_DRAPEAU_LONG_SEQUENCE.slice(0, 6),
  WEDGING_DRAPEAU_LONG_SEQUENCE.slice(6, 12),
  WEDGING_DRAPEAU_LONG_SEQUENCE.slice(12, 18),
];

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

const formatScore = (value: number) => value.toFixed(1);

export default function CoachWedgingDrapeauLongPage() {
  const params = useParams();
  const router = useRouter();
  const assignmentId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [assignment, setAssignment] = useState<AssignmentRow | null>(null);
  const [student, setStudent] = useState<StudentRow | null>(null);
  const [attempts, setAttempts] = useState<AttemptValue[]>(createEmptyAttempts);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [diagramOpen, setDiagramOpen] = useState(false);

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
          "id, test_slug, status, assigned_at, started_at, finalized_at, student_id, index_or_flag_label, clubs_used"
        )
        .eq("id", assignmentId)
        .maybeSingle();

      if (assignmentError || !assignmentData) {
        setError("Test introuvable.");
        setLoading(false);
        return;
      }

      if (assignmentData.test_slug !== WEDGING_DRAPEAU_LONG_SLUG) {
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
        if (row.subtest_key !== WEDGING_DRAPEAU_LONG_SUBTEST_KEY) return;
        if (row.attempt_index < 1 || row.attempt_index > nextAttempts.length) return;
        if (!isWedgingDrapeauLongResultValue(row.result_value)) return;
        nextAttempts[row.attempt_index - 1] = row.result_value as WedgingDrapeauLongResultValue;
      });

      setAttempts(nextAttempts);
      setLoading(false);
    };

    loadAssignment();
  }, [assignmentId]);

  const totalScore = useMemo(() => computeWedgingDrapeauLongTotalScore(attempts), [attempts]);
  const objectivation = useMemo(
    () =>
      computeWedgingDrapeauLongObjectivation(
        assignment?.index_or_flag_label ?? "",
        totalScore
      ),
    [assignment?.index_or_flag_label, totalScore]
  );

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
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold text-[var(--text)]">
                  {WEDGING_DRAPEAU_LONG_TEST.title}
                </h2>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Eleve: {formatStudentName(student)} • Pris le{" "}
                  {formatDate(assignment.started_at ?? assignment.assigned_at)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDiagramOpen(true)}
                  className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
                  aria-label="Ouvrir schema Wedging drapeau long"
                >
                  Schema
                </button>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                  {statusLabel[assignment.status]}
                </span>
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
            {assignment.index_or_flag_label ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--text)]">
                <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  Index / drapeau
                </span>
                <p className="mt-2 font-medium">{assignment.index_or_flag_label}</p>
              </div>
            ) : null}
            {assignment.clubs_used ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--text)]">
                <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  Clubs utilises
                </span>
                <p className="mt-2 font-medium">{assignment.clubs_used}</p>
              </div>
            ) : null}
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
            <div className="mt-4 space-y-4">
              {WEDGING_DRAPEAU_LONG_SEQUENCE_GROUPS.map((group, groupIndex) => {
                const offset = groupIndex * group.length;
                return (
                  <div key={`group-${groupIndex}`} className="overflow-x-auto">
                    <table className="min-w-[720px] w-full border-separate border-spacing-2">
                      <thead>
                        <tr>
                          <th className="text-left text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                            Balle
                          </th>
                          {group.map((slot, index) => (
                            <th
                              key={`ball-${groupIndex}-${index}`}
                              className="text-center text-xs uppercase tracking-[0.2em] text-[var(--muted)]"
                            >
                              <span className={`font-semibold ${getSlotColorClass(slot)}`}>
                                {offset + index + 1}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                            Situation
                          </td>
                          {group.map((slot, index) => (
                            <td
                              key={`situation-${groupIndex}-${index}`}
                              className="text-center text-sm font-semibold"
                            >
                              <span className={getSlotColorClass(slot)}>{slot}</span>
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                            Score
                          </td>
                          {group.map((slot, index) => {
                            const attemptIndex = offset + index;
                            return (
                              <td
                                key={`score-${groupIndex}-${slot}-${index}`}
                                className="min-w-[120px]"
                              >
                                <span className="text-sm font-medium text-[var(--text)]">
                                  {attempts[attemptIndex]
                                    ? getWedgingDrapeauLongResultLabel(
                                        attempts[attemptIndex] as WedgingDrapeauLongResultValue
                                      )
                                    : "-"}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </section>

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
        open={diagramOpen}
        onClose={() => setDiagramOpen(false)}
        title="Schema - Wedging drapeau long"
        alt={WEDGING_DRAPEAU_LONG_DIAGRAM_ALT_TEXT}
        diagramKey={diagramOpen ? WEDGING_DRAPEAU_LONG_DIAGRAM_KEY : null}
        bucket={WEDGING_DRAPEAU_LONG_DIAGRAM_BUCKET}
        extension={WEDGING_DRAPEAU_LONG_DIAGRAM_EXTENSION}
      />
    </RoleGuard>
  );
}
