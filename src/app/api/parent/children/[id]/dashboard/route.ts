import { NextResponse } from "next/server";
import { z } from "zod";
import {
  loadParentLinkedStudentContext,
  loadParentLinkedStudentIds,
} from "@/lib/parent/access";
import { formatZodError } from "@/lib/validation";

type Params = { params: { id: string } | Promise<{ id: string }> };

const paramsSchema = z.object({
  id: z.string().uuid(),
});

type ReportRow = {
  id: string;
  title: string;
  report_date: string | null;
  created_at: string;
  sent_at: string | null;
};

type AssignmentRow = {
  id: string;
  status: "assigned" | "in_progress" | "finalized";
  assigned_at: string;
};

type EventRow = {
  id: string;
  title: string;
  type: "tournament" | "competition" | "training" | "other";
  start_at: string;
  end_at: string | null;
  all_day: boolean;
};

type TpiRow = {
  id: string;
  status: "processing" | "ready" | "error";
  created_at: string;
};

export async function GET(request: Request, { params }: Params) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsedParams.error) },
      { status: 422 }
    );
  }

  const loaded = await loadParentLinkedStudentContext(request, parsedParams.data.id, {
    requiredPermission: "dashboard",
  });
  if (!loaded.context) {
    return NextResponse.json(
      { error: loaded.failure?.error ?? "Acces refuse." },
      { status: loaded.failure?.status ?? 403 }
    );
  }

  const studentIds = await loadParentLinkedStudentIds(
    loaded.context.admin,
    loaded.context.studentId
  );

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  const [reportsResult, assignmentsResult, eventsResult, tpiResult] = await Promise.all([
    loaded.context.admin
      .from("reports")
      .select("id, title, report_date, created_at, sent_at")
      .in("student_id", studentIds)
      .not("sent_at", "is", null)
      .order("report_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(6),
    loaded.context.admin
      .from("normalized_test_assignments")
      .select("id, status, assigned_at, archived_at")
      .eq("student_id", loaded.context.studentId)
      .is("archived_at", null)
      .order("assigned_at", { ascending: false }),
    loaded.context.admin
      .from("student_events")
      .select("id, title, type, start_at, end_at, all_day")
      .eq("student_id", loaded.context.studentId)
      .gte("start_at", startOfToday)
      .order("start_at", { ascending: true })
      .limit(8),
    loaded.context.admin
      .from("tpi_reports")
      .select("id, status, created_at")
      .eq("student_id", loaded.context.studentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (reportsResult.error || assignmentsResult.error || eventsResult.error || tpiResult.error) {
    return NextResponse.json(
      { error: "Chargement du dashboard parent impossible." },
      { status: 400 }
    );
  }

  const reports = ((reportsResult.data ?? []) as ReportRow[]).map((report) => ({
    id: report.id,
    title: report.title,
    reportDate: report.report_date,
    createdAt: report.created_at,
    sentAt: report.sent_at,
  }));

  const assignments = (assignmentsResult.data ?? []) as AssignmentRow[];
  const events = ((eventsResult.data ?? []) as EventRow[]).map((event) => ({
    id: event.id,
    title: event.title,
    type: event.type,
    startAt: event.start_at,
    endAt: event.end_at,
    allDay: event.all_day,
  }));
  const tpi = ((tpiResult.data as TpiRow | null) ?? null)
    ? {
        id: (tpiResult.data as TpiRow).id,
        status: (tpiResult.data as TpiRow).status,
        createdAt: (tpiResult.data as TpiRow).created_at,
      }
    : null;

  return NextResponse.json({
    child: {
      id: loaded.context.studentId,
      firstName: loaded.context.studentFirstName,
      lastName: loaded.context.studentLastName,
      fullName: `${loaded.context.studentFirstName} ${loaded.context.studentLastName ?? ""}`.trim(),
      email: loaded.context.studentEmail,
    },
    metrics: {
      reportsCount: reports.length,
      testsCount: assignments.length,
      testsPendingCount: assignments.filter((assignment) => assignment.status !== "finalized")
        .length,
      upcomingEventsCount: events.length,
    },
    latestReports: reports.slice(0, 3),
    upcomingEvents: events.slice(0, 3),
    tpi,
  });
}
