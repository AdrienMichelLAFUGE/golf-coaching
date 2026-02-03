import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";

const invitationSchema = z.object({
  studentId: z.string().min(1),
});

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
    .select("id, email, first_name, last_name")
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
  const redirectTo = origin ? `${origin}/auth/reset?flow=student` : undefined;

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    student.email,
    redirectTo ? { redirectTo } : undefined
  );

  if (inviteError && !inviteError.message.toLowerCase().includes("exists")) {
    return NextResponse.json({ error: inviteError.message }, { status: 400 });
  }

  await admin
    .from("students")
    .update({ invited_at: new Date().toISOString() })
    .eq("id", student.id);

  return NextResponse.json({ ok: true });
}
