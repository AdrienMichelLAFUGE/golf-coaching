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

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional().or(z.literal("")),
  parentGroupId: z.string().uuid().optional().nullable().or(z.literal("")),
  colorToken: z.enum(ORG_GROUP_COLOR_TOKENS).optional().nullable(),
});

type Params = { params: { groupId: string } | Promise<{ groupId: string }> };

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  parent_group_id: string | null;
  color_token: OrgGroupColorToken | null;
  created_at: string;
};

type GroupSummaryRow = {
  id: string;
  name: string;
  parent_group_id: string | null;
  color_token: OrgGroupColorToken | null;
  created_at: string;
};

const buildMembershipError = () => NextResponse.json({ error: "Acces refuse." }, { status: 403 });

const normalizeParentGroupId = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const ensureParentNotCircular = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  orgId: string,
  groupId: string,
  candidateParentId: string
) => {
  if (groupId === candidateParentId) {
    return "Un groupe ne peut pas etre son propre parent.";
  }

  const { data: parentGroup, error: parentError } = await admin
    .from("org_groups")
    .select("id, parent_group_id")
    .eq("org_id", orgId)
    .eq("id", candidateParentId)
    .maybeSingle();

  if (parentError || !parentGroup) {
    return "Groupe parent introuvable.";
  }

  const visited = new Set<string>([candidateParentId]);
  let cursor = (parentGroup as { parent_group_id: string | null }).parent_group_id;
  let safety = 0;

  while (cursor && safety < 32) {
    if (cursor === groupId) {
      return "Le parent selectionne cree une boucle dans la hierarchie.";
    }
    if (visited.has(cursor)) {
      return "Hierarchie invalide detectee.";
    }
    visited.add(cursor);

    const { data: nextParent, error: nextError } = await admin
      .from("org_groups")
      .select("parent_group_id")
      .eq("org_id", orgId)
      .eq("id", cursor)
      .maybeSingle();

    if (nextError || !nextParent) {
      break;
    }
    cursor = (nextParent as { parent_group_id: string | null }).parent_group_id;
    safety += 1;
  }

  return null;
};

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

const collectDescendantGroupIds = (
  groups: GroupSummaryRow[],
  rootGroupId: string
): string[] => {
  const childrenByParent = new Map<string, string[]>();
  groups.forEach((group) => {
    if (!group.parent_group_id) return;
    const siblings = childrenByParent.get(group.parent_group_id) ?? [];
    siblings.push(group.id);
    childrenByParent.set(group.parent_group_id, siblings);
  });

  const collected = new Set<string>();
  const stack = [...(childrenByParent.get(rootGroupId) ?? [])];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || collected.has(current)) continue;
    collected.add(current);
    const children = childrenByParent.get(current) ?? [];
    children.forEach((childId) => stack.push(childId));
  }

  return Array.from(collected);
};

export async function GET(request: Request, { params }: Params) {
  const { groupId } = await params;
  const context = await loadContext(request);
  if (context.error) return context.error;

  const { admin, profile } = context;
  const { data: group, error: groupError } = await admin
    .from("org_groups")
    .select("id, name, description, parent_group_id, color_token, created_at")
    .eq("org_id", profile.org_id)
    .eq("id", groupId)
    .maybeSingle();

  if (groupError) {
    return NextResponse.json({ error: groupError.message }, { status: 400 });
  }
  if (!group) {
    return NextResponse.json({ error: "Groupe introuvable." }, { status: 404 });
  }

  const { data: allGroups } = await admin
    .from("org_groups")
    .select("id, name, parent_group_id, color_token, created_at")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: true });

  const allGroupRows = (allGroups ?? []) as GroupSummaryRow[];

  const parentGroupId = (group as GroupRow).parent_group_id;
  const parentGroup =
    parentGroupId && allGroupRows.length > 0
      ? allGroupRows.find((entry) => entry.id === parentGroupId) ?? null
      : null;

  const { data: students } = await admin
    .from("students")
    .select("id, first_name, last_name, email, activated_at")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: true });

  const studentIds = (students ?? []).map(
    (row) => (row as { id: string }).id
  );

  const assignmentFlagsByStudent = new Map<
    string,
    { hasAssigned: boolean; hasInProgress: boolean; hasFinalized: boolean }
  >();
  if (studentIds.length > 0) {
    const { data: assignments } = await admin
      .from("normalized_test_assignments")
      .select("student_id, status")
      .eq("org_id", profile.org_id)
      .in("student_id", studentIds)
      .is("archived_at", null);
    (assignments ?? []).forEach((row) => {
      const typed = row as { student_id: string; status: string };
      const existing = assignmentFlagsByStudent.get(typed.student_id) ?? {
        hasAssigned: false,
        hasInProgress: false,
        hasFinalized: false,
      };
      if (typed.status === "assigned") existing.hasAssigned = true;
      if (typed.status === "in_progress") existing.hasInProgress = true;
      if (typed.status === "finalized") existing.hasFinalized = true;
      assignmentFlagsByStudent.set(typed.student_id, existing);
    });
  }

  const { data: coaches } = await admin
    .from("org_memberships")
    .select("user_id, role, status, profiles!org_memberships_user_id_fkey(full_name, avatar_url)")
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

  const selectedStudentIds = Array.from(
    new Set((groupStudents ?? []).map((row) => (row as { student_id: string }).student_id))
  );
  const selectedCoachIds = Array.from(
    new Set((groupCoaches ?? []).map((row) => (row as { coach_id: string }).coach_id))
  );

  const descendantGroupIds =
    parentGroupId === null ? collectDescendantGroupIds(allGroupRows, group.id) : [];
  const memberScopeGroupIds = [group.id, ...descendantGroupIds];

  const { data: memberGroupStudents } = await admin
    .from("org_group_students")
    .select("group_id, student_id")
    .in("group_id", memberScopeGroupIds);

  const memberStudentIds = Array.from(
    new Set(
      (memberGroupStudents ?? []).map((row) => (row as { student_id: string }).student_id)
    )
  );

  const studentGroupIdsByStudent = (memberGroupStudents ?? []).reduce<
    Record<string, string[]>
  >((acc, row) => {
    const typedRow = row as { group_id: string; student_id: string };
    if (!acc[typedRow.student_id]) {
      acc[typedRow.student_id] = [];
    }
    if (!acc[typedRow.student_id].includes(typedRow.group_id)) {
      acc[typedRow.student_id].push(typedRow.group_id);
    }
    return acc;
  }, {});

  const coachRows = (coaches ?? []).map((row) => {
    const typed = row as {
      user_id: string;
      role: string;
      profiles?:
        | { full_name: string | null; avatar_url: string | null }[]
        | { full_name: string | null; avatar_url: string | null }
        | null;
    };
    const profileEntry = Array.isArray(typed.profiles) ? typed.profiles[0] : typed.profiles;
    return {
      id: typed.user_id,
      name: profileEntry?.full_name ?? "Coach",
      role: typed.role,
      avatar_url: profileEntry?.avatar_url ?? null,
    };
  });

  return NextResponse.json({
    group: group as GroupRow,
    students: (students ?? []).map((row) => {
      const typed = row as {
        id: string;
        first_name: string;
        last_name: string | null;
        email: string | null;
        activated_at: string | null;
      };
      return {
        ...typed,
        has_tests: assignmentFlagsByStudent.has(typed.id),
        test_status: assignmentFlagsByStudent.get(typed.id)?.hasInProgress
          ? "in_progress"
          : assignmentFlagsByStudent.get(typed.id)?.hasAssigned
            ? "assigned"
            : assignmentFlagsByStudent.get(typed.id)?.hasFinalized
              ? "finalized"
              : null,
      };
    }),
    coaches: coachRows,
    selectedStudentIds,
    selectedCoachIds,
    memberStudentIds,
    studentGroupIdsByStudent,
    parentGroup,
    availableGroups: allGroupRows.map((entry) => ({
      id: (entry as { id: string }).id,
      name: (entry as { name: string }).name,
      parent_group_id: (entry as { parent_group_id: string | null }).parent_group_id ?? null,
      color_token: (entry as { color_token: OrgGroupColorToken | null }).color_token ?? null,
    })),
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
  if (permissionError) {
    await recordActivity({
      admin,
      level: "warn",
      action: "group.update.denied",
      actorUserId: profile.id,
      orgId: profile.org_id,
      entityType: "org_group",
      entityId: groupId,
      message: "Modification groupe refusee: plan insuffisant.",
    });
    return permissionError;
  }

  const { data: currentGroup, error: currentGroupError } = await admin
    .from("org_groups")
    .select("id, parent_group_id, color_token")
    .eq("org_id", profile.org_id)
    .eq("id", groupId)
    .maybeSingle();

  if (currentGroupError) {
    return NextResponse.json({ error: currentGroupError.message }, { status: 400 });
  }
  if (!currentGroup) {
    return NextResponse.json({ error: "Groupe introuvable." }, { status: 404 });
  }

  const payload: {
    name?: string;
    description?: string | null;
    parent_group_id?: string | null;
    color_token?: OrgGroupColorToken | null;
  } = {};
  if (typeof parsed.data.name !== "undefined") {
    payload.name = parsed.data.name.trim();
  }
  if (typeof parsed.data.description !== "undefined") {
    payload.description = parsed.data.description?.trim() || null;
  }

  const hasParentInput = typeof parsed.data.parentGroupId !== "undefined";
  const nextParentGroupId = hasParentInput
    ? normalizeParentGroupId(parsed.data.parentGroupId ?? null)
    : ((currentGroup as { parent_group_id: string | null }).parent_group_id ?? null);

  if (hasParentInput) {
    if (nextParentGroupId) {
      const hierarchyError = await ensureParentNotCircular(
        admin,
        profile.org_id,
        groupId,
        nextParentGroupId
      );
      if (hierarchyError) {
        return NextResponse.json({ error: hierarchyError }, { status: 422 });
      }
    }
    payload.parent_group_id = nextParentGroupId;
  }

  if (typeof parsed.data.colorToken !== "undefined") {
    payload.color_token = nextParentGroupId ? null : parsed.data.colorToken ?? null;
  } else if (hasParentInput && nextParentGroupId) {
    payload.color_token = null;
  } else if (
    hasParentInput &&
    !nextParentGroupId &&
    !(currentGroup as { color_token: OrgGroupColorToken | null }).color_token
  ) {
    payload.color_token = ORG_GROUP_DEFAULT_COLOR;
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
    await recordActivity({
      admin,
      level: "error",
      action: "group.update.failed",
      actorUserId: profile.id,
      orgId: profile.org_id,
      entityType: "org_group",
      entityId: groupId,
      message: updateError.message ?? "Modification groupe impossible.",
    });
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  await recordActivity({
    admin,
    action: "group.update.success",
    actorUserId: profile.id,
    orgId: profile.org_id,
    entityType: "org_group",
    entityId: groupId,
    message: "Groupe modifie.",
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: Params) {
  const { groupId } = await params;
  const context = await loadContext(request);
  if (context.error) return context.error;

  const { admin, profile, membership } = context;
  if (membership.role !== "admin") {
    await recordActivity({
      admin,
      level: "warn",
      action: "group.delete.denied",
      actorUserId: profile.id,
      orgId: profile.org_id,
      entityType: "org_group",
      entityId: groupId,
      message: "Suppression groupe refusee: role admin requis.",
    });
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { error: deleteError } = await admin
    .from("org_groups")
    .delete()
    .eq("org_id", profile.org_id)
    .eq("id", groupId);

  if (deleteError) {
    await recordActivity({
      admin,
      level: "error",
      action: "group.delete.failed",
      actorUserId: profile.id,
      orgId: profile.org_id,
      entityType: "org_group",
      entityId: groupId,
      message: deleteError.message ?? "Suppression groupe impossible.",
    });
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  await recordActivity({
    admin,
    action: "group.delete.success",
    actorUserId: profile.id,
    orgId: profile.org_id,
    entityType: "org_group",
    entityId: groupId,
    message: "Groupe supprime.",
  });

  return NextResponse.json({ ok: true });
}
