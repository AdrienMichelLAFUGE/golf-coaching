"use client";

import { useCallback, useEffect, useState } from "react";
import StudentCalendar from "@/app/app/_components/student-calendar/StudentCalendar";
import { fetchParentApi } from "@/app/parent/fetch-with-auth";
import ParentChildNav from "../ParentChildNav";

type ChildPayload = {
  child: {
    id: string;
    fullName: string;
    email: string | null;
  };
};

type PermissionsPayload = {
  permissions?: {
    calendrier?: boolean;
  };
};

export default function ParentChildCalendarPage({
  params,
}: {
  params: { studentId: string } | Promise<{ studentId: string }>;
}) {
  const [studentId, setStudentId] = useState("");
  const [child, setChild] = useState<ChildPayload["child"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [moduleForbidden, setModuleForbidden] = useState(false);

  useEffect(() => {
    Promise.resolve(params).then((resolved) => setStudentId(resolved.studentId));
  }, [params]);

  const loadChild = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    setError("");
    setModuleForbidden(false);

    try {
      const [childResponse, permissionsResponse] = await Promise.all([
        fetchParentApi(`/api/parent/children/${studentId}`),
        fetchParentApi(`/api/parent/children/${studentId}/permissions`),
      ]);

      const payload = (await childResponse.json().catch(() => ({}))) as ChildPayload & {
        error?: string;
      };
      const permissionsPayload = (await permissionsResponse.json().catch(() => ({}))) as PermissionsPayload & {
        error?: string;
      };

      const calendrierAllowed = Boolean(permissionsPayload.permissions?.calendrier);
      if (!permissionsResponse.ok || !calendrierAllowed) {
        setModuleForbidden(true);
        setChild(null);
        setLoading(false);
        return;
      }

      if (!childResponse.ok) {
        setError(payload.error ?? "Chargement impossible.");
        setChild(null);
        setLoading(false);
        return;
      }
      setChild(payload.child);
      setLoading(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Chargement impossible.");
      setChild(null);
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      void loadChild();
    });
    return () => {
      cancelled = true;
    };
  }, [loadChild]);

  return (
    <section className="space-y-4">
      <header className="panel rounded-2xl p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
          Calendrier enfant
        </p>
        <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">
          {child?.fullName ?? "Calendrier"}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Lecture seule (parent): visualisation des echeances.
        </p>
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
      ) : moduleForbidden ? (
        <section className="panel-soft rounded-2xl p-5 text-sm text-[var(--muted)]">
          Acces non autorise pour ce module.
        </section>
      ) : !child ? (
        <section className="panel-soft rounded-2xl p-5 text-sm text-[var(--muted)]">
          Enfant introuvable.
        </section>
      ) : (
        <section className="panel rounded-2xl p-4 md:p-6">
          <StudentCalendar studentId={child.id} mode="parent" locale="fr-FR" />
        </section>
      )}
    </section>
  );
}
