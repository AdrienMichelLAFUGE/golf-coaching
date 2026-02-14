import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient, createSupabaseServerClientFromRequest } from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { recordActivity } from "@/lib/activity-log";
import { copySharedReportToWorkspace } from "@/lib/report-share-copy";

const respondSchema = z.object({
  shareId: z.string().uuid(),
  decision: z.enum(["accept", "reject"]),
});

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
      "id, title, report_date, created_at, sent_at, coach_observations, coach_work, coach_club"
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

  const copiedReportResult = await copySharedReportToWorkspace(admin, {
    shareId: share.id,
    targetOrgId,
    authorUserId: profile.id,
    sourceReport,
    sourceSections:
      (sourceSections ?? []).map((section) => ({
        title: section.title ?? null,
        content: section.content ?? null,
        content_formatted: section.content_formatted ?? null,
        content_format_hash: section.content_format_hash ?? null,
        position: section.position ?? null,
        type: section.type ?? null,
        media_urls: section.media_urls ?? null,
        media_captions: section.media_captions ?? null,
        radar_file_id: section.radar_file_id ?? null,
        radar_config:
          section.radar_config && typeof section.radar_config === "object"
            ? (section.radar_config as Record<string, unknown>)
            : null,
      })) ?? [],
  });

  if ("error" in copiedReportResult) {
    await recordActivity({
      admin,
      level: "error",
      action: "report.share.accept_report_copy_failed",
      actorUserId: profile.id,
      orgId: targetOrgId,
      entityType: "report_share",
      entityId: share.id,
      message: copiedReportResult.error,
      metadata: {
        sourceReportId: share.source_report_id,
      },
    });
    return NextResponse.json(
      { error: copiedReportResult.error },
      { status: 400 }
    );
  }

  const { error: acceptError } = await admin
    .from("report_shares")
    .update({
      status: "accepted",
      recipient_org_id: targetOrgId,
      decided_at: new Date().toISOString(),
      copied_report_id: copiedReportResult.reportId,
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
        copiedReportId: copiedReportResult.reportId,
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
      copiedReportId: copiedReportResult.reportId,
    },
  });

  return NextResponse.json({ ok: true, reportId: copiedReportResult.reportId });
}
