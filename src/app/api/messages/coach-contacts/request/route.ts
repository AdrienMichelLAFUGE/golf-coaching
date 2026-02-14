import { messagesJson } from "@/lib/messages/http";
import {
  findAuthUserByEmail,
  isCoachLikeActiveOrgMember,
  isCoachLikeRole,
  loadMessageActorContext,
  normalizeUserPair,
} from "@/lib/messages/access";
import { enforceMessageRateLimit } from "@/lib/messages/rate-limit";
import { CoachContactRequestCreateSchema } from "@/lib/messages/types";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { recordActivity } from "@/lib/activity-log";

const neutralContactRequestResponse = () =>
  messagesJson({
    ok: true,
    message: "Si le compte est eligible, la demande a ete prise en compte.",
  });

export async function POST(request: Request) {
  const parsedBody = await parseRequestJson(request, CoachContactRequestCreateSchema);
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
    "coach_contact_request"
  );
  if (!rateLimit.allowed) {
    await recordActivity({
      admin: context.admin,
      level: "warn",
      action: "messages.rate_limited",
      actorUserId: context.userId,
      orgId: context.activeWorkspace.id,
      entityType: "message_contact_request",
      message: "Rate limit demande contact coach atteint.",
      metadata: {
        action: "coach_contact_request",
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

  const targetAuthUser = await findAuthUserByEmail(context.admin, parsedBody.data.targetEmail);
  if (!targetAuthUser || targetAuthUser.id === context.userId) {
    return neutralContactRequestResponse();
  }

  const { data: targetProfile } = await context.admin
    .from("profiles")
    .select("id, role")
    .eq("id", targetAuthUser.id)
    .maybeSingle();

  if (
    !targetProfile ||
    !isCoachLikeRole((targetProfile as { role: "owner" | "coach" | "staff" | "student" }).role)
  ) {
    return neutralContactRequestResponse();
  }

  if (context.activeWorkspace.workspace_type === "org") {
    const isSameOrgCoach = await isCoachLikeActiveOrgMember(
      context.admin,
      context.activeWorkspace.id,
      targetAuthUser.id
    );
    if (isSameOrgCoach) {
      return neutralContactRequestResponse();
    }
  }

  const pair = normalizeUserPair(context.userId, targetAuthUser.id);

  const { data: existingContact } = await context.admin
    .from("message_coach_contacts")
    .select("id")
    .eq("user_a_id", pair.participantAId)
    .eq("user_b_id", pair.participantBId)
    .maybeSingle();

  if (existingContact) {
    return neutralContactRequestResponse();
  }

  const { data: existingRequest } = await context.admin
    .from("message_coach_contact_requests")
    .select("id")
    .eq("pair_user_a_id", pair.participantAId)
    .eq("pair_user_b_id", pair.participantBId)
    .maybeSingle();

  if (existingRequest) {
    return neutralContactRequestResponse();
  }

  const { error: insertError } = await context.admin
    .from("message_coach_contact_requests")
    .insert([
      {
        requester_user_id: context.userId,
        target_user_id: targetAuthUser.id,
        pair_user_a_id: pair.participantAId,
        pair_user_b_id: pair.participantBId,
      },
    ]);

  if (insertError) {
    if (insertError.code === "23505") {
      return neutralContactRequestResponse();
    }

    return messagesJson(
      { error: insertError.message ?? "Creation demande impossible." },
      { status: 400 }
    );
  }

  return neutralContactRequestResponse();
}
