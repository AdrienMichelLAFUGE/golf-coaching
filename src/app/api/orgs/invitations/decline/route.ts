import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { recordActivity } from "@/lib/activity-log";

const declineSchema = z.object({
  token: z.string().uuid(),
});

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, declineSchema);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }

  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const email = userData.user.email?.toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Email introuvable." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: invitation, error: inviteError } = await admin
    .from("org_invitations")
    .select("id, email, status")
    .eq("token", parsed.data.token)
    .maybeSingle();

  if (inviteError || !invitation) {
    await recordActivity({
      admin,
      level: "warn",
      action: "organization.invitation.decline.denied",
      actorUserId: userData.user.id,
      message: "Refus invitation: invitation introuvable.",
    });
    return NextResponse.json({ error: "Invitation introuvable." }, { status: 404 });
  }

  if (invitation.email.toLowerCase() !== email) {
    await recordActivity({
      admin,
      level: "warn",
      action: "organization.invitation.decline.denied",
      actorUserId: userData.user.id,
      message: "Refus invitation: email non autorise.",
    });
    return NextResponse.json({ error: "Email non autorise." }, { status: 403 });
  }

  if (invitation.status !== "pending") {
    await recordActivity({
      admin,
      level: "warn",
      action: "organization.invitation.decline.denied",
      actorUserId: userData.user.id,
      message: "Refus invitation: invitation deja traitee.",
    });
    return NextResponse.json({ error: "Invitation deja traitee." }, { status: 400 });
  }

  const { error: updateError } = await admin
    .from("org_invitations")
    .update({ status: "revoked" })
    .eq("id", invitation.id);

  if (updateError) {
    await recordActivity({
      admin,
      level: "error",
      action: "organization.invitation.decline.failed",
      actorUserId: userData.user.id,
      entityType: "org_invitation",
      entityId: invitation.id,
      message: updateError.message ?? "Refus invitation impossible.",
    });
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  await recordActivity({
    admin,
    action: "organization.invitation.decline.success",
    actorUserId: userData.user.id,
    entityType: "org_invitation",
    entityId: invitation.id,
    message: "Invitation organisation refusee.",
  });

  return NextResponse.json({ ok: true });
}
