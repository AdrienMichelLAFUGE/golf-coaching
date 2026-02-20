import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import {
  buildNormalizedTestsSummary,
  NormalizedTestAssignmentSchema,
  NormalizedTestAttemptSchema,
} from "@/lib/normalized-tests/monitoring";
import { TempoContextResponseSchema } from "@/lib/tempo/types";
import { canCoachLikeAccessStudent } from "@/lib/parent/coach-student-access";
import { recordActivity } from "@/lib/activity-log";

export const runtime = "nodejs";

const querySchema = z.object({
  studentId: z.string().uuid(),
});

const trimText = (value: string | null | undefined, max = 240) => {
  const text = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 3))}...`;
};

const formatIsoDate = (value: string | null | undefined) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR");
};

const getStudentName = (firstName?: string | null, lastName?: string | null) =>
  [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ").trim() || "Eleve";

const toTpiColorLabel = (value: string | null | undefined) => {
  if (value === "red") return "ROUGE";
  if (value === "orange") return "ORANGE";
  return "VERT";
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsedQuery = querySchema.safeParse({
    studentId: searchParams.get("studentId"),
  });
  if (!parsedQuery.success) {
    return NextResponse.json({ error: "studentId invalide." }, { status: 422 });
  }

  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;
  if (userError || !userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const studentId = parsedQuery.data.studentId;

  const canAccess = await canCoachLikeAccessStudent(admin, userId, studentId);
  if (!canAccess) {
    await recordActivity({
      admin,
      level: "warn",
      action: "tempo.context.denied",
      actorUserId: userId,
      entityType: "student",
      entityId: studentId,
      message: "Chargement contexte Tempo refuse.",
    }).catch(() => null);
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { data: linkedStudentIdsRaw } = await supabase.rpc("get_linked_student_ids", {
    _student_id: studentId,
  });
  const linkedStudentIds = Array.isArray(linkedStudentIdsRaw)
    ? linkedStudentIdsRaw.filter((item): item is string => typeof item === "string")
    : [];
  const scopedStudentIds = linkedStudentIds.length > 0 ? linkedStudentIds : [studentId];

  const { data: studentRow, error: studentError } = await admin
    .from("students")
    .select("id, first_name, last_name, email, playing_hand, tpi_report_id")
    .eq("id", studentId)
    .maybeSingle();

  if (studentError || !studentRow) {
    return NextResponse.json({ error: "Eleve introuvable." }, { status: 404 });
  }

  const studentName = getStudentName(studentRow.first_name, studentRow.last_name);

  const [{ data: tpiReports }, { data: reports }, { data: radarFiles }, { data: assignmentsRaw }] =
    await Promise.all([
      admin
        .from("tpi_reports")
        .select("id, created_at")
        .in("student_id", scopedStudentIds)
        .eq("status", "ready")
        .order("created_at", { ascending: false })
        .limit(1),
      admin
        .from("reports")
        .select(
          "id, title, report_date, created_at, coach_observations, coach_work, coach_club, sent_at"
        )
        .in("student_id", scopedStudentIds)
        .not("sent_at", "is", null)
        .order("created_at", { ascending: false })
        .limit(8),
      admin
        .from("radar_files")
        .select("id, source, original_name, summary, stats, created_at, status")
        .in("student_id", scopedStudentIds)
        .eq("status", "ready")
        .order("created_at", { ascending: false })
        .limit(6),
      admin
        .from("normalized_test_assignments")
        .select(
          "id, test_slug, status, assigned_at, started_at, finalized_at, archived_at, updated_at, index_or_flag_label, clubs_used"
        )
        .in("student_id", scopedStudentIds)
        .order("assigned_at", { ascending: false })
        .limit(18),
    ]);

  const latestTpiReportId = tpiReports?.[0]?.id ?? null;
  const { data: tpiTestsRaw } = latestTpiReportId
    ? await admin
        .from("tpi_tests")
        .select(
          "test_name, result_color, mini_summary, details, details_translated, position"
        )
        .eq("report_id", latestTpiReportId)
        .order("position", { ascending: true })
    : { data: [] as Array<{
        test_name: string;
        result_color: "green" | "orange" | "red";
        mini_summary: string | null;
        details: string | null;
        details_translated: string | null;
        position: number;
      }> };

  const reportIds = (reports ?? []).map((report) => report.id).filter(Boolean);
  const { data: sectionsRaw } =
    reportIds.length > 0
      ? await admin
          .from("report_sections")
          .select("report_id, title, content, position, type")
          .in("report_id", reportIds)
          .order("position", { ascending: true })
      : { data: [] as Array<{
          report_id: string;
          title: string;
          content: string | null;
          position: number;
          type: string | null;
        }> };

  const assignmentsParsed = z.array(NormalizedTestAssignmentSchema).safeParse(assignmentsRaw ?? []);
  const assignments = assignmentsParsed.success ? assignmentsParsed.data : [];
  const assignmentIds = assignments.map((item) => item.id);
  const { data: attemptsRaw } =
    assignmentIds.length > 0
      ? await admin
          .from("normalized_test_attempts")
          .select("id, assignment_id, subtest_key, attempt_index, result_value, points, created_at")
          .in("assignment_id", assignmentIds)
          .order("created_at", { ascending: false })
          .limit(220)
      : { data: [] as Array<unknown> };
  const attemptsParsed = z.array(NormalizedTestAttemptSchema).safeParse(attemptsRaw ?? []);
  const attempts = attemptsParsed.success ? attemptsParsed.data : [];

  const byReportId = new Map<
    string,
    Array<{ title: string; content: string | null; type: string | null }>
  >();
  (sectionsRaw ?? []).forEach((section) => {
    const list = byReportId.get(section.report_id) ?? [];
    list.push({
      title: section.title,
      content: section.content,
      type: section.type,
    });
    byReportId.set(section.report_id, list);
  });

  const tpiTests = (tpiTestsRaw ?? []).map((item) => ({
    ...item,
    mini_summary: trimText(item.mini_summary, 180),
    details_text: trimText(item.details_translated || item.details || item.mini_summary, 340),
  }));

  const redTests = tpiTests.filter((item) => item.result_color === "red");
  const orangeTests = tpiTests.filter((item) => item.result_color === "orange");
  const tpiDetailedLines = tpiTests.map((item, index) => {
    const summary = item.mini_summary ? `${item.mini_summary}. ` : "";
    const details = item.details_text ? `Detail: ${item.details_text}` : "Detail: n/a";
    return `${index + 1}. ${trimText(item.test_name, 78)} [${toTpiColorLabel(
      item.result_color
    )}] - ${summary}${details}`.trim();
  });

  const tpiSummary =
    latestTpiReportId && tpiTests.length > 0
      ? [
          `Dernier TPI: ${formatIsoDate(tpiReports?.[0]?.created_at) || "date inconnue"}.`,
          `Rouges: ${redTests.length}, orange: ${orangeTests.length}, verts: ${tpiTests.filter((item) => item.result_color === "green").length}.`,
          redTests.length > 0
            ? `Limitations prioritaires: ${redTests
                .slice(0, 4)
                .map((item) => trimText(item.test_name, 48))
                .join(", ")}.`
            : "Aucune limitation rouge.",
          tpiDetailedLines.length > 0
            ? `Details tests TPI:\n${tpiDetailedLines.join("\n")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "Aucun profil TPI exploitable pour cet eleve.";

  const reportsSummary =
    (reports ?? []).length > 0
      ? (reports ?? [])
          .slice(0, 5)
          .map((report, index) => {
            const reportDate = formatIsoDate(report.report_date ?? report.created_at);
            const reportSections = (byReportId.get(report.id) ?? [])
              .filter((section) => !section.type || section.type === "text")
              .filter((section) => trimText(section.content, 12))
              .slice(0, 3)
              .map((section) => `${trimText(section.title, 60)}: ${trimText(section.content, 220)}`);
            const coachContext = [
              report.coach_club ? `Club: ${trimText(report.coach_club, 80)}` : "",
              report.coach_observations
                ? `Constat: ${trimText(report.coach_observations, 180)}`
                : "",
              report.coach_work ? `Travail: ${trimText(report.coach_work, 180)}` : "",
            ]
              .filter(Boolean)
              .join(" | ");
            const blocks = [...reportSections];
            if (coachContext) {
              blocks.push(coachContext);
            }
            return `${index + 1}. ${trimText(report.title, 90)} (${reportDate || "date n/a"}) -> ${
              blocks.length > 0 ? blocks.join(" ; ") : "pas de detail texte"
            }`;
          })
          .join("\n")
      : "Aucun rapport publie.";

  const radarSummary =
    (radarFiles ?? []).length > 0
      ? (radarFiles ?? [])
          .slice(0, 4)
          .map((file, index) => {
            const source = trimText(file.source, 24) || "unknown";
            const name = trimText(file.original_name, 70) || "fichier datas";
            const date = formatIsoDate(file.created_at) || "date n/a";
            const summary = trimText(file.summary, 220) || "pas de resume";
            return `${index + 1}. ${name} (${source}, ${date}) -> ${summary}`;
          })
          .join("\n")
      : "Aucune extraction datas prete.";

  const testsMonitoring = buildNormalizedTestsSummary(assignments, attempts);
  const testsSummary =
    assignments.length > 0
      ? [
          `Tests actifs: ${testsMonitoring.current.length}. Tests historises: ${testsMonitoring.history.length}.`,
          testsMonitoring.current.length > 0
            ? `Actifs: ${testsMonitoring.current
                .slice(0, 3)
                .map((item) => `${item.title} (${item.status}, ${item.attemptsCount} tentatives)`)
                .join(" ; ")}.`
            : "Aucun test actif.",
          testsMonitoring.history.length > 0
            ? `Historique recent: ${testsMonitoring.history
                .slice(0, 3)
                .map((item) => `${item.title} (${item.status})`)
                .join(" ; ")}.`
            : "Aucun historique finalise.",
        ].join(" ")
      : "Aucun test normalise enregistre.";

  const aiContext = [
    `Eleve: ${studentName}${studentRow.playing_hand ? ` (${studentRow.playing_hand})` : ""}.`,
    `TPI: ${tpiSummary}`,
    `Rapports:\n${reportsSummary}`,
    `Datas radar:\n${radarSummary}`,
    `Tests normalises: ${testsSummary}`,
  ].join("\n\n");

  const payload = {
    student: {
      id: studentRow.id,
      firstName: studentRow.first_name ?? "",
      lastName: studentRow.last_name ?? "",
      email: studentRow.email ?? null,
      playingHand: studentRow.playing_hand ?? null,
    },
    summaries: {
      tpi: tpiSummary,
      reports: reportsSummary,
      radar: radarSummary,
      tests: testsSummary,
    },
    aiContext,
  };

  const parsedPayload = TempoContextResponseSchema.safeParse(payload);
  if (!parsedPayload.success) {
    return NextResponse.json({ error: "Contexte Tempo invalide." }, { status: 500 });
  }

  await recordActivity({
    admin,
    action: "tempo.context.loaded",
    actorUserId: userId,
    entityType: "student",
    entityId: studentId,
    message: "Contexte Tempo charge.",
    metadata: {
      reportsCount: (reports ?? []).length,
      radarCount: (radarFiles ?? []).length,
      testsCount: assignments.length,
    },
  }).catch(() => null);

  return NextResponse.json(parsedPayload.data);
}
