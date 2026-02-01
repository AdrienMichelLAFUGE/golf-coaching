import { NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const email = userData.user.email?.toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Email introuvable." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: invitations, error } = await admin
    .from("org_invitations")
    .select("id, org_id, email, role, status, created_at, expires_at, token, organizations(name, workspace_type)")
    .ilike("email", email)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ invitations: invitations ?? [] });
}
