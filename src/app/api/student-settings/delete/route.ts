import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { recordActivity } from "@/lib/activity-log";

const deleteSchema = z.object({
  password: z.string().min(8),
});

const STORAGE_BUCKET = "coach-assets";

const extractStoragePath = (url: string, bucket: string) => {
  try {
    const parsed = new URL(url);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const index = parsed.pathname.indexOf(marker);
    if (index === -1) return null;
    return decodeURIComponent(parsed.pathname.slice(index + marker.length));
  } catch {
    return null;
  }
};

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, deleteSchema);
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

  const email = userData.user.email?.trim();
  const userId = userData.user.id;
  const admin = createSupabaseAdminClient();
  if (!email) {
    await recordActivity({
      admin,
      level: "warn",
      action: "student.delete.denied",
      actorUserId: userId,
      entityType: "profile",
      entityId: userId,
      message: "Suppression eleve refusee: email introuvable.",
    });
    return NextResponse.json({ error: "Email introuvable." }, { status: 400 });
  }

  const authCheck = createSupabaseServerClient();
  const { error: signInError } = await authCheck.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });
  if (signInError) {
    await recordActivity({
      admin,
      level: "warn",
      action: "student.delete.denied",
      actorUserId: userId,
      entityType: "profile",
      entityId: userId,
      message: "Suppression eleve refusee: mot de passe invalide.",
    });
    return NextResponse.json({ error: "Mot de passe incorrect." }, { status: 401 });
  }

  const now = new Date().toISOString();

  const { data: accountRows, error: accountError } = await admin
    .from("student_accounts")
    .select("student_id")
    .eq("user_id", userId);

  if (accountError) {
    await recordActivity({
      admin,
      level: "error",
      action: "student.delete.failed",
      actorUserId: userId,
      entityType: "profile",
      entityId: userId,
      message: accountError.message ?? "Chargement comptes eleve impossible.",
    });
    return NextResponse.json(
      { error: accountError.message ?? "Erreur lors du chargement eleve." },
      { status: 500 }
    );
  }

  const studentIds = (accountRows ?? []).map((row) => row.student_id);
  if (studentIds.length === 0) {
    await recordActivity({
      admin,
      level: "warn",
      action: "student.delete.denied",
      actorUserId: userId,
      entityType: "profile",
      entityId: userId,
      message: "Suppression eleve refusee: aucun profil eleve lie.",
    });
    return NextResponse.json({ error: "Eleve introuvable." }, { status: 404 });
  }

  const { data: students, error: studentsError } = await admin
    .from("students")
    .select("id, avatar_url")
    .in("id", studentIds);

  if (studentsError) {
    await recordActivity({
      admin,
      level: "error",
      action: "student.delete.failed",
      actorUserId: userId,
      entityType: "profile",
      entityId: userId,
      message: studentsError.message ?? "Chargement eleves impossible.",
    });
    return NextResponse.json(
      { error: studentsError.message ?? "Erreur lors du chargement eleve." },
      { status: 500 }
    );
  }

  const anonymizedAuthEmail = `deleted+${userId}@example.invalid`;

  const { error: authUpdateError } = await admin.auth.admin.updateUserById(
    userId,
    { email: anonymizedAuthEmail }
  );

  if (authUpdateError) {
    await recordActivity({
      admin,
      level: "error",
      action: "student.delete.failed",
      actorUserId: userId,
      entityType: "profile",
      entityId: userId,
      message: authUpdateError.message ?? "Anonymisation auth impossible.",
    });
    return NextResponse.json(
      { error: authUpdateError.message ?? "Anonymisation auth impossible." },
      { status: 500 }
    );
  }

  const { error: revokeError } = await admin
    .from("student_shares")
    .update({
      status: "revoked",
      revoked_at: now,
      updated_at: now,
    })
    .in("student_id", studentIds)
    .eq("status", "active");

  if (revokeError) {
    await admin.auth.admin.updateUserById(userData.user.id, { email });
    await recordActivity({
      admin,
      level: "error",
      action: "student.delete.failed",
      actorUserId: userId,
      entityType: "profile",
      entityId: userId,
      message: revokeError.message ?? "Revocation partages eleve impossible.",
    });
    return NextResponse.json(
      { error: revokeError.message ?? "Erreur lors de la revocation." },
      { status: 500 }
    );
  }

  for (const student of students ?? []) {
    const anonymizedStudentEmail = `deleted+${student.id}@example.invalid`;
    const { error: studentUpdateError } = await admin
      .from("students")
      .update({
        first_name: "Compte supprime",
        last_name: null,
        email: anonymizedStudentEmail,
        avatar_url: null,
        deleted_at: now,
      })
      .eq("id", student.id);

    if (studentUpdateError) {
      await admin.auth.admin.updateUserById(userId, { email });
      await recordActivity({
        admin,
        level: "error",
        action: "student.delete.failed",
        actorUserId: userId,
        entityType: "student",
        entityId: student.id,
        message: studentUpdateError.message ?? "Anonymisation eleve impossible.",
      });
      return NextResponse.json(
        { error: studentUpdateError.message ?? "Anonymisation eleve impossible." },
        { status: 500 }
      );
    }
  }

  const { error: profileUpdateError } = await admin
    .from("profiles")
    .update({
      full_name: "Compte supprime",
      avatar_url: null,
      deleted_at: now,
    })
    .eq("id", userId);

  if (profileUpdateError) {
    await admin.auth.admin.updateUserById(userData.user.id, { email });
    await recordActivity({
      admin,
      level: "error",
      action: "student.delete.failed",
      actorUserId: userId,
      entityType: "profile",
      entityId: userId,
      message: profileUpdateError.message ?? "Anonymisation profil impossible.",
    });
    return NextResponse.json(
      { error: profileUpdateError.message ?? "Anonymisation profil impossible." },
      { status: 500 }
    );
  }

  for (const student of students ?? []) {
    if (!student.avatar_url) continue;
    const path = extractStoragePath(student.avatar_url, STORAGE_BUCKET);
    if (!path) continue;
    const { error: removeError } = await admin.storage
      .from(STORAGE_BUCKET)
      .remove([path]);
    if (removeError) {
      await recordActivity({
        admin,
        level: "error",
        action: "student.delete.failed",
        actorUserId: userId,
        entityType: "student",
        entityId: student.id,
        message: removeError.message ?? "Suppression avatar impossible.",
      });
      return NextResponse.json(
        { error: removeError.message ?? "Suppression avatar impossible." },
        { status: 500 }
      );
    }
  }

  const { error: unlinkError } = await admin
    .from("student_accounts")
    .delete()
    .eq("user_id", userId);

  if (unlinkError) {
    await recordActivity({
      admin,
      level: "error",
      action: "student.delete.failed",
      actorUserId: userId,
      entityType: "profile",
      entityId: userId,
      message: unlinkError.message ?? "Suppression liens eleve impossible.",
    });
    return NextResponse.json(
      { error: unlinkError.message ?? "Suppression compte eleve impossible." },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7)
    : authHeader;
  if (token) {
    await admin.auth.admin.signOut(token, "global");
  }

  await recordActivity({
    admin,
    action: "student.delete.success",
    actorUserId: userId,
    entityType: "profile",
    entityId: userId,
    message: "Compte eleve supprime.",
    metadata: {
      studentCount: studentIds.length,
    },
  });

  return NextResponse.json({ ok: true });
}
