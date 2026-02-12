import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { createOrgNotifications } from "@/lib/org-notifications";
import { loadPersonalPlanTier } from "@/lib/plan-access";
import { generateReportKpisForPublishedReport } from "@/lib/ai/report-kpis";

const decideSchema = z.object({
  proposalId: z.string().uuid(),
  decision: z.enum(["accept", "reject"]),
});

const studentLinkRequestPayloadSchema = z.object({
  kind: z.literal("student_link_request"),
  requester_user_id: z.string().uuid(),
  requester_org_id: z.string().uuid(),
  requester_org_name: z.string().nullable().optional(),
  requested_student: z.object({
    first_name: z.string().min(1),
    last_name: z.string().nullable().optional(),
    email: z.string().email(),
    playing_hand: z.enum(["right", "left"]).nullable().optional(),
  }),
});

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, decideSchema);
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
    .select("role, status")
    .eq("org_id", profile.org_id)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (!membership || membership.status !== "active") {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const planTier = await loadPersonalPlanTier(admin, profile.id);
  if (planTier === "free") {
    return NextResponse.json(
      { error: "Lecture seule: plan Free en organisation." },
      { status: 403 }
    );
  }

  const { data: proposal } = await admin
    .from("org_proposals")
    .select("id, org_id, student_id, created_by, status, payload")
    .eq("id", parsed.data.proposalId)
    .single();

  if (!proposal || proposal.org_id !== profile.org_id) {
    return NextResponse.json({ error: "Proposition introuvable." }, { status: 404 });
  }

  if (proposal.status !== "pending") {
    return NextResponse.json({ error: "Proposition deja traitee." }, { status: 400 });
  }

  const isAdmin = membership.role === "admin";
  const parsedLinkRequestPayload = studentLinkRequestPayloadSchema.safeParse(
    proposal.payload ?? {}
  );
  const isStudentLinkRequest =
    parsedLinkRequestPayload.success &&
    parsedLinkRequestPayload.data.kind === "student_link_request";

  if (isStudentLinkRequest) {
    if (!isAdmin) {
      return NextResponse.json(
        {
          error:
            "Seul l admin de l organisation proprietaire peut valider cette demande.",
        },
        { status: 403 }
      );
    }

    const linkRequestPayload = parsedLinkRequestPayload.data;

    if (parsed.data.decision === "accept") {
      const { data: sourceStudent } = await admin
        .from("students")
        .select("id, first_name, last_name, email, playing_hand")
        .eq("id", proposal.student_id)
        .maybeSingle();

      if (!sourceStudent?.id) {
        return NextResponse.json({ error: "Eleve source introuvable." }, { status: 404 });
      }

      const { data: requesterMembership } = await admin
        .from("org_memberships")
        .select("id")
        .eq("org_id", linkRequestPayload.requester_org_id)
        .eq("user_id", linkRequestPayload.requester_user_id)
        .eq("status", "active")
        .maybeSingle();

      if (!requesterMembership?.id) {
        return NextResponse.json(
          { error: "Le coach demandeur n est plus actif dans son organisation." },
          { status: 409 }
        );
      }

      const targetEmail = linkRequestPayload.requested_student.email
        .trim()
        .toLowerCase();

      const { data: targetStudentCandidate } = await admin
        .from("students")
        .select("id")
        .eq("org_id", linkRequestPayload.requester_org_id)
        .ilike("email", targetEmail)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      let targetStudentId = targetStudentCandidate?.id ?? null;
      if (!targetStudentId) {
        const { data: insertedTargetStudent, error: targetStudentInsertError } = await admin
          .from("students")
          .insert([
            {
              org_id: linkRequestPayload.requester_org_id,
              first_name:
                sourceStudent.first_name ??
                linkRequestPayload.requested_student.first_name.trim(),
              last_name:
                sourceStudent.last_name ??
                linkRequestPayload.requested_student.last_name ??
                null,
              email: targetEmail,
              playing_hand:
                sourceStudent.playing_hand ??
                linkRequestPayload.requested_student.playing_hand ??
                null,
            },
          ])
          .select("id")
          .single();

        if (targetStudentInsertError || !insertedTargetStudent?.id) {
          return NextResponse.json(
            {
              error:
                targetStudentInsertError?.message ??
                "Creation de l eleve dans l organisation demandeuse impossible.",
            },
            { status: 400 }
          );
        }
        targetStudentId = insertedTargetStudent.id;
      }

      const { error: assignmentError } = await admin
        .from("student_assignments")
        .upsert(
          [
            {
              org_id: linkRequestPayload.requester_org_id,
              student_id: targetStudentId,
              coach_id: linkRequestPayload.requester_user_id,
              created_by: profile.id,
            },
          ],
          { onConflict: "student_id,coach_id" }
        );

      if (assignmentError) {
        return NextResponse.json({ error: assignmentError.message }, { status: 400 });
      }

      const { data: sourceAccount } = await admin
        .from("student_accounts")
        .select("user_id")
        .eq("student_id", proposal.student_id)
        .maybeSingle();

      if (sourceAccount?.user_id) {
        const { data: existingTargetAccount } = await admin
          .from("student_accounts")
          .select("user_id")
          .eq("student_id", targetStudentId)
          .maybeSingle();

        if (
          existingTargetAccount?.user_id &&
          existingTargetAccount.user_id !== sourceAccount.user_id
        ) {
          return NextResponse.json(
            {
              error:
                "Conflit de liaison: cet eleve cible est deja relie a un autre compte eleve.",
            },
            { status: 409 }
          );
        }

        const { error: linkError } = await admin.from("student_accounts").upsert([
          {
            student_id: targetStudentId,
            user_id: sourceAccount.user_id,
          },
        ]);
        if (linkError) {
          return NextResponse.json({ error: linkError.message }, { status: 400 });
        }
      }
    }

    const { error: linkRequestUpdateError } = await admin
      .from("org_proposals")
      .update({
        status: parsed.data.decision === "accept" ? "accepted" : "rejected",
        decided_at: new Date().toISOString(),
        decided_by: profile.id,
      })
      .eq("id", proposal.id);

    if (linkRequestUpdateError) {
      return NextResponse.json({ error: linkRequestUpdateError.message }, { status: 400 });
    }

    await createOrgNotifications(admin, {
      orgId: linkRequestPayload.requester_org_id,
      userIds: [proposal.created_by],
      type:
        parsed.data.decision === "accept"
          ? "student.link_request.accepted"
          : "student.link_request.rejected",
      payload: { proposalId: proposal.id, studentId: proposal.student_id },
    });

    return NextResponse.json({ ok: true });
  }

  const { data: assignments } = await admin
    .from("student_assignments")
    .select("coach_id")
    .eq("student_id", proposal.student_id);

  const assignedIds = (assignments ?? []).map(
    (row) => (row as { coach_id: string }).coach_id
  );
  const isAssigned = assignedIds.includes(profile.id);
  if (!isAssigned && !isAdmin) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  if (parsed.data.decision === "accept") {
    const payload = (proposal.payload ?? {}) as {
      title?: string;
      summary?: string;
      sections?: Array<{ title: string; content: string }>;
    };
    const title = payload.title?.trim() || "Proposition acceptee";
    const reportDate = new Date().toISOString().slice(0, 10);

    const { data: report, error: reportError } = await admin
      .from("reports")
      .insert([
        {
          org_id: proposal.org_id,
          student_id: proposal.student_id,
          title,
          report_date: reportDate,
          sent_at: new Date().toISOString(),
          coach_observations: payload.summary ?? null,
        },
      ])
      .select("id")
      .single();

    if (reportError || !report) {
      return NextResponse.json(
        { error: reportError?.message ?? "Creation du rapport impossible." },
        { status: 400 }
      );
    }

    const sections = payload.sections ?? [];
    const sectionsPayload = [
      {
        org_id: proposal.org_id,
        report_id: report.id,
        title: "Resume proposition",
        type: "text",
        content: payload.summary ?? "",
        position: 0,
      },
      ...sections.map((section, index) => ({
        org_id: proposal.org_id,
        report_id: report.id,
        title: section.title,
        type: "text",
        content: section.content,
        position: index + 1,
      })),
    ];

    await admin.from("report_sections").insert(sectionsPayload);

    try {
      await generateReportKpisForPublishedReport({
        admin,
        orgId: proposal.org_id,
        studentId: proposal.student_id,
        reportId: report.id,
        actorUserId: profile.id,
        timeoutMs: 12_000,
      });
    } catch (error) {
      console.error("[report_kpis] proposal generation failed:", error);
    }
  }

  const { error: updateError } = await admin
    .from("org_proposals")
    .update({
      status: parsed.data.decision === "accept" ? "accepted" : "rejected",
      decided_at: new Date().toISOString(),
      decided_by: profile.id,
    })
    .eq("id", proposal.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  await createOrgNotifications(admin, {
    orgId: proposal.org_id,
    userIds: [proposal.created_by],
    type: parsed.data.decision === "accept" ? "proposal.accepted" : "proposal.rejected",
    payload: { proposalId: proposal.id, studentId: proposal.student_id },
  });

  return NextResponse.json({ ok: true });
}
