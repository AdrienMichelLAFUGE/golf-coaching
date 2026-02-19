import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { generateParentSecretCode, hashParentSecretCode } from "@/lib/parent/secret-code";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { loadPersonalPlanTier } from "@/lib/plan-access";
import { createOrgNotifications } from "@/lib/org-notifications";
import { recordActivity } from "@/lib/activity-log";

const studentSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  playing_hand: z.enum(["right", "left"]).optional().nullable().or(z.literal("")),
  coach_ids: z.array(z.string().uuid()).optional(),
});

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, studentSchema);
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
    await recordActivity({
      admin,
      level: "warn",
      action: "student.create.denied",
      actorUserId: userData.user.id,
      message: "Creation eleve refusee: organisation active introuvable.",
    });
    return NextResponse.json({ error: "Organisation introuvable." }, { status: 403 });
  }

  const { data: membership } = await admin
    .from("org_memberships")
    .select("role, status")
    .eq("org_id", profile.org_id)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (!membership || membership.status !== "active") {
    await recordActivity({
      admin,
      level: "warn",
      action: "student.create.denied",
      actorUserId: profile.id,
      orgId: profile.org_id,
      message: "Creation eleve refusee: membre inactif ou absent.",
    });
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const planTier = await loadPersonalPlanTier(admin, profile.id);
  if (planTier === "free") {
    await recordActivity({
      admin,
      level: "warn",
      action: "student.create.denied",
      actorUserId: profile.id,
      orgId: profile.org_id,
      message: "Creation eleve refusee: plan Free en organisation.",
    });
    return NextResponse.json(
      { error: "Lecture seule: plan Free en organisation." },
      { status: 403 }
    );
  }

  const normalizedEmail = parsed.data.email?.trim().toLowerCase() ?? "";
  if (normalizedEmail) {
    const { data: existingElsewhere } = await admin
      .from("students")
      .select("id, org_id, first_name, last_name, email, created_at")
      .ilike("email", normalizedEmail)
      .neq("org_id", profile.org_id)
      .order("created_at", { ascending: true })
      .limit(1);

    const ownerStudent = (existingElsewhere ?? [])[0] as
      | {
          id: string;
          org_id: string;
          first_name: string;
          last_name: string | null;
          email: string | null;
        }
      | undefined;

    if (ownerStudent?.id && ownerStudent.org_id) {
      const { data: ownerAdmin } = await admin
        .from("org_memberships")
        .select("user_id")
        .eq("org_id", ownerStudent.org_id)
        .eq("role", "admin")
        .eq("status", "active")
        .maybeSingle();

      if (!ownerAdmin?.user_id) {
        await recordActivity({
          admin,
          level: "warn",
          action: "student.create.pending_owner_missing_admin",
          actorUserId: profile.id,
          orgId: profile.org_id,
          entityType: "student",
          entityId: ownerStudent.id,
          message: "Demande cross-org impossible: aucun admin actif proprietaire.",
          metadata: {
            email: normalizedEmail,
            ownerOrgId: ownerStudent.org_id,
          },
        });
        return NextResponse.json(
          { error: "Aucun admin actif trouve pour l organisation proprietaire." },
          { status: 409 }
        );
      }

      const { data: requesterOrg } = await admin
        .from("organizations")
        .select("name")
        .eq("id", profile.org_id)
        .maybeSingle();

      const requestSummary =
        "Demande d ajout cross-organisation pour un eleve deja existant.";

      const { data: proposal, error: proposalError } = await admin
        .from("org_proposals")
        .insert([
          {
            org_id: ownerStudent.org_id,
            student_id: ownerStudent.id,
            created_by: profile.id,
            summary: requestSummary,
            payload: {
              kind: "student_link_request",
              title: "Demande d ajout eleve",
              summary: requestSummary,
              requester_user_id: profile.id,
              requester_org_id: profile.org_id,
              requester_org_name: requesterOrg?.name ?? null,
              requested_student: {
                first_name: parsed.data.first_name.trim(),
                last_name: parsed.data.last_name?.trim() || null,
                email: normalizedEmail,
                playing_hand: parsed.data.playing_hand || null,
              },
            },
          },
        ])
        .select("id")
        .single();

      if (proposalError || !proposal?.id) {
        await recordActivity({
          admin,
          level: "error",
          action: "student.create.pending_request_failed",
          actorUserId: profile.id,
          orgId: profile.org_id,
          entityType: "student",
          entityId: ownerStudent.id,
          message: proposalError?.message ?? "Creation de demande cross-org impossible.",
          metadata: {
            email: normalizedEmail,
            ownerOrgId: ownerStudent.org_id,
          },
        });
        return NextResponse.json(
          { error: proposalError?.message ?? "Creation de la demande impossible." },
          { status: 400 }
        );
      }

      await createOrgNotifications(admin, {
        orgId: ownerStudent.org_id,
        userIds: [ownerAdmin.user_id],
        type: "student.link_request.created",
        payload: {
          proposalId: proposal.id,
          studentId: ownerStudent.id,
          requesterOrgId: profile.org_id,
        },
      });

      await recordActivity({
        admin,
        action: "student.create.pending_owner_approval",
        actorUserId: profile.id,
        orgId: profile.org_id,
        entityType: "student",
        entityId: ownerStudent.id,
        message: "Demande envoyee a l admin proprietaire pour ajout cross-organisation.",
        metadata: {
          email: normalizedEmail,
          ownerOrgId: ownerStudent.org_id,
          proposalId: proposal.id,
        },
      });

      return NextResponse.json({
        ok: true,
        pendingRequest: true,
        message:
          "Eleve deja present dans une autre organisation. Une demande a ete envoyee a l admin proprietaire.",
      });
    }
  }

  const parentSecretCode = generateParentSecretCode();
  const parentSecretCodeHash = hashParentSecretCode(parentSecretCode);
  const { data: student, error: insertError } = await admin
    .from("students")
    .insert([
      {
        org_id: profile.org_id,
        first_name: parsed.data.first_name.trim(),
        last_name: parsed.data.last_name?.trim() || null,
        email: normalizedEmail || null,
        playing_hand: parsed.data.playing_hand || null,
        parent_secret_code_plain: null,
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
      orgId: profile.org_id,
      message: insertError?.message ?? "Creation eleve impossible.",
      metadata: {
        email: normalizedEmail || null,
      },
    });
    return NextResponse.json(
      { error: insertError?.message ?? "Creation impossible." },
      { status: 400 }
    );
  }

  const coachIds = new Set<string>();
  coachIds.add(profile.id);
  (parsed.data.coach_ids ?? []).forEach((id) => coachIds.add(id));

  const { data: eligibleCoaches } = await admin
    .from("org_memberships")
    .select("user_id")
    .eq("org_id", profile.org_id)
    .eq("status", "active")
    .in("user_id", Array.from(coachIds));

  const validCoachIds = (eligibleCoaches ?? []).map(
    (row) => (row as { user_id: string }).user_id
  );

  if (validCoachIds.length > 0) {
    const assignmentsPayload = validCoachIds.map((coachId) => ({
      org_id: profile.org_id,
      student_id: student.id,
      coach_id: coachId,
      created_by: profile.id,
    }));
    const { error: assignmentError } = await admin
      .from("student_assignments")
      .insert(assignmentsPayload);
    if (assignmentError) {
      await recordActivity({
        admin,
        level: "error",
        action: "student.create.assignment_failed",
        actorUserId: profile.id,
        orgId: profile.org_id,
        entityType: "student",
        entityId: student.id,
        message: assignmentError.message ?? "Assignation des coachs impossible.",
      });
      return NextResponse.json({ error: assignmentError.message }, { status: 400 });
    }
  }

  await recordActivity({
    admin,
    action: "student.create.success",
    actorUserId: profile.id,
    orgId: profile.org_id,
    entityType: "student",
    entityId: student.id,
    message: "Eleve cree dans l organisation.",
    metadata: {
      email: normalizedEmail || null,
      assignedCoachCount: validCoachIds.length,
    },
  });

  return NextResponse.json({ ok: true, studentId: student.id });
}
