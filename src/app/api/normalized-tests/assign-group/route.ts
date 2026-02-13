import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { PELZ_PUTTING_SLUG } from "@/lib/normalized-tests/pelz-putting";
import { PELZ_APPROCHES_SLUG } from "@/lib/normalized-tests/pelz-approches";
import { WEDGING_DRAPEAU_LONG_SLUG } from "@/lib/normalized-tests/wedging-drapeau-long";
import { WEDGING_DRAPEAU_COURT_SLUG } from "@/lib/normalized-tests/wedging-drapeau-court";
import { isAdminEmail } from "@/lib/admin";
import { PLAN_ENTITLEMENTS } from "@/lib/plans";
import { loadPersonalPlanTier } from "@/lib/plan-access";
import { recordActivity } from "@/lib/activity-log";

export const runtime = "nodejs";

const isPelzSlug = (
  slug: string
): slug is typeof PELZ_PUTTING_SLUG | typeof PELZ_APPROCHES_SLUG =>
  slug === PELZ_PUTTING_SLUG || slug === PELZ_APPROCHES_SLUG;

const assignSchema = z.object({
  testSlug: z.enum([
    PELZ_PUTTING_SLUG,
    PELZ_APPROCHES_SLUG,
    WEDGING_DRAPEAU_LONG_SLUG,
    WEDGING_DRAPEAU_COURT_SLUG,
  ]),
  groupId: z.string().uuid(),
});

const chunkArray = <T,>(values: T[], size: number) => {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
};

const buildMembershipError = () => NextResponse.json({ error: "Acces refuse." }, { status: 403 });

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, assignSchema);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }

  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  const userEmail = userData.user?.email ?? "";

  if (userError || !userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, org_id, role")
    .eq("id", userId)
    .single();

  if (!profile?.org_id) {
    await recordActivity({
      admin,
      level: "warn",
      action: "normalized_test.assign_group.denied",
      actorUserId: userId,
      message: "Assignation groupe refusee: organisation introuvable.",
    });
    return NextResponse.json({ error: "Organisation introuvable." }, { status: 403 });
  }

  if (!["owner", "coach", "staff"].includes(profile.role)) {
    await recordActivity({
      admin,
      level: "warn",
      action: "normalized_test.assign_group.denied",
      actorUserId: profile.id,
      orgId: profile.org_id,
      message: "Assignation groupe refusee: role non autorise.",
    });
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
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
      action: "normalized_test.assign_group.denied",
      actorUserId: profile.id,
      orgId: profile.org_id,
      message: "Assignation groupe refusee: membre inactif ou absent.",
    });
    return buildMembershipError();
  }

  const planTier = await loadPersonalPlanTier(admin, profile.id);
  if (membership.role !== "admin" && planTier === "free") {
    await recordActivity({
      admin,
      level: "warn",
      action: "normalized_test.assign_group.denied",
      actorUserId: profile.id,
      orgId: profile.org_id,
      message: "Assignation groupe refusee: plan insuffisant.",
    });
    return NextResponse.json(
      { error: "Plan Pro requis pour gerer les groupes." },
      { status: 403 }
    );
  }

  const isAdmin = isAdminEmail(userEmail);
  if (!isAdmin) {
    const testAccess = PLAN_ENTITLEMENTS[planTier].tests;
    if (testAccess.scope === "pelz" && !isPelzSlug(parsed.data.testSlug)) {
      await recordActivity({
        admin,
        level: "warn",
        action: "normalized_test.assign_group.denied",
        actorUserId: profile.id,
        orgId: profile.org_id,
        message: "Assignation groupe refusee: entitlement test insuffisant.",
        metadata: { testSlug: parsed.data.testSlug, groupId: parsed.data.groupId },
      });
      return NextResponse.json({ error: "Plan Pro requis pour ce test." }, { status: 403 });
    }
  }

  const { data: group } = await admin
    .from("org_groups")
    .select("id")
    .eq("org_id", profile.org_id)
    .eq("id", parsed.data.groupId)
    .maybeSingle();

  if (!group) {
    await recordActivity({
      admin,
      level: "warn",
      action: "normalized_test.assign_group.denied",
      actorUserId: profile.id,
      orgId: profile.org_id,
      message: "Assignation groupe refusee: groupe introuvable.",
      metadata: { testSlug: parsed.data.testSlug, groupId: parsed.data.groupId },
    });
    return NextResponse.json({ error: "Groupe introuvable." }, { status: 404 });
  }

  const { data: groupStudents, error: groupError } = await admin
    .from("org_group_students")
    .select("student_id")
    .eq("org_id", profile.org_id)
    .eq("group_id", parsed.data.groupId);

  if (groupError) {
    await recordActivity({
      admin,
      level: "error",
      action: "normalized_test.assign_group.failed",
      actorUserId: profile.id,
      orgId: profile.org_id,
      message: groupError.message ?? "Lecture des eleves du groupe impossible.",
      metadata: { testSlug: parsed.data.testSlug, groupId: parsed.data.groupId },
    });
    return NextResponse.json({ error: groupError.message }, { status: 400 });
  }

  const studentIds = Array.from(
    new Set((groupStudents ?? []).map((row) => (row as { student_id: string }).student_id))
  );

  if (studentIds.length === 0) {
    await recordActivity({
      admin,
      action: "normalized_test.assign_group.success",
      actorUserId: profile.id,
      orgId: profile.org_id,
      message: "Assignation groupe: aucun eleve a traiter.",
      metadata: { testSlug: parsed.data.testSlug, groupId: parsed.data.groupId, created: 0, skipped: 0 },
    });
    return NextResponse.json({ ok: true, created: 0, skipped: 0 });
  }

  const { data: existingRows, error: existingError } = await admin
    .from("normalized_test_assignments")
    .select("student_id")
    .eq("org_id", profile.org_id)
    .eq("coach_id", profile.id)
    .eq("test_slug", parsed.data.testSlug)
    .in("student_id", studentIds);

  if (existingError) {
    await recordActivity({
      admin,
      level: "error",
      action: "normalized_test.assign_group.failed",
      actorUserId: profile.id,
      orgId: profile.org_id,
      message: existingError.message ?? "Lecture des assignations existantes impossible.",
      metadata: { testSlug: parsed.data.testSlug, groupId: parsed.data.groupId },
    });
    return NextResponse.json({ error: existingError.message }, { status: 400 });
  }

  const existingIds = new Set(
    (existingRows ?? []).map((row) => (row as { student_id: string }).student_id)
  );

  const studentIdsToInsert = studentIds.filter((id) => !existingIds.has(id));

  if (studentIdsToInsert.length === 0) {
    await recordActivity({
      admin,
      action: "normalized_test.assign_group.success",
      actorUserId: profile.id,
      orgId: profile.org_id,
      message: "Assignation groupe: aucune nouvelle assignation.",
      metadata: {
        testSlug: parsed.data.testSlug,
        groupId: parsed.data.groupId,
        created: 0,
        skipped: studentIds.length,
      },
    });
    return NextResponse.json({ ok: true, created: 0, skipped: studentIds.length });
  }

  const now = new Date().toISOString();
  const rows = studentIdsToInsert.map((studentId) => ({
    org_id: profile.org_id,
    student_id: studentId,
    coach_id: profile.id,
    test_slug: parsed.data.testSlug,
    status: "assigned",
    assigned_at: now,
    created_at: now,
    updated_at: now,
  }));

  let created = 0;
  for (const chunk of chunkArray(rows, 50)) {
    const { error: insertError } = await admin
      .from("normalized_test_assignments")
      .insert(chunk);

    if (insertError) {
      await recordActivity({
        admin,
        level: "error",
        action: "normalized_test.assign_group.failed",
        actorUserId: profile.id,
        orgId: profile.org_id,
        message: insertError.message ?? "Assignation groupe impossible.",
        metadata: {
          testSlug: parsed.data.testSlug,
          groupId: parsed.data.groupId,
          attempted: rows.length,
        },
      });
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
    created += chunk.length;
  }

  await recordActivity({
    admin,
    action: "normalized_test.assign_group.success",
    actorUserId: profile.id,
    orgId: profile.org_id,
    message: "Test assigne au groupe.",
    metadata: {
      testSlug: parsed.data.testSlug,
      groupId: parsed.data.groupId,
      created,
      skipped: studentIds.length - created,
    },
  });

  return NextResponse.json({
    ok: true,
    created,
    skipped: studentIds.length - created,
  });
}
