import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { loadPersonalPlanTier } from "@/lib/plan-access";

const assignSchema = z.object({
  coachIds: z.array(z.string().uuid()),
});

type Params = { params: { groupId: string } | Promise<{ groupId: string }> };

const buildMembershipError = () => NextResponse.json({ error: "Acces refuse." }, { status: 403 });

export async function POST(request: Request, { params }: Params) {
  const { groupId } = await params;
  const parsed = await parseRequestJson(request, assignSchema);
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

  if (!membership || membership.status !== "active") {
    return buildMembershipError();
  }

  if (membership.role !== "admin") {
    const planTier = await loadPersonalPlanTier(admin, profile.id);
    if (planTier === "free") {
      return NextResponse.json(
        { error: "Plan Pro requis pour gerer les groupes." },
        { status: 403 }
      );
    }
  }

  const { data: group } = await admin
    .from("org_groups")
    .select("id")
    .eq("org_id", profile.org_id)
    .eq("id", groupId)
    .maybeSingle();

  if (!group) {
    return NextResponse.json({ error: "Groupe introuvable." }, { status: 404 });
  }

  const coachIds = Array.from(new Set(parsed.data.coachIds));

  const { error: deleteError } = await admin
    .from("org_group_coaches")
    .delete()
    .eq("org_id", profile.org_id)
    .eq("group_id", groupId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  if (coachIds.length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { data: eligibleCoaches } = await admin
    .from("org_memberships")
    .select("user_id")
    .eq("org_id", profile.org_id)
    .eq("status", "active")
    .in("user_id", coachIds);

  const validCoachIds = (eligibleCoaches ?? []).map(
    (row) => (row as { user_id: string }).user_id
  );

  if (validCoachIds.length === 0) {
    return NextResponse.json({ ok: true });
  }

  const assignments = validCoachIds.map((coachId) => ({
    org_id: profile.org_id,
    group_id: groupId,
    coach_id: coachId,
    created_by: profile.id,
  }));

  const { error: insertError } = await admin
    .from("org_group_coaches")
    .insert(assignments);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
