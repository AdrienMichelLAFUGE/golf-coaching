"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import RoleGuard from "../../../_components/role-guard";
import { useProfile } from "../../../_components/profile-context";
import PageBack from "../../../_components/page-back";

type Student = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  invited_at: string | null;
  activated_at: string | null;
  created_at: string;
  tpi_report_id: string | null;
};

type Report = {
  id: string;
  title: string;
  report_date: string | null;
  created_at: string;
  sent_at: string | null;
};

type TpiReport = {
  id: string;
  status: "processing" | "ready" | "error";
  file_url: string;
  file_type: "pdf" | "image";
  original_name: string | null;
  created_at: string;
};

type TpiTest = {
  id: string;
  test_name: string;
  result_color: "green" | "orange" | "red";
  mini_summary: string | null;
  details: string | null;
  details_translated: string | null;
  position: number;
};

const tpiColorRank: Record<TpiTest["result_color"], number> = {
  red: 0,
  orange: 1,
  green: 2,
};

const tpiLegendByColor: Record<TpiTest["result_color"], string> = {
  red: "Affecte fortement le swing",
  orange: "A surveiller",
  green: "Mobilite optimale",
};

const formatDate = (
  value?: string | null,
  locale?: string | null,
  timezone?: string | null
) => {
  if (!value) return "-";
  const options = timezone ? { timeZone: timezone } : undefined;
  return new Date(value).toLocaleDateString(locale ?? "fr-FR", options);
};

export default function CoachStudentDetailPage() {
  const { organization } = useProfile();
  const params = useParams();
  const studentId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [student, setStudent] = useState<Student | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tpiReport, setTpiReport] = useState<TpiReport | null>(null);
  const [tpiTests, setTpiTests] = useState<TpiTest[]>([]);
  const [tpiLoading, setTpiLoading] = useState(false);
  const [tpiError, setTpiError] = useState("");
  const [tpiUploading, setTpiUploading] = useState(false);
  const [tpiProgress, setTpiProgress] = useState(0);
  const [tpiPhase, setTpiPhase] = useState<"upload" | "analyse">("upload");
  const [tpiDragging, setTpiDragging] = useState(false);
  const tpiInputRef = useRef<HTMLInputElement | null>(null);
  const [tpiDetail, setTpiDetail] = useState<TpiTest | null>(null);
  const tpiProgressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const locale = organization?.locale ?? "fr-FR";
  const timezone = organization?.timezone ?? "Europe/Paris";

  const loadTpi = async (reportId?: string | null) => {
    if (!studentId) return;

    setTpiLoading(true);
    setTpiError("");

    let reportData: TpiReport | null = null;

    if (reportId) {
      const { data, error } = await supabase
        .from("tpi_reports")
        .select("id, status, file_url, file_type, original_name, created_at")
        .eq("id", reportId)
        .single();
      if (!error && data) reportData = data as TpiReport;
    }

    if (!reportData) {
      const { data, error } = await supabase
        .from("tpi_reports")
        .select("id, status, file_url, file_type, original_name, created_at")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!error && data) reportData = data as TpiReport;
    }

    if (reportData && reportData.status !== "ready") {
      const { data, error } = await supabase
        .from("tpi_reports")
        .select("id, status, file_url, file_type, original_name, created_at")
        .eq("student_id", studentId)
        .eq("status", "ready")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!error && data) reportData = data as TpiReport;
    }

    if (!reportData) {
      setTpiReport(null);
      setTpiTests([]);
      setTpiLoading(false);
      return;
    }

    setTpiReport(reportData);

    const { data: testsData, error: testsError } = await supabase
      .from("tpi_tests")
      .select(
        "id, test_name, result_color, mini_summary, details, details_translated, position"
      )
      .eq("report_id", reportData.id)
      .order("position", { ascending: true });

    if (testsError) {
      setTpiError(testsError.message);
      setTpiTests([]);
      setTpiLoading(false);
      return;
    }

    const sorted = [...(testsData ?? [])].sort((a, b) => {
      const rank = tpiColorRank[a.result_color] - tpiColorRank[b.result_color];
      if (rank !== 0) return rank;
      return a.position - b.position;
    });
    setTpiTests(sorted);
    setTpiLoading(false);
  };

  const stopTpiProgress = () => {
    if (tpiProgressTimer.current) {
      clearInterval(tpiProgressTimer.current);
      tpiProgressTimer.current = null;
    }
  };

  const runTpiProgress = (target: number, step: number, delay: number) => {
    stopTpiProgress();
    tpiProgressTimer.current = setInterval(() => {
      setTpiProgress((prev) => {
        if (prev >= target) return prev;
        return Math.min(prev + step, target);
      });
    }, delay);
  };

  const handleTpiFile = async (file: File) => {
    if (!studentId || !organization?.id) return;
    const isPdf = file.type === "application/pdf";
    const isImage = file.type.startsWith("image/");
    if (!isPdf && !isImage) {
      setTpiError("Format accepte : PDF ou image.");
      return;
    }

    setTpiUploading(true);
    setTpiError("");
    setTpiProgress(8);
    setTpiPhase("upload");
    runTpiProgress(45, 1.5, 350);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${organization.id}/students/${studentId}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("tpi-reports")
      .upload(path, file, { cacheControl: "3600", upsert: true });

    if (uploadError) {
      setTpiError(uploadError.message);
      stopTpiProgress();
      setTpiProgress(0);
      setTpiUploading(false);
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const uploadedBy = userData.user?.id ?? null;

    const { data: reportData, error: insertError } = await supabase
      .from("tpi_reports")
      .insert([
        {
          org_id: organization.id,
          student_id: studentId,
          uploaded_by: uploadedBy,
          file_url: path,
          file_type: isPdf ? "pdf" : "image",
          original_name: file.name,
          status: "processing",
        },
      ])
      .select("id")
      .single();

    if (insertError || !reportData) {
      setTpiError(insertError?.message ?? "Erreur lors de l enregistrement TPI.");
      stopTpiProgress();
      setTpiProgress(0);
      setTpiUploading(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("students")
      .update({ tpi_report_id: reportData.id })
      .eq("id", studentId);
    if (updateError) {
      setTpiError(updateError.message);
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setTpiError("Session invalide.");
      stopTpiProgress();
      setTpiProgress(0);
      setTpiUploading(false);
      return;
    }

    setTpiProgress(50);
    setTpiPhase("analyse");
    runTpiProgress(98, 0.6, 700);

    const response = await fetch("/api/tpi/extract", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reportId: reportData.id }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setTpiError(payload.error ?? "Erreur lors de l analyse TPI.");
      stopTpiProgress();
      setTpiProgress(0);
      setTpiUploading(false);
      return;
    }

    await loadTpi(reportData.id);
    stopTpiProgress();
    setTpiProgress(100);
    setTpiUploading(false);
  };

  useEffect(() => {
    if (!studentId) return;

    const loadStudent = async () => {
      setLoading(true);
      setError("");

      const { data: studentData, error: studentError } = await supabase
        .from("students")
        .select(
          "id, first_name, last_name, email, invited_at, activated_at, created_at, tpi_report_id"
        )
        .eq("id", studentId)
        .single();

      if (studentError) {
        setError(studentError.message);
        setLoading(false);
        return;
      }

      setStudent(studentData);
      await loadTpi(studentData.tpi_report_id);

      const { data: reportData, error: reportError } = await supabase
        .from("reports")
        .select("id, title, report_date, created_at, sent_at")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false });

      if (reportError) {
        setError(reportError.message);
        setLoading(false);
        return;
      }

      setReports(reportData ?? []);
      setLoading(false);
    };

    loadStudent();
  }, [studentId]);

  useEffect(() => {
    return () => {
      stopTpiProgress();
    };
  }, []);

  const handleDeleteReport = async (report: Report) => {
    const confirmed = window.confirm(`Supprimer le rapport "${report.title}" ?`);
    if (!confirmed) return;

    setDeletingId(report.id);
    const { error: deleteError } = await supabase
      .from("reports")
      .delete()
      .eq("id", report.id);

    if (deleteError) {
      setError(deleteError.message);
      setDeletingId(null);
      return;
    }

    setReports((prev) => prev.filter((item) => item.id !== report.id));
    setDeletingId(null);
  };

  return (
    <RoleGuard allowedRoles={["owner", "coach", "staff"]}>
      {loading ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-[var(--muted)]">
            Chargement de l eleve...
          </p>
        </section>
      ) : error || !student ? (
        <section className="panel rounded-2xl p-6">
          <p className="text-sm text-red-400">
            {error || "Eleve introuvable."}
          </p>
        </section>
      ) : (
        <div className="space-y-6">
          <style jsx>{`
            .tpi-dots {
              display: inline-block;
              overflow: hidden;
              vertical-align: bottom;
              animation: tpiDots 1.4s steps(4, end) infinite;
              width: 0;
            }
            @keyframes tpiDots {
              0% {
                width: 0;
              }
              100% {
                width: 1.5em;
              }
            }
          `}</style>
          <section className="panel rounded-2xl p-6">
            <div className="flex items-center gap-2">
              <PageBack />
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                Eleve
              </p>
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
              {student.first_name} {student.last_name ?? ""}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {student.email || "-"}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide">
              {student.activated_at ? (
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-emerald-200">
                  Actif
                </span>
              ) : student.invited_at ? (
                <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-1 text-amber-200">
                  Invite
                </span>
              ) : (
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[var(--muted)]">
                  A inviter
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Invite le {formatDate(student.invited_at, locale, timezone)} -
              Cree le {formatDate(student.created_at, locale, timezone)}
            </p>
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <section className="panel rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[var(--text)]">
                  Rapports
                </h3>
                <Link
                  href={`/app/coach/rapports/nouveau?studentId=${student.id}`}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--text)]"
                >
                  Nouveau rapport
                </Link>
              </div>
              {reports.length === 0 ? (
                <div className="mt-4 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                  Aucun rapport pour cet eleve.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {reports.map((report) => (
                    <div
                      key={report.id}
                      className="flex flex-col gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--text)] md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{report.title}</p>
                          {!report.sent_at ? (
                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                              Brouillon
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {formatDate(
                            report.report_date ?? report.created_at,
                            locale,
                            timezone
                          )}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/app/coach/rapports/${report.id}`}
                          className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20"
                        >
                          Ouvrir
                        </Link>
                        <Link
                          href={`/app/coach/rapports/nouveau?reportId=${report.id}`}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                        >
                          Modifier
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDeleteReport(report)}
                          disabled={deletingId === report.id}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-red-300 transition hover:text-red-200 disabled:opacity-60"
                        >
                          {deletingId === report.id
                            ? "Suppression..."
                            : "Supprimer"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="panel rounded-2xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--text)]">
                    Profil TPI
                    {tpiReport?.created_at ? (
                      <span className="text-sm font-medium text-[var(--muted)]">
                        {" "}
                        - {formatDate(tpiReport.created_at, locale, timezone)}
                      </span>
                    ) : null}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Ajoute un screening TPI pour obtenir une synthese claire des
                    points a travailler et des points forts.
                  </p>
                </div>
                {tpiReport ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                    {tpiReport.status === "processing"
                      ? "Analyse en cours"
                      : tpiReport.status === "ready"
                      ? "Pret"
                      : "Erreur"}
                  </span>
                ) : null}
              </div>

              <div
                className={`mt-4 rounded-xl border border-dashed px-4 py-4 text-sm text-[var(--muted)] transition ${
                  tpiDragging
                    ? "border-sky-300/50 bg-sky-400/10 text-sky-100"
                    : "border-white/10 bg-white/5"
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setTpiDragging(true);
                }}
                onDragLeave={() => setTpiDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setTpiDragging(false);
                  const file = event.dataTransfer.files?.[0];
                  if (file) void handleTpiFile(file);
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-[var(--text)]">
                      Glisse un rapport TPI (PDF ou image).
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      L extraction peut prendre quelques minutes.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={tpiUploading}
                    onClick={() => tpiInputRef.current?.click()}
                    className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--text)] transition hover:bg-white/20 disabled:opacity-60"
                  >
                    Parcourir
                  </button>
                </div>
                <input
                  ref={tpiInputRef}
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleTpiFile(file);
                  }}
                />
              </div>

              {tpiUploading ? (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                    <span>
                      {tpiPhase === "upload" ? (
                        <>
                          Upload du rapport<span className="tpi-dots">...</span>
                        </>
                      ) : (
                        <>
                          Analyse en cours<span className="tpi-dots">...</span>{" "}
                          <span className="text-[0.6rem] uppercase tracking-wide text-[var(--muted)]">
                            (jusqu&apos;a 5 min)
                          </span>
                        </>
                      )}
                    </span>
                    <span>{Math.round(tpiProgress)}%</span>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-white/10">
                    <div
                      className="h-2 rounded-full bg-emerald-300 transition-all duration-700 ease-out"
                      style={{ width: `${tpiProgress}%` }}
                    />
                  </div>
                </div>
              ) : null}
              {tpiLoading ? (
                <p className="mt-3 text-xs text-[var(--muted)]">
                  Chargement des donnees TPI...
                </p>
              ) : null}
              {tpiError ? (
                <p className="mt-3 text-xs text-red-300">{tpiError}</p>
              ) : null}

              {tpiReport && tpiReport.status === "ready" ? (
                <>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {tpiTests.length === 0 ? (
                    <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
                      Aucun test TPI detecte.
                    </div>
                  ) : (
                    tpiTests.map((test) => {
                      const colorClass =
                        test.result_color === "green"
                          ? "bg-emerald-400"
                          : test.result_color === "orange"
                          ? "bg-amber-400"
                          : "bg-rose-400";
                      return (
                        <div
                          key={test.id}
                          className="relative rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${colorClass}`}
                            />
                            <p className="text-sm font-semibold text-[var(--text)]">
                              {test.test_name}
                            </p>
                          </div>
                          <p className="mt-1 pb-7 pr-8 text-xs text-[var(--muted)]">
                            {test.mini_summary || "-"}
                          </p>
                          {test.details ? (
                            <button
                              type="button"
                              onClick={() => setTpiDetail(test)}
                              className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/10 text-xs font-semibold text-[var(--text)] transition hover:bg-white/20"
                            >
                              +
                            </button>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-[var(--muted)]">
                    {(["red", "orange", "green"] as const).map((color) => {
                      const dotClass =
                        color === "green"
                          ? "bg-emerald-400"
                          : color === "orange"
                          ? "bg-amber-400"
                          : "bg-rose-400";
                      return (
                        <div key={color} className="flex items-center gap-2">
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${dotClass}`}
                          />
                          <span>{tpiLegendByColor[color]}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </section>

            {tpiDetail ? (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                onClick={() => setTpiDetail(null)}
              >
                <div
                  className="panel w-full max-w-2xl rounded-2xl p-6"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                        Test TPI
                      </p>
                      <h4 className="mt-2 text-lg font-semibold text-[var(--text)]">
                        {tpiDetail.test_name}
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTpiDetail(null)}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--text)]"
                    >
                      Fermer
                    </button>
                  </div>
                  <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--text)]">
                    <p className="whitespace-pre-wrap">
                      {tpiDetail.details_translated ||
                        tpiDetail.details ||
                        "Details indisponibles."}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </RoleGuard>
  );
}
