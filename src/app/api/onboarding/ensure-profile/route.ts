import { NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { defaultSectionTemplates } from "@/lib/default-section-templates";

const ensurePersonalWorkspace = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  name?: string | null
) => {
  const { data: existing } = await admin
    .from("organizations")
    .select("id")
    .eq("workspace_type", "personal")
    .eq("owner_profile_id", userId)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: personalOrg } = await admin
    .from("organizations")
    .insert([
      {
        name: name?.trim() || "Espace personnel",
        workspace_type: "personal",
        owner_profile_id: userId,
      },
    ])
    .select("id")
    .single();

  if (personalOrg?.id) {
    await admin.from("org_memberships").insert([
      {
        org_id: personalOrg.id,
        user_id: userId,
        role: "admin",
        status: "active",
        premium_active: true,
      },
    ]);
  }

  return personalOrg?.id ?? null;
};

const ensureOrgMembership = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  orgId: string,
  userId: string,
  role: "admin" | "coach"
) => {
  const { data: org } = await admin
    .from("organizations")
    .select("workspace_type")
    .eq("id", orgId)
    .maybeSingle();
  if (org?.workspace_type !== "org") return;

  const { data: existing } = await admin
    .from("org_memberships")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing?.id) return;

  await admin.from("org_memberships").insert([
    {
      org_id: orgId,
      user_id: userId,
      role,
      status: "active",
      premium_active: role === "admin",
    },
  ]);
};

export async function POST(request: Request) {
  const supabase = createSupabaseServerClientFromRequest(request);

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const user = userData.user;
  const email = user.email?.trim();
  if (!email) {
    return NextResponse.json({ error: "Email introuvable." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, org_id, full_name, active_workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.id) {
    const personalWorkspaceId = await ensurePersonalWorkspace(
      admin,
      profile.id,
      profile.full_name ?? null
    );
    if (profile.role === "owner" || profile.role === "coach") {
      if (profile.org_id) {
        const role = profile.role === "owner" ? "admin" : "coach";
        await ensureOrgMembership(admin, profile.org_id, profile.id, role);
      }
      if (personalWorkspaceId && profile.active_workspace_id !== personalWorkspaceId) {
        await admin
          .from("profiles")
          .update({
            org_id: personalWorkspaceId,
            active_workspace_id: personalWorkspaceId,
          })
          .eq("id", profile.id);
      }
    } else if (!profile.active_workspace_id && profile.org_id) {
      await admin
        .from("profiles")
        .update({ active_workspace_id: profile.org_id })
        .eq("id", profile.id);
    }
    return NextResponse.json({ ok: true, role: profile.role });
  }

  const { data: student } = await admin
    .from("students")
    .select("id, org_id, first_name, last_name")
    .ilike("email", email)
    .maybeSingle();

  if (student?.id && student.org_id) {
    const fullName = `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim();
    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: user.id,
        org_id: student.org_id,
        role: "student",
        full_name: fullName || null,
        active_workspace_id: student.org_id,
      },
      { onConflict: "id" }
    );

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    await ensurePersonalWorkspace(admin, user.id, fullName || null);
    return NextResponse.json({ ok: true, role: "student" });
  }

  const roleHint = String(user.user_metadata?.role ?? "").toLowerCase();
  if (roleHint !== "coach" && roleHint !== "owner") {
    return NextResponse.json(
      { error: "Acces reserve aux comptes invites." },
      { status: 403 }
    );
  }

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert([{ name: "Nouvelle organisation" }])
    .select("id")
    .single();

  if (orgError || !org) {
    return NextResponse.json(
      { error: orgError?.message ?? "Creation organisation impossible." },
      { status: 400 }
    );
  }

  const fullName = String(user.user_metadata?.full_name ?? "").trim();
  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: user.id,
      org_id: org.id,
      role: "owner",
      full_name: fullName || null,
    },
    { onConflict: "id" }
  );

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  await ensureOrgMembership(admin, org.id, user.id, "admin");
  const personalWorkspaceId = await ensurePersonalWorkspace(
    admin,
    user.id,
    fullName || null
  );
  if (personalWorkspaceId) {
    await admin
      .from("profiles")
      .update({
        org_id: personalWorkspaceId,
        active_workspace_id: personalWorkspaceId,
      })
      .eq("id", user.id);
  }

  const templatesPayload = defaultSectionTemplates.map((template) => ({
    org_id: org.id,
    title: template.title,
    type: template.type,
    tags: template.tags,
  }));
  const { error: templatesError } = await admin
    .from("section_templates")
    .upsert(templatesPayload, { onConflict: "org_id,title" });

  if (templatesError) {
    const { error: fallbackError } = await admin.from("section_templates").upsert(
      defaultSectionTemplates.map((template) => ({
        org_id: org.id,
        title: template.title,
        type: template.type,
      })),
      { onConflict: "org_id,title" }
    );

    if (fallbackError) {
      return NextResponse.json({ error: fallbackError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true, role: "owner" });
}
