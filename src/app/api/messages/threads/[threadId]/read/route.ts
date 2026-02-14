import { messagesJson } from "@/lib/messages/http";
import { z } from "zod";
import { coerceMessageId, loadMessageActorContext } from "@/lib/messages/access";
import { validateThreadAccess } from "@/lib/messages/service";
import { MarkThreadReadSchema } from "@/lib/messages/types";
import { formatZodError, parseRequestJson } from "@/lib/validation";

type Params = { params: { threadId: string } | Promise<{ threadId: string }> };

const threadParamsSchema = z.object({
  threadId: z.string().uuid(),
});

const resolveThreadId = async (params: Params["params"]) => {
  const value = await params;
  const parsed = threadParamsSchema.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data.threadId;
};

export async function POST(request: Request, { params }: Params) {
  const parsedBody = await parseRequestJson(request, MarkThreadReadSchema);
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

  const { data: targetMessage } = await context.admin
    .from("message_messages")
    .select("id")
    .eq("thread_id", threadId)
    .eq("id", parsedBody.data.lastReadMessageId)
    .maybeSingle();

  if (!targetMessage) {
    return messagesJson({ error: "Message introuvable." }, { status: 404 });
  }

  const currentReadMessageId = coerceMessageId(
    accessCheck.participantContext.ownMember.last_read_message_id
  );
  if (currentReadMessageId && currentReadMessageId >= parsedBody.data.lastReadMessageId) {
    return messagesJson({
      ok: true,
      lastReadMessageId: currentReadMessageId,
      lastReadAt: accessCheck.participantContext.ownMember.last_read_at ?? null,
    });
  }

  const now = new Date().toISOString();
  const { error: updateError } = await context.admin
    .from("message_thread_members")
    .update({
      last_read_message_id: parsedBody.data.lastReadMessageId,
      last_read_at: now,
    })
    .eq("thread_id", threadId)
    .eq("user_id", context.userId);

  if (updateError) {
    return messagesJson(
      { error: updateError.message ?? "Mise a jour impossible." },
      { status: 400 }
    );
  }

  return messagesJson({
    ok: true,
    lastReadMessageId: parsedBody.data.lastReadMessageId,
    lastReadAt: now,
  });
}