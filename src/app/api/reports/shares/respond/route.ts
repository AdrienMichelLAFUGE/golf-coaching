import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient, createSupabaseServerClientFromRequest } from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { recordActivity } from "@/lib/activity-log";

const respondSchema = z.object({
  shareId: z.string().uuid(),
  decision: z.enum(["accept", "reject"]),
});

type SourceStudent =
  | { first_name: string | null; last_name: string | null; playing_hand: "right" | "left" | null }
  | { first_name: string | null; last_name: string | null; playing_hand: "right" | "left" | null }[]
  | null;

const getSourceStudent = (value: SourceStudent) => {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
};

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, respondSchema);
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
    .select("id, role, org_id, active_workspace_id")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!profile || profile.role === "student") {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { data: share, error: shareError } = await admin
    .from("report_shares")
    .select(
      "id, source_report_id, source_org_id, recipient_user_id, recipient_email, status, payload"
    )
    .eq("id", parsed.data.shareId)
    .maybeSingle();

  if (shareError || !share) {
    return NextResponse.json({ error: "Partage introuvable." }, { status: 404 });
  }
  if (share.recipient_user_id !== profile.id) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }
  if (share.status !== "pending") {
    return NextResponse.json({ error: "Partage deja traite." }, { status: 400 });
  }

  if (parsed.data.decision === "reject") {
    const { error: rejectError } = await admin
      .from("report_shares")
      .update({
        status: "rejected",
        decided_at: new Date().toISOString(),
      })
      .eq("id", share.id);
    if (rejectError) {
      await recordActivity({
        admin,
        level: "error",
        action: "report.share.reject_failed",
        actorUserId: profile.id,
        orgId: profile.org_id,
        entityType: "report_share",
        entityId: share.id,
        message: rejectError.message ?? "Rejet du partage impossible.",
      });
      return NextResponse.json({ error: rejectError.message }, { status: 400 });
    }
    await recordActivity({
      admin,
      action: "report.share.rejected",
      actorUserId: profile.id,
      orgId: profile.org_id,
      entityType: "report_share",
      entityId: share.id,
      message: "Partage de rapport refuse.",
      metadata: {
        sourceReportId: share.source_report_id,
      },
    });
    return NextResponse.json({ ok: true });
  }

  const { data: sourceReport, error: sourceReportError } = await admin
    .from("reports")
    .select(
      "id, title, report_date, created_at, sent_at, coach_observations, coach_work, coach_club, student_id, students(first_name, last_name, playing_hand)"
    )
    .eq("id", share.source_report_id)
    .maybeSingle();

  if (sourceReportError || !sourceReport) {
    return NextResponse.json({ error: "Rapport source introuvable." }, { status: 404 });
  }

  const { data: sourceSections, error: sourceSectionsError } = await admin
    .from("report_sections")
    .select(
      "title, content, content_formatted, content_format_hash, position, type, media_urls, media_captions, radar_file_id, radar_config"
    )
    .eq("report_id", sourceReport.id)
    .order("position", { ascending: true });

  if (sourceSectionsError) {
    return NextResponse.json({ error: sourceSectionsError.message }, { status: 400 });
  }

  const targetOrgId = profile.active_workspace_id ?? profile.org_id;
  if (!targetOrgId) {
    return NextResponse.json({ error: "Workspace de destination introuvable." }, { status: 400 });
  }

  const sourceStudent = getSourceStudent(sourceReport.students as SourceStudent);
  const { data: copiedStudent, error: copiedStudentError } = await admin
    .from("students")
    .insert([
      {
        org_id: targetOrgId,
        first_name: sourceStudent?.first_name ?? "Eleve",
        last_name: sourceStudent?.last_name ?? "Partage",
        email: null,
        playing_hand: sourceStudent?.playing_hand ?? null,
      },
    ])
    .select("id")
    .single();

  if (copiedStudentError || !copiedStudent?.id) {
    await recordActivity({
      admin,
      level: "error",
      action: "report.share.accept_student_copy_failed",
      actorUserId: profile.id,
      orgId: targetOrgId,
      entityType: "report_share",
      entityId: share.id,
      message: copiedStudentError?.message ?? "Creation eleve de lecture impossible.",
      metadata: {
        sourceReportId: share.source_report_id,
      },
    });
    return NextResponse.json(
      { error: copiedStudentError?.message ?? "Creation eleve de lecture impossible." },
      { status: 400 }
    );
  }

  const { data: copiedReport, error: copiedReportError } = await admin
    .from("reports")
    .insert([
      {
        org_id: targetOrgId,
        student_id: copiedStudent.id,
        author_id: profile.id,
        title: sourceReport.title,
        content: null,
        sent_at: new Date().toISOString(),
        report_date: sourceReport.report_date ?? sourceReport.created_at.slice(0, 10),
        coach_observations: sourceReport.coach_observations,
        coach_work: sourceReport.coach_work,
        coach_club: sourceReport.coach_club,
        origin_share_id: share.id,
      },
    ])
    .select("id")
    .single();

  if (copiedReportError || !copiedReport?.id) {
    await recordActivity({
      admin,
      level: "error",
      action: "report.share.accept_report_copy_failed",
      actorUserId: profile.id,
      orgId: targetOrgId,
      entityType: "report_share",
      entityId: share.id,
      message: copiedReportError?.message ?? "Copie du rapport impossible.",
      metadata: {
        sourceReportId: share.source_report_id,
        copiedStudentId: copiedStudent.id,
      },
    });
    return NextResponse.json(
      { error: copiedReportError?.message ?? "Copie du rapport impossible." },
      { status: 400 }
    );
  }

  const copiedSectionsPayload = (sourceSections ?? []).map((section) => ({
    org_id: targetOrgId,
    report_id: copiedReport.id,
    title: section.title,
    content: section.content,
    content_formatted: section.content_formatted,
    content_format_hash: section.content_format_hash,
    position: section.position,
    type: section.type,
    media_urls: section.media_urls,
    media_captions: section.media_captions,
    radar_file_id: section.radar_file_id,
    radar_config: section.radar_config,
  }));

  if (copiedSectionsPayload.length > 0) {
    const { error: copiedSectionsError } = await admin
      .from("report_sections")
      .insert(copiedSectionsPayload);
    if (copiedSectionsError) {
      await recordActivity({
        admin,
        level: "error",
        action: "report.share.accept_sections_copy_failed",
        actorUserId: profile.id,
        orgId: targetOrgId,
        entityType: "report_share",
        entityId: share.id,
        message: copiedSectionsError.message ?? "Copie des sections impossible.",
        metadata: {
          sourceReportId: share.source_report_id,
          copiedReportId: copiedReport.id,
        },
      });
      return NextResponse.json(
        { error: copiedSectionsError.message ?? "Copie des sections impossible." },
        { status: 400 }
      );
    }
  }

  const { error: acceptError } = await admin
    .from("report_shares")
    .update({
      status: "accepted",
      recipient_org_id: targetOrgId,
      decided_at: new Date().toISOString(),
      copied_report_id: copiedReport.id,
    })
    .eq("id", share.id);

  if (acceptError) {
    await recordActivity({
      admin,
      level: "error",
      action: "report.share.accept_failed",
      actorUserId: profile.id,
      orgId: targetOrgId,
      entityType: "report_share",
      entityId: share.id,
      message: acceptError.message ?? "Acceptation du partage impossible.",
      metadata: {
        sourceReportId: share.source_report_id,
        copiedReportId: copiedReport.id,
      },
    });
    return NextResponse.json({ error: acceptError.message }, { status: 400 });
  }

  await recordActivity({
    admin,
    action: "report.share.accepted",
    actorUserId: profile.id,
    orgId: targetOrgId,
    entityType: "report_share",
    entityId: share.id,
    message: "Partage de rapport accepte.",
    metadata: {
      sourceReportId: share.source_report_id,
      copiedReportId: copiedReport.id,
    },
  });

  return NextResponse.json({ ok: true, reportId: copiedReport.id });
}
