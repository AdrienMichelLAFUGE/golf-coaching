import "server-only";

type AdminClient = ReturnType<typeof import("@/lib/supabase/server").createSupabaseAdminClient>;

type CoachLikeRole = "owner" | "coach" | "staff";

type ProfileRow = {
  id: string;
  role: string | null;
  org_id: string | null;
  active_workspace_id: string | null;
};

type StudentRow = {
  id: string;
  org_id: string | null;
};

type WorkspaceRow = {
  id: string;
  workspace_type: "personal" | "org";
  owner_profile_id: string | null;
};

type MembershipRow = {
  role: "admin" | "coach";
  status: string;
};

const isCoachLikeRole = (role: string | null | undefined): role is CoachLikeRole =>
  role === "owner" || role === "coach" || role === "staff";

export const canCoachLikeAccessStudent = async (
  admin: AdminClient,
  userId: string,
  studentId: string
) => {
  const [{ data: profileData }, { data: studentData }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, role, org_id, active_workspace_id")
      .eq("id", userId)
      .maybeSingle(),
    admin.from("students").select("id, org_id").eq("id", studentId).maybeSingle(),
  ]);

  const profile = (profileData as ProfileRow | null) ?? null;
  const student = (studentData as StudentRow | null) ?? null;
  if (!profile || !student?.org_id || !isCoachLikeRole(profile.role)) {
    return false;
  }

  const workspaceId = profile.active_workspace_id ?? profile.org_id;
  if (!workspaceId || workspaceId !== student.org_id) {
    return false;
  }

  const { data: workspaceData } = await admin
    .from("organizations")
    .select("id, workspace_type, owner_profile_id")
    .eq("id", workspaceId)
    .maybeSingle();

  const workspace = (workspaceData as WorkspaceRow | null) ?? null;
  if (!workspace) return false;

  if (workspace.workspace_type === "personal") {
    return workspace.owner_profile_id === userId;
  }

  const { data: membershipData } = await admin
    .from("org_memberships")
    .select("role, status")
    .eq("org_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  const membership = (membershipData as MembershipRow | null) ?? null;
  if (!membership || membership.status !== "active") {
    return false;
  }

  if (membership.role === "admin" || profile.role === "staff") {
    return true;
  }

  const { data: assignmentData } = await admin
    .from("student_assignments")
    .select("student_id")
    .eq("org_id", workspaceId)
    .eq("student_id", studentId)
    .eq("coach_id", userId)
    .maybeSingle();

  return Boolean((assignmentData as { student_id: string } | null)?.student_id);
};
