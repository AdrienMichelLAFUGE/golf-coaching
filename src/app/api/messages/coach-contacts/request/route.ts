import { NextResponse } from "next/server";
import {
  findAuthUserByEmail,
  isCoachLikeRole,
  loadMessageActorContext,
  normalizeUserPair,
} from "@/lib/messages/access";
import { buildCoachContactRequestDtos } from "@/lib/messages/service";
import { CoachContactRequestCreateSchema } from "@/lib/messages/types";
import { formatZodError, parseRequestJson } from "@/lib/validation";

export async function POST(request: Request) {
  const parsedBody = await parseRequestJson(request, CoachContactRequestCreateSchema);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsedBody.error) },
      { status: 422 }
    );
  }

  const { context, response } = await loadMessageActorContext(request);
  if (response || !context) return response;

  if (!isCoachLikeRole(context.profile.role)) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const targetAuthUser = await findAuthUserByEmail(context.admin, parsedBody.data.targetEmail);
  if (!targetAuthUser) {
    return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
  }

  if (targetAuthUser.id === context.userId) {
    return NextResponse.json(
      { error: "Demande impossible vers votre propre compte." },
      { status: 409 }
    );
  }

  const { data: targetProfile } = await context.admin
    .from("profiles")
    .select("id, role")
    .eq("id", targetAuthUser.id)
    .maybeSingle();

  if (!targetProfile || !isCoachLikeRole((targetProfile as { role: "owner" | "coach" | "staff" | "student" }).role)) {
    return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
  }

  const pair = normalizeUserPair(context.userId, targetAuthUser.id);

  const { data: existingContact } = await context.admin
    .from("message_coach_contacts")
    .select("id")
    .eq("user_a_id", pair.participantAId)
    .eq("user_b_id", pair.participantBId)
    .maybeSingle();

  if (existingContact) {
    return NextResponse.json({ error: "Contact deja actif." }, { status: 409 });
  }

  const { data: existingRequest } = await context.admin
    .from("message_coach_contact_requests")
    .select("id")
    .eq("pair_user_a_id", pair.participantAId)
    .eq("pair_user_b_id", pair.participantBId)
    .maybeSingle();

  if (existingRequest) {
    return NextResponse.json({ error: "Une demande est deja en attente." }, { status: 409 });
  }

  const { data: insertData, error: insertError } = await context.admin
    .from("message_coach_contact_requests")
    .insert([
      {
        requester_user_id: context.userId,
        target_user_id: targetAuthUser.id,
        pair_user_a_id: pair.participantAId,
        pair_user_b_id: pair.participantBId,
      },
    ])
    .select("id, requester_user_id, target_user_id, created_at")
    .single();

  if (insertError || !insertData) {
    return NextResponse.json(
      { error: insertError?.message ?? "Creation demande impossible." },
      { status: 400 }
    );
  }

  const [requestDto] = await buildCoachContactRequestDtos(context.admin, [
    insertData as {
      id: string;
      requester_user_id: string;
      target_user_id: string;
      created_at: string;
    },
  ]);

  return NextResponse.json({ ok: true, request: requestDto });
}
