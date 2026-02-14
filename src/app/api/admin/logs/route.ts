import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { assertBackofficeUnlocked } from "@/lib/backoffice-auth";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

type ActivityLogRow = {
  id: string;
  created_at: string;
  level: "info" | "warn" | "error";
  action: string;
  source: string;
  actor_user_id: string | null;
  org_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
};

const requireAdmin = async (request: Request) => {
  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
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

  return { admin: createSupabaseAdminClient() };
};

const normalizePositiveInt = (value: string | null, fallback: number, max: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
};

const normalizeLevel = (value: string | null) => {
  if (value === "info" || value === "warn" || value === "error") return value;
  return "all";
};

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const action = (url.searchParams.get("action") ?? "").trim();
  const level = normalizeLevel(url.searchParams.get("level"));
  const queryText = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const sinceDays = normalizePositiveInt(url.searchParams.get("sinceDays"), 7, 120);
  const limit = normalizePositiveInt(url.searchParams.get("limit"), 100, 300);
  const sinceIso = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

  let query = auth.admin
    .from("app_activity_logs")
    .select(
      "id, created_at, level, action, source, actor_user_id, org_id, entity_type, entity_id, message, metadata"
    )
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false });

  if (action) {
    query = query.eq("action", action);
  }
  if (level !== "all") {
    query = query.eq("level", level);
  }

  const { data, error } = await query.limit(limit);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const logs = (data ?? []) as ActivityLogRow[];
  const actorIds = Array.from(
    new Set(logs.map((row) => row.actor_user_id).filter((value): value is string => Boolean(value)))
  );
  const orgIds = Array.from(
    new Set(logs.map((row) => row.org_id).filter((value): value is string => Boolean(value)))
  );

  const [profilesResult, orgsResult] = await Promise.all([
    actorIds.length
      ? auth.admin.from("profiles").select("id, full_name").in("id", actorIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; full_name: string | null }>,
          error: null,
        }),
    orgIds.length
      ? auth.admin.from("organizations").select("id, name").in("id", orgIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; name: string | null }>,
          error: null,
        }),
  ]);

  if (profilesResult.error || orgsResult.error) {
    return NextResponse.json(
      {
        error:
          profilesResult.error?.message ??
          orgsResult.error?.message ??
          "Erreur de chargement des references.",
      },
      { status: 500 }
    );
  }

  const profileById = new Map(
    (profilesResult.data ?? []).map((profile) => [
      profile.id,
      profile.full_name?.trim() || null,
    ])
  );
  const orgById = new Map(
    (orgsResult.data ?? []).map((org) => [org.id, org.name?.trim() || null])
  );

  const enrichedLogs = logs
    .map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      level: row.level,
      action: row.action,
      source: row.source,
      actorUserId: row.actor_user_id,
      actorName: row.actor_user_id ? profileById.get(row.actor_user_id) ?? null : null,
      orgId: row.org_id,
      orgName: row.org_id ? orgById.get(row.org_id) ?? null : null,
      entityType: row.entity_type,
      entityId: row.entity_id,
      message: row.message,
      metadata: row.metadata ?? {},
    }))
    .filter((row) => {
      if (!queryText) return true;
      const haystack = [
        row.action,
        row.message ?? "",
        row.actorName ?? "",
        row.orgName ?? "",
        row.entityType ?? "",
        row.entityId ?? "",
        JSON.stringify(row.metadata ?? {}),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(queryText);
    });

  return NextResponse.json({
    logs: enrichedLogs,
    filters: {
      action: action || null,
      level,
      sinceDays,
      limit,
      q: queryText || null,
    },
  });
}
