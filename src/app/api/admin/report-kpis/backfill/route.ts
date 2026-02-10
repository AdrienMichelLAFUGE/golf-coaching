import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { loadPersonalPlanTier } from "@/lib/plan-access";
import { generateReportKpisForPublishedReport } from "@/lib/ai/report-kpis";

export const runtime = "nodejs";

const cursorSchema = z.object({
  createdAt: z.string().min(1),
  id: z.string().uuid(),
});

const schema = z.object({
  limit: z.number().int().min(1).max(10).optional(),
  cursor: cursorSchema.nullable().optional(),
});

type StudentCursor = z.infer<typeof cursorSchema>;

export async function POST(req: Request) {
  const parsed = await parseRequestJson(req, schema);
  if (!parsed.success) {
    return Response.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }

  const supabase = createSupabaseServerClientFromRequest(req);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (userError || !userId) {
    return Response.json({ error: "Session invalide." }, { status: 401 });
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", userId)
    .single();

  if (!profileData?.org_id) {
    return Response.json({ error: "Organisation introuvable." }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const { data: workspace, error: workspaceError } = await admin
    .from("organizations")
    .select("id, workspace_type, owner_profile_id")
    .eq("id", profileData.org_id)
    .single();

  if (workspaceError || !workspace) {
    return Response.json({ error: "Workspace introuvable." }, { status: 404 });
  }

  if (workspace.workspace_type === "personal") {
    if (workspace.owner_profile_id !== userId) {
      return Response.json({ error: "Acces refuse." }, { status: 403 });
    }
  } else {
    const { data: membership } = await admin
      .from("org_memberships")
      .select("role, status")
      .eq("org_id", profileData.org_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership || membership.status !== "active" || membership.role !== "admin") {
      return Response.json({ error: "Acces refuse." }, { status: 403 });
    }

    const planTier = await loadPersonalPlanTier(admin, userId);
    if (planTier === "free") {
      return Response.json(
        { error: "Lecture seule: plan Free en organisation." },
        { status: 403 }
      );
    }
  }

  const limit = parsed.data.limit ?? 3;
  const cursor = parsed.data.cursor ?? null;

  const studentsQuery = admin
    .from("students")
    .select("id, created_at")
    .eq("org_id", profileData.org_id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);

  // Cursor: we keep it minimal (created_at only) to avoid brittle PostgREST OR filters.
  // In practice, created_at collisions are rare; worst case we may reprocess 1 student (safe/idempotent via input_hash caching).
  const { data: studentsData, error: studentsError } = cursor
    ? await studentsQuery.gt("created_at", cursor.createdAt)
    : await studentsQuery;

  if (studentsError) {
    return Response.json({ error: studentsError.message }, { status: 500 });
  }

  const students = (studentsData ?? []) as Array<{ id: string; created_at: string }>;
  if (students.length === 0) {
    return Response.json({ processed: 0, skipped: 0, errors: 0, done: true });
  }

  const studentIds = students.map((s) => s.id);
  const { data: reportsData, error: reportsError } = await admin
    .from("reports")
    .select("id, student_id, report_date, created_at, sent_at")
    .in("student_id", studentIds)
    .not("sent_at", "is", null)
    .order("report_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (reportsError) {
    return Response.json({ error: reportsError.message }, { status: 500 });
  }

  const latestByStudent = new Map<string, string>();
  for (const row of (reportsData ?? []) as Array<{ id: string; student_id: string }>) {
    if (!latestByStudent.has(row.student_id)) {
      latestByStudent.set(row.student_id, row.id);
    }
  }

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const student of students) {
    const reportId = latestByStudent.get(student.id);
    if (!reportId) {
      skipped += 1;
      continue;
    }

    const result = await generateReportKpisForPublishedReport({
      admin,
      orgId: profileData.org_id,
      studentId: student.id,
      reportId,
      actorUserId: userId,
      timeoutMs: 12_000,
    });

    if (result.status === "ready") processed += 1;
    else if (result.status === "error") errors += 1;
    else skipped += 1;
  }

  const last = students[students.length - 1]!;
  const nextCursor: StudentCursor = { createdAt: last.created_at, id: last.id };

  return Response.json({
    processed,
    skipped,
    errors,
    done: false,
    nextCursor,
  });
}
