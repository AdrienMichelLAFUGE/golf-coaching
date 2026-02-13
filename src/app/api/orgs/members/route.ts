import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { recordActivity } from "@/lib/activity-log";

const updateSchema = z.object({
  memberId: z.string().uuid(),
  status: z.enum(["invited", "active", "disabled"]).optional(),
  premium_active: z.boolean().optional(),
  role: z.enum(["admin", "coach"]).optional(),
});

const deleteSchema = z.object({
  memberId: z.string().uuid(),
});

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
    .select("role, status")
    .eq("org_id", profile.org_id)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (!membership || membership.status !== "active" || membership.role !== "admin") {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { data: members } = await admin
    .from("org_memberships")
    .select(
      "id, org_id, user_id, role, status, premium_active, profiles!org_memberships_user_id_fkey(full_name)"
    )
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: true });

  const { data: invites } = await admin
    .from("org_invitations")
    .select("id, email, role, status, created_at, expires_at, token")
    .eq("org_id", profile.org_id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return NextResponse.json({ members: members ?? [], invitations: invites ?? [] });
}

export async function PATCH(request: Request) {
  const parsed = await parseRequestJson(request, updateSchema);
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
    .select("role, status")
    .eq("org_id", profile.org_id)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (!membership || membership.status !== "active" || membership.role !== "admin") {
    await recordActivity({
      admin,
      level: "warn",
      action: "organization.member.update.denied",
      actorUserId: profile.id,
      orgId: profile.org_id,
      message: "Modification membre refusee: droits insuffisants.",
    });
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const updatePayload: Record<string, unknown> = {};
  if (typeof parsed.data.status !== "undefined")
    updatePayload.status = parsed.data.status;
  if (typeof parsed.data.premium_active !== "undefined") {
    updatePayload.premium_active = parsed.data.premium_active;
  }
  if (typeof parsed.data.role !== "undefined") updatePayload.role = parsed.data.role;

  if (!Object.keys(updatePayload).length) {
    return NextResponse.json({ error: "Aucune mise a jour." }, { status: 400 });
  }

  const { data: currentMember } = await admin
    .from("org_memberships")
    .select("id, role, status, premium_active")
    .eq("id", parsed.data.memberId)
    .eq("org_id", profile.org_id)
    .maybeSingle();

  if (!currentMember) {
    await recordActivity({
      admin,
      level: "warn",
      action: "organization.member.update.denied",
      actorUserId: profile.id,
      orgId: profile.org_id,
      entityType: "org_membership",
      entityId: parsed.data.memberId,
      message: "Modification membre refusee: membre introuvable.",
    });
    return NextResponse.json({ error: "Membre introuvable." }, { status: 404 });
  }

  const nextRole = (parsed.data.role ?? currentMember.role) as "admin" | "coach";
  const nextStatus = (parsed.data.status ?? currentMember.status) as
    | "invited"
    | "active"
    | "disabled";
  const nextPremium =
    typeof parsed.data.premium_active !== "undefined"
      ? parsed.data.premium_active
      : currentMember.premium_active;

  if (nextRole === "admin" && nextStatus === "active") {
    if (!nextPremium) {
      await recordActivity({
        admin,
        level: "warn",
        action: "organization.member.update.denied",
        actorUserId: profile.id,
        orgId: profile.org_id,
        entityType: "org_membership",
        entityId: parsed.data.memberId,
        message: "Modification membre refusee: admin sans premium.",
      });
      return NextResponse.json({ error: "Un admin doit etre premium." }, { status: 400 });
    }
    const { data: activeAdmins } = await admin
      .from("org_memberships")
      .select("id")
      .eq("org_id", profile.org_id)
      .eq("role", "admin")
      .eq("status", "active");
    const otherAdmin = (activeAdmins ?? []).some(
      (row) => (row as { id: string }).id !== currentMember.id
    );
    if (otherAdmin) {
      await recordActivity({
        admin,
        level: "warn",
        action: "organization.member.update.denied",
        actorUserId: profile.id,
        orgId: profile.org_id,
        entityType: "org_membership",
        entityId: parsed.data.memberId,
        message: "Modification membre refusee: un admin actif existe deja.",
      });
      return NextResponse.json({ error: "Un admin actif existe deja." }, { status: 409 });
    }
  }

  const { error: updateError } = await admin
    .from("org_memberships")
    .update(updatePayload)
    .eq("id", parsed.data.memberId)
    .eq("org_id", profile.org_id);

  if (updateError) {
    await recordActivity({
      admin,
      level: "error",
      action: "organization.member.update.failed",
      actorUserId: profile.id,
      orgId: profile.org_id,
      entityType: "org_membership",
      entityId: parsed.data.memberId,
      message: updateError.message ?? "Modification membre impossible.",
    });
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  await recordActivity({
    admin,
    action: "organization.member.update.success",
    actorUserId: profile.id,
    orgId: profile.org_id,
    entityType: "org_membership",
    entityId: parsed.data.memberId,
    message: "Membre organisation modifie.",
    metadata: {
      status: parsed.data.status ?? null,
      premiumActive:
        typeof parsed.data.premium_active === "boolean"
          ? parsed.data.premium_active
          : null,
      role: parsed.data.role ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const parsed = await parseRequestJson(request, deleteSchema);
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
    .select("role, status")
    .eq("org_id", profile.org_id)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (!membership || membership.status !== "active" || membership.role !== "admin") {
    await recordActivity({
      admin,
      level: "warn",
      action: "organization.member.delete.denied",
      actorUserId: profile.id,
      orgId: profile.org_id,
      message: "Suppression membre refusee: droits insuffisants.",
    });
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { data: target } = await admin
    .from("org_memberships")
    .select("id, org_id, user_id, role")
    .eq("id", parsed.data.memberId)
    .eq("org_id", profile.org_id)
    .maybeSingle();

  if (!target) {
    await recordActivity({
      admin,
      level: "warn",
      action: "organization.member.delete.denied",
      actorUserId: profile.id,
      orgId: profile.org_id,
      entityType: "org_membership",
      entityId: parsed.data.memberId,
      message: "Suppression membre refusee: membre introuvable.",
    });
    return NextResponse.json({ error: "Membre introuvable." }, { status: 404 });
  }

  if (target.user_id === profile.id) {
    await recordActivity({
      admin,
      level: "warn",
      action: "organization.member.delete.denied",
      actorUserId: profile.id,
      orgId: profile.org_id,
      entityType: "org_membership",
      entityId: parsed.data.memberId,
      message: "Suppression membre refusee: auto suppression.",
    });
    return NextResponse.json({ error: "Impossible de vous retirer." }, { status: 400 });
  }

  if (target.role === "admin") {
    await recordActivity({
      admin,
      level: "warn",
      action: "organization.member.delete.denied",
      actorUserId: profile.id,
      orgId: profile.org_id,
      entityType: "org_membership",
      entityId: parsed.data.memberId,
      message: "Suppression membre refusee: membre admin.",
    });
    return NextResponse.json(
      { error: "Impossible de retirer un admin." },
      { status: 400 }
    );
  }

  const { error: deleteError } = await admin
    .from("org_memberships")
    .delete()
    .eq("id", parsed.data.memberId)
    .eq("org_id", profile.org_id);

  if (deleteError) {
    await recordActivity({
      admin,
      level: "error",
      action: "organization.member.delete.failed",
      actorUserId: profile.id,
      orgId: profile.org_id,
      entityType: "org_membership",
      entityId: parsed.data.memberId,
      message: deleteError.message ?? "Suppression membre impossible.",
    });
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  const { data: targetProfile } = await admin
    .from("profiles")
    .select("id, org_id, active_workspace_id")
    .eq("id", target.user_id)
    .single();

  if (
    targetProfile?.active_workspace_id &&
    targetProfile.active_workspace_id === profile.org_id
  ) {
    const nextWorkspaceId = targetProfile.org_id ?? null;
    await admin
      .from("profiles")
      .update({ active_workspace_id: nextWorkspaceId })
      .eq("id", targetProfile.id);
  }

  await recordActivity({
    admin,
    action: "organization.member.delete.success",
    actorUserId: profile.id,
    orgId: profile.org_id,
    entityType: "org_membership",
    entityId: parsed.data.memberId,
    message: "Membre organisation retire.",
  });

  return NextResponse.json({ ok: true });
}
