import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { recordActivity } from "@/lib/activity-log";
import { formatZodError, parseRequestJson } from "@/lib/validation";

const updateEmailSchema = z.object({
  email: z.string().trim().email().max(320),
});

type StudentAccountRow = {
  student_id: string;
};

export async function PATCH(request: Request) {
  const parsed = await parseRequestJson(request, updateEmailSchema);
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
  const userId = userData.user.id;

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile || profile.role !== "student") {
    await recordActivity({
      admin,
      level: "warn",
      action: "student.email.update.denied",
      actorUserId: userId,
      entityType: "profile",
      entityId: userId,
      message: "Mise a jour email eleve refusee: role non autorise.",
    });
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const currentEmail = userData.user.email?.trim().toLowerCase() ?? "";

  const { data: accountRows, error: accountError } = await admin
    .from("student_accounts")
    .select("student_id")
    .eq("user_id", userId);

  if (accountError) {
    await recordActivity({
      admin,
      level: "error",
      action: "student.email.update.failed",
      actorUserId: userId,
      entityType: "profile",
      entityId: userId,
      message: accountError.message ?? "Chargement liens eleve impossible.",
    });
    return NextResponse.json(
      { error: accountError.message ?? "Chargement eleve impossible." },
      { status: 500 }
    );
  }

  const studentIds = ((accountRows ?? []) as StudentAccountRow[]).map((row) => row.student_id);
  if (studentIds.length === 0) {
    await recordActivity({
      admin,
      level: "warn",
      action: "student.email.update.denied",
      actorUserId: userId,
      entityType: "profile",
      entityId: userId,
      message: "Mise a jour email eleve refusee: aucun profil eleve lie.",
    });
    return NextResponse.json({ error: "Profil eleve introuvable." }, { status: 404 });
  }

  const shouldUpdateAuthEmail = normalizedEmail !== currentEmail;
  if (shouldUpdateAuthEmail) {
    const { error: authUpdateError } = await supabase.auth.updateUser({
      email: normalizedEmail,
    });

    if (authUpdateError) {
      await recordActivity({
        admin,
        level: "error",
        action: "student.email.update.failed",
        actorUserId: userId,
        entityType: "profile",
        entityId: userId,
        message: authUpdateError.message ?? "Mise a jour email auth impossible.",
      });
      return NextResponse.json(
        { error: authUpdateError.message ?? "Mise a jour email impossible." },
        { status: 400 }
      );
    }
  }

  const { error: studentUpdateError } = await admin
    .from("students")
    .update({ email: normalizedEmail })
    .in("id", studentIds);

  if (studentUpdateError) {
    if (shouldUpdateAuthEmail && currentEmail) {
      await admin.auth.admin.updateUserById(userId, {
        email: currentEmail,
      });
    }

    await recordActivity({
      admin,
      level: "error",
      action: "student.email.update.failed",
      actorUserId: userId,
      entityType: "profile",
      entityId: userId,
      message: studentUpdateError.message ?? "Propagation email eleve impossible.",
      metadata: {
        studentCount: studentIds.length,
      },
    });

    return NextResponse.json(
      { error: studentUpdateError.message ?? "Propagation email impossible." },
      { status: 500 }
    );
  }

  await recordActivity({
    admin,
    action: "student.email.update.success",
    actorUserId: userId,
    entityType: "profile",
    entityId: userId,
    message: "Email eleve synchronise sur tous les workspaces lies.",
    metadata: {
      studentCount: studentIds.length,
      emailChanged: shouldUpdateAuthEmail,
    },
  });

  return NextResponse.json({
    ok: true,
    email: normalizedEmail,
    syncedStudentCount: studentIds.length,
    requiresEmailConfirmation: shouldUpdateAuthEmail,
  });
}
