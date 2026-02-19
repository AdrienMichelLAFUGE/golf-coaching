"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchParentApi } from "@/app/parent/fetch-with-auth";
import ParentChildNav from "../ParentChildNav";

type ChildPayload = {
  child: {
    id: string;
    fullName: string;
    email: string | null;
  };
};

type TestsPayload = {
  assignments: Array<{
    id: string;
    testSlug: string;
    status: "assigned" | "in_progress" | "finalized";
    assignedAt: string;
    updatedAt: string;
    attemptsCount: number;
    lastAttemptAt: string | null;
  }>;
};

const statusLabel: Record<TestsPayload["assignments"][number]["status"], string> = {
  assigned: "Assigne",
  in_progress: "En cours",
  finalized: "Finalise",
};

const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("fr-FR") : "-";

export default function ParentChildTestsPage({
  params,
}: {
  params: { studentId: string } | Promise<{ studentId: string }>;
}) {
  const [studentId, setStudentId] = useState("");
  const [child, setChild] = useState<ChildPayload["child"] | null>(null);
  const [assignments, setAssignments] = useState<TestsPayload["assignments"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.resolve(params).then((resolved) => setStudentId(resolved.studentId));
  }, [params]);

  const loadData = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    setError("");

    try {
      const [childResponse, testsResponse] = await Promise.all([
        fetchParentApi(`/api/parent/children/${studentId}`),
        fetchParentApi(`/api/parent/children/${studentId}/tests`),
      ]);

      const childPayload = (await childResponse.json().catch(() => ({}))) as ChildPayload & {
        error?: string;
      };
      const testsPayload = (await testsResponse.json().catch(() => ({}))) as TestsPayload & {
        error?: string;
      };

      if (!childResponse.ok || !testsResponse.ok) {
        setError(
          testsResponse.status === 403
            ? "Acces non autorise pour ce module."
            : childPayload.error ?? testsPayload.error ?? "Chargement impossible."
        );
        setChild(null);
        setAssignments([]);
        setLoading(false);
        return;
      }

      setChild(childPayload.child);
      setAssignments(testsPayload.assignments ?? []);
      setLoading(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Chargement impossible.");
      setChild(null);
      setAssignments([]);
      setLoading(false);
    }
  }, [studentId]);

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
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Tests</p>
        <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">
          {child?.fullName ?? "Historique tests"}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Lecture seule (parent)</p>
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
      ) : (
        <section className="panel rounded-2xl p-5">
          {assignments.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Aucun test assigne.</p>
          ) : (
            <div className="space-y-2">
              {assignments.map((assignment) => (
                <Link
                  key={assignment.id}
                  href={`/parent/children/${studentId}/tests/${assignment.id}`}
                  className="block rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-[var(--text)] transition hover:border-white/20"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{assignment.testSlug}</p>
                    <span className="text-xs text-[var(--muted)]">
                      {statusLabel[assignment.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Assigne le {formatDate(assignment.assignedAt)} - {assignment.attemptsCount}{" "}
                    tentative(s)
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </section>
  );
}
