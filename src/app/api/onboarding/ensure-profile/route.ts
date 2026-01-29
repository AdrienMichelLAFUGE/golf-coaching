import { NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { defaultSectionTemplates } from "@/lib/default-section-templates";

export async function POST(request: Request) {
  const supabase = createSupabaseServerClientFromRequest(request);

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const user = userData.user;
  const email = user.email?.trim();
  if (!email) {
    return NextResponse.json({ error: "Email introuvable." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

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

  const templatesPayload = defaultSectionTemplates.map((template) => ({
    org_id: org.id,
    title: template.title,
    type: template.type,
    tags: template.tags,
  }));
  const { error: templatesError } = await admin
    .from("section_templates")
    .upsert(templatesPayload, { onConflict: "org_id,title" });

  if (templatesError) {
    const { error: fallbackError } = await admin.from("section_templates").upsert(
      defaultSectionTemplates.map((template) => ({
        org_id: org.id,
        title: template.title,
        type: template.type,
      })),
      { onConflict: "org_id,title" }
    );

    if (fallbackError) {
      return NextResponse.json({ error: fallbackError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true, role: "owner" });
}
