import { NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { recordActivity } from "@/lib/activity-log";

export async function POST(request: Request) {
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
    .maybeSingle();

  await recordActivity({
    admin,
    action: "auth.logout.success",
    actorUserId: userData.user.id,
    orgId: profile?.active_workspace_id ?? profile?.org_id ?? null,
    entityType: "profile",
    entityId: userData.user.id,
    message: "Deconnexion utilisateur.",
  });

  return NextResponse.json({ ok: true });
}
