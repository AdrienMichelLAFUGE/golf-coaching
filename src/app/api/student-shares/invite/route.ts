import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { recordActivity } from "@/lib/activity-log";

const inviteSchema = z.object({
  studentId: z.string().min(1),
  coachEmail: z.string().email(),
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
  const admin = createSupabaseAdminClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (userError || !userId) {
    await recordActivity({
      admin,
      level: "warn",
      action: "student_share.invite.denied",
      message: "Invitation partage eleve refusee: session invalide.",
    });
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, org_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    await recordActivity({
      admin,
      level: "warn",
      action: "student_share.invite.denied",
      actorUserId: userId,
      message: "Invitation partage eleve refusee: profil introuvable.",
    });
    return NextResponse.json({ error: "Profil introuvable." }, { status: 403 });
  }

  if (profile.role !== "owner") {
    await recordActivity({
      admin,
      level: "warn",
      action: "student_share.invite.denied",
      actorUserId: userId,
      orgId: profile.org_id ?? null,
      message: "Invitation partage eleve refusee: role non owner.",
    });
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { studentId, coachEmail } = parsed.data;
  const normalizedEmail = coachEmail.trim().toLowerCase();
  const requesterEmail = userData.user?.email?.toLowerCase() ?? "";
  if (normalizedEmail === requesterEmail) {
    await recordActivity({
      admin,
      level: "warn",
      action: "student_share.invite.denied",
      actorUserId: userId,
      orgId: profile.org_id ?? null,
      message: "Invitation partage eleve refusee: partage vers soi-meme.",
    });
    return NextResponse.json(
      { error: "Impossible de partager avec votre propre compte." },
      { status: 400 }
    );
  }

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id, org_id, email")
    .eq("id", studentId)
    .maybeSingle();

  if (studentError || !student) {
    await recordActivity({
      admin,
      level: "warn",
      action: "student_share.invite.denied",
      actorUserId: userId,
      orgId: profile.org_id ?? null,
      entityType: "student",
      entityId: studentId,
      message: "Invitation partage eleve refusee: eleve introuvable.",
    });
    return NextResponse.json({ error: "Eleve introuvable." }, { status: 404 });
  }

  if (student.org_id !== profile.org_id) {
    await recordActivity({
      admin,
      level: "warn",
      action: "student_share.invite.denied",
      actorUserId: userId,
      orgId: profile.org_id ?? null,
      entityType: "student",
      entityId: studentId,
      message: "Invitation partage eleve refusee: eleve hors organisation.",
    });
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }
  if (!student.email) {
    await recordActivity({
      admin,
      level: "warn",
      action: "student_share.invite.denied",
      actorUserId: userId,
      orgId: profile.org_id ?? null,
      entityType: "student",
      entityId: studentId,
      message: "Invitation partage eleve refusee: email eleve manquant.",
    });
    return NextResponse.json({ error: "Email eleve manquant." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error: insertError } = await supabase.from("student_shares").insert([
    {
      student_id: studentId,
      owner_id: userId,
      viewer_email: normalizedEmail,
      student_email: student.email.toLowerCase(),
      status: "pending_coach",
      updated_at: now,
    },
  ]);

  if (insertError) {
    const message = insertError.message?.toLowerCase() ?? "";
    if (message.includes("duplicate") || message.includes("unique")) {
      await recordActivity({
        admin,
        level: "warn",
        action: "student_share.invite.denied",
        actorUserId: userId,
        orgId: profile.org_id ?? null,
        entityType: "student",
        entityId: studentId,
        message: "Invitation partage eleve refusee: partage deja existant.",
      });
      return NextResponse.json(
        { error: "Un partage existe deja pour cet email." },
        { status: 409 }
      );
    }
    await recordActivity({
      admin,
      level: "error",
      action: "student_share.invite.failed",
      actorUserId: userId,
      orgId: profile.org_id ?? null,
      entityType: "student",
      entityId: studentId,
      message: insertError.message ?? "Creation partage eleve impossible.",
    });
    return NextResponse.json(
      { error: insertError.message ?? "Erreur lors du partage." },
      { status: 500 }
    );
  }

  await recordActivity({
    admin,
    action: "student_share.invite.success",
    actorUserId: userId,
    orgId: profile.org_id ?? null,
    entityType: "student",
    entityId: studentId,
    message: "Invitation partage eleve envoyee.",
    metadata: {
      coachEmail: normalizedEmail,
    },
  });

  return NextResponse.json({ ok: true });
}
