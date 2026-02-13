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
  studentIds: z.array(z.string().uuid()).min(1).max(50),
});

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

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, org_id, role")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profil introuvable." }, { status: 403 });
  }

  if (!["owner", "coach", "staff"].includes(profile.role)) {
    await recordActivity({
      admin: createSupabaseAdminClient(),
      level: "warn",
      action: "normalized_test.assign.denied",
      actorUserId: userId,
      orgId: profile.org_id ?? null,
      message: "Assignation test refusee: role non autorise.",
    });
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const isAdmin = isAdminEmail(userEmail);

  if (!isAdmin) {
    const planTier = await loadPersonalPlanTier(admin, profile.id);
    const testAccess = PLAN_ENTITLEMENTS[planTier].tests;
    if (testAccess.scope === "pelz" && !isPelzSlug(parsed.data.testSlug)) {
      await recordActivity({
        admin,
        level: "warn",
        action: "normalized_test.assign.denied",
        actorUserId: profile.id,
        orgId: profile.org_id,
        message: "Assignation test refusee: entitlement plan insuffisant.",
        metadata: {
          testSlug: parsed.data.testSlug,
        },
      });
      return NextResponse.json({ error: "Plan Pro requis pour ce test." }, { status: 403 });
    }
  }

  const studentIds = Array.from(new Set(parsed.data.studentIds.map((id) => id.trim())));

  const { data: students, error: studentError } = await admin
    .from("students")
    .select("id")
    .in("id", studentIds)
    .eq("org_id", profile.org_id);

  if (studentError) {
    await recordActivity({
      admin,
      level: "error",
      action: "normalized_test.assign.failed",
      actorUserId: profile.id,
      orgId: profile.org_id,
      message: studentError.message ?? "Verification des eleves impossible.",
      metadata: {
        testSlug: parsed.data.testSlug,
      },
    });
    return NextResponse.json({ error: studentError.message }, { status: 500 });
  }

  if ((students ?? []).length !== studentIds.length) {
    await recordActivity({
      admin,
      level: "warn",
      action: "normalized_test.assign.denied",
      actorUserId: profile.id,
      orgId: profile.org_id,
      message: "Assignation test refusee: selection eleves invalide.",
      metadata: {
        testSlug: parsed.data.testSlug,
      },
    });
    return NextResponse.json({ error: "Selection d eleves invalide." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const rows = studentIds.map((studentId) => ({
    org_id: profile.org_id,
    student_id: studentId,
    coach_id: profile.id,
    test_slug: parsed.data.testSlug,
    status: "assigned",
    assigned_at: now,
    created_at: now,
    updated_at: now,
  }));

  const { error: insertError } = await admin
    .from("normalized_test_assignments")
    .insert(rows);

  if (insertError) {
    await recordActivity({
      admin,
      level: "error",
      action: "normalized_test.assign.failed",
      actorUserId: profile.id,
      orgId: profile.org_id,
      message: insertError.message ?? "Assignation test impossible.",
      metadata: {
        testSlug: parsed.data.testSlug,
        studentCount: rows.length,
      },
    });
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await recordActivity({
    admin,
    action: "normalized_test.assign.success",
    actorUserId: profile.id,
    orgId: profile.org_id,
    message: "Test assigne aux eleves.",
    metadata: {
      testSlug: parsed.data.testSlug,
      studentCount: rows.length,
    },
  });

  return NextResponse.json({ ok: true, count: rows.length });
}
