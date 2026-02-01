import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";

const switchSchema = z.object({
  workspaceId: z.string().uuid(),
});

const mapMembershipRoleToProfileRole = (role: "admin" | "coach") =>
  role === "admin" ? "owner" : "coach";

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, switchSchema);
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

  const userId = userData.user.id;
  const { workspaceId } = parsed.data;

  const admin = createSupabaseAdminClient();
  const { data: workspace, error: workspaceError } = await admin
    .from("organizations")
    .select("id, workspace_type, owner_profile_id")
    .eq("id", workspaceId)
    .single();

  if (workspaceError || !workspace) {
    return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  }

  let nextRole: "owner" | "coach" = "coach";
  if (workspace.workspace_type === "personal") {
    if (workspace.owner_profile_id !== userId) {
      return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
    }
    nextRole = "owner";
  } else {
    const { data: membership } = await admin
      .from("org_memberships")
      .select("role, status")
      .eq("org_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership || membership.status !== "active") {
      return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
    }
    nextRole = mapMembershipRoleToProfileRole(membership.role as "admin" | "coach");
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({ org_id: workspaceId, active_workspace_id: workspaceId, role: nextRole })
    .eq("id", userId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
