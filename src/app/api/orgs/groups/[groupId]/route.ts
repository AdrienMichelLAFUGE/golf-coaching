import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { loadPersonalPlanTier } from "@/lib/plan-access";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().or(z.literal("")),
});

type Params = { params: { groupId: string } | Promise<{ groupId: string }> };

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

const buildMembershipError = () => NextResponse.json({ error: "Acces refuse." }, { status: 403 });

const loadContext = async (request: Request) => {
  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, org_id")
    .eq("id", userData.user.id)
    .single();

  if (!profile?.org_id) {
    return {
      error: NextResponse.json({ error: "Organisation introuvable." }, { status: 403 }),
    };
  }

  const { data: membership } = await admin
    .from("org_memberships")
    .select("role, status")
    .eq("org_id", profile.org_id)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (!membership || membership.status !== "active") {
    return { error: buildMembershipError() };
  }

  return { admin, profile, membership };
};

const ensureWriteAccess = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  profileId: string,
  role: string
) => {
  if (role === "admin") return null;
  const planTier = await loadPersonalPlanTier(admin, profileId);
  if (planTier === "free") {
    return NextResponse.json(
      { error: "Plan Pro requis pour gerer les groupes." },
      { status: 403 }
    );
  }
  return null;
};

export async function GET(request: Request, { params }: Params) {
  const { groupId } = await params;
  const context = await loadContext(request);
  if (context.error) return context.error;

  const { admin, profile } = context;
  const { data: group, error: groupError } = await admin
    .from("org_groups")
    .select("id, name, description, created_at")
    .eq("org_id", profile.org_id)
    .eq("id", groupId)
    .maybeSingle();

  if (groupError) {
    return NextResponse.json({ error: groupError.message }, { status: 400 });
  }
  if (!group) {
    return NextResponse.json({ error: "Groupe introuvable." }, { status: 404 });
  }

  const { data: students } = await admin
    .from("students")
    .select("id, first_name, last_name")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: true });

  const { data: coaches } = await admin
    .from("org_memberships")
    .select("user_id, role, status, profiles!org_memberships_user_id_fkey(full_name)")
    .eq("org_id", profile.org_id)
    .eq("status", "active")
    .in("role", ["admin", "coach"]);

  const { data: groupStudents } = await admin
    .from("org_group_students")
    .select("student_id")
    .eq("group_id", group.id);

  const { data: groupCoaches } = await admin
    .from("org_group_coaches")
    .select("coach_id")
    .eq("group_id", group.id);

  const selectedStudentIds = (groupStudents ?? []).map(
    (row) => (row as { student_id: string }).student_id
  );
  const selectedCoachIds = (groupCoaches ?? []).map(
    (row) => (row as { coach_id: string }).coach_id
  );

  const coachRows = (coaches ?? []).map((row) => {
    const typed = row as {
      user_id: string;
      role: string;
      profiles?: { full_name: string | null }[] | { full_name: string | null } | null;
    };
    const profileEntry = Array.isArray(typed.profiles) ? typed.profiles[0] : typed.profiles;
    return {
      id: typed.user_id,
      name: profileEntry?.full_name ?? "Coach",
      role: typed.role,
    };
  });

  return NextResponse.json({
    group: group as GroupRow,
    students: students ?? [],
    coaches: coachRows,
    selectedStudentIds,
    selectedCoachIds,
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const { groupId } = await params;
  const parsed = await parseRequestJson(request, updateSchema);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }

  const context = await loadContext(request);
  if (context.error) return context.error;

  const { admin, profile, membership } = context;
  const permissionError = await ensureWriteAccess(admin, profile.id, membership.role);
  if (permissionError) return permissionError;

  const payload: Record<string, string | null> = {};
  if (typeof parsed.data.name !== "undefined") {
    payload.name = parsed.data.name.trim();
  }
  if (typeof parsed.data.description !== "undefined") {
    payload.description = parsed.data.description?.trim() || null;
  }

  if (!Object.keys(payload).length) {
    return NextResponse.json({ error: "Aucune mise a jour." }, { status: 400 });
  }

  const { error: updateError } = await admin
    .from("org_groups")
    .update(payload)
    .eq("org_id", profile.org_id)
    .eq("id", groupId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: Params) {
  const { groupId } = await params;
  const context = await loadContext(request);
  if (context.error) return context.error;

  const { admin, profile, membership } = context;
  const permissionError = await ensureWriteAccess(admin, profile.id, membership.role);
  if (permissionError) return permissionError;

  const { error: deleteError } = await admin
    .from("org_groups")
    .delete()
    .eq("org_id", profile.org_id)
    .eq("id", groupId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
