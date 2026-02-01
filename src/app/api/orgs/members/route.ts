import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";

const updateSchema = z.object({
  memberId: z.string().uuid(),
  status: z.enum(["invited", "active", "disabled"]).optional(),
  premium_active: z.boolean().optional(),
  role: z.enum(["admin", "coach"]).optional(),
});

export async function GET(request: Request) {
  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, org_id")
    .eq("id", userData.user.id)
    .single();

  if (!profile?.org_id) {
    return NextResponse.json({ error: "Organisation introuvable." }, { status: 403 });
  }

  const { data: membership } = await admin
    .from("org_memberships")
    .select("role, status")
    .eq("org_id", profile.org_id)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (!membership || membership.status !== "active" || membership.role !== "admin") {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { data: members } = await admin
    .from("org_memberships")
    .select("id, org_id, user_id, role, status, premium_active, profiles(full_name)")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: true });

  const { data: invites } = await admin
    .from("org_invitations")
    .select("id, email, role, status, created_at, expires_at")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ members: members ?? [], invitations: invites ?? [] });
}

export async function PATCH(request: Request) {
  const parsed = await parseRequestJson(request, updateSchema);
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
  const { data: profile } = await admin
    .from("profiles")
    .select("id, org_id")
    .eq("id", userData.user.id)
    .single();

  if (!profile?.org_id) {
    return NextResponse.json({ error: "Organisation introuvable." }, { status: 403 });
  }

  const { data: membership } = await admin
    .from("org_memberships")
    .select("role, status")
    .eq("org_id", profile.org_id)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (!membership || membership.status !== "active" || membership.role !== "admin") {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const updatePayload: Record<string, unknown> = {};
  if (typeof parsed.data.status !== "undefined") updatePayload.status = parsed.data.status;
  if (typeof parsed.data.premium_active !== "undefined") {
    updatePayload.premium_active = parsed.data.premium_active;
  }
  if (typeof parsed.data.role !== "undefined") updatePayload.role = parsed.data.role;

  if (!Object.keys(updatePayload).length) {
    return NextResponse.json({ error: "Aucune mise a jour." }, { status: 400 });
  }

  const { data: currentMember } = await admin
    .from("org_memberships")
    .select("id, role, status, premium_active")
    .eq("id", parsed.data.memberId)
    .eq("org_id", profile.org_id)
    .maybeSingle();

  if (!currentMember) {
    return NextResponse.json({ error: "Membre introuvable." }, { status: 404 });
  }

  const nextRole = (parsed.data.role ?? currentMember.role) as "admin" | "coach";
  const nextStatus = (parsed.data.status ?? currentMember.status) as
    | "invited"
    | "active"
    | "disabled";
  const nextPremium =
    typeof parsed.data.premium_active !== "undefined"
      ? parsed.data.premium_active
      : currentMember.premium_active;

  if (nextRole === "admin" && nextStatus === "active") {
    if (!nextPremium) {
      return NextResponse.json(
        { error: "Un admin doit etre premium." },
        { status: 400 }
      );
    }
    const { data: activeAdmins } = await admin
      .from("org_memberships")
      .select("id")
      .eq("org_id", profile.org_id)
      .eq("role", "admin")
      .eq("status", "active");
    const otherAdmin = (activeAdmins ?? []).some(
      (row) => (row as { id: string }).id !== currentMember.id
    );
    if (otherAdmin) {
      return NextResponse.json(
        { error: "Un admin actif existe deja." },
        { status: 409 }
      );
    }
  }

  const { error: updateError } = await admin
    .from("org_memberships")
    .update(updatePayload)
    .eq("id", parsed.data.memberId)
    .eq("org_id", profile.org_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
