import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClientFromRequest } from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";

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
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (userError || !userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, org_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profil introuvable." }, { status: 403 });
  }

  if (profile.role !== "owner") {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { studentId, coachEmail } = parsed.data;
  const normalizedEmail = coachEmail.trim().toLowerCase();
  const requesterEmail = userData.user?.email?.toLowerCase() ?? "";
  if (normalizedEmail === requesterEmail) {
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
    return NextResponse.json({ error: "Eleve introuvable." }, { status: 404 });
  }

  if (student.org_id !== profile.org_id) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }
  if (!student.email) {
    return NextResponse.json(
      { error: "Email eleve manquant." },
      { status: 400 }
    );
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
      return NextResponse.json(
        { error: "Un partage existe deja pour cet email." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: insertError.message ?? "Erreur lors du partage." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
