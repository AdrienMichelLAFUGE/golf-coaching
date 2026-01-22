import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

  const user = userData.user;
  const email = user.email?.trim();
  if (!email) {
    return NextResponse.json({ error: "Email introuvable." }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, org_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.id) {
    return NextResponse.json({ ok: true, role: profile.role });
  }

  const { data: student } = await admin
    .from("students")
    .select("id, org_id, first_name, last_name")
    .ilike("email", email)
    .maybeSingle();

  if (student?.id && student.org_id) {
    const fullName = `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim();
    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: user.id,
        org_id: student.org_id,
        role: "student",
        full_name: fullName || null,
      },
      { onConflict: "id" }
    );

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, role: "student" });
  }

  const roleHint = String(user.user_metadata?.role ?? "").toLowerCase();
  if (roleHint !== "coach" && roleHint !== "owner") {
    return NextResponse.json(
      { error: "Acces reserve aux comptes invites." },
      { status: 403 }
    );
  }

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert([{ name: "Nouvelle organisation" }])
    .select("id")
    .single();

  if (orgError || !org) {
    return NextResponse.json(
      { error: orgError?.message ?? "Creation organisation impossible." },
      { status: 400 }
    );
  }

  const fullName = String(user.user_metadata?.full_name ?? "").trim();
  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: user.id,
      org_id: org.id,
      role: "owner",
      full_name: fullName || null,
    },
    { onConflict: "id" }
  );

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, role: "owner" });
}
