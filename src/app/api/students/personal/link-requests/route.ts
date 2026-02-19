import { NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";

type IncomingRequestRow = {
  id: string;
  created_at: string;
  source_student_id: string;
  requester_user_id: string;
  requester_email: string;
  requested_first_name: string | null;
  requested_last_name: string | null;
  student_email: string;
};

type SourceStudent = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
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
    .select("id, org_id, active_workspace_id")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Profil introuvable." }, { status: 403 });
  }

  const targetOrgId =
    (profile as { active_workspace_id?: string | null }).active_workspace_id ??
    (profile as { org_id?: string | null }).org_id ??
    null;
  if (!targetOrgId) {
    return NextResponse.json({ error: "Workspace introuvable." }, { status: 403 });
  }

  const { data: workspace } = await admin
    .from("organizations")
    .select("id, workspace_type, owner_profile_id")
    .eq("id", targetOrgId)
    .maybeSingle();

  if (!workspace || workspace.workspace_type !== "personal") {
    return NextResponse.json(
      { error: "Endpoint disponible uniquement en workspace personnel." },
      { status: 403 }
    );
  }

  if (workspace.owner_profile_id !== profile.id) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { data: rows, error: rowsError } = await admin
    .from("personal_student_link_requests")
    .select(
      "id, created_at, source_student_id, requester_user_id, requester_email, requested_first_name, requested_last_name, student_email"
    )
    .eq("source_owner_user_id", profile.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (rowsError) {
    return NextResponse.json({ error: rowsError.message }, { status: 400 });
  }

  const incomingRows = (rows ?? []) as IncomingRequestRow[];
  const sourceStudentIds = Array.from(
    new Set(
      incomingRows
        .map((row) => row.source_student_id)
        .filter((studentId): studentId is string => Boolean(studentId))
    )
  );

  let sourceStudentsById = new Map<string, SourceStudent>();
  if (sourceStudentIds.length > 0) {
    const { data: sourceStudents, error: sourceStudentsError } = await admin
      .from("students")
      .select("id, first_name, last_name, email")
      .in("id", sourceStudentIds);

    if (sourceStudentsError) {
      return NextResponse.json({ error: sourceStudentsError.message }, { status: 400 });
    }

    sourceStudentsById = new Map(
      ((sourceStudents ?? []) as SourceStudent[]).map((student) => [student.id, student])
    );
  }

  const requests = incomingRows.map((row) => {
    const sourceStudent = sourceStudentsById.get(row.source_student_id);
    return {
      requestId: row.id,
      createdAt: row.created_at,
      studentId: row.source_student_id,
      studentFirstName:
        sourceStudent?.first_name?.trim() || row.requested_first_name?.trim() || "Eleve",
      studentLastName: sourceStudent?.last_name?.trim() || row.requested_last_name?.trim() || null,
      studentEmail: sourceStudent?.email?.trim() || row.student_email || null,
      requesterUserId: row.requester_user_id,
      requesterEmail: row.requester_email,
    };
  });

  return NextResponse.json({ requests });
}
