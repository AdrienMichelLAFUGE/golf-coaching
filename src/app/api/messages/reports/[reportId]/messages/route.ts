import { z } from "zod";
import { messagesJson } from "@/lib/messages/http";
import { loadMessageActorContext } from "@/lib/messages/access";
import {
  loadThreadMembersForThread,
  loadThreadMessages,
} from "@/lib/messages/service";
import {
  insertMessageModerationAudit,
  isOrgMessagingAdmin,
} from "@/lib/messages/moderation";
import {
  MessageReportSnapshotItemSchema,
  MessageReportThreadMessagesResponseSchema,
} from "@/lib/messages/types";
import {
  mapMessageReportRowsToDtos,
  type MessageReportRow,
} from "@/lib/messages/report-dto";

type Params = { params: { reportId: string } | Promise<{ reportId: string }> };

const reportParamsSchema = z.object({
  reportId: z.string().uuid(),
});

const reportQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const resolveReportId = async (params: Params["params"]) => {
  const value = await params;
  const parsed = reportParamsSchema.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data.reportId;
};

export async function GET(request: Request, { params }: Params) {
  const reportId = await resolveReportId(params);
  if (!reportId) {
    return messagesJson({ error: "Payload invalide." }, { status: 422 });
  }

  const query = new URL(request.url).searchParams;
  const parsedQuery = reportQuerySchema.safeParse({
    limit: query.get("limit") ?? undefined,
  });
  if (!parsedQuery.success) {
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
      "id, workspace_org_id, thread_id, message_id, reported_by, reason, details, status, freeze_applied, resolved_by, resolved_at, created_at, updated_at, snapshot"
    )
    .eq("id", reportId)
    .maybeSingle();

  if (!reportRow) {
    return messagesJson({ error: "Signalement introuvable." }, { status: 404 });
  }

  const typedReportWithSnapshot = reportRow as MessageReportRow & {
    snapshot: unknown;
  };
  if (typedReportWithSnapshot.workspace_org_id !== context.activeWorkspace.id) {
    return messagesJson({ error: "Acces refuse." }, { status: 403 });
  }

  const { data: threadRow } = await context.admin
    .from("message_threads")
    .select("id, kind, group_id, workspace_org_id, participant_a_id, participant_b_id")
    .eq("id", typedReportWithSnapshot.thread_id)
    .maybeSingle();

  if (!threadRow) {
    return messagesJson({ error: "Conversation introuvable." }, { status: 404 });
  }

  const { rows } = await loadThreadMessages(
    context.admin,
    typedReportWithSnapshot.thread_id,
    null,
    parsedQuery.data.limit ?? 100
  );

  const threadMembers = await loadThreadMembersForThread(
    context.admin,
    threadRow as {
      kind: "student_coach" | "coach_coach" | "group" | "group_info" | "org_info" | "org_coaches";
      group_id: string | null;
      workspace_org_id: string;
      participant_a_id: string;
      participant_b_id: string;
    }
  );

  const report = (
    await mapMessageReportRowsToDtos(context.admin, [typedReportWithSnapshot])
  )[0];

  const snapshotCandidate = Array.isArray(typedReportWithSnapshot.snapshot)
    ? typedReportWithSnapshot.snapshot
    : [];
  const snapshot = z
    .array(MessageReportSnapshotItemSchema)
    .safeParse(snapshotCandidate).data ?? [];

  await insertMessageModerationAudit({
    admin: context.admin,
    workspaceOrgId: context.activeWorkspace.id,
    actorUserId: context.userId,
    reportId: report.id,
    threadId: report.threadId,
    action: "report.thread_viewed",
    metadata: {
      limit: parsedQuery.data.limit ?? 100,
    },
  });

  const payload = MessageReportThreadMessagesResponseSchema.parse({
    report,
    snapshot,
    messages: rows,
    threadMembers,
  });

  return messagesJson(payload);
}
