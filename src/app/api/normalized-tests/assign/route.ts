import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { PELZ_PUTTING_SLUG } from "@/lib/normalized-tests/pelz-putting";
import { isAdminEmail } from "@/lib/admin";

export const runtime = "nodejs";

const assignSchema = z.object({
  testSlug: z.literal(PELZ_PUTTING_SLUG),
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
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const { data: orgData, error: orgError } = await admin
    .from("organizations")
    .select("coaching_dynamic_enabled")
    .eq("id", profile.org_id)
    .single();

  const isAdmin = isAdminEmail(userEmail);

  if (!isAdmin && (orgError || !orgData?.coaching_dynamic_enabled)) {
    return NextResponse.json(
      { error: "Add-on Coaching dynamique requis." },
      { status: 403 }
    );
  }

  const studentIds = Array.from(new Set(parsed.data.studentIds.map((id) => id.trim())));

  const { data: students, error: studentError } = await admin
    .from("students")
    .select("id")
    .in("id", studentIds)
    .eq("org_id", profile.org_id);

  if (studentError) {
    return NextResponse.json({ error: studentError.message }, { status: 500 });
  }

  if ((students ?? []).length !== studentIds.length) {
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
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: rows.length });
}
