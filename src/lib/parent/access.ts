import "server-only";

import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import {
  type ParentLinkPermissions,
  type ParentPermissionModule,
  normalizeParentLinkPermissions,
} from "@/lib/parent/permissions";

type ParentRole = "parent";

type ParentProfileRow = {
  id: string;
  role: string | null;
  full_name: string | null;
};

type ParentChildLinkRow = {
  id: string;
  permissions?: unknown;
};

type StudentRow = {
  id: string;
  org_id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
};

export type ParentAuthContext = {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  parentUserId: string;
  parentEmail: string;
  parentRole: ParentRole;
  parentName: string | null;
};

export type ParentLinkedStudentContext = ParentAuthContext & {
  parentChildLinkId: string;
  parentPermissions: ParentLinkPermissions;
  studentId: string;
  studentOrgId: string;
  studentFirstName: string;
  studentLastName: string | null;
  studentEmail: string | null;
};

export type ParentAccessFailure = {
  status: 401 | 403;
  error: string;
};

type LoadParentLinkedStudentOptions = {
  requiredPermission?: ParentPermissionModule;
};

const forbiddenFailure = (): ParentAccessFailure => ({
  status: 403,
  error: "Acces refuse.",
});

const moduleForbiddenFailure = (): ParentAccessFailure => ({
  status: 403,
  error: "Acces non autorise pour ce module.",
});

export const isParentRole = (role: string | null | undefined): role is ParentRole =>
  role === "parent";

export const loadParentAuthContext = async (
  request: Request
): Promise<
  | { context: ParentAuthContext; failure: null }
  | { context: null; failure: ParentAccessFailure }
> => {
  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return {
      context: null,
      failure: { status: 401, error: "Unauthorized." },
    };
  }

  const userId = userData.user.id;
  const userEmail = userData.user.email?.trim().toLowerCase() ?? "";
  if (!userEmail) {
    return {
      context: null,
      failure: forbiddenFailure(),
    };
  }

  const admin = createSupabaseAdminClient();
  const { data: profileData, error: profileError } = await admin
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", userId)
    .maybeSingle();

  const profile = (profileData as ParentProfileRow | null) ?? null;
  if (profileError || !profile || !isParentRole(profile.role)) {
    return {
      context: null,
      failure: forbiddenFailure(),
    };
  }

  return {
    context: {
      admin,
      parentUserId: userId,
      parentEmail: userEmail,
      parentRole: "parent",
      parentName: profile.full_name,
    },
    failure: null,
  };
};

export const hasParentChildLink = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  parentUserId: string,
  studentId: string
) => {
  const { data, error } = await admin
    .from("parent_child_links")
    .select("id")
    .eq("parent_user_id", parentUserId)
    .eq("student_id", studentId)
    .eq("status", "active")
    .maybeSingle();

  if (error) return false;
  return Boolean((data as ParentChildLinkRow | null)?.id);
};

export const loadParentLinkedStudentIds = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  studentId: string
): Promise<string[]> => {
  const { data: accountData, error: accountError } = await admin
    .from("student_accounts")
    .select("user_id")
    .eq("student_id", studentId)
    .maybeSingle();

  if (accountError) {
    return [studentId];
  }

  const studentUserId = (accountData as { user_id: string } | null)?.user_id ?? null;
  if (!studentUserId) {
    return [studentId];
  }

  const { data: siblingAccountsData, error: siblingAccountsError } = await admin
    .from("student_accounts")
    .select("student_id")
    .eq("user_id", studentUserId);

  if (siblingAccountsError) {
    return [studentId];
  }

  const ids = Array.from(
    new Set(
      ((siblingAccountsData ?? []) as Array<{ student_id: string }>)
        .map((row) => row.student_id)
        .filter((value) => typeof value === "string" && value.length > 0)
    )
  );

  if (!ids.includes(studentId)) {
    ids.push(studentId);
  }

  return ids.length > 0 ? ids : [studentId];
};

export const loadParentLinkedStudentContext = async (
  request: Request,
  studentId: string,
  options?: LoadParentLinkedStudentOptions
): Promise<
  | { context: ParentLinkedStudentContext; failure: null }
  | { context: null; failure: ParentAccessFailure }
> => {
  const authContextResult = await loadParentAuthContext(request);
  if (!authContextResult.context) {
    return {
      context: null,
      failure: authContextResult.failure,
    };
  }

  const { context: authContext } = authContextResult;
  const { data: linkData, error: linkError } = await authContext.admin
    .from("parent_child_links")
    .select("id, permissions")
    .eq("parent_user_id", authContext.parentUserId)
    .eq("student_id", studentId)
    .eq("status", "active")
    .maybeSingle();

  const link = (linkData as ParentChildLinkRow | null) ?? null;
  if (linkError || !link) {
    return {
      context: null,
      failure: forbiddenFailure(),
    };
  }

  const parentPermissions = normalizeParentLinkPermissions(link.permissions);
  if (options?.requiredPermission && !parentPermissions[options.requiredPermission]) {
    return {
      context: null,
      failure: moduleForbiddenFailure(),
    };
  }

  const { data: studentData, error: studentError } = await authContext.admin
    .from("students")
    .select("id, org_id, first_name, last_name, email")
    .eq("id", studentId)
    .maybeSingle();

  const student = (studentData as StudentRow | null) ?? null;
  if (studentError || !student) {
    return {
      context: null,
      failure: forbiddenFailure(),
    };
  }

  return {
    context: {
      ...authContext,
      parentChildLinkId: link.id,
      parentPermissions,
      studentId: student.id,
      studentOrgId: student.org_id,
      studentFirstName: student.first_name,
      studentLastName: student.last_name,
      studentEmail: student.email,
    },
    failure: null,
  };
};
