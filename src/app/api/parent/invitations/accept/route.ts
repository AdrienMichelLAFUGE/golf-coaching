import { NextResponse } from "next/server";
import { z } from "zod";
import { recordActivity } from "@/lib/activity-log";
import { loadParentAuthContext } from "@/lib/parent/access";
import { enforceParentInvitationRateLimit } from "@/lib/parent/invitation-rate-limit";
import { hashParentInvitationToken } from "@/lib/parent/invitation-token";
import {
  normalizeParentSecretCode,
  verifyParentSecretCode,
} from "@/lib/parent/secret-code";
import { formatZodError, parseRequestJson } from "@/lib/validation";

type AcceptInvitationRow = {
  invitation_id: string;
  student_id: string;
};

type InvitationDiagnosticRow = {
  id: string;
  student_id: string;
  status: string;
  expires_at: string;
  target_parent_email: string | null;
};

type StudentSecretRow = {
  parent_secret_code_hash: string | null;
};

const acceptSchema = z.object({
  token: z.string().trim().min(16).max(256),
  secretCode: z.string().trim().min(1).max(32),
});

const GENERIC_INVITATION_ERROR = "Invitation invalide ou expiree.";

const diagnoseInvitationAcceptFailure = async (input: {
  admin: NonNullable<Awaited<ReturnType<typeof loadParentAuthContext>>["context"]>["admin"];
  tokenHash: string;
  parentEmail: string;
  secretCode: string;
}) => {
  const maybeFrom = (input.admin as { from?: unknown }).from;
  if (typeof maybeFrom !== "function") {
    return "diagnostic_unavailable";
  }

  const { data: invitationData, error: invitationError } = await input.admin
    .from("parent_child_link_invitations")
    .select("id, student_id, status, expires_at, target_parent_email")
    .eq("token_hash", input.tokenHash)
    .maybeSingle();

  const invitation = (invitationData as InvitationDiagnosticRow | null) ?? null;
  if (invitationError || !invitation) return "token_not_found";

  if (invitation.status !== "pending") {
    return `status_${invitation.status}`;
  }

  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    return "expired";
  }

  if (invitation.target_parent_email && invitation.target_parent_email !== input.parentEmail) {
    return "target_email_mismatch";
  }

  const { data: studentData, error: studentError } = await input.admin
    .from("students")
    .select("parent_secret_code_hash")
    .eq("id", invitation.student_id)
    .maybeSingle();

  const student = (studentData as StudentSecretRow | null) ?? null;
  if (studentError || !student) return "student_not_found";
  if (!student.parent_secret_code_hash) return "secret_not_configured";

  const isSecretValid = verifyParentSecretCode(
    input.secretCode,
    student.parent_secret_code_hash
  );
  if (!isSecretValid) return "secret_mismatch";

  return "no_match_unknown";
};

export async function POST(request: Request) {
  const parsedBody = await parseRequestJson(request, acceptSchema);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsedBody.error) },
      { status: 422 }
    );
  }

  const authContext = await loadParentAuthContext(request);
  if (!authContext.context) {
    return NextResponse.json(
      { error: authContext.failure?.error ?? "Acces refuse." },
      { status: authContext.failure?.status ?? 403 }
    );
  }

  const rateLimit = await enforceParentInvitationRateLimit(
    authContext.context.admin,
    authContext.context.parentUserId,
    "accept_invitation"
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Trop de tentatives. Reessaie plus tard." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      }
    );
  }

  let tokenHash = "";
  try {
    tokenHash = hashParentInvitationToken(parsedBody.data.token);
  } catch {
    return NextResponse.json({ error: GENERIC_INVITATION_ERROR }, { status: 400 });
  }

  const normalizedSecretCode = normalizeParentSecretCode(parsedBody.data.secretCode);

  const { data, error } = await authContext.context.admin.rpc(
    "accept_parent_child_invitation_secure",
    {
      _token_hash: tokenHash,
      _parent_user_id: authContext.context.parentUserId,
      _parent_email: authContext.context.parentEmail,
      _secret_code: normalizedSecretCode,
    }
  );

  if (error) {
    const diagnosis = await diagnoseInvitationAcceptFailure({
      admin: authContext.context.admin,
      tokenHash,
      parentEmail: authContext.context.parentEmail,
      secretCode: normalizedSecretCode,
    }).catch(() => "diagnostic_failed");

    await recordActivity({
      admin: authContext.context.admin,
      level: "warn",
      action: "parent.invitation.accept_denied",
      actorUserId: authContext.context.parentUserId,
      message: "Acceptation invitation parent refusee.",
      metadata: {
        parentUserId: authContext.context.parentUserId,
        reason: error.message,
        diagnosis,
      },
    });
    return NextResponse.json({ error: GENERIC_INVITATION_ERROR }, { status: 400 });
  }

  const row = Array.isArray(data) ? ((data[0] as AcceptInvitationRow | undefined) ?? null) : null;
  if (!row?.invitation_id || !row.student_id) {
    const diagnosis = await diagnoseInvitationAcceptFailure({
      admin: authContext.context.admin,
      tokenHash,
      parentEmail: authContext.context.parentEmail,
      secretCode: normalizedSecretCode,
    }).catch(() => "diagnostic_failed");

    await recordActivity({
      admin: authContext.context.admin,
      level: "warn",
      action: "parent.invitation.accept_denied",
      actorUserId: authContext.context.parentUserId,
      message: "Acceptation invitation parent refusee.",
      metadata: {
        parentUserId: authContext.context.parentUserId,
        diagnosis,
      },
    });
    return NextResponse.json({ error: GENERIC_INVITATION_ERROR }, { status: 400 });
  }

  await recordActivity({
    admin: authContext.context.admin,
    action: "parent.invitation.accepted",
    actorUserId: authContext.context.parentUserId,
    entityType: "student",
    entityId: row.student_id,
    message: "Invitation parent acceptee.",
    metadata: {
      parentUserId: authContext.context.parentUserId,
      invitationId: row.invitation_id,
      studentId: row.student_id,
    },
  });

  return NextResponse.json({
    ok: true,
    studentId: row.student_id,
  });
}
