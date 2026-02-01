import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";

const createOrgSchema = z.object({
  name: z.string().min(2).max(80),
});

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, createOrgSchema);
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

  const admin = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, org_id")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profil introuvable." }, { status: 403 });
  }

  if (!profile.org_id) {
    return NextResponse.json({ error: "Organisation introuvable." }, { status: 403 });
  }

  const { data: workspace, error: workspaceError } = await admin
    .from("organizations")
    .select("id, ai_enabled")
    .eq("id", profile.org_id)
    .single();

  if (workspaceError || !workspace) {
    return NextResponse.json({ error: "Organisation introuvable." }, { status: 403 });
  }

  if (!workspace.ai_enabled) {
    return NextResponse.json(
      { error: "Premium requis pour creer une organisation." },
      { status: 403 }
    );
  }

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert([
      {
        name: parsed.data.name.trim(),
        workspace_type: "org",
        ai_enabled: workspace.ai_enabled,
      },
    ])
    .select("id")
    .single();

  if (orgError || !org) {
    return NextResponse.json(
      { error: orgError?.message ?? "Creation impossible." },
      { status: 400 }
    );
  }

  const { error: membershipError } = await admin.from("org_memberships").insert([
    {
      org_id: org.id,
      user_id: profile.id,
      role: "admin",
      status: "active",
      premium_active: true,
    },
  ]);

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, orgId: org.id });
}
