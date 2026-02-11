import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { loadPersonalPlanTier } from "@/lib/plan-access";
import { generateReportKpisForPublishedReport } from "@/lib/ai/report-kpis";

export const runtime = "nodejs";

const schema = z.object({
  reportId: z.string().uuid(),
});

const StudentAccountRowSchema = z.object({
  student_id: z.string().uuid(),
  user_id: z.string().uuid(),
});

const StudentRowSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
});

const resolveLinkedStudentIds = async (admin: ReturnType<typeof createSupabaseAdminClient>, studentId: string) => {
  const { data: accountData, error: accountError } = await admin
    .from("student_accounts")
    .select("student_id, user_id")
    .eq("student_id", studentId)
    .maybeSingle();

  if (accountError || !accountData) return [studentId];
  const parsedAccount = StudentAccountRowSchema.safeParse(accountData);
  if (!parsedAccount.success) return [studentId];

  const { data: linkedData, error: linkedError } = await admin
    .from("student_accounts")
    .select("student_id, user_id")
    .eq("user_id", parsedAccount.data.user_id);

  if (linkedError) return [studentId];
  const parsedLinked = z.array(StudentAccountRowSchema).safeParse(linkedData ?? []);
  if (!parsedLinked.success) return [studentId];

  const ids = Array.from(new Set(parsedLinked.data.map((row) => row.student_id)));
  return ids.length ? ids : [studentId];
};

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

  const { reportId } = parsed.data;

  const { data: report, error: reportError } = await supabase
    .from("reports")
    .select("id, org_id, student_id, sent_at")
    .eq("id", reportId)
    .single();

  if (reportError || !report) {
    return Response.json({ error: "Rapport introuvable." }, { status: 404 });
  }

  if (!report.sent_at) {
    return Response.json({ error: "Rapport non publie." }, { status: 400 });
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

    if (!membership || membership.status !== "active") {
      return Response.json({ error: "Acces refuse." }, { status: 403 });
    }

    const planTier = await loadPersonalPlanTier(admin, userId);
    if (planTier === "free") {
      return Response.json(
        { error: "Lecture seule: plan Free en organisation." },
        { status: 403 }
      );
    }

    const linkedStudentIds = await resolveLinkedStudentIds(admin, report.student_id);
    const { data: orgStudentRows, error: orgStudentsError } = await admin
      .from("students")
      .select("id, org_id")
      .in("id", linkedStudentIds)
      .eq("org_id", profileData.org_id);

    if (orgStudentsError) {
      return Response.json({ error: "Acces refuse." }, { status: 403 });
    }

    const orgStudentsParsed = z.array(StudentRowSchema).safeParse(orgStudentRows ?? []);
    const orgStudentIds = orgStudentsParsed.success
      ? orgStudentsParsed.data.map((row) => row.id)
      : [];

    // If the report belongs to another workspace, only allow regeneration when it is linked
    // to a student present in the current organization workspace.
    if (orgStudentIds.length === 0) {
      return Response.json({ error: "Acces refuse." }, { status: 403 });
    }

    const { data: assignments } = await admin
      .from("student_assignments")
      .select("coach_id")
      .in("student_id", orgStudentIds)
      .eq("org_id", profileData.org_id);

    const assignedIds = (assignments ?? []).map(
      (row) => (row as { coach_id: string }).coach_id
    );
    const isAssigned = assignedIds.includes(userId);
    if (membership.role !== "admin" && !isAssigned) {
      return Response.json({ error: "Acces refuse." }, { status: 403 });
    }
  }

  const result = await generateReportKpisForPublishedReport({
    admin,
    orgId: report.org_id,
    studentId: report.student_id,
    reportId,
    actorUserId: userId,
    timeoutMs: 12_000,
  });

  return Response.json({ status: result.status });
}
