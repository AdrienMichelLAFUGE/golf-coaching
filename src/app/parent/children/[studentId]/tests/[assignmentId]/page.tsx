"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchParentApi } from "@/app/parent/fetch-with-auth";
import ParentChildNav from "../../ParentChildNav";

type ChildPayload = {
  child: {
    id: string;
    fullName: string;
    email: string | null;
  };
};

type TestDetailPayload = {
  assignment: {
    id: string;
    testSlug: string;
    status: "assigned" | "in_progress" | "finalized";
    assignedAt: string;
    updatedAt: string;
  };
  attempts: Array<{
    id: string;
    score: number | null;
    summary: string | null;
    answers: unknown;
    createdAt: string;
  }>;
};

const statusLabel: Record<TestDetailPayload["assignment"]["status"], string> = {
  assigned: "Assigne",
  in_progress: "En cours",
  finalized: "Finalise",
};

const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("fr-FR") : "-";

export default function ParentChildTestDetailPage({
  params,
}: {
  params:
    | { studentId: string; assignmentId: string }
    | Promise<{ studentId: string; assignmentId: string }>;
}) {
  const [studentId, setStudentId] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [child, setChild] = useState<ChildPayload["child"] | null>(null);
  const [payload, setPayload] = useState<TestDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.resolve(params).then((resolved) => {
      setStudentId(resolved.studentId);
      setAssignmentId(resolved.assignmentId);
    });
  }, [params]);

  const loadData = useCallback(async () => {
    if (!studentId || !assignmentId) return;
    setLoading(true);
    setError("");

    try {
      const [childResponse, testResponse] = await Promise.all([
        fetchParentApi(`/api/parent/children/${studentId}`),
        fetchParentApi(`/api/parent/children/${studentId}/tests/${assignmentId}`),
      ]);

      const childPayload = (await childResponse.json().catch(() => ({}))) as ChildPayload & {
        error?: string;
      };
      const testPayload = (await testResponse.json().catch(() => ({}))) as TestDetailPayload & {
        error?: string;
      };

      if (!childResponse.ok || !testResponse.ok) {
        setError(childPayload.error ?? testPayload.error ?? "Chargement impossible.");
        setChild(null);
        setPayload(null);
        setLoading(false);
        return;
      }

      setChild(childPayload.child);
      setPayload(testPayload);
      setLoading(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Chargement impossible.");
      setChild(null);
      setPayload(null);
      setLoading(false);
    }
  }, [studentId, assignmentId]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      void loadData();
    });
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  return (
    <section className="space-y-4">
      <header className="panel rounded-2xl p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
          Test (lecture seule)
        </p>
        <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">
          {payload?.assignment.testSlug ?? "Detail test"}
        </h2>
        {payload?.assignment ? (
          <p className="mt-1 text-sm text-[var(--muted)]">
            {statusLabel[payload.assignment.status]} - assigne le{" "}
            {formatDate(payload.assignment.assignedAt)}
          </p>
        ) : null}
        {studentId ? (
          <div className="mt-4">
            <ParentChildNav studentId={studentId} />
          </div>
        ) : null}
      </header>

      {loading ? (
        <section className="panel-soft rounded-2xl p-5 text-sm text-[var(--muted)]">
          Chargement...
        </section>
      ) : error ? (
        <section className="panel-soft rounded-2xl p-5 text-sm text-red-400">{error}</section>
      ) : !payload ? (
        <section className="panel-soft rounded-2xl p-5 text-sm text-[var(--muted)]">
          Test indisponible.
        </section>
      ) : (
        <section className="panel rounded-2xl p-5">
          <p className="text-sm text-[var(--muted)]">Eleve: {child?.fullName ?? "-"}</p>
          {payload.attempts.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--muted)]">Aucune tentative enregistree.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {payload.attempts.map((attempt) => (
                <article
                  key={attempt.id}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[var(--text)]">
                      Tentative du {formatDate(attempt.createdAt)}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      Score: {typeof attempt.score === "number" ? attempt.score : "-"}
                    </p>
                  </div>
                  {attempt.summary ? (
                    <p className="mt-2 text-sm text-[var(--text)]">{attempt.summary}</p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </section>
  );
}
