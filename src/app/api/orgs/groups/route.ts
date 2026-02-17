import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { loadPersonalPlanTier } from "@/lib/plan-access";
import { recordActivity } from "@/lib/activity-log";
import {
  ORG_GROUP_COLOR_TOKENS,
  ORG_GROUP_DEFAULT_COLOR,
  type OrgGroupColorToken,
} from "@/lib/org-groups";

const groupSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional().or(z.literal("")),
  parentGroupId: z.string().uuid().optional().nullable().or(z.literal("")),
  colorToken: z.enum(ORG_GROUP_COLOR_TOKENS).optional().nullable(),
});

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  parent_group_id: string | null;
  color_token: OrgGroupColorToken | null;
  created_at: string;
};

const buildMembershipError = () => NextResponse.json({ error: "Acces refuse." }, { status: 403 });

const normalizeParentGroupId = (value?: string | null): string | null => {
  if (!value) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
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
    .select("id, org_id")
    .eq("id", userData.user.id)
    .single();

  if (!profile?.org_id) {
    await recordActivity({
      admin,
      level: "warn",
      action: "group.create.denied",
      actorUserId: userData.user.id,
      message: "Creation groupe refusee: organisation introuvable.",
    });
    return NextResponse.json({ error: "Organisation introuvable." }, { status: 403 });
  }

  const { data: membership } = await admin
    .from("org_memberships")
    .select("role, status")
    .eq("org_id", profile.org_id)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (!membership || membership.status !== "active") {
    await recordActivity({
      admin,
      level: "warn",
      action: "group.create.denied",
      actorUserId: profile.id,
      orgId: profile.org_id,
      message: "Creation groupe refusee: membre inactif ou absent.",
    });
    return buildMembershipError();
  }

  const { data: groups, error: groupsError } = await admin
    .from("org_groups")
    .select("id, name, description, parent_group_id, color_token, created_at")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false });

  if (groupsError) {
    return NextResponse.json({ error: groupsError.message }, { status: 400 });
  }

  const baseGroups = (groups ?? []) as GroupRow[];
  if (baseGroups.length === 0) {
    return NextResponse.json({ groups: [] });
  }

  const groupIds = baseGroups.map((group) => group.id);

  const { data: studentRows } = await admin
    .from("org_group_students")
    .select("group_id")
    .in("group_id", groupIds);

  const { data: coachRows } = await admin
    .from("org_group_coaches")
    .select("group_id")
    .in("group_id", groupIds);

  const studentCountByGroup = new Map<string, number>();
  (studentRows ?? []).forEach((row) => {
    const key = (row as { group_id: string }).group_id;
    studentCountByGroup.set(key, (studentCountByGroup.get(key) ?? 0) + 1);
  });

  const coachCountByGroup = new Map<string, number>();
  (coachRows ?? []).forEach((row) => {
    const key = (row as { group_id: string }).group_id;
    coachCountByGroup.set(key, (coachCountByGroup.get(key) ?? 0) + 1);
  });

  const payload = baseGroups.map((group) => ({
    ...group,
    studentCount: studentCountByGroup.get(group.id) ?? 0,
    coachCount: coachCountByGroup.get(group.id) ?? 0,
  }));

  return NextResponse.json({ groups: payload });
}

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, groupSchema);
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

  if (!membership || membership.status !== "active") {
    return buildMembershipError();
  }

  const isAdmin = membership.role === "admin";
  if (!isAdmin) {
    const planTier = await loadPersonalPlanTier(admin, profile.id);
    if (planTier === "free") {
      await recordActivity({
        admin,
        level: "warn",
        action: "group.create.denied",
        actorUserId: profile.id,
        orgId: profile.org_id,
        message: "Creation groupe refusee: plan Free.",
      });
      return NextResponse.json(
        { error: "Plan Pro requis pour gerer les groupes." },
        { status: 403 }
      );
    }
  }

  const parentGroupId = normalizeParentGroupId(parsed.data.parentGroupId ?? null);
  if (parentGroupId) {
    const { data: parentGroup, error: parentError } = await admin
      .from("org_groups")
      .select("id")
      .eq("org_id", profile.org_id)
      .eq("id", parentGroupId)
      .maybeSingle();

    if (parentError || !parentGroup) {
      await recordActivity({
        admin,
        level: "warn",
        action: "group.create.denied",
        actorUserId: profile.id,
        orgId: profile.org_id,
        message: "Creation sous-groupe refusee: groupe parent introuvable.",
      });
      return NextResponse.json({ error: "Groupe parent introuvable." }, { status: 400 });
    }
  }

  const colorToken: OrgGroupColorToken | null = parentGroupId
    ? null
    : (parsed.data.colorToken ?? ORG_GROUP_DEFAULT_COLOR);

  const { data: group, error: insertError } = await admin
    .from("org_groups")
    .insert([
      {
        org_id: profile.org_id,
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim() || null,
        parent_group_id: parentGroupId,
        color_token: colorToken,
        created_by: profile.id,
      },
    ])
    .select("id")
    .single();

  if (insertError || !group) {
    await recordActivity({
      admin,
      level: "error",
      action: "group.create.failed",
      actorUserId: profile.id,
      orgId: profile.org_id,
      message: insertError?.message ?? "Creation groupe impossible.",
    });
    return NextResponse.json(
      { error: insertError?.message ?? "Creation impossible." },
      { status: 400 }
    );
  }

  await recordActivity({
    admin,
    action: "group.create.success",
    actorUserId: profile.id,
    orgId: profile.org_id,
    entityType: "org_group",
    entityId: group.id,
    message: "Groupe cree.",
  });

  return NextResponse.json({ ok: true, groupId: group.id });
}
