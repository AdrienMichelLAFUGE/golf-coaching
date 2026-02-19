import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { recordActivity } from "@/lib/activity-log";

const decideSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["share", "transfer", "reject"]),
});

type LinkRequestRow = {
  id: string;
  source_student_id: string;
  source_org_id: string;
  source_owner_user_id: string;
  requester_org_id: string;
  requester_user_id: string;
  requester_email: string;
  student_email: string;
  status: "pending" | "accepted_share" | "accepted_transfer" | "rejected" | "cancelled";
};

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, decideSchema);
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

  const { data: requestRow, error: requestError } = await admin
    .from("personal_student_link_requests")
    .select(
      "id, source_student_id, source_org_id, source_owner_user_id, requester_org_id, requester_user_id, requester_email, student_email, status"
    )
    .eq("id", parsed.data.requestId)
    .maybeSingle();

  if (requestError) {
    return NextResponse.json({ error: requestError.message }, { status: 400 });
  }

  const linkRequest = (requestRow as LinkRequestRow | null) ?? null;
  if (!linkRequest) {
    return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
  }

  if (linkRequest.source_owner_user_id !== profile.id) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  if (linkRequest.status !== "pending") {
    return NextResponse.json({ error: "Demande deja traitee." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const decision = parsed.data.decision;

  if (decision === "share") {
    const { data: sourceStudent, error: sourceStudentError } = await admin
      .from("students")
      .select("id, email")
      .eq("id", linkRequest.source_student_id)
      .maybeSingle();

    if (sourceStudentError || !sourceStudent?.id) {
      return NextResponse.json({ error: "Eleve source introuvable." }, { status: 404 });
    }

    const normalizedStudentEmail =
      sourceStudent.email?.trim().toLowerCase() ||
      linkRequest.student_email?.trim().toLowerCase() ||
      null;

    if (!normalizedStudentEmail) {
      return NextResponse.json(
        { error: "Email eleve manquant pour activer le partage." },
        { status: 409 }
      );
    }

    const { error: shareError } = await admin.from("student_shares").upsert(
      [
        {
          student_id: linkRequest.source_student_id,
          owner_id: profile.id,
          viewer_id: linkRequest.requester_user_id,
          viewer_email: linkRequest.requester_email,
          student_email: normalizedStudentEmail,
          status: "active",
          coach_accepted_at: now,
          student_accepted_at: now,
          coach_declined_at: null,
          student_declined_at: null,
          revoked_at: null,
          updated_at: now,
        },
      ],
      { onConflict: "student_id,viewer_email" }
    );

    if (shareError) {
      return NextResponse.json({ error: shareError.message }, { status: 400 });
    }
  } else if (decision === "transfer") {
    const { error: transferError } = await admin.rpc(
      "transfer_personal_student_to_workspace",
      {
        _student_id: linkRequest.source_student_id,
        _target_org_id: linkRequest.requester_org_id,
        _target_coach_user_id: linkRequest.requester_user_id,
        _actor_user_id: profile.id,
      }
    );

    if (transferError) {
      return NextResponse.json(
        {
          error:
            transferError.message ??
            "Transfert impossible pour cet eleve.",
        },
        { status: 400 }
      );
    }

    await admin
      .from("student_shares")
      .update({
        status: "revoked",
        revoked_at: now,
        updated_at: now,
      })
      .eq("student_id", linkRequest.source_student_id)
      .ilike("viewer_email", linkRequest.requester_email)
      .eq("status", "active");
  }

  const nextStatus =
    decision === "share"
      ? "accepted_share"
      : decision === "transfer"
        ? "accepted_transfer"
        : "rejected";

  const { error: updateError } = await admin
    .from("personal_student_link_requests")
    .update({
      status: nextStatus,
      decision,
      decided_at: now,
      decided_by: profile.id,
      updated_at: now,
    })
    .eq("id", linkRequest.id)
    .eq("status", "pending");

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  await recordActivity({
    admin,
    action:
      decision === "share"
        ? "student.link_request.personal.accept_share"
        : decision === "transfer"
          ? "student.link_request.personal.accept_transfer"
          : "student.link_request.personal.rejected",
    actorUserId: profile.id,
    orgId: targetOrgId,
    entityType: "student",
    entityId: linkRequest.source_student_id,
    message:
      decision === "share"
        ? "Demande inter-coach acceptee en partage."
        : decision === "transfer"
          ? "Demande inter-coach acceptee en transfert."
          : "Demande inter-coach refusee.",
    metadata: {
      requestId: linkRequest.id,
      requesterUserId: linkRequest.requester_user_id,
      requesterOrgId: linkRequest.requester_org_id,
    },
  });

  return NextResponse.json({ ok: true, status: nextStatus });
}
