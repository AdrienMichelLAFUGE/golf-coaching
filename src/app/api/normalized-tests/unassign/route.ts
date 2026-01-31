import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { isAdminEmail } from "@/lib/admin";

export const runtime = "nodejs";

const unassignSchema = z.object({
  assignmentId: z.string().uuid(),
});

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, unassignSchema);
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

  const { data: assignment, error: assignmentError } = await admin
    .from("normalized_test_assignments")
    .select("id, org_id, status")
    .eq("id", parsed.data.assignmentId)
    .maybeSingle();

  if (assignmentError) {
    return NextResponse.json({ error: assignmentError.message }, { status: 500 });
  }

  if (!assignment) {
    return NextResponse.json({ error: "Assignation introuvable." }, { status: 404 });
  }

  if (assignment.org_id !== profile.org_id) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  if (assignment.status === "finalized") {
    return NextResponse.json(
      { error: "Assignation finalisee: suppression interdite." },
      { status: 409 }
    );
  }

  const { error: deleteError } = await admin
    .from("normalized_test_assignments")
    .delete()
    .eq("id", parsed.data.assignmentId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
