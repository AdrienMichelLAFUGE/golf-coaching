import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { loadPersonalPlanTier } from "@/lib/plan-access";
import { recordActivity } from "@/lib/activity-log";

const assignSchema = z.object({
  studentIds: z.array(z.string().uuid()),
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
    await recordActivity({
      admin,
      level: "warn",
      action: "group.assign_students.denied",
      actorUserId: userData.user.id,
      message: "Assignation eleves groupe refusee: organisation introuvable.",
    });
    return NextResponse.json({ error: "Organisation introuvable." }, { status: 403 });
  }

  const { data: membership } = await admin
    .from("org_memberships")
    .select("role, status")
    .eq("org_id", profile.org_id)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (!membership || membership.status !== "active") {
    await recordActivity({
      admin,
      level: "warn",
      action: "group.assign_students.denied",
      actorUserId: profile.id,
      orgId: profile.org_id,
      entityType: "org_group",
      entityId: groupId,
      message: "Assignation eleves groupe refusee: membre inactif ou absent.",
    });
    return buildMembershipError();
  }

  if (membership.role !== "admin") {
    const planTier = await loadPersonalPlanTier(admin, profile.id);
    if (planTier === "free") {
      await recordActivity({
        admin,
        level: "warn",
        action: "group.assign_students.denied",
        actorUserId: profile.id,
        orgId: profile.org_id,
        entityType: "org_group",
        entityId: groupId,
        message: "Assignation eleves groupe refusee: plan Free.",
      });
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
    await recordActivity({
      admin,
      level: "warn",
      action: "group.assign_students.denied",
      actorUserId: profile.id,
      orgId: profile.org_id,
      entityType: "org_group",
      entityId: groupId,
      message: "Assignation eleves groupe refusee: groupe introuvable.",
    });
    return NextResponse.json({ error: "Groupe introuvable." }, { status: 404 });
  }

  const studentIds = Array.from(new Set(parsed.data.studentIds));
  if (studentIds.length === 0) {
    const { error: clearError } = await admin
      .from("org_group_students")
      .delete()
      .eq("org_id", profile.org_id)
      .eq("group_id", groupId);

    if (clearError) {
      await recordActivity({
        admin,
        level: "error",
        action: "group.assign_students.failed",
        actorUserId: profile.id,
        orgId: profile.org_id,
        entityType: "org_group",
        entityId: groupId,
        message: clearError.message ?? "Nettoyage eleves groupe impossible.",
      });
      return NextResponse.json({ error: clearError.message }, { status: 400 });
    }

    await recordActivity({
      admin,
      action: "group.assign_students.success",
      actorUserId: profile.id,
      orgId: profile.org_id,
      entityType: "org_group",
      entityId: groupId,
      message: "Eleves du groupe mis a jour.",
      metadata: { studentCount: 0 },
    });

    return NextResponse.json({ ok: true });
  }

  const { data: students } = await admin
    .from("students")
    .select("id")
    .eq("org_id", profile.org_id)
    .in("id", studentIds);

  const validStudentIds = (students ?? []).map((row) => (row as { id: string }).id);

  if (validStudentIds.length === 0) {
    await recordActivity({
      admin,
      level: "warn",
      action: "group.assign_students.denied",
      actorUserId: profile.id,
      orgId: profile.org_id,
      entityType: "org_group",
      entityId: groupId,
      message: "Assignation eleves groupe refusee: aucun eleve valide.",
    });
    return NextResponse.json({ error: "Aucun eleve valide." }, { status: 400 });
  }

  const { error: deleteError } = await admin
    .from("org_group_students")
    .delete()
    .eq("org_id", profile.org_id)
    .in("student_id", validStudentIds);

  if (deleteError) {
    await recordActivity({
      admin,
      level: "error",
      action: "group.assign_students.failed",
      actorUserId: profile.id,
      orgId: profile.org_id,
      entityType: "org_group",
      entityId: groupId,
      message: deleteError.message ?? "Nettoyage ancienne assignation groupe impossible.",
    });
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  const assignments = validStudentIds.map((studentId) => ({
    org_id: profile.org_id,
    group_id: groupId,
    student_id: studentId,
    created_by: profile.id,
  }));

  const { error: insertError } = await admin
    .from("org_group_students")
    .insert(assignments);

  if (insertError) {
    await recordActivity({
      admin,
      level: "error",
      action: "group.assign_students.failed",
      actorUserId: profile.id,
      orgId: profile.org_id,
      entityType: "org_group",
      entityId: groupId,
      message: insertError.message ?? "Assignation eleves groupe impossible.",
    });
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  await recordActivity({
    admin,
    action: "group.assign_students.success",
    actorUserId: profile.id,
    orgId: profile.org_id,
    entityType: "org_group",
    entityId: groupId,
    message: "Eleves du groupe mis a jour.",
    metadata: { studentCount: validStudentIds.length },
  });

  return NextResponse.json({ ok: true });
}
