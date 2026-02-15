import { NextResponse } from "next/server";
import { env } from "@/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { recordActivity } from "@/lib/activity-log";

const extractToken = (request: Request) => {
  const direct = request.headers.get("x-org-invitations-expire-token");
  if (direct) return direct;

  const authorization = request.headers.get("authorization");
  if (!authorization) return null;
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7);
  }
  return authorization;
};

const authorize = (request: Request) => {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }

  const token = extractToken(request);
  if (!token || token !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return null;
};

const runExpireInvitations = async () => {
  const admin = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("org_invitations")
    .update({ status: "expired" })
    .eq("status", "pending")
    .lt("expires_at", nowIso)
    .select("id");

  if (error) {
    await recordActivity({
      admin,
      level: "error",
      source: "cron",
      action: "organization.invitation.expire.failed",
      message: error.message ?? "Expiration invitations impossible.",
    });
    return NextResponse.json(
      { error: error.message ?? "Expiration invitations impossible." },
      { status: 400 }
    );
  }

  const expiredInvitations = Array.isArray(data) ? data.length : 0;

  await recordActivity({
    admin,
    source: "cron",
    action: "organization.invitation.expire.success",
    message: "Expiration invitations executee.",
    metadata: {
      expiredInvitations,
    },
  });

  return NextResponse.json({
    ok: true,
    expiredInvitations,
  });
};

const handleExpire = async (request: Request) => {
  const denied = authorize(request);
  if (denied) return denied;
  return runExpireInvitations();
};

export async function GET(request: Request) {
  return handleExpire(request);
}

export async function POST(request: Request) {
  return handleExpire(request);
}
