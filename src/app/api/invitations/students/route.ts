import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Payload = {
  studentId?: string;
};

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Missing Supabase env vars." },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

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

  const body = (await request.json()) as Payload;
  if (!body.studentId) {
    return NextResponse.json({ error: "Student ID missing." }, { status: 400 });
  }

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id, email, first_name, last_name")
    .eq("id", body.studentId)
    .maybeSingle();

  if (studentError || !student) {
    return NextResponse.json({ error: "Eleve introuvable." }, { status: 404 });
  }

  if (!student.email) {
    return NextResponse.json(
      { error: "Cet eleve n a pas d email." },
      { status: 400 }
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const origin = request.headers.get("origin") ?? "";
  const redirectTo = origin ? `${origin}/auth/reset` : undefined;

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
