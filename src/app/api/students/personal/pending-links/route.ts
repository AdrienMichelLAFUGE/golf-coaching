import { NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";

type PendingLinkRow = {
  id: string;
  created_at: string;
  requested_first_name: string | null;
  requested_last_name: string | null;
  student_email: string | null;
  requested_playing_hand: "right" | "left" | null;
};

export async function GET(request: Request) {
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

  if (!profile) {
    return NextResponse.json({ error: "Profil introuvable." }, { status: 403 });
  }

  const targetOrgId =
    (profile as { active_workspace_id?: string | null }).active_workspace_id ??
    (profile as { org_id?: string | null }).org_id ??
    null;
  if (!targetOrgId) {
    return NextResponse.json({ error: "Workspace introuvable." }, { status: 403 });
  }

  const { data: workspace } = await admin
    .from("organizations")
    .select("id, workspace_type, owner_profile_id")
    .eq("id", targetOrgId)
    .maybeSingle();

  if (!workspace || workspace.workspace_type !== "personal") {
    return NextResponse.json(
      { error: "Endpoint disponible uniquement en workspace personnel." },
      { status: 403 }
    );
  }

  if (workspace.owner_profile_id !== profile.id) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { data: rows, error: rowsError } = await admin
    .from("personal_student_link_requests")
    .select(
      "id, created_at, requested_first_name, requested_last_name, student_email, requested_playing_hand"
    )
    .eq("requester_user_id", profile.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (rowsError) {
    return NextResponse.json({ error: rowsError.message }, { status: 400 });
  }

  const requests = ((rows ?? []) as PendingLinkRow[]).map((row) => ({
    proposal_id: row.id,
    created_at: row.created_at,
    first_name: row.requested_first_name?.trim() || "Eleve",
    last_name: row.requested_last_name?.trim() || null,
    email: row.student_email?.trim() || null,
    playing_hand: row.requested_playing_hand ?? null,
  }));

  return NextResponse.json({ requests });
}
