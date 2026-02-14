import { NextResponse } from "next/server";
import { env } from "@/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { messagesJson } from "@/lib/messages/http";
import { recordActivity } from "@/lib/activity-log";

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

export async function POST(request: Request) {
  if (!env.MESSAGES_PURGE_CRON_SECRET) {
    return NextResponse.json(
      { error: "MESSAGES_PURGE_CRON_SECRET is not configured." },
      { status: 503 }
    );
  }

  const token = extractToken(request);
  if (!token || token !== env.MESSAGES_PURGE_CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

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
}
