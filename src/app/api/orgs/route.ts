import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { loadPersonalPlanTier } from "@/lib/plan-access";
import { recordActivity } from "@/lib/activity-log";

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
    await recordActivity({
      admin,
      level: "warn",
      action: "organization.create.denied",
      actorUserId: profile.id,
      message: "Creation organisation refusee: organisation active introuvable.",
    });
    return NextResponse.json({ error: "Organisation introuvable." }, { status: 403 });
  }

  const planTier = await loadPersonalPlanTier(admin, profile.id);
  if (planTier === "free") {
    await recordActivity({
      admin,
      level: "warn",
      action: "organization.create.denied",
      actorUserId: profile.id,
      orgId: profile.org_id,
      message: "Creation organisation refusee: plan Free.",
    });
    return NextResponse.json(
      { error: "Plan Free: creation d organisation indisponible." },
      { status: 403 }
    );
  }

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert([
      {
        name: parsed.data.name.trim(),
        workspace_type: "org",
        plan_tier: "free",
      },
    ])
    .select("id")
    .single();

  if (orgError || !org) {
    await recordActivity({
      admin,
      level: "error",
      action: "organization.create.failed",
      actorUserId: profile.id,
      orgId: profile.org_id,
      message: orgError?.message ?? "Creation organisation impossible.",
    });
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
    await recordActivity({
      admin,
      level: "error",
      action: "organization.create.failed",
      actorUserId: profile.id,
      orgId: org.id,
      message: membershipError.message ?? "Creation membership admin impossible.",
    });
    return NextResponse.json({ error: membershipError.message }, { status: 400 });
  }

  await recordActivity({
    admin,
    action: "organization.create.success",
    actorUserId: profile.id,
    orgId: org.id,
    entityType: "organization",
    entityId: org.id,
    message: "Organisation creee.",
  });

  return NextResponse.json({ ok: true, orgId: org.id });
}
