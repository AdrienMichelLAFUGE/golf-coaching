import { NextResponse } from "next/server";
import { z } from "zod";
import { loadMessageActorContext } from "@/lib/messages/access";

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
    return NextResponse.json({ error: "Payload invalide." }, { status: 422 });
  }

  const { context, response } = await loadMessageActorContext(request);
  if (response || !context) return response;

  const { data: memberData } = await context.admin
    .from("message_thread_members")
    .select("thread_id, user_id")
    .eq("thread_id", threadId)
    .eq("user_id", context.userId)
    .maybeSingle();

  if (!memberData) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { error: updateError } = await context.admin
    .from("message_thread_members")
    .update({
      hidden_at: new Date().toISOString(),
    })
    .eq("thread_id", threadId)
    .eq("user_id", context.userId);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message ?? "Suppression impossible." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    threadId,
  });
}
