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
    .select("id, student_id, sent_at")
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

    const { data: assignments } = await admin
      .from("student_assignments")
      .select("coach_id")
      .eq("student_id", report.student_id);

    const assignedIds = (assignments ?? []).map(
      (row) => (row as { coach_id: string }).coach_id
    );
    const isAssigned = assignedIds.includes(userId);
    if (membership.role !== "admin" && !isAssigned) {
      return Response.json({ error: "Acces refuse." }, { status: 403 });
    }
  }

  const { data: studentData } = await supabase
    .from("students")
    .select("org_id")
    .eq("id", report.student_id)
    .single();

  if (!studentData || String(studentData.org_id) !== String(profileData.org_id)) {
    return Response.json({ error: "Acces refuse." }, { status: 403 });
  }

  const result = await generateReportKpisForPublishedReport({
    admin,
    orgId: profileData.org_id,
    studentId: report.student_id,
    reportId,
    actorUserId: userId,
    timeoutMs: 12_000,
  });

  return Response.json({ status: result.status });
}
