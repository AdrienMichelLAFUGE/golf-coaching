import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminEmail } from "@/lib/admin";
import { assertBackofficeUnlocked } from "@/lib/backoffice-auth";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { recordActivity } from "@/lib/activity-log";

export const runtime = "nodejs";

type BugReportRow = {
  id: string;
  created_at: string;
  reporter_user_id: string | null;
  workspace_org_id: string | null;
  reporter_role: string | null;
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "new" | "in_progress" | "fixed" | "closed";
  page_path: string;
  user_agent: string | null;
  context: Record<string, unknown> | null;
  resolved_at: string | null;
};

type ProfileLookupRow = {
  id: string;
  full_name: string | null;
};

type OrgLookupRow = {
  id: string;
  name: string | null;
};

const requireAdmin = async (request: Request) => {
  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;
  const email = userData.user?.email ?? "";

  if (userError || !isAdminEmail(email)) {
    return {
      error: NextResponse.json({ error: "Unauthorized." }, { status: 403 }),
    };
  }

  const backofficeError = assertBackofficeUnlocked(request);
  if (backofficeError) {
    return {
      error: backofficeError,
    };
  }

  return { admin: createSupabaseAdminClient(), userId };
};

const normalizeLimit = (value: string | null) => {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 120;
  return Math.min(parsed, 300);
};

const normalizeSinceDays = (value: string | null) => {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 30;
  return Math.min(parsed, 180);
};

const normalizeSeverity = (value: string | null) => {
  if (value === "low" || value === "medium" || value === "high" || value === "critical") {
    return value;
  }
  return "all";
};

const normalizeStatus = (value: string | null) => {
  if (value === "new" || value === "in_progress" || value === "fixed" || value === "closed") {
    return value;
  }
  return "all";
};

const bugReportUpdateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["new", "in_progress", "fixed", "closed"]),
});

const bugReportDeleteSchema = z.object({
  id: z.string().min(1),
});

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const severity = normalizeSeverity(url.searchParams.get("severity"));
  const status = normalizeStatus(url.searchParams.get("status"));
  const limit = normalizeLimit(url.searchParams.get("limit"));
  const sinceDays = normalizeSinceDays(url.searchParams.get("sinceDays"));
  const sinceIso = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

  let query = auth.admin
    .from("bug_reports")
    .select(
      "id, created_at, reporter_user_id, workspace_org_id, reporter_role, title, description, severity, status, page_path, user_agent, context, resolved_at"
    )
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false });

  if (severity !== "all") {
    query = query.eq("severity", severity);
  }
  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query.limit(limit);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const reports = (data ?? []) as BugReportRow[];
  const reporterIds = Array.from(
    new Set(
      reports
        .map((report) => report.reporter_user_id)
        .filter((value): value is string => Boolean(value))
    )
  );
  const workspaceIds = Array.from(
    new Set(
      reports
        .map((report) => report.workspace_org_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  const [profilesResult, orgsResult] = await Promise.all([
    reporterIds.length
      ? auth.admin.from("profiles").select("id, full_name").in("id", reporterIds)
      : Promise.resolve({ data: [] as ProfileLookupRow[], error: null }),
    workspaceIds.length
      ? auth.admin.from("organizations").select("id, name").in("id", workspaceIds)
      : Promise.resolve({ data: [] as OrgLookupRow[], error: null }),
  ]);

  if (profilesResult.error || orgsResult.error) {
    return NextResponse.json(
      {
        error:
          profilesResult.error?.message ??
          orgsResult.error?.message ??
          "Chargement references impossible.",
      },
      { status: 500 }
    );
  }

  const profileById = new Map(
    (profilesResult.data ?? []).map((entry) => [entry.id, entry.full_name?.trim() || null])
  );
  const orgById = new Map(
    (orgsResult.data ?? []).map((entry) => [entry.id, entry.name?.trim() || null])
  );

  const filteredReports = reports
    .map((report) => ({
      id: report.id,
      createdAt: report.created_at,
      reporterUserId: report.reporter_user_id,
      reporterName: report.reporter_user_id
        ? profileById.get(report.reporter_user_id) ?? null
        : null,
      workspaceOrgId: report.workspace_org_id,
      workspaceOrgName: report.workspace_org_id
        ? orgById.get(report.workspace_org_id) ?? null
        : null,
      reporterRole: report.reporter_role,
      title: report.title,
      description: report.description,
      severity: report.severity,
      status: report.status,
      pagePath: report.page_path,
      userAgent: report.user_agent,
      context: report.context ?? {},
      resolvedAt: report.resolved_at,
    }))
    .filter((report) => {
      if (!q) return true;
      const haystack = [
        report.title,
        report.description,
        report.reporterName ?? "",
        report.reporterUserId ?? "",
        report.workspaceOrgName ?? "",
        report.workspaceOrgId ?? "",
        report.pagePath,
        report.severity,
        report.status,
        JSON.stringify(report.context ?? {}),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

  return NextResponse.json({
    reports: filteredReports,
    filters: {
      q: q || null,
      severity,
      status,
      sinceDays,
      limit,
    },
  });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const parsed = await parseRequestJson(request, bugReportUpdateSchema);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }

  const nowIso = new Date().toISOString();
  const isResolved = parsed.data.status === "fixed" || parsed.data.status === "closed";
  const { error } = await auth.admin
    .from("bug_reports")
    .update({
      status: parsed.data.status,
      updated_at: nowIso,
      resolved_at: isResolved ? nowIso : null,
      resolved_by: isResolved ? auth.userId : null,
    })
    .eq("id", parsed.data.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordActivity({
    admin: auth.admin,
    action: "admin.bug_reports.status.updated",
    actorUserId: auth.userId,
    entityType: "bug_report",
    entityId: parsed.data.id,
    message: "Statut bug mis a jour.",
    metadata: {
      status: parsed.data.status,
    },
  }).catch(() => null);

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const parsed = await parseRequestJson(request, bugReportDeleteSchema);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }

  const { error } = await auth.admin.from("bug_reports").delete().eq("id", parsed.data.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordActivity({
    admin: auth.admin,
    action: "admin.bug_reports.deleted",
    actorUserId: auth.userId,
    entityType: "bug_report",
    entityId: parsed.data.id,
    message: "Signalement bug supprime.",
  }).catch(() => null);

  return NextResponse.json({ ok: true });
}
