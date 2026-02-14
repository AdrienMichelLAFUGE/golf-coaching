import { z } from "zod";
import { messagesJson } from "@/lib/messages/http";
import { loadMessageActorContext } from "@/lib/messages/access";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { UpdateMessageReportSchema } from "@/lib/messages/types";
import {
  insertMessageModerationAudit,
  isOrgMessagingAdmin,
} from "@/lib/messages/moderation";
import {
  mapMessageReportRowsToDtos,
  type MessageReportRow,
} from "@/lib/messages/report-dto";
import { recordActivity } from "@/lib/activity-log";

type Params = { params: { reportId: string } | Promise<{ reportId: string }> };

const reportParamsSchema = z.object({
  reportId: z.string().uuid(),
});

const resolveReportId = async (params: Params["params"]) => {
  const value = await params;
  const parsed = reportParamsSchema.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data.reportId;
};

export async function POST(request: Request, { params }: Params) {
  const parsedBody = await parseRequestJson(request, UpdateMessageReportSchema);
  if (!parsedBody.success) {
    return messagesJson(
      { error: "Payload invalide.", details: formatZodError(parsedBody.error) },
      { status: 422 }
    );
  }

  const reportId = await resolveReportId(params);
  if (!reportId) {
    return messagesJson({ error: "Payload invalide." }, { status: 422 });
  }

  const { context, response } = await loadMessageActorContext(request);
  if (response || !context) return response;

  if (!isOrgMessagingAdmin(context)) {
    return messagesJson({ error: "Acces refuse." }, { status: 403 });
  }

  const { data: reportRow } = await context.admin
    .from("message_reports")
    .select(
      "id, workspace_org_id, thread_id, message_id, reported_by, reason, details, status, freeze_applied, resolved_by, resolved_at, created_at, updated_at"
    )
    .eq("id", reportId)
    .maybeSingle();

  if (!reportRow) {
    return messagesJson({ error: "Signalement introuvable." }, { status: 404 });
  }

  const typedReport = reportRow as MessageReportRow;
  if (typedReport.workspace_org_id !== context.activeWorkspace.id) {
    return messagesJson({ error: "Acces refuse." }, { status: 403 });
  }

  const now = new Date().toISOString();
  const nextFreezeApplied =
    typeof parsedBody.data.freezeThread === "boolean"
      ? parsedBody.data.freezeThread
      : typedReport.freeze_applied;

  const { data: updatedReportRow, error: updateReportError } = await context.admin
    .from("message_reports")
    .update({
      status: parsedBody.data.status,
      freeze_applied: nextFreezeApplied,
      resolved_by: parsedBody.data.status === "resolved" ? context.userId : null,
      resolved_at: parsedBody.data.status === "resolved" ? now : null,
    })
    .eq("id", reportId)
    .select(
      "id, workspace_org_id, thread_id, message_id, reported_by, reason, details, status, freeze_applied, resolved_by, resolved_at, created_at, updated_at"
    )
    .single();

  if (updateReportError || !updatedReportRow) {
    return messagesJson(
      { error: updateReportError?.message ?? "Mise a jour signalement impossible." },
      { status: 400 }
    );
  }

  const { error: freezeUpdateError } = await context.admin
    .from("message_threads")
    .update({
      frozen_at: nextFreezeApplied ? now : null,
      frozen_by: nextFreezeApplied ? context.userId : null,
      frozen_reason: nextFreezeApplied
        ? parsedBody.data.resolutionNote?.trim() || typedReport.reason
        : null,
    })
    .eq("id", typedReport.thread_id)
    .eq("workspace_org_id", context.activeWorkspace.id);

  if (freezeUpdateError) {
    return messagesJson(
      { error: freezeUpdateError.message ?? "Mise a jour gel conversation impossible." },
      { status: 400 }
    );
  }

  await insertMessageModerationAudit({
    admin: context.admin,
    workspaceOrgId: context.activeWorkspace.id,
    actorUserId: context.userId,
    reportId,
    threadId: typedReport.thread_id,
    action: "report.status_updated",
    metadata: {
      status: parsedBody.data.status,
      freezeApplied: nextFreezeApplied,
    },
  });

  await recordActivity({
    admin: context.admin,
    action: "messages.report.updated",
    actorUserId: context.userId,
    orgId: context.activeWorkspace.id,
    entityType: "message_report",
    entityId: reportId,
    message: "Signalement messagerie mis a jour.",
    metadata: {
      status: parsedBody.data.status,
      freezeApplied: nextFreezeApplied,
    },
  });

  const report = (
    await mapMessageReportRowsToDtos(context.admin, [updatedReportRow as MessageReportRow])
  )[0];

  return messagesJson({ report });
}
