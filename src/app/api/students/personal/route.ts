import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { generateParentSecretCode, hashParentSecretCode } from "@/lib/parent/secret-code";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { recordActivity } from "@/lib/activity-log";

const personalStudentSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().optional().nullable().or(z.literal("")),
  email: z.string().email().optional().nullable().or(z.literal("")),
  playing_hand: z.enum(["right", "left"]).optional().nullable().or(z.literal("")),
});

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, personalStudentSchema);
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
  const { data: profile } = await admin
    .from("profiles")
    .select("id, org_id, active_workspace_id")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Profil introuvable." }, { status: 403 });
  }

  const targetOrgId = profile.active_workspace_id ?? profile.org_id;
  if (!targetOrgId) {
    await recordActivity({
      admin,
      level: "warn",
      action: "student.create.denied",
      actorUserId: profile.id,
      message: "Creation eleve refusee: workspace personnel introuvable.",
    });
    return NextResponse.json({ error: "Workspace introuvable." }, { status: 403 });
  }

  const { data: workspace } = await admin
    .from("organizations")
    .select("id, workspace_type, owner_profile_id")
    .eq("id", targetOrgId)
    .maybeSingle();

  if (!workspace || workspace.workspace_type !== "personal") {
    await recordActivity({
      admin,
      level: "warn",
      action: "student.create.denied",
      actorUserId: profile.id,
      orgId: targetOrgId,
      message: "Creation eleve refusee: workspace non personnel.",
    });
    return NextResponse.json(
      { error: "Creation eleve perso uniquement depuis un workspace personnel." },
      { status: 403 }
    );
  }

  if (workspace.owner_profile_id !== profile.id) {
    await recordActivity({
      admin,
      level: "warn",
      action: "student.create.denied",
      actorUserId: profile.id,
      orgId: targetOrgId,
      message: "Creation eleve refusee: utilisateur non proprietaire du workspace personnel.",
    });
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const normalizedEmail = parsed.data.email?.trim().toLowerCase() ?? "";
  const parentSecretCode = generateParentSecretCode();
  const parentSecretCodeHash = hashParentSecretCode(parentSecretCode);
  const { data: student, error: insertError } = await admin
    .from("students")
    .insert([
      {
        org_id: targetOrgId,
        first_name: parsed.data.first_name.trim(),
        last_name: parsed.data.last_name?.trim() || null,
        email: normalizedEmail || null,
        playing_hand: parsed.data.playing_hand || null,
        parent_secret_code_plain: parentSecretCode,
        parent_secret_code_hash: parentSecretCodeHash,
        parent_secret_code_rotated_at: new Date().toISOString(),
      },
    ])
    .select("id")
    .single();

  if (insertError || !student) {
    await recordActivity({
      admin,
      level: "error",
      action: "student.create.failed",
      actorUserId: profile.id,
      orgId: targetOrgId,
      message: insertError?.message ?? "Creation eleve perso impossible.",
      metadata: {
        email: normalizedEmail || null,
      },
    });
    return NextResponse.json(
      { error: insertError?.message ?? "Creation impossible." },
      { status: 400 }
    );
  }

  await recordActivity({
    admin,
    action: "student.create.success",
    actorUserId: profile.id,
    orgId: targetOrgId,
    entityType: "student",
    entityId: student.id,
    message: "Eleve cree dans le workspace personnel.",
    metadata: {
      email: normalizedEmail || null,
      workspaceType: "personal",
    },
  });

  return NextResponse.json({ ok: true, studentId: student.id });
}
