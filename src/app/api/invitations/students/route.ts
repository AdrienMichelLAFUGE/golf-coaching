import { NextResponse } from "next/server";
import { z } from "zod";
import Brevo from "@getbrevo/brevo";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { env } from "@/env";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { recordActivity } from "@/lib/activity-log";

const invitationSchema = z.object({
  studentId: z.string().min(1),
});

const findUserByEmail = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  email: string
) => {
  const target = email.toLowerCase();
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return { error };
    const users = data?.users ?? [];
    const match = users.find((user) => (user.email ?? "").toLowerCase() === target);
    if (match) return { user: match };
    if (!data?.nextPage || users.length < perPage) break;
    page = data.nextPage;
  }

  return { user: null };
};

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, invitationSchema);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }
  const { studentId } = parsed.data;

  const supabase = createSupabaseServerClientFromRequest(request);

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, org_id")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profil introuvable." }, { status: 403 });
  }

  if (!["owner", "coach", "staff"].includes(profile.role)) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id, org_id, email, first_name, last_name")
    .eq("id", studentId)
    .maybeSingle();

  if (studentError || !student) {
    return NextResponse.json({ error: "Eleve introuvable." }, { status: 404 });
  }

  if (!student.email) {
    return NextResponse.json({ error: "Cet eleve n a pas d email." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const origin = request.headers.get("origin") ?? "";
  const baseUrl = env.NEXT_PUBLIC_SITE_URL || origin;
  const redirectTo = baseUrl ? `${baseUrl}/auth/reset?flow=student` : undefined;

  const { user: existingUser, error: lookupError } = await findUserByEmail(
    admin,
    student.email
  );

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 400 });
  }

  let userId = existingUser?.id ?? null;
  let invited = false;
  let emailSent = false;

  if (!userId) {
    const { data: invitedData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      student.email,
      redirectTo ? { redirectTo } : undefined
    );

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 400 });
    }

    userId = invitedData?.user?.id ?? null;
    invited = true;
  }

  if (!userId) {
    return NextResponse.json(
      { error: "Utilisateur introuvable pour cette invitation." },
      { status: 400 }
    );
  }

  const { data: existingStudentAccount, error: studentAccountLookupError } = await admin
    .from("student_accounts")
    .select("user_id")
    .eq("student_id", student.id)
    .maybeSingle();

  if (studentAccountLookupError) {
    return NextResponse.json({ error: studentAccountLookupError.message }, { status: 400 });
  }

  const linkedUserId =
    (existingStudentAccount as { user_id: string } | null)?.user_id ?? null;
  if (linkedUserId && linkedUserId !== userId) {
    await recordActivity({
      admin,
      level: "warn",
      action: "student.invite.blocked",
      actorUserId: userData.user.id,
      orgId: profile.org_id,
      entityType: "student",
      entityId: student.id,
      message: "Invitation bloquee: eleve deja lie a un autre compte.",
      metadata: {
        studentEmail: student.email,
        linkedUserId,
        targetUserId: userId,
      },
    });
    return NextResponse.json(
      {
        error:
          "Conflit de liaison: cet eleve est deja relie a un autre compte. L email doit etre modifie par l eleve depuis ses parametres.",
      },
      { status: 409 }
    );
  }

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, role, org_id")
    .eq("id", userId)
    .maybeSingle();

  if (existingProfile && existingProfile.role !== "student") {
    await recordActivity({
      admin,
      level: "warn",
      action: "student.invite.blocked",
      actorUserId: userData.user.id,
      orgId: profile.org_id,
      entityType: "student",
      entityId: student.id,
      message: "Invitation bloquee: email deja associe a un compte coach.",
      metadata: {
        studentEmail: student.email,
        targetUserId: userId,
      },
    });
    return NextResponse.json(
      { error: "Cet email correspond deja a un compte coach." },
      { status: 409 }
    );
  }

  const fullName = `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim();
  if (!existingProfile) {
    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: userId,
        org_id: student.org_id,
        role: "student",
        full_name: fullName || null,
        active_workspace_id: student.org_id,
      },
      { onConflict: "id" }
    );

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }
  }

  if (!linkedUserId) {
    const { error: linkError } = await admin.from("student_accounts").upsert(
      [
        {
          student_id: student.id,
          user_id: userId,
        },
      ],
      { onConflict: "student_id" }
    );

    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 400 });
    }
  }

  await admin
    .from("students")
    .update({ invited_at: new Date().toISOString() })
    .eq("id", student.id);

  if (existingUser && baseUrl) {
    const apiKey = env.BREVO_API_KEY;
    const senderEmail = env.BREVO_SENDER_EMAIL;
    const senderName = env.BREVO_SENDER_NAME;
    if (apiKey && senderEmail && senderName) {
      const apiInstance = new Brevo.TransactionalEmailsApi();
      apiInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, apiKey);
      await apiInstance.sendTransacEmail({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: student.email }],
        subject: "Acces eleve disponible",
        htmlContent: `
          <p>Bonjour,</p>
          <p>Votre coach vous a ajoute a SwingFlow.</p>
          <p><a href="${baseUrl}/app/eleve">Acceder a votre espace eleve</a></p>
        `,
      });
      emailSent = true;
    }
  }

  await recordActivity({
    admin,
    action: "student.invite.success",
    actorUserId: userData.user.id,
    orgId: profile.org_id,
    entityType: "student",
    entityId: student.id,
    message: invited
      ? "Invitation eleve envoyee."
      : "Eleve existant relie a son compte.",
    metadata: {
      studentEmail: student.email,
      invited,
      emailSent,
      targetUserId: userId,
    },
  });

  return NextResponse.json({
    ok: true,
    invited,
    emailSent,
  });
}
