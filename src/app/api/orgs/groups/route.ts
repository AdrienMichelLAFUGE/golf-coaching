import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { loadPersonalPlanTier } from "@/lib/plan-access";

const groupSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().or(z.literal("")),
});

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

const buildMembershipError = () => NextResponse.json({ error: "Acces refuse." }, { status: 403 });

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

  if (!membership || membership.status !== "active") {
    return buildMembershipError();
  }

  const { data: groups, error: groupsError } = await admin
    .from("org_groups")
    .select("id, name, description, created_at")
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
      return NextResponse.json(
        { error: "Plan Pro requis pour gerer les groupes." },
        { status: 403 }
      );
    }
  }

  const { data: group, error: insertError } = await admin
    .from("org_groups")
    .insert([
      {
        org_id: profile.org_id,
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim() || null,
        created_by: profile.id,
      },
    ])
    .select("id")
    .single();

  if (insertError || !group) {
    return NextResponse.json(
      { error: insertError?.message ?? "Creation impossible." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, groupId: group.id });
}
