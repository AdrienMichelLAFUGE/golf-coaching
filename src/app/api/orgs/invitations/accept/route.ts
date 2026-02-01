import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";

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
    return NextResponse.json({ error: "Invitation introuvable." }, { status: 404 });
  }

  if (invitation.status !== "pending") {
    return NextResponse.json({ error: "Invitation deja traitee." }, { status: 400 });
  }

  if (
    invitation.expires_at &&
    new Date(invitation.expires_at).getTime() < Date.now()
  ) {
    return NextResponse.json({ error: "Invitation expiree." }, { status: 400 });
  }

  const email = userData.user.email?.toLowerCase();
  if (!email || email !== invitation.email.toLowerCase()) {
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
      return NextResponse.json(
        { error: "Un admin actif existe deja." },
        { status: 409 }
      );
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
    return NextResponse.json({ error: membershipError.message }, { status: 400 });
  }

  const { error: updateInviteError } = await admin
    .from("org_invitations")
    .update({ status: "accepted" })
    .eq("id", invitation.id);

  if (updateInviteError) {
    return NextResponse.json({ error: updateInviteError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, orgId: invitation.org_id });
}
