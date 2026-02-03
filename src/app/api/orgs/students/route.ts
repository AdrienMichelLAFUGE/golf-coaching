import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { loadPersonalPlanTier } from "@/lib/plan-access";

const studentSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  playing_hand: z.enum(["right", "left"]).optional().or(z.literal("")),
  coach_ids: z.array(z.string().uuid()).optional(),
});

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, studentSchema);
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
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const planTier = await loadPersonalPlanTier(admin, profile.id);
  if (planTier === "free") {
    return NextResponse.json(
      { error: "Lecture seule: plan Free en organisation." },
      { status: 403 }
    );
  }

  const { data: student, error: insertError } = await admin
    .from("students")
    .insert([
      {
        org_id: profile.org_id,
        first_name: parsed.data.first_name.trim(),
        last_name: parsed.data.last_name?.trim() || null,
        email: parsed.data.email?.trim() || null,
        playing_hand: parsed.data.playing_hand || null,
      },
    ])
    .select("id")
    .single();

  if (insertError || !student) {
    return NextResponse.json(
      { error: insertError?.message ?? "Creation impossible." },
      { status: 400 }
    );
  }

  const coachIds = new Set<string>();
  coachIds.add(profile.id);
  if (membership.role === "admin") {
    (parsed.data.coach_ids ?? []).forEach((id) => coachIds.add(id));
  }

  const { data: eligibleCoaches } = await admin
    .from("org_memberships")
    .select("user_id")
    .eq("org_id", profile.org_id)
    .eq("status", "active")
    .in("user_id", Array.from(coachIds));

  const validCoachIds = (eligibleCoaches ?? []).map(
    (row) => (row as { user_id: string }).user_id
  );

  if (validCoachIds.length > 0) {
    const assignmentsPayload = validCoachIds.map((coachId) => ({
      org_id: profile.org_id,
      student_id: student.id,
      coach_id: coachId,
      created_by: profile.id,
    }));
    const { error: assignmentError } = await admin
      .from("student_assignments")
      .insert(assignmentsPayload);
    if (assignmentError) {
      return NextResponse.json({ error: assignmentError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true, studentId: student.id });
}
