import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";

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
  if (!email) {
    return NextResponse.json({ error: "Email introuvable." }, { status: 400 });
  }

  const authCheck = createSupabaseServerClient();
  const { error: signInError } = await authCheck.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });
  if (signInError) {
    return NextResponse.json({ error: "Mot de passe incorrect." }, { status: 401 });
  }

  const now = new Date().toISOString();
  const admin = createSupabaseAdminClient();

  const { data: accountRows, error: accountError } = await admin
    .from("student_accounts")
    .select("student_id")
    .eq("user_id", userId);

  if (accountError) {
    return NextResponse.json(
      { error: accountError.message ?? "Erreur lors du chargement eleve." },
      { status: 500 }
    );
  }

  const studentIds = (accountRows ?? []).map((row) => row.student_id);
  if (studentIds.length === 0) {
    return NextResponse.json({ error: "Eleve introuvable." }, { status: 404 });
  }

  const { data: students, error: studentsError } = await admin
    .from("students")
    .select("id, avatar_url")
    .in("id", studentIds);

  if (studentsError) {
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

  return NextResponse.json({ ok: true });
}
