import { NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { loadPersonalPlanTier } from "@/lib/plan-access";

export async function GET(request: Request) {
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
    .select("status")
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

  const { data: members } = await admin
    .from("org_memberships")
    .select(
      "user_id, role, status, profiles!org_memberships_user_id_fkey(full_name)"
    )
    .eq("org_id", profile.org_id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  return NextResponse.json({ members: members ?? [] });
}
