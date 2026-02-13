import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { isAdminEmail } from "@/lib/admin";
import { PLAN_ENTITLEMENTS } from "@/lib/plans";
import { loadPersonalPlanTier } from "@/lib/plan-access";
import { PELZ_PUTTING_SLUG } from "@/lib/normalized-tests/pelz-putting";
import { PELZ_APPROCHES_SLUG } from "@/lib/normalized-tests/pelz-approches";
import { recordActivity } from "@/lib/activity-log";

export const runtime = "nodejs";

const isPelzSlug = (
  slug: string | null | undefined
): slug is typeof PELZ_PUTTING_SLUG | typeof PELZ_APPROCHES_SLUG =>
  slug === PELZ_PUTTING_SLUG || slug === PELZ_APPROCHES_SLUG;

const archiveSchema = z.object({
  assignmentId: z.string().uuid(),
  archived: z.boolean().optional(),
});

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, archiveSchema);
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
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const isAdmin = isAdminEmail(userEmail);

  const { data: assignment, error: assignmentError } = await admin
    .from("normalized_test_assignments")
    .select("id, org_id, test_slug")
    .eq("id", parsed.data.assignmentId)
    .maybeSingle();

  if (assignmentError) {
    await recordActivity({
      admin,
      level: "error",
      action: "normalized_test.archive.failed",
      actorUserId: profile.id,
      orgId: profile.org_id,
      message: assignmentError.message ?? "Lecture assignation impossible.",
      metadata: { assignmentId: parsed.data.assignmentId },
    });
    return NextResponse.json({ error: assignmentError.message }, { status: 500 });
  }

  if (!assignment) {
    await recordActivity({
      admin,
      level: "warn",
      action: "normalized_test.archive.denied",
      actorUserId: profile.id,
      orgId: profile.org_id,
      message: "Archive refusee: assignation introuvable.",
      metadata: { assignmentId: parsed.data.assignmentId },
    });
    return NextResponse.json({ error: "Assignation introuvable." }, { status: 404 });
  }

  if (assignment.org_id !== profile.org_id) {
    await recordActivity({
      admin,
      level: "warn",
      action: "normalized_test.archive.denied",
      actorUserId: profile.id,
      orgId: profile.org_id,
      message: "Archive refusee: assignation hors organisation.",
      metadata: { assignmentId: parsed.data.assignmentId },
    });
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  if (!isAdmin) {
    const planTier = await loadPersonalPlanTier(admin, profile.id);
    const testAccess = PLAN_ENTITLEMENTS[planTier].tests;
    if (testAccess.scope === "pelz" && !isPelzSlug(assignment.test_slug)) {
      await recordActivity({
        admin,
        level: "warn",
        action: "normalized_test.archive.denied",
        actorUserId: profile.id,
        orgId: profile.org_id,
        message: "Archive refusee: entitlement test insuffisant.",
        metadata: { assignmentId: parsed.data.assignmentId, testSlug: assignment.test_slug },
      });
      return NextResponse.json({ error: "Plan Pro requis pour ce test." }, { status: 403 });
    }
  }

  const shouldArchive = parsed.data.archived !== false;
  const { error: updateError } = await admin
    .from("normalized_test_assignments")
    .update({ archived_at: shouldArchive ? new Date().toISOString() : null })
    .eq("id", parsed.data.assignmentId);

  if (updateError) {
    await recordActivity({
      admin,
      level: "error",
      action: "normalized_test.archive.failed",
      actorUserId: profile.id,
      orgId: profile.org_id,
      message: updateError.message ?? "Archive assignation impossible.",
      metadata: { assignmentId: parsed.data.assignmentId, testSlug: assignment.test_slug },
    });
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await recordActivity({
    admin,
    action: "normalized_test.archive.success",
    actorUserId: profile.id,
    orgId: profile.org_id,
    message: shouldArchive ? "Assignation test archivee." : "Assignation test restauree.",
    metadata: {
      assignmentId: parsed.data.assignmentId,
      testSlug: assignment.test_slug,
      archived: shouldArchive,
    },
  });

  return NextResponse.json({ ok: true });
}
