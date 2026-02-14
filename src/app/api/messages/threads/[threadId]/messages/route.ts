import { messagesJson } from "@/lib/messages/http";
import { z } from "zod";
import { coerceMessageId, loadMessageActorContext } from "@/lib/messages/access";
import {
  buildThreadMessagesResponse,
  loadThreadMembersForThread,
  loadThreadMessages,
  validateThreadAccess,
} from "@/lib/messages/service";
import { enforceMessageRateLimit } from "@/lib/messages/rate-limit";
import { SendMessageSchema } from "@/lib/messages/types";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { loadMessagingPolicy } from "@/lib/messages/policy";
import {
  detectMessageContentFlags,
  shouldBlockMessageForMinorThread,
} from "@/lib/messages/content-guard";
import { isMinorThreadKind } from "@/lib/messages/moderation";
import { recordActivity } from "@/lib/activity-log";

type Params = { params: { threadId: string } | Promise<{ threadId: string }> };

const threadParamsSchema = z.object({
  threadId: z.string().uuid(),
});

const threadQuerySchema = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const resolveThreadId = async (params: Params["params"]) => {
  const value = await params;
  const parsed = threadParamsSchema.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data.threadId;
};

export async function GET(request: Request, { params }: Params) {
  const threadId = await resolveThreadId(params);
  if (!threadId) {
    return messagesJson({ error: "Payload invalide." }, { status: 422 });
  }

  const query = new URL(request.url).searchParams;
  const parsedQuery = threadQuerySchema.safeParse({
    cursor: query.get("cursor") ?? undefined,
    limit: query.get("limit") ?? undefined,
  });

  if (!parsedQuery.success) {
    return messagesJson(
      { error: "Payload invalide.", details: formatZodError(parsedQuery.error) },
      { status: 422 }
    );
  }

  const { context, response } = await loadMessageActorContext(request);
  if (response || !context) return response;

  const accessCheck = await validateThreadAccess(
    context.admin,
    context.userId,
    context.profile.role,
    threadId,
    "read"
  );
  if (!accessCheck.ok) {
    return messagesJson({ error: accessCheck.error }, { status: accessCheck.status });
  }

  const { rows, nextCursor } = await loadThreadMessages(
    context.admin,
    threadId,
    parsedQuery.data.cursor ?? null,
    parsedQuery.data.limit ?? 50
  );

  const threadMembers = await loadThreadMembersForThread(
    context.admin,
    accessCheck.participantContext.thread
  );

  return messagesJson(
    buildThreadMessagesResponse(
      threadId,
      rows,
      threadMembers,
      nextCursor,
      accessCheck.participantContext.ownMember,
      accessCheck.participantContext.counterpartMember
    )
  );
}

export async function POST(request: Request, { params }: Params) {
  const parsedBody = await parseRequestJson(request, SendMessageSchema);
  if (!parsedBody.success) {
    return messagesJson(
      { error: "Payload invalide.", details: formatZodError(parsedBody.error) },
      { status: 422 }
    );
  }

  const threadId = await resolveThreadId(params);
  if (!threadId) {
    return messagesJson({ error: "Payload invalide." }, { status: 422 });
  }

  const { context, response } = await loadMessageActorContext(request);
  if (response || !context) return response;

  const rateLimit = await enforceMessageRateLimit(
    context.admin,
    context.userId,
    "message_send"
  );
  if (!rateLimit.allowed) {
    await recordActivity({
      admin: context.admin,
      level: "warn",
      action: "messages.rate_limited",
      actorUserId: context.userId,
      orgId: context.activeWorkspace.id,
      entityType: "message_thread",
      entityId: threadId,
      message: "Rate limit messagerie atteint.",
      metadata: {
        action: "message_send",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
    });
    return messagesJson(
      { error: "Trop de requetes. Reessaie dans quelques secondes." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds || 1) },
      }
    );
  }

  const accessCheck = await validateThreadAccess(
    context.admin,
    context.userId,
    context.profile.role,
    threadId,
    "write"
  );
  if (!accessCheck.ok) {
    await recordActivity({
      admin: context.admin,
      level: "warn",
      action: "messages.access.denied",
      actorUserId: context.userId,
      orgId: context.activeWorkspace.id,
      entityType: "message_thread",
      entityId: threadId,
      message: "Acces ecriture refuse sur conversation.",
      metadata: {
        status: accessCheck.status,
      },
    });
    return messagesJson({ error: accessCheck.error }, { status: accessCheck.status });
  }

  const messageBody = parsedBody.data.body.trim();
  const thread = accessCheck.participantContext.thread;
  if (thread.frozen_at) {
    return messagesJson(
      {
        error: "Cette conversation est temporairement gelee par la structure.",
      },
      { status: 423 }
    );
  }

  const policy = await loadMessagingPolicy(context.admin, thread.workspace_org_id);
  const contentFlags = detectMessageContentFlags(messageBody, policy.sensitiveWords);
  const isMinorThread = isMinorThreadKind(thread.kind);

  if (shouldBlockMessageForMinorThread(policy.guardMode, isMinorThread, contentFlags)) {
    await recordActivity({
      admin: context.admin,
      level: "warn",
      action: "messages.content.blocked",
      actorUserId: context.userId,
      orgId: thread.workspace_org_id,
      entityType: "message_thread",
      entityId: thread.id,
      message: "Message bloque par politique de contenu.",
      metadata: {
        flagTypes: Array.from(new Set(contentFlags.map((flag) => flag.type))),
      },
    });

    return messagesJson(
      {
        error:
          "Message bloque par la politique de securite de la structure (contenu sensible detecte).",
      },
      { status: 422 }
    );
  }

  const { data: insertData, error: insertError } = await context.admin
    .from("message_messages")
    .insert([
      {
        thread_id: threadId,
        sender_user_id: context.userId,
        body: messageBody,
      },
    ])
    .select("id, thread_id, sender_user_id, body, created_at")
    .single();

  if (insertError || !insertData) {
    return messagesJson(
      { error: insertError?.message ?? "Envoi impossible." },
      { status: 400 }
    );
  }

  const messageId = coerceMessageId((insertData as { id: number | string }).id);
  if (!messageId) {
    return messagesJson({ error: "Envoi impossible." }, { status: 500 });
  }

  if (contentFlags.length > 0) {
    await context.admin.from("message_content_flags").insert(
      contentFlags.map((flag) => ({
        workspace_org_id: thread.workspace_org_id,
        thread_id: thread.id,
        message_id: messageId,
        sender_user_id: context.userId,
        flag_type: flag.type,
        matched_value: flag.matchedValue,
      }))
    );

    const { count } = await context.admin
      .from("message_content_flags")
      .select("id", { count: "exact", head: true })
      .eq("workspace_org_id", thread.workspace_org_id)
      .eq("sender_user_id", context.userId)
      .gte(
        "created_at",
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      );

    await recordActivity({
      admin: context.admin,
      level: "warn",
      action: "messages.content.flagged",
      actorUserId: context.userId,
      orgId: thread.workspace_org_id,
      entityType: "message_message",
      entityId: thread.id,
      message: "Message marque par garde-fous de contenu.",
      metadata: {
        threadId: thread.id,
        messageId,
        flagTypes: Array.from(new Set(contentFlags.map((flag) => flag.type))),
        recentFlagsLast24h: count ?? 0,
      },
    });

    if ((count ?? 0) >= 3) {
      await recordActivity({
        admin: context.admin,
        level: "warn",
        action: "messages.content.recurrent_flags",
        actorUserId: context.userId,
        orgId: thread.workspace_org_id,
        entityType: "message_thread",
        entityId: thread.id,
        message: "Flags recurrents detectes sur messagerie.",
        metadata: {
          threadId: thread.id,
          recentFlagsLast24h: count ?? 0,
        },
      });
    }
  }

  const unhideUserIds = Array.from(
    new Set([
      ...(accessCheck.threadMemberUserIds ?? []),
      context.userId,
      accessCheck.participantContext.counterpartMember?.user_id ?? context.userId,
    ])
  );

  await context.admin
    .from("message_thread_members")
    .update({
      hidden_at: null,
    })
    .eq("thread_id", threadId)
    .in("user_id", unhideUserIds);

  await context.admin
    .from("message_thread_members")
    .update({
      last_read_message_id: messageId,
      last_read_at: new Date().toISOString(),
    })
    .eq("thread_id", threadId)
    .eq("user_id", context.userId);

  return messagesJson({
    message: {
      id: messageId,
      threadId,
      senderUserId: context.userId,
      senderName: context.profile.full_name ?? null,
      senderAvatarUrl: context.profile.avatar_url ?? null,
      senderRole: context.profile.role,
      body: (insertData as { body: string }).body,
      createdAt: (insertData as { created_at: string }).created_at,
    },
  });
}
