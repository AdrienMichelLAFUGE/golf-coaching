import { messagesJson } from "@/lib/messages/http";
import { isCoachLikeRole, loadMessageActorContext } from "@/lib/messages/access";
import { enforceMessageRateLimit } from "@/lib/messages/rate-limit";
import { CoachContactRequestRespondSchema } from "@/lib/messages/types";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { recordActivity } from "@/lib/activity-log";

export async function POST(request: Request) {
  const parsedBody = await parseRequestJson(request, CoachContactRequestRespondSchema);
  if (!parsedBody.success) {
    return messagesJson(
      { error: "Payload invalide.", details: formatZodError(parsedBody.error) },
      { status: 422 }
    );
  }

  const { context, response } = await loadMessageActorContext(request);
  if (response || !context) return response;

  if (!isCoachLikeRole(context.profile.role)) {
    return messagesJson({ error: "Acces refuse." }, { status: 403 });
  }

  const rateLimit = await enforceMessageRateLimit(
    context.admin,
    context.userId,
    "coach_contact_respond"
  );
  if (!rateLimit.allowed) {
    await recordActivity({
      admin: context.admin,
      level: "warn",
      action: "messages.rate_limited",
      actorUserId: context.userId,
      orgId: context.activeWorkspace?.id ?? null,
      entityType: "message_contact_request",
      message: "Rate limit reponse demande contact coach atteint.",
      metadata: {
        action: "coach_contact_respond",
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

  const { data: requestRow } = await context.admin
    .from("message_coach_contact_requests")
    .select("id, requester_user_id, target_user_id, pair_user_a_id, pair_user_b_id")
    .eq("id", parsedBody.data.requestId)
    .maybeSingle();

  if (!requestRow) {
    return messagesJson({ error: "Demande introuvable." }, { status: 404 });
  }

  const typedRequest = requestRow as {
    id: string;
    requester_user_id: string;
    target_user_id: string;
    pair_user_a_id: string;
    pair_user_b_id: string;
  };

  if (typedRequest.target_user_id !== context.userId) {
    return messagesJson({ error: "Acces refuse." }, { status: 403 });
  }

  if (parsedBody.data.decision === "accept") {
    const { error: contactError } = await context.admin
      .from("message_coach_contacts")
      .upsert(
        [
          {
            user_a_id: typedRequest.pair_user_a_id,
            user_b_id: typedRequest.pair_user_b_id,
            accepted_by: context.userId,
          },
        ],
        { onConflict: "user_a_id,user_b_id" }
      );

    if (contactError) {
      return messagesJson(
        { error: contactError.message ?? "Validation impossible." },
        { status: 400 }
      );
    }
  }

  const { error: deleteError } = await context.admin
    .from("message_coach_contact_requests")
    .delete()
    .eq("id", typedRequest.id);

  if (deleteError) {
    return messagesJson(
      { error: deleteError.message ?? "Mise a jour impossible." },
      { status: 400 }
    );
  }

  return messagesJson({ ok: true, decision: parsedBody.data.decision });
}
