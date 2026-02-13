import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { createOrgNotifications } from "@/lib/org-notifications";
import { loadPersonalPlanTier } from "@/lib/plan-access";
import { recordActivity } from "@/lib/activity-log";

const proposalSchema = z.object({
  studentId: z.string().uuid(),
  title: z.string().min(2).max(120),
  summary: z.string().min(1).max(2000),
  sections: z
    .array(
      z.object({
        title: z.string().min(1).max(120),
        content: z.string().min(1).max(5000),
      })
    )
    .optional(),
});

export async function GET(request: Request) {
  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, org_id")
    .eq("id", userData.user.id)
    .single();

  if (!profile?.org_id) {
    await recordActivity({
      admin,
      level: "warn",
      action: "proposal.create.denied",
      actorUserId: userData.user.id,
      message: "Creation proposition refusee: organisation introuvable.",
    });
    return NextResponse.json({ error: "Organisation introuvable." }, { status: 403 });
  }

  const { data: membership } = await admin
    .from("org_memberships")
    .select("status")
    .eq("org_id", profile.org_id)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (!membership || membership.status !== "active") {
    await recordActivity({
      admin,
      level: "warn",
      action: "proposal.create.denied",
      actorUserId: profile.id,
      orgId: profile.org_id,
      message: "Creation proposition refusee: membre inactif ou absent.",
    });
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { data: proposals } = await admin
    .from("org_proposals")
    .select(
      "id, student_id, created_by, status, summary, payload, created_at, decided_at, decided_by"
    )
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ proposals: proposals ?? [] });
}

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, proposalSchema);
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
    .select("id, org_id")
    .eq("id", userData.user.id)
    .single();

  if (!profile?.org_id) {
    return NextResponse.json({ error: "Organisation introuvable." }, { status: 403 });
  }

  const { data: membership } = await admin
    .from("org_memberships")
    .select("status")
    .eq("org_id", profile.org_id)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (!membership || membership.status !== "active") {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const planTier = await loadPersonalPlanTier(admin, profile.id);
  if (planTier === "free") {
    await recordActivity({
      admin,
      level: "warn",
      action: "proposal.create.denied",
      actorUserId: profile.id,
      orgId: profile.org_id,
      message: "Creation proposition refusee: plan Free.",
    });
    return NextResponse.json(
      { error: "Lecture seule: plan Free en organisation." },
      { status: 403 }
    );
  }

  const { data: student } = await admin
    .from("students")
    .select("id, org_id")
    .eq("id", parsed.data.studentId)
    .single();

  if (!student || student.org_id !== profile.org_id) {
    await recordActivity({
      admin,
      level: "warn",
      action: "proposal.create.denied",
      actorUserId: profile.id,
      orgId: profile.org_id,
      entityType: "student",
      entityId: parsed.data.studentId,
      message: "Creation proposition refusee: eleve introuvable.",
    });
    return NextResponse.json({ error: "Eleve introuvable." }, { status: 404 });
  }

  const payload = {
    title: parsed.data.title.trim(),
    summary: parsed.data.summary.trim(),
    sections: parsed.data.sections ?? [],
  };

  const { data: proposal, error: proposalError } = await admin
    .from("org_proposals")
    .insert([
      {
        org_id: profile.org_id,
        student_id: parsed.data.studentId,
        created_by: profile.id,
        summary: payload.summary,
        payload,
      },
    ])
    .select("id")
    .single();

  if (proposalError || !proposal) {
    await recordActivity({
      admin,
      level: "error",
      action: "proposal.create.failed",
      actorUserId: profile.id,
      orgId: profile.org_id,
      entityType: "student",
      entityId: parsed.data.studentId,
      message: proposalError?.message ?? "Creation proposition impossible.",
    });
    return NextResponse.json(
      { error: proposalError?.message ?? "Creation impossible." },
      { status: 400 }
    );
  }

  const { data: assigned } = await admin
    .from("student_assignments")
    .select("coach_id")
    .eq("student_id", parsed.data.studentId);

  const assignedIds = (assigned ?? []).map(
    (row) => (row as { coach_id: string }).coach_id
  );
  await createOrgNotifications(admin, {
    orgId: profile.org_id,
    userIds: assignedIds,
    type: "proposal.created",
    payload: { proposalId: proposal.id, studentId: parsed.data.studentId },
  });

  await recordActivity({
    admin,
    action: "proposal.create.success",
    actorUserId: profile.id,
    orgId: profile.org_id,
    entityType: "org_proposal",
    entityId: proposal.id,
    message: "Proposition creee.",
    metadata: { studentId: parsed.data.studentId },
  });

  return NextResponse.json({ ok: true, proposalId: proposal.id });
}
