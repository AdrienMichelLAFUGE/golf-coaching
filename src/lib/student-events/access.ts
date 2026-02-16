import "server-only";

type AdminClient = ReturnType<typeof import("@/lib/supabase/server").createSupabaseAdminClient>;

type WorkspaceType = "personal" | "org";

type StudentEventAccessReason = "student" | "coach_linked" | "forbidden";

export type StudentEventAccess = {
  canRead: boolean;
  canWrite: boolean;
  reason: StudentEventAccessReason;
};

type StudentOrgRow = {
  id: string;
  org_id: string;
};

type ProfileWorkspaceRow = {
  id: string;
  org_id: string;
  active_workspace_id: string | null;
};

type OrganizationRow = {
  id: string;
  workspace_type: WorkspaceType;
  owner_profile_id: string | null;
};

type ActiveShareRow = {
  id: string;
};

const forbiddenAccess = (): StudentEventAccess => ({
  canRead: false,
  canWrite: false,
  reason: "forbidden",
});

const studentAccess = (): StudentEventAccess => ({
  canRead: true,
  canWrite: true,
  reason: "student",
});

const coachReadOnlyAccess = (): StudentEventAccess => ({
  canRead: true,
  canWrite: false,
  reason: "coach_linked",
});

const isStudentLinked = async (
  admin: AdminClient,
  userId: string,
  studentId: string
): Promise<boolean> => {
  const { data } = await admin
    .from("student_accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("student_id", studentId)
    .maybeSingle();

  return Boolean(data);
};

const loadStudentOrg = async (
  admin: AdminClient,
  studentId: string
): Promise<StudentOrgRow | null> => {
  const { data } = await admin
    .from("students")
    .select("id, org_id")
    .eq("id", studentId)
    .maybeSingle();

  return (data as StudentOrgRow | null) ?? null;
};

const loadProfileWorkspace = async (
  admin: AdminClient,
  userId: string
): Promise<ProfileWorkspaceRow | null> => {
  const { data } = await admin
    .from("profiles")
    .select("id, org_id, active_workspace_id")
    .eq("id", userId)
    .maybeSingle();

  return (data as ProfileWorkspaceRow | null) ?? null;
};

const loadOrganization = async (
  admin: AdminClient,
  orgId: string
): Promise<OrganizationRow | null> => {
  const { data } = await admin
    .from("organizations")
    .select("id, workspace_type, owner_profile_id")
    .eq("id", orgId)
    .maybeSingle();

  return (data as OrganizationRow | null) ?? null;
};

const isActiveOrgMember = async (
  admin: AdminClient,
  orgId: string,
  userId: string
): Promise<boolean> => {
  const { data } = await admin
    .from("org_memberships")
    .select("status")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();

  return (data as { status?: string } | null)?.status === "active";
};

const isAssignedCoach = async (
  admin: AdminClient,
  studentId: string,
  userId: string
): Promise<boolean> => {
  const { data } = await admin
    .from("student_assignments")
    .select("student_id")
    .eq("student_id", studentId)
    .eq("coach_id", userId)
    .maybeSingle();

  return Boolean(data);
};

const isActiveShareViewer = async (
  admin: AdminClient,
  studentId: string,
  userId: string,
  userEmail?: string | null
): Promise<boolean> => {
  const { data: shareByUserId } = await admin
    .from("student_shares")
    .select("id")
    .eq("student_id", studentId)
    .eq("status", "active")
    .eq("viewer_id", userId)
    .maybeSingle();

  if (shareByUserId) {
    return true;
  }

  const normalizedEmail = userEmail?.trim().toLowerCase() ?? null;
  if (!normalizedEmail) {
    return false;
  }

  const { data: shareByEmail } = await admin
    .from("student_shares")
    .select("id")
    .eq("student_id", studentId)
    .eq("status", "active")
    .ilike("viewer_email", normalizedEmail)
    .maybeSingle();

  return Boolean((shareByEmail as ActiveShareRow | null)?.id);
};

export const resolveStudentEventAccess = async (
  admin: AdminClient,
  userId: string,
  studentId: string,
  userEmail?: string | null
): Promise<StudentEventAccess> => {
  if (!userId || !studentId) return forbiddenAccess();

  if (await isStudentLinked(admin, userId, studentId)) {
    return studentAccess();
  }

  if (await isActiveShareViewer(admin, studentId, userId, userEmail)) {
    return coachReadOnlyAccess();
  }

  const [student, profile] = await Promise.all([
    loadStudentOrg(admin, studentId),
    loadProfileWorkspace(admin, userId),
  ]);

  if (!student?.org_id || !profile) {
    return forbiddenAccess();
  }

  const activeWorkspaceId = profile.active_workspace_id ?? profile.org_id;
  if (!activeWorkspaceId || activeWorkspaceId !== student.org_id) {
    return forbiddenAccess();
  }

  const organization = await loadOrganization(admin, student.org_id);
  if (!organization) {
    return forbiddenAccess();
  }

  if (organization.workspace_type === "personal") {
    return organization.owner_profile_id === userId
      ? coachReadOnlyAccess()
      : forbiddenAccess();
  }

  const [isMember, assigned] = await Promise.all([
    isActiveOrgMember(admin, student.org_id, userId),
    isAssignedCoach(admin, studentId, userId),
  ]);

  if (!isMember || !assigned) {
    return forbiddenAccess();
  }

  return coachReadOnlyAccess();
};
