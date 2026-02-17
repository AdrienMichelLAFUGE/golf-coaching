import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { recordActivity } from "@/lib/activity-log";

const updateOrgSettingsSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

type Context = {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  profileId: string;
  orgId: string;
  role: "admin" | "coach";
  organization: {
    id: string;
    name: string | null;
    workspace_type: "personal" | "org";
    plan_tier: string | null;
  };
};

const loadContext = async (request: Request): Promise<{ context?: Context; error?: Response }> => {
  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }

  const admin = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, org_id, active_workspace_id")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile?.id) {
    return { error: NextResponse.json({ error: "Profil introuvable." }, { status: 403 }) };
  }

  const activeOrgId = profile.active_workspace_id ?? profile.org_id;
  if (!activeOrgId) {
    return { error: NextResponse.json({ error: "Organisation introuvable." }, { status: 403 }) };
  }

  const { data: organization, error: orgError } = await admin
    .from("organizations")
    .select("id, name, workspace_type, plan_tier")
    .eq("id", activeOrgId)
    .maybeSingle();

  if (orgError || !organization) {
    return { error: NextResponse.json({ error: "Organisation introuvable." }, { status: 403 }) };
  }

  if (organization.workspace_type !== "org") {
    return {
      error: NextResponse.json(
        { error: "Disponible uniquement en workspace organisation." },
        { status: 403 }
      ),
    };
  }

  const { data: membership } = await admin
    .from("org_memberships")
    .select("role, status")
    .eq("org_id", organization.id)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (!membership || membership.status !== "active") {
    return { error: NextResponse.json({ error: "Acces refuse." }, { status: 403 }) };
  }

  return {
    context: {
      admin,
      profileId: profile.id,
      orgId: organization.id,
      role: membership.role,
      organization,
    },
  };
};

export async function GET(request: Request) {
  const loaded = await loadContext(request);
  if (loaded.error) return loaded.error;

  const { organization, role } = loaded.context!;
  return NextResponse.json({
    organization: {
      id: organization.id,
      name: organization.name,
      workspaceType: organization.workspace_type,
      planTier: organization.plan_tier,
    },
    canEdit: role === "admin",
  });
}

export async function PATCH(request: Request) {
  const parsed = await parseRequestJson(request, updateOrgSettingsSchema);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }

  const loaded = await loadContext(request);
  if (loaded.error) return loaded.error;
  const { context } = loaded;

  if (!context || context.role !== "admin") {
    await recordActivity({
      admin: context?.admin,
      level: "warn",
      action: "organization.settings.update.denied",
      actorUserId: context?.profileId,
      orgId: context?.orgId,
      message: "Modification des reglages organisation refusee: droits insuffisants.",
    });
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const nextName = parsed.data.name.trim();
  const { error: updateError } = await context.admin
    .from("organizations")
    .update({ name: nextName })
    .eq("id", context.orgId);

  if (updateError) {
    await recordActivity({
      admin: context.admin,
      level: "error",
      action: "organization.settings.update.failed",
      actorUserId: context.profileId,
      orgId: context.orgId,
      message: updateError.message ?? "Mise a jour du nom de l organisation impossible.",
    });
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  await recordActivity({
    admin: context.admin,
    action: "organization.settings.update.success",
    actorUserId: context.profileId,
    orgId: context.orgId,
    entityType: "organization",
    entityId: context.orgId,
    message: "Nom de l organisation mis a jour.",
  });

  return NextResponse.json({ ok: true, name: nextName });
}
