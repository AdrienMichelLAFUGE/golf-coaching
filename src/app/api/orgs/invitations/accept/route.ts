import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { recordActivity } from "@/lib/activity-log";

const acceptSchema = z.object({
  token: z.string().uuid(),
});

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, acceptSchema);
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

  const admin = createSupabaseAdminClient();
  const { data: invitation, error: inviteError } = await admin
    .from("org_invitations")
    .select("id, org_id, email, role, status, expires_at")
    .eq("token", parsed.data.token)
    .maybeSingle();

  if (inviteError || !invitation) {
    await recordActivity({
      admin,
      level: "warn",
      action: "organization.invitation.accept.denied",
      actorUserId: userData.user.id,
      message: "Acceptation invitation refusee: invitation introuvable.",
    });
    return NextResponse.json({ error: "Invitation introuvable." }, { status: 404 });
  }

  if (invitation.status !== "pending") {
    await recordActivity({
      admin,
      level: "warn",
      action: "organization.invitation.accept.denied",
      actorUserId: userData.user.id,
      orgId: invitation.org_id,
      message: "Acceptation invitation refusee: invitation deja traitee.",
    });
    return NextResponse.json({ error: "Invitation deja traitee." }, { status: 400 });
  }

  if (invitation.expires_at && new Date(invitation.expires_at).getTime() < Date.now()) {
    await recordActivity({
      admin,
      level: "warn",
      action: "organization.invitation.accept.denied",
      actorUserId: userData.user.id,
      orgId: invitation.org_id,
      message: "Acceptation invitation refusee: invitation expiree.",
    });
    return NextResponse.json({ error: "Invitation expiree." }, { status: 400 });
  }

  const email = userData.user.email?.toLowerCase();
  if (!email || email !== invitation.email.toLowerCase()) {
    await recordActivity({
      admin,
      level: "warn",
      action: "organization.invitation.accept.denied",
      actorUserId: userData.user.id,
      orgId: invitation.org_id,
      message: "Acceptation invitation refusee: email non autorise.",
    });
    return NextResponse.json({ error: "Email non autorise." }, { status: 403 });
  }

  if (invitation.role === "admin") {
    const { data: activeAdmins } = await admin
      .from("org_memberships")
      .select("id")
      .eq("org_id", invitation.org_id)
      .eq("role", "admin")
      .eq("status", "active")
      .limit(1);
    if ((activeAdmins ?? []).length > 0) {
      await recordActivity({
        admin,
        level: "warn",
        action: "organization.invitation.accept.denied",
        actorUserId: userData.user.id,
        orgId: invitation.org_id,
        message: "Acceptation invitation admin refusee: admin deja actif.",
      });
      return NextResponse.json({ error: "Un admin actif existe deja." }, { status: 409 });
    }
  }

  const { error: membershipError } = await admin.from("org_memberships").upsert(
    {
      org_id: invitation.org_id,
      user_id: userData.user.id,
      role: invitation.role,
      status: "active",
      premium_active: invitation.role === "admin",
    },
    { onConflict: "org_id,user_id" }
  );

  if (membershipError) {
    await recordActivity({
      admin,
      level: "error",
      action: "organization.invitation.accept.failed",
      actorUserId: userData.user.id,
      orgId: invitation.org_id,
      message: membershipError.message ?? "Creation membership impossible.",
    });
    return NextResponse.json({ error: membershipError.message }, { status: 400 });
  }

  const { error: updateInviteError } = await admin
    .from("org_invitations")
    .update({ status: "accepted" })
    .eq("id", invitation.id);

  if (updateInviteError) {
    await recordActivity({
      admin,
      level: "error",
      action: "organization.invitation.accept.failed",
      actorUserId: userData.user.id,
      orgId: invitation.org_id,
      entityType: "org_invitation",
      entityId: invitation.id,
      message: updateInviteError.message ?? "Mise a jour invitation impossible.",
    });
    return NextResponse.json({ error: updateInviteError.message }, { status: 400 });
  }

  await recordActivity({
    admin,
    action: "organization.invitation.accept.success",
    actorUserId: userData.user.id,
    orgId: invitation.org_id,
    entityType: "org_invitation",
    entityId: invitation.id,
    message: "Invitation organisation acceptee.",
  });

  return NextResponse.json({ ok: true, orgId: invitation.org_id });
}
