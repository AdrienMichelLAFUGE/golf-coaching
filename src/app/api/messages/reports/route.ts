import { messagesJson } from "@/lib/messages/http";
import {
  CreateMessageReportSchema,
  MessageReportsResponseSchema,
} from "@/lib/messages/types";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { loadMessageActorContext } from "@/lib/messages/access";
import {
  validateThreadAccess,
} from "@/lib/messages/service";
import {
  insertMessageModerationAudit,
  isOrgMessagingAdmin,
} from "@/lib/messages/moderation";
import { recordActivity } from "@/lib/activity-log";
import {
  mapMessageReportRowsToDtos,
  type MessageReportRow,
} from "@/lib/messages/report-dto";

export async function GET(request: Request) {
  const { context, response } = await loadMessageActorContext(request);
  if (response || !context) return response;

  if (!isOrgMessagingAdmin(context)) {
    return messagesJson({ error: "Acces refuse." }, { status: 403 });
  }

  const { data, error } = await context.admin
    .from("message_reports")
    .select(
      "id, workspace_org_id, thread_id, message_id, reported_by, reason, details, status, freeze_applied, resolved_by, resolved_at, created_at, updated_at"
    )
    .eq("workspace_org_id", context.activeWorkspace.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return messagesJson(
      { error: error.message ?? "Chargement signalements impossible." },
      { status: 400 }
    );
  }

  const reports = await mapMessageReportRowsToDtos(
    context.admin,
    (data ?? []) as MessageReportRow[]
  );

  await insertMessageModerationAudit({
    admin: context.admin,
    workspaceOrgId: context.activeWorkspace.id,
    actorUserId: context.userId,
    action: "reports.list_viewed",
    metadata: {
      count: reports.length,
    },
  });

  const payload = MessageReportsResponseSchema.parse({ reports });
  return messagesJson(payload);
}

export async function POST(request: Request) {
  const parsedBody = await parseRequestJson(request, CreateMessageReportSchema);
  if (!parsedBody.success) {
    return messagesJson(
      { error: "Payload invalide.", details: formatZodError(parsedBody.error) },
      { status: 422 }
    );
  }

  const { context, response } = await loadMessageActorContext(request);
  if (response || !context) return response;

  const accessCheck = await validateThreadAccess(
    context.admin,
    context.userId,
    context.profile.role,
    parsedBody.data.threadId,
    "read"
  );

  if (!accessCheck.ok) {
    await recordActivity({
      admin: context.admin,
      level: "warn",
      action: "messages.report.denied",
      actorUserId: context.userId,
      orgId: context.activeWorkspace.id,
      entityType: "message_thread",
      entityId: parsedBody.data.threadId,
      message: "Tentative de signalement sans acces au thread.",
    });
    return messagesJson({ error: accessCheck.error }, { status: accessCheck.status });
  }

  const thread = accessCheck.participantContext.thread;
  let targetMessageId = parsedBody.data.messageId ?? null;

  if (targetMessageId !== null) {
    const { data: targetMessage } = await context.admin
      .from("message_messages")
      .select("id")
      .eq("thread_id", thread.id)
      .eq("id", targetMessageId)
      .maybeSingle();

    if (!targetMessage) {
      return messagesJson({ error: "Message introuvable." }, { status: 404 });
    }
  }

  if (targetMessageId === null) {
    targetMessageId =
      typeof thread.last_message_id === "number" ? thread.last_message_id : null;
  }

  const snapshotRaw =
    targetMessageId !== null
      ? await context.admin
          .from("message_messages")
          .select("id, sender_user_id, body, created_at")
          .eq("thread_id", thread.id)
          .gte("id", Math.max(1, targetMessageId - 5))
          .lte("id", targetMessageId + 5)
          .order("id", { ascending: true })
      : await context.admin
          .from("message_messages")
          .select("id, sender_user_id, body, created_at")
          .eq("thread_id", thread.id)
          .order("id", { ascending: false })
          .limit(12);

  const snapshotRows = (
    (snapshotRaw.data ?? []) as Array<{
      id: number;
      sender_user_id: string;
      body: string;
      created_at: string;
    }>
  ).sort((first, second) => first.id - second.id);

  const senderIds = Array.from(new Set(snapshotRows.map((row) => row.sender_user_id)));
  const { data: senderProfiles } =
    senderIds.length > 0
      ? await context.admin
          .from("profiles")
          .select("id, full_name, role")
          .in("id", senderIds)
      : { data: [] };

  const senderProfileMap = new Map<
    string,
    { full_name: string | null; role: "owner" | "coach" | "staff" | "student" | null }
  >();
  (
    (senderProfiles ?? []) as Array<{
      id: string;
      full_name: string | null;
      role: "owner" | "coach" | "staff" | "student";
    }>
  ).forEach((profile) => {
    senderProfileMap.set(profile.id, {
      full_name: profile.full_name,
      role: profile.role,
    });
  });

  const snapshot = snapshotRows.map((row) => {
    const sender = senderProfileMap.get(row.sender_user_id);
    return {
      id: row.id,
      senderUserId: row.sender_user_id,
      senderName: sender?.full_name ?? null,
      senderRole: sender?.role ?? null,
      createdAt: row.created_at,
      body: row.body,
    };
  });

  const { data: insertData, error: insertError } = await context.admin
    .from("message_reports")
    .insert([
      {
        workspace_org_id: thread.workspace_org_id,
        thread_id: thread.id,
        message_id: targetMessageId,
        reported_by: context.userId,
        reason: parsedBody.data.reason.trim(),
        details: parsedBody.data.details?.trim() || null,
        snapshot,
        status: "open",
      },
    ])
    .select(
      "id, workspace_org_id, thread_id, message_id, reported_by, reason, details, status, freeze_applied, resolved_by, resolved_at, created_at, updated_at"
    )
    .single();

  if (insertError || !insertData) {
    return messagesJson(
      { error: insertError?.message ?? "Signalement impossible." },
      { status: 400 }
    );
  }

  const report = (
    await mapMessageReportRowsToDtos(context.admin, [insertData as MessageReportRow])
  )[0];

  await insertMessageModerationAudit({
    admin: context.admin,
    workspaceOrgId: thread.workspace_org_id,
    actorUserId: context.userId,
    reportId: report.id,
    threadId: thread.id,
    action: "report.created",
    metadata: {
      messageId: targetMessageId,
      status: report.status,
    },
  });

  await recordActivity({
    admin: context.admin,
    level: "warn",
    action: "messages.report.created",
    actorUserId: context.userId,
    orgId: thread.workspace_org_id,
    entityType: "message_report",
    entityId: report.id,
    message: "Signalement messagerie cree.",
    metadata: {
      threadId: thread.id,
      messageId: targetMessageId,
      status: report.status,
    },
  });

  return messagesJson({ report }, { status: 201 });
}
