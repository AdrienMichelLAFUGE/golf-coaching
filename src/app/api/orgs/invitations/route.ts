import { NextResponse } from "next/server";
import { z } from "zod";
import Brevo from "@getbrevo/brevo";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { env } from "@/env";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { loadPersonalPlanTier } from "@/lib/plan-access";
import { recordActivity } from "@/lib/activity-log";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "coach"]),
});

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, inviteSchema);
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
    .select("id, org_id")
    .eq("id", userData.user.id)
    .single();

  if (!profile?.org_id) {
    await recordActivity({
      admin,
      level: "warn",
      action: "organization.invitation.denied",
      actorUserId: userData.user.id,
      message: "Invitation membre refusee: organisation introuvable.",
    });
    return NextResponse.json({ error: "Organisation introuvable." }, { status: 403 });
  }

  const { data: membership } = await admin
    .from("org_memberships")
    .select("role, status")
    .eq("org_id", profile.org_id)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (!membership || membership.status !== "active" || membership.role !== "admin") {
    await recordActivity({
      admin,
      level: "warn",
      action: "organization.invitation.denied",
      actorUserId: profile.id,
      orgId: profile.org_id,
      message: "Invitation membre refusee: admin requis.",
    });
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const planTier = await loadPersonalPlanTier(admin, profile.id);
  if (planTier === "free") {
    await recordActivity({
      admin,
      level: "warn",
      action: "organization.invitation.denied",
      actorUserId: profile.id,
      orgId: profile.org_id,
      message: "Invitation membre refusee: plan Free.",
    });
    return NextResponse.json(
      { error: "Lecture seule: plan Free en organisation." },
      { status: 403 }
    );
  }

  if (parsed.data.role === "admin") {
    const { data: activeAdmins } = await admin
      .from("org_memberships")
      .select("id")
      .eq("org_id", profile.org_id)
      .eq("role", "admin")
      .eq("status", "active")
      .limit(1);
    if ((activeAdmins ?? []).length > 0) {
      await recordActivity({
        admin,
        level: "warn",
        action: "organization.invitation.denied",
        actorUserId: profile.id,
        orgId: profile.org_id,
        message: "Invitation admin refusee: un admin actif existe deja.",
      });
      return NextResponse.json({ error: "Un admin actif existe deja." }, { status: 409 });
    }
  }

  const { data: invitation, error: inviteError } = await admin
    .from("org_invitations")
    .insert([
      {
        org_id: profile.org_id,
        email: parsed.data.email.toLowerCase(),
        role: parsed.data.role,
        invited_by: profile.id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ])
    .select("id, token")
    .single();

  if (inviteError || !invitation) {
    await recordActivity({
      admin,
      level: "error",
      action: "organization.invitation.failed",
      actorUserId: profile.id,
      orgId: profile.org_id,
      message: inviteError?.message ?? "Invitation membre impossible.",
      metadata: {
        email: parsed.data.email.toLowerCase(),
        role: parsed.data.role,
      },
    });
    return NextResponse.json(
      { error: inviteError?.message ?? "Invitation impossible." },
      { status: 400 }
    );
  }

  const origin = request.headers.get("origin") ?? "";
  const acceptUrl = origin
    ? `${origin}/app/workspaces/accept?token=${invitation.token}`
    : undefined;

  const apiKey = env.BREVO_API_KEY;
  const senderEmail = env.BREVO_SENDER_EMAIL;
  const senderName = env.BREVO_SENDER_NAME;
  const emailSent = Boolean(acceptUrl && apiKey && senderEmail && senderName);
  if (emailSent) {
    const apiInstance = new Brevo.TransactionalEmailsApi();
    apiInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, apiKey);
    await apiInstance.sendTransacEmail({
      sender: { email: senderEmail, name: senderName },
      to: [{ email: parsed.data.email }],
      subject: "Invitation a rejoindre une organisation",
      htmlContent: `
        <p>Bonjour,</p>
        <p>Vous avez ete invite a rejoindre une organisation Golf Coaching.</p>
        <p><a href="${acceptUrl}">Accepter l invitation</a></p>
      `,
    });
  }

  await recordActivity({
    admin,
    action: "organization.invitation.success",
    actorUserId: profile.id,
    orgId: profile.org_id,
    entityType: "org_invitation",
    entityId: invitation.id,
    message: "Invitation membre envoyee.",
    metadata: {
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
      emailSent,
    },
  });

  return NextResponse.json({ ok: true, acceptUrl, emailSent });
}
