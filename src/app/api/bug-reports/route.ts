import { NextResponse } from "next/server";
import { z } from "zod";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { recordActivity } from "@/lib/activity-log";

export const runtime = "nodejs";

const bugReportSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(6000),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  pagePath: z.string().trim().min(1).max(400),
  userAgent: z.string().trim().max(1024).optional(),
  context: z
    .object({
      viewportWidth: z.number().int().min(1).max(10000).optional(),
      viewportHeight: z.number().int().min(1).max(10000).optional(),
      language: z.string().trim().max(32).optional(),
      timezone: z.string().trim().max(120).optional(),
    })
    .optional(),
});

const normalizePagePath = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "/app";
  return trimmed.startsWith("/") ? trimmed.slice(0, 400) : `/${trimmed}`.slice(0, 400);
};

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, bugReportSchema);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }

  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;

  if (userError || !userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, role, org_id, active_workspace_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profil introuvable." }, { status: 403 });
  }

  const workspaceOrgId = profile.active_workspace_id ?? profile.org_id ?? null;
  const severity = parsed.data.severity ?? "medium";
  const pagePath = normalizePagePath(parsed.data.pagePath);
  const userAgent = (parsed.data.userAgent || request.headers.get("user-agent") || "").trim();

  const { data: inserted, error: insertError } = await admin
    .from("bug_reports")
    .insert([
      {
        reporter_user_id: userId,
        workspace_org_id: workspaceOrgId,
        reporter_role: profile.role ?? null,
        title: parsed.data.title.trim(),
        description: parsed.data.description.trim(),
        severity,
        status: "new",
        page_path: pagePath,
        user_agent: userAgent || null,
        context: parsed.data.context ?? {},
      },
    ])
    .select("id, created_at")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json(
      { error: insertError?.message ?? "Signalement impossible." },
      { status: 500 }
    );
  }

  await recordActivity({
    admin,
    action: "bug.report.created",
    actorUserId: userId,
    orgId: workspaceOrgId,
    entityType: "bug_report",
    entityId: inserted.id,
    message: "Signalement bug cree.",
    metadata: {
      severity,
      pagePath,
    },
  }).catch(() => null);

  return NextResponse.json(
    {
      reportId: inserted.id,
      createdAt: inserted.created_at,
    },
    { status: 201 }
  );
}
