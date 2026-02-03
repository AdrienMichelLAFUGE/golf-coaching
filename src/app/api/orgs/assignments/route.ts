import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { resolvePlanTier } from "@/lib/plans";

const assignmentSchema = z.object({
  studentId: z.string().uuid(),
  coachIds: z.array(z.string().uuid()).min(1),
});

const listSchema = z.object({
  studentId: z.string().uuid(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = listSchema.safeParse({ studentId: searchParams.get("studentId") });
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
    .select("id, org_id, active_workspace_id")
    .eq("id", userData.user.id)
    .single();

  if (!profile?.id) {
    return NextResponse.json({ error: "Profil introuvable." }, { status: 403 });
  }

  const { data: student } = await admin
    .from("students")
    .select("id, org_id")
    .eq("id", parsed.data.studentId)
    .single();

  if (!student?.org_id) {
    return NextResponse.json({ error: "Eleve introuvable." }, { status: 404 });
  }

  const activeWorkspaceId = profile.active_workspace_id ?? profile.org_id ?? null;
  if (activeWorkspaceId !== student.org_id) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { data: membership } = await admin
    .from("org_memberships")
    .select("status")
    .eq("org_id", student.org_id)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (!membership || membership.status !== "active") {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { data: assignments, error: assignmentsError } = await admin
    .from("student_assignments")
    .select("coach_id, profiles!student_assignments_coach_id_fkey(full_name)")
    .eq("student_id", parsed.data.studentId);

  if (assignmentsError) {
    return NextResponse.json({ error: assignmentsError.message }, { status: 400 });
  }

  return NextResponse.json({ assignments: assignments ?? [] });
}

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, assignmentSchema);
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

  const { data: workspace, error: workspaceError } = await admin
    .from("organizations")
    .select("plan_tier")
    .eq("id", profile.org_id)
    .single();

  if (workspaceError || !workspace) {
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

  const planTier = resolvePlanTier(workspace.plan_tier);
  if (planTier === "free") {
    return NextResponse.json(
      { error: "Lecture seule: plan Free en organisation." },
      { status: 403 }
    );
  }

  const { data: student } = await admin
    .from("students")
    .select("id, org_id")
    .eq("id", parsed.data.studentId)
    .single();

  if (!student || student.org_id !== profile.org_id) {
    return NextResponse.json({ error: "Eleve introuvable." }, { status: 404 });
  }

  const { data: eligibleCoaches } = await admin
    .from("org_memberships")
    .select("user_id")
    .eq("org_id", profile.org_id)
    .eq("status", "active")
    .in("user_id", parsed.data.coachIds);

  const validCoachIds = (eligibleCoaches ?? []).map(
    (row) => (row as { user_id: string }).user_id
  );

  if (validCoachIds.length === 0) {
    return NextResponse.json(
      { error: "Selectionne au moins un coach actif." },
      { status: 400 }
    );
  }

  const { error: deleteError } = await admin
    .from("student_assignments")
    .delete()
    .eq("student_id", parsed.data.studentId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  const payload = validCoachIds.map((coachId) => ({
    org_id: profile.org_id,
    student_id: parsed.data.studentId,
    coach_id: coachId,
    created_by: profile.id,
  }));

  const { error: insertError } = await admin.from("student_assignments").insert(payload);
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
