import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";

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
    return NextResponse.json({ error: "Invitation introuvable." }, { status: 404 });
  }

  if (invitation.email.toLowerCase() !== email) {
    return NextResponse.json({ error: "Email non autorise." }, { status: 403 });
  }

  if (invitation.status !== "pending") {
    return NextResponse.json({ error: "Invitation deja traitee." }, { status: 400 });
  }

  const { error: updateError } = await admin
    .from("org_invitations")
    .update({ status: "revoked" })
    .eq("id", invitation.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
