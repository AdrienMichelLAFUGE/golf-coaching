import { messagesJson } from "@/lib/messages/http";
import { z } from "zod";
import { loadMessageActorContext } from "@/lib/messages/access";
import { validateThreadAccess } from "@/lib/messages/service";

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

export async function DELETE(request: Request, { params }: Params) {
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
    "hide"
  );

  if (!accessCheck.ok) {
    return messagesJson({ error: accessCheck.error }, { status: accessCheck.status });
  }

  const { error: updateError } = await context.admin
    .from("message_thread_members")
    .update({
      hidden_at: new Date().toISOString(),
    })
    .eq("thread_id", threadId)
    .eq("user_id", context.userId);

  if (updateError) {
    return messagesJson(
      { error: updateError.message ?? "Suppression impossible." },
      { status: 400 }
    );
  }

  return messagesJson({
    ok: true,
    threadId,
  });
}