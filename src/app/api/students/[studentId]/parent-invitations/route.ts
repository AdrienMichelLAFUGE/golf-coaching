import { NextResponse } from "next/server";
import { z } from "zod";
import Brevo from "@getbrevo/brevo";
import { recordActivity } from "@/lib/activity-log";
import { env } from "@/env";
import { loadParentInvitationActor } from "@/lib/parent/invitation-access";
import { enforceParentInvitationRateLimit } from "@/lib/parent/invitation-rate-limit";
import {
  generateParentInvitationToken,
  hashParentInvitationToken,
} from "@/lib/parent/invitation-token";
import { cloneDefaultParentLinkPermissions } from "@/lib/parent/permissions";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";

type Params = {
  params: { studentId: string } | Promise<{ studentId: string }>;
};

type InvitationRow = {
  id: string;
  target_parent_email: string | null;
  created_by_role: "owner" | "coach" | "staff" | "student";
  status: "pending" | "accepted" | "revoked";
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

type StudentSecretCodeRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  parent_secret_code_hash: string | null;
};

const paramsSchema = z.object({
  studentId: z.string().uuid(),
});

const createInvitationSchema = z.object({
  parentEmail: z.string().trim().email().max(320),
  expiresInDays: z.coerce.number().int().min(1).max(30).optional(),
});

const resolveSiteOrigin = (request: Request) => {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto || "https";

  if (host) {
    return `${proto}://${host}`;
  }

  try {
    return new URL(request.url).origin;
  } catch {
    return env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  }
};

const buildInviteUrl = (request: Request, token: string) =>
  `${resolveSiteOrigin(request)}/parent/invitations/accept?token=${encodeURIComponent(token)}`;

const normalizeRequiredEmail = (value: string) => value.trim().toLowerCase();

const buildStudentDisplayName = (student: {
  first_name: string | null;
  last_name: string | null;
}) => {
  const firstName = student.first_name?.trim() ?? "";
  const lastName = student.last_name?.trim() ?? "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  return fullName || "l eleve";
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const sendParentInvitationEmail = async (input: {
  to: string;
  inviteUrl: string;
  expiresAt: string;
  studentDisplayName: string;
}) => {
  const apiInstance = new Brevo.TransactionalEmailsApi();
  apiInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, env.BREVO_API_KEY);

  const acceptHref = escapeHtml(input.inviteUrl);
  const signupHref = escapeHtml(
    `${env.NEXT_PUBLIC_SITE_URL}/signup/parent?next=${encodeURIComponent(
      `/parent/invitations/accept?token=${new URL(input.inviteUrl).searchParams.get("token") ?? ""}`
    )}`
  );
  const expiresAtLabel = new Date(input.expiresAt).toLocaleString("fr-FR");
  const studentName = escapeHtml(input.studentDisplayName);

  await apiInstance.sendTransacEmail({
    sender: {
      email: env.BREVO_SENDER_EMAIL,
      name: env.BREVO_SENDER_NAME,
    },
    to: [{ email: input.to }],
    subject: "Invitation parent SwingFlow",
    htmlContent: `
      <p>Bonjour,</p>
      <p>Vous avez reçu une invitation parent pour suivre un élève sur SwingFlow.</p>
      <p>Eleve concerne : <strong>${studentName}</strong>.</p>
      <p>Ce lien est personnel et expire le ${escapeHtml(expiresAtLabel)}.</p>
      <p style="margin: 20px 0;">
        <a href="${acceptHref}" style="display:inline-block;padding:10px 16px;background:#34d399;color:#052e16;text-decoration:none;border-radius:999px;font-weight:600;">
          Accepter
        </a>
      </p>
      <p>Si vous n’avez pas encore de compte parent, créez-en un ici :</p>
      <p><a href="${signupHref}">Créer mon compte parent</a></p>
      <p>Après connexion, vous devrez saisir le code secret élève pour finaliser le rattachement.</p>
      <p>— ${escapeHtml(env.BREVO_SENDER_NAME)}</p>
    `,
  });
};

export async function GET(request: Request, { params }: Params) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsedParams.error) },
      { status: 422 }
    );
  }

  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const access = await loadParentInvitationActor(
    admin,
    userData.user.id,
    parsedParams.data.studentId
  );
  if (!access.allowed) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { data, error } = await admin
    .from("parent_child_link_invitations")
    .select(
      "id, target_parent_email, created_by_role, status, created_at, expires_at, accepted_at, revoked_at"
    )
    .eq("student_id", parsedParams.data.studentId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json(
      { error: "Chargement des invitations impossible." },
      { status: 400 }
    );
  }

  const invitations = ((data ?? []) as InvitationRow[]).map((row) => ({
    id: row.id,
    parentEmail: row.target_parent_email,
    createdByRole: row.created_by_role,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
  }));

  return NextResponse.json({ invitations });
}

export async function POST(request: Request, { params }: Params) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsedParams.error) },
      { status: 422 }
    );
  }

  const parsedBody = await parseRequestJson(request, createInvitationSchema);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsedBody.error) },
      { status: 422 }
    );
  }

  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const access = await loadParentInvitationActor(
    admin,
    userData.user.id,
    parsedParams.data.studentId
  );
  if (!access.allowed) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const rateLimit = await enforceParentInvitationRateLimit(
    admin,
    userData.user.id,
    "create_invitation"
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

  const { data: studentData, error: studentError } = await admin
    .from("students")
    .select("id, first_name, last_name, parent_secret_code_hash")
    .eq("id", parsedParams.data.studentId)
    .maybeSingle();
  const student = (studentData as StudentSecretCodeRow | null) ?? null;
  if (studentError || !student) {
    return NextResponse.json(
      { error: "Eleve introuvable." },
      { status: 404 }
    );
  }
  if (!student.parent_secret_code_hash) {
    return NextResponse.json(
      {
        error:
          "Code secret eleve non configure. Regenerer le code secret avant d envoyer l invitation.",
      },
      { status: 409 }
    );
  }

  const expiresInDays = parsedBody.data.expiresInDays ?? 7;
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  const parentEmail = normalizeRequiredEmail(parsedBody.data.parentEmail);
  const token = generateParentInvitationToken();
  const tokenHash = hashParentInvitationToken(token);

  const { data: insertData, error: insertError } = await admin
    .from("parent_child_link_invitations")
    .insert({
      student_id: parsedParams.data.studentId,
      created_by_user_id: userData.user.id,
      created_by_role: access.actorRole,
      target_parent_email: parentEmail,
      token_hash: tokenHash,
      permissions: cloneDefaultParentLinkPermissions(),
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id")
    .maybeSingle();

  if (insertError || !insertData) {
    await recordActivity({
      admin,
      level: "error",
      action: "parent.invitation.created_failed",
      actorUserId: userData.user.id,
      entityType: "student",
      entityId: parsedParams.data.studentId,
      message: insertError?.message ?? "Creation invitation parent impossible.",
      metadata: {
        actorRole: access.actorRole,
      },
    });
    return NextResponse.json(
      { error: "Creation de l invitation impossible." },
      { status: 400 }
    );
  }

  await recordActivity({
    admin,
    action: "parent.invitation.created",
    actorUserId: userData.user.id,
    entityType: "student",
    entityId: parsedParams.data.studentId,
    message: "Invitation parent creee.",
    metadata: {
      actorRole: access.actorRole,
      invitationId: (insertData as { id: string }).id,
      hasTargetEmail: true,
      expiresAt,
    },
  });

  const inviteUrl = buildInviteUrl(request, token);
  try {
    await sendParentInvitationEmail({
      to: parentEmail,
      inviteUrl,
      expiresAt,
      studentDisplayName: buildStudentDisplayName(student),
    });
    await recordActivity({
      admin,
      action: "parent.invitation.email_sent",
      actorUserId: userData.user.id,
      entityType: "student",
      entityId: parsedParams.data.studentId,
      message: "Invitation parent envoyee par email.",
      metadata: {
        actorRole: access.actorRole,
        invitationId: (insertData as { id: string }).id,
      },
    });
  } catch (emailError) {
    const now = new Date().toISOString();
    await admin
      .from("parent_child_link_invitations")
      .update({
        status: "revoked",
        revoked_at: now,
        revoked_by: userData.user.id,
      })
      .eq("id", (insertData as { id: string }).id)
      .eq("status", "pending");

    await recordActivity({
      admin,
      level: "error",
      action: "parent.invitation.email_failed",
      actorUserId: userData.user.id,
      entityType: "student",
      entityId: parsedParams.data.studentId,
      message: emailError instanceof Error ? emailError.message : "Envoi email invitation impossible.",
      metadata: {
        actorRole: access.actorRole,
        invitationId: (insertData as { id: string }).id,
      },
    });

    return NextResponse.json(
      { error: "Envoi de l invitation impossible. Reessaie plus tard." },
      { status: 503 }
    );
  }

  return NextResponse.json({
    ok: true,
    invitationId: (insertData as { id: string }).id,
    expiresAt,
    emailSent: true,
  });
}
