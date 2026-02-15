import { NextResponse } from "next/server";
import { env } from "@/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { messagesJson } from "@/lib/messages/http";
import { recordActivity } from "@/lib/activity-log";

const expectedTokens = () =>
  Array.from(
    new Set(
      [env.MESSAGES_PURGE_CRON_SECRET, env.CRON_SECRET].filter(
        (token): token is string => Boolean(token)
      )
    )
  );

const extractToken = (request: Request) => {
  const direct = request.headers.get("x-messages-purge-token");
  if (direct) return direct;

  const authorization = request.headers.get("authorization");
  if (!authorization) return null;
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7);
  }
  return authorization;
};

const authorize = (request: Request) => {
  const tokens = expectedTokens();
  if (tokens.length === 0) {
    return NextResponse.json(
      { error: "MESSAGES_PURGE_CRON_SECRET or CRON_SECRET is not configured." },
      { status: 503 }
    );
  }

  const token = extractToken(request);
  if (!token || !tokens.includes(token)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return null;
};

const runPurge = async () => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("purge_message_data");

  if (error) {
    await recordActivity({
      admin,
      level: "error",
      action: "messages.purge.failed",
      message: error.message ?? "Purge messagerie impossible.",
    });
    return messagesJson(
      { error: error.message ?? "Purge messagerie impossible." },
      { status: 400 }
    );
  }

  const row = Array.isArray(data) ? data[0] : null;
  const redactedMessages =
    row && typeof row.redacted_messages === "number" ? row.redacted_messages : 0;
  const deletedReports =
    row && typeof row.deleted_reports === "number" ? row.deleted_reports : 0;

  await recordActivity({
    admin,
    action: "messages.purge.success",
    message: "Purge messagerie executee.",
    metadata: {
      redactedMessages,
      deletedReports,
    },
  });

  return messagesJson({
    ok: true,
    redactedMessages,
    deletedReports,
  });
};

const handlePurge = async (request: Request) => {
  const denied = authorize(request);
  if (denied) return denied;
  return runPurge();
};

export async function GET(request: Request) {
  return handlePurge(request);
}

export async function POST(request: Request) {
  return handlePurge(request);
}
