import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import {
  type CoachCalendarStudentDto,
  type CoachStudentEventDto,
  STUDENT_EVENT_SELECT,
  StudentEventRowSchema,
  StudentEventsRangeQuerySchema,
  mapStudentEventRowToDto,
} from "@/lib/student-events/schemas";
import { formatZodError } from "@/lib/validation";

const ProfileRowSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["owner", "coach", "staff", "student"]),
  org_id: z.string().uuid().nullable(),
  active_workspace_id: z.string().uuid().nullable(),
});

const OrganizationRowSchema = z.object({
  id: z.string().uuid(),
  workspace_type: z.enum(["personal", "org"]),
  owner_profile_id: z.string().uuid().nullable(),
});

const MembershipRowSchema = z.object({
  role: z.enum(["admin", "coach"]),
  status: z.string(),
});

const StudentSummaryRowSchema = z.object({
  id: z.string().uuid(),
  first_name: z.string().min(1),
  last_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

const AssignmentRowSchema = z.object({
  student_id: z.string().uuid(),
});

const ShareRowSchema = z.object({
  student_id: z.string().uuid(),
});

const LinkedStudentIdsSchema = z.array(z.string().uuid());

const parseRows = <T>(schema: z.ZodSchema<T>, rows: unknown[]): T[] | null => {
  const parsed = z.array(schema).safeParse(rows);
  if (!parsed.success) return null;
  return parsed.data;
};

const toStudentName = (firstName: string, lastName: string | null) =>
  `${firstName} ${lastName ?? ""}`.trim();

const loadShareStudentIds = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  userEmail: string | null
) => {
  const shareIds = new Set<string>();

  const { data: sharesById } = await admin
    .from("student_shares")
    .select("student_id")
    .eq("status", "active")
    .eq("viewer_id", userId);

  const parsedById = parseRows(ShareRowSchema, (sharesById ?? []) as unknown[]);
  parsedById?.forEach((row) => {
    shareIds.add(row.student_id);
  });

  const normalizedEmail = userEmail?.trim().toLowerCase() ?? "";
  if (normalizedEmail.length > 0) {
    const { data: sharesByEmail } = await admin
      .from("student_shares")
      .select("student_id")
      .eq("status", "active")
      .ilike("viewer_email", normalizedEmail);

    const parsedByEmail = parseRows(ShareRowSchema, (sharesByEmail ?? []) as unknown[]);
    parsedByEmail?.forEach((row) => {
      shareIds.add(row.student_id);
    });
  }

  return Array.from(shareIds);
};

const loadWorkspaceStudentIds = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  workspaceId: string,
  userId: string
) => {
  const { data: organizationData, error: organizationError } = await admin
    .from("organizations")
    .select("id, workspace_type, owner_profile_id")
    .eq("id", workspaceId)
    .maybeSingle();

  if (organizationError || !organizationData) {
    return {
      error: "Workspace introuvable.",
      status: 404 as const,
      ids: [] as string[],
    };
  }

  const organizationParsed = OrganizationRowSchema.safeParse(organizationData);
  if (!organizationParsed.success) {
    return {
      error: "Workspace invalide.",
      status: 500 as const,
      ids: [] as string[],
    };
  }

  const organization = organizationParsed.data;

  if (organization.workspace_type === "personal") {
    if (organization.owner_profile_id !== userId) {
      return {
        error: "Acces refuse.",
        status: 403 as const,
        ids: [] as string[],
      };
    }

    const { data: studentRows } = await admin
      .from("students")
      .select("id")
      .eq("org_id", workspaceId);

    const parsedStudents = parseRows(
      StudentSummaryRowSchema.pick({ id: true }),
      (studentRows ?? []) as unknown[]
    );
    return {
      error: null,
      status: 200 as const,
      ids: (parsedStudents ?? []).map((row) => row.id),
    };
  }

  const { data: membershipData } = await admin
    .from("org_memberships")
    .select("role, status")
    .eq("org_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  const membershipParsed = MembershipRowSchema.safeParse(membershipData);
  if (!membershipParsed.success || membershipParsed.data.status !== "active") {
    return {
      error: "Acces refuse.",
      status: 403 as const,
      ids: [] as string[],
    };
  }

  if (membershipParsed.data.role === "admin") {
    const { data: studentRows } = await admin
      .from("students")
      .select("id")
      .eq("org_id", workspaceId);

    const parsedStudents = parseRows(
      StudentSummaryRowSchema.pick({ id: true }),
      (studentRows ?? []) as unknown[]
    );
    return {
      error: null,
      status: 200 as const,
      ids: (parsedStudents ?? []).map((row) => row.id),
    };
  }

  const { data: assignmentRows } = await admin
    .from("student_assignments")
    .select("student_id")
    .eq("org_id", workspaceId)
    .eq("coach_id", userId);

  const parsedAssignments = parseRows(
    AssignmentRowSchema,
    (assignmentRows ?? []) as unknown[]
  );

  return {
    error: null,
    status: 200 as const,
    ids: (parsedAssignments ?? []).map((row) => row.student_id),
  };
};

const resolveLinkedStudentIds = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  baseStudentIds: string[]
) => {
  if (baseStudentIds.length === 0) return [];

  const linkedLists = await Promise.all(
    baseStudentIds.map(async (studentId) => {
      const { data, error } = await admin.rpc("get_linked_student_ids", {
        _student_id: studentId,
      });
      if (error) return [studentId];

      const parsed = LinkedStudentIdsSchema.safeParse(data);
      if (!parsed.success || parsed.data.length === 0) return [studentId];
      return parsed.data;
    })
  );

  const uniqueIds = new Set<string>();
  linkedLists.forEach((ids) => {
    ids.forEach((id) => uniqueIds.add(id));
  });
  return Array.from(uniqueIds);
};

const loadStudentDetails = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  studentIds: string[]
) => {
  if (studentIds.length === 0) {
    return {
      namesById: new Map<string, string>(),
      avatarsById: new Map<string, string | null>(),
      students: [] as CoachCalendarStudentDto[],
    };
  }

  const { data: studentRows } = await admin
    .from("students")
    .select("id, first_name, last_name, avatar_url")
    .in("id", studentIds);

  const parsedStudents = parseRows(
    StudentSummaryRowSchema,
    (studentRows ?? []) as unknown[]
  );

  const namesById = new Map<string, string>();
  const avatarsById = new Map<string, string | null>();
  const students: CoachCalendarStudentDto[] = [];
  (parsedStudents ?? []).forEach((row) => {
    const studentName = toStudentName(row.first_name, row.last_name);
    namesById.set(row.id, studentName);
    avatarsById.set(row.id, row.avatar_url);
    students.push({
      id: row.id,
      name: studentName,
      avatarUrl: row.avatar_url,
    });
  });
  students.sort((a, b) => a.name.localeCompare(b.name, "fr"));

  return {
    namesById,
    avatarsById,
    students,
  };
};

const loadEvents = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  studentIds: string[],
  fromIso: string,
  toIso: string
) => {
  if (studentIds.length === 0) return [] as z.infer<typeof StudentEventRowSchema>[];

  const [openEndRows, boundedRows] = await Promise.all([
    admin
      .from("student_events")
      .select(STUDENT_EVENT_SELECT)
      .in("student_id", studentIds)
      .lte("start_at", toIso)
      .is("end_at", null),
    admin
      .from("student_events")
      .select(STUDENT_EVENT_SELECT)
      .in("student_id", studentIds)
      .lte("start_at", toIso)
      .not("end_at", "is", null)
      .gte("end_at", fromIso),
  ]);

  if (openEndRows.error) {
    throw new Error(openEndRows.error.message);
  }
  if (boundedRows.error) {
    throw new Error(boundedRows.error.message);
  }

  const parsedOpenEnd = parseRows(
    StudentEventRowSchema,
    (openEndRows.data ?? []) as unknown[]
  );
  const parsedBounded = parseRows(
    StudentEventRowSchema,
    (boundedRows.data ?? []) as unknown[]
  );

  const mergedById = new Map<string, z.infer<typeof StudentEventRowSchema>>();
  [...(parsedOpenEnd ?? []), ...(parsedBounded ?? [])].forEach((row) => {
    mergedById.set(row.id, row);
  });

  return Array.from(mergedById.values()).sort(
    (a, b) => Date.parse(a.start_at) - Date.parse(b.start_at)
  );
};

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const parsedQuery = StudentEventsRangeQuerySchema.safeParse({
    from: searchParams.get("from"),
    to: searchParams.get("to"),
  });
  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsedQuery.error) },
      { status: 422 }
    );
  }

  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: profileData, error: profileError } = await admin
    .from("profiles")
    .select("id, role, org_id, active_workspace_id")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profileData) {
    return NextResponse.json({ error: "Profil introuvable." }, { status: 404 });
  }

  const profileParsed = ProfileRowSchema.safeParse(profileData);
  if (!profileParsed.success) {
    return NextResponse.json({ error: "Profil invalide." }, { status: 500 });
  }

  if (profileParsed.data.role === "student") {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const workspaceId =
    profileParsed.data.active_workspace_id ?? profileParsed.data.org_id;
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace introuvable." }, { status: 403 });
  }

  const workspaceStudents = await loadWorkspaceStudentIds(
    admin,
    workspaceId,
    userData.user.id
  );
  if (workspaceStudents.error) {
    return NextResponse.json(
      { error: workspaceStudents.error },
      { status: workspaceStudents.status }
    );
  }

  const shareStudentIds = await loadShareStudentIds(
    admin,
    userData.user.id,
    userData.user.email ?? null
  );
  const baseStudentIds = Array.from(
    new Set([...workspaceStudents.ids, ...shareStudentIds])
  );

  const linkedStudentIds = await resolveLinkedStudentIds(admin, baseStudentIds);
  const eventStudentIds = Array.from(
    new Set([...baseStudentIds, ...linkedStudentIds])
  );

  const { namesById, avatarsById, students } = await loadStudentDetails(
    admin,
    eventStudentIds
  );

  try {
    const eventRows = await loadEvents(
      admin,
      eventStudentIds,
      parsedQuery.data.from,
      parsedQuery.data.to
    );

    const events: CoachStudentEventDto[] = eventRows.map((row) => ({
      ...mapStudentEventRowToDto(row),
      studentName: namesById.get(row.student_id) ?? "Eleve",
      studentAvatarUrl: avatarsById.get(row.student_id) ?? null,
    }));

    return NextResponse.json({ events, students });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur calendrier.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
