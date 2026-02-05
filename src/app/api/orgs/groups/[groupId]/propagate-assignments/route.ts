import { NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { loadPersonalPlanTier } from "@/lib/plan-access";

type Params = { params: { groupId: string } | Promise<{ groupId: string }> };

const buildMembershipError = () => NextResponse.json({ error: "Acces refuse." }, { status: 403 });

export async function POST(request: Request, { params }: Params) {
  const { groupId } = await params;
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

  const { data: groupStudents } = await admin
    .from("org_group_students")
    .select("student_id")
    .eq("group_id", group.id);

  const { data: groupCoaches } = await admin
    .from("org_group_coaches")
    .select("coach_id")
    .eq("group_id", group.id);

  const studentIds = (groupStudents ?? []).map(
    (row) => (row as { student_id: string }).student_id
  );
  const coachIds = (groupCoaches ?? []).map(
    (row) => (row as { coach_id: string }).coach_id
  );

  if (studentIds.length === 0 || coachIds.length === 0) {
    return NextResponse.json({ ok: true, created: 0 });
  }

  const assignments = studentIds.flatMap((studentId) =>
    coachIds.map((coachId) => ({
      org_id: profile.org_id,
      student_id: studentId,
      coach_id: coachId,
      created_by: profile.id,
    }))
  );

  const { error: upsertError } = await admin
    .from("student_assignments")
    .upsert(assignments, { onConflict: "student_id,coach_id", ignoreDuplicates: true });

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, created: assignments.length });
}
