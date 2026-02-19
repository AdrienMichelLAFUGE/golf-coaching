import "server-only";

import { NextResponse } from "next/server";
import { messagesJson } from "@/lib/messages/http";
import { loadMessagingCharterStatus } from "@/lib/messages/charter";
import { loadActiveMessagingSuspension } from "@/lib/messages/suspensions";
import { loadPersonalPlanTier } from "@/lib/plan-access";
import { resolveEffectivePlanTier } from "@/lib/plans";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { recordActivity } from "@/lib/activity-log";

export type AppProfileRole = "owner" | "coach" | "staff" | "student" | "parent";

type ProfileRow = {
  id: string;
  role: AppProfileRole;
  org_id: string;
  active_workspace_id: string | null;
  full_name: string | null;
  avatar_url?: string | null;
};

type OrganizationRow = {
  id: string;
  name: string | null;
  workspace_type: "personal" | "org";
  owner_profile_id: string | null;
  plan_tier: string | null;
  plan_tier_override: string | null;
  plan_tier_override_starts_at: string | null;
  plan_tier_override_expires_at: string | null;
  plan_tier_override_unlimited: boolean | null;
  messaging_charter_version: number | null;
};

type MembershipRow = {
  role: "admin" | "coach";
  status: "invited" | "active" | "disabled";
};

export type MessageActorContext = {
  userId: string;
  userEmail: string | null;
  profile: ProfileRow;
  activeWorkspace: OrganizationRow;
  orgMembershipRole: "admin" | "coach" | null;
  studentIds: string[];
  admin: ReturnType<typeof createSupabaseAdminClient>;
};

export const normalizeUserPair = (firstUserId: string, secondUserId: string) => {
  if (firstUserId < secondUserId) {
    return {
      participantAId: firstUserId,
      participantBId: secondUserId,
    };
  }

  return {
    participantAId: secondUserId,
    participantBId: firstUserId,
  };
};

export const coerceMessageId = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
};

export const isCoachLikeRole = (role: AppProfileRole) =>
  role === "owner" || role === "coach" || role === "staff";

export const loadMessageActorContext = async (
  request: Request,
  options?: { skipCharterCheck?: boolean; skipSuspensionCheck?: boolean }
): Promise<{ context: MessageActorContext; response: null } | { context: null; response: NextResponse }> => {
  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return {
      context: null,
      response: messagesJson({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  const admin = createSupabaseAdminClient();
  const { data: profileData, error: profileError } = await admin
    .from("profiles")
    .select("id, role, org_id, active_workspace_id, full_name, avatar_url")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profileData) {
    return {
      context: null,
      response: messagesJson({ error: "Profil introuvable." }, { status: 403 }),
    };
  }

  const profile = profileData as ProfileRow;
  const activeWorkspaceId = profile.active_workspace_id ?? profile.org_id;

  const { data: workspaceData, error: workspaceError } = await admin
    .from("organizations")
    .select(
      "id, name, workspace_type, owner_profile_id, plan_tier, plan_tier_override, plan_tier_override_starts_at, plan_tier_override_expires_at, plan_tier_override_unlimited, messaging_charter_version"
    )
    .eq("id", activeWorkspaceId)
    .maybeSingle();

  if (workspaceError || !workspaceData) {
    return {
      context: null,
      response: messagesJson({ error: "Workspace introuvable." }, { status: 403 }),
    };
  }

  const activeWorkspace = workspaceData as OrganizationRow;
  const effectivePlanTier = resolveEffectivePlanTier(
    activeWorkspace.plan_tier,
    activeWorkspace.plan_tier_override,
    activeWorkspace.plan_tier_override_expires_at,
    new Date(),
    activeWorkspace.plan_tier_override_starts_at,
    activeWorkspace.plan_tier_override_unlimited
  ).tier;

  if (
    activeWorkspace.workspace_type === "org" &&
    effectivePlanTier === "free" &&
    profile.role !== "student"
  ) {
    const entitlementOwnerId = activeWorkspace.owner_profile_id ?? profile.id;
    const personalPlanTier = await loadPersonalPlanTier(admin, entitlementOwnerId);
    if (personalPlanTier === "free") {
      return {
        context: null,
        response: messagesJson(
          { error: "Lecture seule: plan Free en organisation." },
          { status: 403 }
        ),
      };
    }
  }

  if (!options?.skipSuspensionCheck && activeWorkspace.workspace_type === "org") {
    const suspension = await loadActiveMessagingSuspension(
      admin,
      activeWorkspace.id,
      profile.id
    );

    if (suspension) {
      await recordActivity({
        admin,
        level: "warn",
        action: "messages.suspension.access_blocked",
        actorUserId: profile.id,
        orgId: activeWorkspace.id,
        entityType: "message_user_suspension",
        entityId: suspension.id,
        message: "Acces messagerie bloque: utilisateur suspendu.",
        metadata: {
          suspendedUntil: suspension.suspendedUntil,
        },
      });

      return {
        context: null,
        response: messagesJson(
          {
            error: "Acces messagerie suspendu par votre structure.",
            code: "MESSAGING_SUSPENDED",
            suspendedUntil: suspension.suspendedUntil,
          },
          { status: 403 }
        ),
      };
    }
  }

  if (!options?.skipCharterCheck) {
    const charterStatus = await loadMessagingCharterStatus(
      admin,
      profile.id,
      activeWorkspace.id
    );
    if (charterStatus.mustAccept) {
      return {
        context: null,
        response: messagesJson(
          {
            error: "Acceptation de la charte messagerie requise.",
            code: "MESSAGING_CHARTER_REQUIRED",
            charterVersion: charterStatus.charterVersion,
          },
          { status: 428 }
        ),
      };
    }
  }

  let orgMembershipRole: "admin" | "coach" | null = null;
  if (activeWorkspace.workspace_type === "org" && profile.role !== "student") {
    const { data: membershipData } = await admin
      .from("org_memberships")
      .select("role, status")
      .eq("org_id", activeWorkspace.id)
      .eq("user_id", profile.id)
      .maybeSingle();

    const membership = (membershipData as MembershipRow | null) ?? null;
    if (!membership || membership.status !== "active") {
      return {
        context: null,
        response: messagesJson({ error: "Acces refuse." }, { status: 403 }),
      };
    }

    orgMembershipRole = membership.role;
  }

  let studentIds: string[] = [];
  if (profile.role === "student") {
    const { data: accountRows, error: accountsError } = await admin
      .from("student_accounts")
      .select("student_id")
      .eq("user_id", profile.id);

    if (accountsError) {
      return {
        context: null,
        response: messagesJson({ error: accountsError.message }, { status: 400 }),
      };
    }

    studentIds = (accountRows ?? [])
      .map((row) => (row as { student_id: string }).student_id)
      .filter((value, index, array) => array.indexOf(value) === index);
  }

  return {
    context: {
      userId: userData.user.id,
      userEmail: userData.user.email ?? null,
      profile,
      activeWorkspace,
      orgMembershipRole,
      studentIds,
      admin,
    },
    response: null,
  };
};

export const loadStudentUserId = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  studentId: string
): Promise<string | null> => {
  const { data } = await admin
    .from("student_accounts")
    .select("user_id")
    .eq("student_id", studentId)
    .maybeSingle();

  return (data as { user_id: string } | null)?.user_id ?? null;
};

export const loadStudentRow = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  studentId: string
): Promise<{ id: string; org_id: string; first_name: string; last_name: string | null } | null> => {
  const { data } = await admin
    .from("students")
    .select("id, org_id, first_name, last_name")
    .eq("id", studentId)
    .maybeSingle();

  return (data as { id: string; org_id: string; first_name: string; last_name: string | null } | null) ?? null;
};

export const isCoachAllowedForStudent = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  coachUserId: string,
  studentId: string
): Promise<boolean> => {
  const student = await loadStudentRow(admin, studentId);
  if (!student) return false;

  const { data: workspaceData } = await admin
    .from("organizations")
    .select("workspace_type, owner_profile_id")
    .eq("id", student.org_id)
    .maybeSingle();

  const workspace =
    (workspaceData as { workspace_type: "personal" | "org"; owner_profile_id: string | null } | null) ??
    null;
  if (!workspace) return false;

  if (workspace.workspace_type === "personal") {
    return workspace.owner_profile_id === coachUserId;
  }

  const { data: assignment } = await admin
    .from("student_assignments")
    .select("student_id")
    .eq("student_id", studentId)
    .eq("coach_id", coachUserId)
    .maybeSingle();

  return Boolean(assignment);
};

export const isStudentLinkedToStudentId = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  studentUserId: string,
  studentId: string
): Promise<boolean> => {
  const { data } = await admin
    .from("student_accounts")
    .select("id")
    .eq("user_id", studentUserId)
    .eq("student_id", studentId)
    .maybeSingle();

  return Boolean(data);
};

export const hasCoachContactOptIn = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userAId: string,
  userBId: string
): Promise<boolean> => {
  const pair = normalizeUserPair(userAId, userBId);
  const { data } = await admin
    .from("message_coach_contacts")
    .select("id")
    .eq("user_a_id", pair.participantAId)
    .eq("user_b_id", pair.participantBId)
    .maybeSingle();

  return Boolean(data);
};

export const isCoachLikeActiveOrgMember = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  orgId: string,
  userId: string
): Promise<boolean> => {
  const [{ data: membershipData }, { data: profileData }] = await Promise.all([
    admin
      .from("org_memberships")
      .select("status")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  const membership = membershipData as { status: "invited" | "active" | "disabled" } | null;
  const profile = profileData as { role: AppProfileRole } | null;

  if (!membership || membership.status !== "active") return false;
  if (!profile) return false;

  return isCoachLikeRole(profile.role);
};

export const findAuthUserByEmail = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  email: string
): Promise<{ id: string; email: string } | null> => {
  const normalizedEmail = email.trim().toLowerCase();
  let page = 1;
  const perPage = 200;

  while (page <= 25) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return null;

    const user = (data.users ?? []).find(
      (candidate) => candidate.email?.trim().toLowerCase() === normalizedEmail
    );

    if (user?.id && user.email) {
      return { id: user.id, email: user.email };
    }

    if (!data.users || data.users.length < perPage) {
      break;
    }

    page += 1;
  }

  return null;
};

export const loadUserEmailsByIds = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userIds: string[]
): Promise<Map<string, string>> => {
  const uniqueIds = Array.from(new Set(userIds));
  const map = new Map<string, string>();

  await Promise.all(
    uniqueIds.map(async (userId) => {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error || !data.user?.email) return;
      map.set(userId, data.user.email);
    })
  );

  return map;
};

export const loadOrgGroupRow = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  groupId: string
): Promise<{ id: string; org_id: string; name: string } | null> => {
  const { data } = await admin
    .from("org_groups")
    .select("id, org_id, name")
    .eq("id", groupId)
    .maybeSingle();

  return (data as { id: string; org_id: string; name: string } | null) ?? null;
};

export const loadOrgGroupMemberUserIds = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  groupId: string
): Promise<{
  memberUserIds: string[];
  coachUserIds: string[];
  studentUserIds: string[];
  coachCount: number;
  studentCount: number;
}> => {
  const [{ data: coachRows }, { data: groupStudentRows }] = await Promise.all([
    admin
      .from("org_group_coaches")
      .select("coach_id")
      .eq("group_id", groupId),
    admin
      .from("org_group_students")
      .select("student_id")
      .eq("group_id", groupId),
  ]);

  const coachUserIds = Array.from(
    new Set(
      ((coachRows ?? []) as Array<{ coach_id: string }>)
        .map((row) => row.coach_id)
        .filter((value) => value.length > 0)
    )
  );

  const studentIds = Array.from(
    new Set(
      ((groupStudentRows ?? []) as Array<{ student_id: string }>)
        .map((row) => row.student_id)
        .filter((value) => value.length > 0)
    )
  );

  let studentUserIds: string[] = [];
  if (studentIds.length > 0) {
    const { data: accountRows } = await admin
      .from("student_accounts")
      .select("student_id, user_id")
      .in("student_id", studentIds);

    studentUserIds = Array.from(
      new Set(
        ((accountRows ?? []) as Array<{ student_id: string; user_id: string }>)
          .map((row) => row.user_id)
          .filter((value) => value.length > 0)
      )
    );
  }

  const memberUserIds = Array.from(new Set([...coachUserIds, ...studentUserIds]));

  return {
    memberUserIds,
    coachUserIds,
    studentUserIds,
    coachCount: coachUserIds.length,
    studentCount: studentUserIds.length,
  };
};

export const isUserInOrgGroup = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  groupId: string
): Promise<boolean> => {
  const { data: coachMembership } = await admin
    .from("org_group_coaches")
    .select("id")
    .eq("group_id", groupId)
    .eq("coach_id", userId)
    .maybeSingle();
  if (coachMembership) return true;

  const { data: studentAccounts } = await admin
    .from("student_accounts")
    .select("student_id")
    .eq("user_id", userId);

  const studentIds = Array.from(
    new Set(
      ((studentAccounts ?? []) as Array<{ student_id: string }>)
        .map((row) => row.student_id)
        .filter((value) => value.length > 0)
    )
  );
  if (studentIds.length === 0) return false;

  const { data: studentMembership } = await admin
    .from("org_group_students")
    .select("id")
    .eq("group_id", groupId)
    .in("student_id", studentIds)
    .limit(1)
    .maybeSingle();

  return Boolean(studentMembership);
};

export const loadOrgCoachUserIds = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  orgId: string
): Promise<string[]> => {
  const { data } = await admin
    .from("org_memberships")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("status", "active");

  return Array.from(
    new Set(
      ((data ?? []) as Array<{ user_id: string }>)
        .map((row) => row.user_id)
        .filter((value) => value.length > 0)
    )
  );
};

export const loadOrgAudienceUserIds = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  orgId: string
): Promise<{
  coachUserIds: string[];
  studentUserIds: string[];
  memberUserIds: string[];
}> => {
  const coachUserIds = await loadOrgCoachUserIds(admin, orgId);

  const { data: studentRows } = await admin
    .from("students")
    .select("id")
    .eq("org_id", orgId);

  const studentIds = Array.from(
    new Set(
      ((studentRows ?? []) as Array<{ id: string }>)
        .map((row) => row.id)
        .filter((value) => value.length > 0)
    )
  );

  let studentUserIds: string[] = [];
  if (studentIds.length > 0) {
    const { data: accountRows } = await admin
      .from("student_accounts")
      .select("user_id")
      .in("student_id", studentIds);

    studentUserIds = Array.from(
      new Set(
        ((accountRows ?? []) as Array<{ user_id: string }>)
          .map((row) => row.user_id)
          .filter((value) => value.length > 0)
      )
    );
  }

  const memberUserIds = Array.from(new Set([...coachUserIds, ...studentUserIds]));

  return {
    coachUserIds,
    studentUserIds,
    memberUserIds,
  };
};

export const isStudentLinkedToOrganization = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  orgId: string
): Promise<boolean> => {
  const { data: accountRows } = await admin
    .from("student_accounts")
    .select("student_id")
    .eq("user_id", userId);

  const studentIds = Array.from(
    new Set(
      ((accountRows ?? []) as Array<{ student_id: string }>)
        .map((row) => row.student_id)
        .filter((value) => value.length > 0)
    )
  );
  if (studentIds.length === 0) return false;

  const { data } = await admin
    .from("students")
    .select("id")
    .eq("org_id", orgId)
    .in("id", studentIds)
    .limit(1)
    .maybeSingle();

  return Boolean(data);
};
