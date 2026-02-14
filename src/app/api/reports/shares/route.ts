import { NextResponse } from "next/server";
import Brevo from "@getbrevo/brevo";
import { z } from "zod";
import { env } from "@/env";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";
import { buildSharedReportPdf, findAuthUserByEmail } from "@/lib/report-share";
import { recordActivity } from "@/lib/activity-log";
import { copySharedReportToWorkspace } from "@/lib/report-share-copy";

const shareReportSchema = z.object({
  reportId: z.string().uuid(),
  recipientEmail: z.string().email(),
});

type StudentRef =
  | { first_name: string | null; last_name: string | null }
  | { first_name: string | null; last_name: string | null }[]
  | null;

const getStudentRef = (value: StudentRef) => {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sendSharedReportEmail = async (input: {
  to: string;
  senderName: string;
  reportTitle: string;
  studentName: string;
  viewFullReportUrl: string;
  pdfFileName: string;
  pdfBase64: string;
  accessMode: "signup" | "view";
}) => {
  const senderName = escapeHtml(input.senderName);
  const reportTitle = escapeHtml(input.reportTitle);
  const studentName = escapeHtml(input.studentName);
  const viewFullReportUrl = escapeHtml(input.viewFullReportUrl);
  const accessParagraph =
    input.accessMode === "view"
      ? `<p>Pour consulter le rapport complet (images, videos, graphiques/donnees), ouvrez ce lien :</p>
      <p><a href="${viewFullReportUrl}" target="_blank" rel="noopener noreferrer">${viewFullReportUrl}</a></p>`
      : `<p>Pour consulter le rapport complet (images, videos, graphiques/donnees), creez un compte SwingFlow avec cet email puis ouvrez l application :</p>
      <p><a href="${viewFullReportUrl}" target="_blank" rel="noopener noreferrer">${viewFullReportUrl}</a></p>`;

  const apiInstance = new Brevo.TransactionalEmailsApi();
  apiInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, env.BREVO_API_KEY);
  await apiInstance.sendTransacEmail({
    sender: { email: env.BREVO_SENDER_EMAIL, name: env.BREVO_SENDER_NAME },
    to: [{ email: input.to }],
    subject: `Rapport partage: ${input.reportTitle} - ${input.studentName}`,
    htmlContent: `
      <p>Bonjour,</p>
      <p>${senderName} vous a partage un rapport SwingFlow.</p>
      <p>Rapport: <strong>${reportTitle}</strong></p>
      <p>Eleve: <strong>${studentName}</strong></p>
      <p>Le PDF joint contient le texte du rapport.</p>
      ${accessParagraph}
      <p>Bonne lecture,</p>
      <p>${env.BREVO_SENDER_NAME}</p>
    `,
    attachment: [
      {
        name: input.pdfFileName,
        content: input.pdfBase64,
      },
    ],
  });
};

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, shareReportSchema);
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

  const normalizedRecipientEmail = parsed.data.recipientEmail.trim().toLowerCase();
  const senderEmail = userData.user.email?.trim().toLowerCase() ?? "";
  if (normalizedRecipientEmail === senderEmail) {
    return NextResponse.json(
      { error: "Impossible de partager un rapport avec votre propre email." },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: senderProfile } = await admin
    .from("profiles")
    .select("id, role, org_id, active_workspace_id, full_name")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!senderProfile || senderProfile.role === "student") {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { data: sourceReport, error: sourceReportError } = await supabase
    .from("reports")
    .select(
      "id, org_id, student_id, title, report_date, created_at, sent_at, coach_observations, coach_work, coach_club, students(first_name, last_name)"
    )
    .eq("id", parsed.data.reportId)
    .maybeSingle();

  if (sourceReportError || !sourceReport) {
    return NextResponse.json({ error: "Rapport introuvable." }, { status: 404 });
  }

  if (!sourceReport.sent_at) {
    return NextResponse.json(
      { error: "Publiez d abord le rapport avant de le partager." },
      { status: 400 }
    );
  }

  const { data: sourceSections, error: sectionsError } = await supabase
    .from("report_sections")
    .select(
      "title, type, content, content_formatted, content_format_hash, media_urls, media_captions, radar_file_id, radar_config, position"
    )
    .eq("report_id", sourceReport.id)
    .order("position", { ascending: true });

  if (sectionsError) {
    return NextResponse.json(
      { error: sectionsError.message ?? "Chargement des sections impossible." },
      { status: 400 }
    );
  }

  const { data: existingPending } = await admin
    .from("report_shares")
    .select("id")
    .eq("source_report_id", sourceReport.id)
    .eq("recipient_email", normalizedRecipientEmail)
    .eq("status", "pending")
    .maybeSingle();

  if (existingPending?.id) {
    await recordActivity({
      admin,
      level: "warn",
      action: "report.share.duplicate_pending",
      actorUserId: senderProfile.id,
      orgId: sourceReport.org_id,
      entityType: "report",
      entityId: sourceReport.id,
      message: "Partage deja en attente pour cet email.",
      metadata: {
        recipientEmail: normalizedRecipientEmail,
      },
    });
    return NextResponse.json(
      { error: "Une demande de partage est deja en attente pour cet email." },
      { status: 409 }
    );
  }

  const { data: existingAccepted } = await admin
    .from("report_shares")
    .select("id")
    .eq("source_report_id", sourceReport.id)
    .eq("recipient_email", normalizedRecipientEmail)
    .eq("status", "accepted")
    .maybeSingle();

  if (existingAccepted?.id) {
    return NextResponse.json(
      { error: "Ce rapport a deja ete partage avec cet email." },
      { status: 409 }
    );
  }

  const targetAuthUser = await findAuthUserByEmail(admin, normalizedRecipientEmail);
  const targetUserId = targetAuthUser?.id ?? null;

  let targetProfile:
    | {
        id: string;
        role: string;
        org_id: string;
        active_workspace_id: string | null;
        full_name: string | null;
      }
    | null = null;

  if (targetUserId) {
    const { data } = await admin
      .from("profiles")
      .select("id, role, org_id, active_workspace_id, full_name")
      .eq("id", targetUserId)
      .maybeSingle();
    targetProfile = data ?? null;
  }

  const senderName = senderProfile.full_name?.trim() || "Un coach SwingFlow";
  const sourceStudent = getStudentRef(sourceReport.students as StudentRef);
  const sourceStudentName = [sourceStudent?.first_name, sourceStudent?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const sectionsForPdf = (sourceSections ?? []).map((section) => ({
    title: section.title ?? "Section",
    content: (section.content_formatted ?? section.content ?? "").trim(),
    type: section.type ?? "text",
    hasRichMedia:
      (Array.isArray(section.media_urls) && section.media_urls.length > 0) ||
      Boolean(section.radar_file_id),
    mediaCount:
      (Array.isArray(section.media_urls) ? section.media_urls.length : 0) +
      (section.radar_file_id ? 1 : 0),
  }));
  const reportDate = sourceReport.report_date ?? sourceReport.created_at.slice(0, 10);
  const pdfBuffer = buildSharedReportPdf({
    title: sourceReport.title,
    reportDate,
    studentName: sourceStudentName || "Eleve",
    sections: sectionsForPdf,
  });
  const pdfBase64 = pdfBuffer.toString("base64");
  const safeBaseName = sourceReport.title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  const pdfFileName = `${safeBaseName || "rapport-swingflow"}.pdf`;

  if (
    targetProfile &&
    targetProfile.role !== "student" &&
    targetProfile.id !== senderProfile.id
  ) {
    const targetOrgId = targetProfile.active_workspace_id ?? targetProfile.org_id;
    if (!targetOrgId) {
      return NextResponse.json(
        { error: "Workspace de destination introuvable pour ce coach." },
        { status: 400 }
      );
    }

    const { data: shareInsertData, error: shareInsertError } = await admin
      .from("report_shares")
      .insert([
        {
          source_report_id: sourceReport.id,
          source_org_id: sourceReport.org_id,
          sender_id: senderProfile.id,
          recipient_email: normalizedRecipientEmail,
          recipient_user_id: targetProfile.id,
          recipient_org_id: targetOrgId,
          status: "pending",
          delivery: "in_app",
          payload: {
            report_title: sourceReport.title,
            source_student_name: sourceStudentName || null,
            sender_name: senderName,
          },
        },
      ])
      .select("id")
      .single();

    if (shareInsertError || !shareInsertData?.id) {
      const shareInsertErrorMessage =
        shareInsertError?.message ?? "Creation de la demande impossible.";
      await recordActivity({
        admin,
        level: "error",
        action: "report.share.create_failed",
        actorUserId: senderProfile.id,
        orgId: sourceReport.org_id,
        entityType: "report",
        entityId: sourceReport.id,
        message: shareInsertErrorMessage,
        metadata: {
          recipientEmail: normalizedRecipientEmail,
        },
      });
      return NextResponse.json(
        { error: shareInsertErrorMessage },
        { status: 400 }
      );
    }

    const copiedReportResult = await copySharedReportToWorkspace(admin, {
      shareId: shareInsertData.id,
      targetOrgId,
      authorUserId: targetProfile.id,
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
      await admin
        .from("report_shares")
        .update({
          status: "rejected",
          decided_at: new Date().toISOString(),
        })
        .eq("id", shareInsertData.id);
      await recordActivity({
        admin,
        level: "error",
        action: "report.share.copy_failed",
        actorUserId: senderProfile.id,
        orgId: sourceReport.org_id,
        entityType: "report",
        entityId: sourceReport.id,
        message: copiedReportResult.error,
        metadata: {
          recipientEmail: normalizedRecipientEmail,
          shareId: shareInsertData.id,
        },
      });
      return NextResponse.json({ error: copiedReportResult.error }, { status: 400 });
    }

    const { error: acceptError } = await admin
      .from("report_shares")
      .update({
        status: "accepted",
        delivery: "email",
        decided_at: new Date().toISOString(),
        copied_report_id: copiedReportResult.reportId,
      })
      .eq("id", shareInsertData.id);

    if (acceptError) {
      await recordActivity({
        admin,
        level: "error",
        action: "report.share.accept_finalize_failed",
        actorUserId: senderProfile.id,
        orgId: sourceReport.org_id,
        entityType: "report",
        entityId: sourceReport.id,
        message: acceptError.message ?? "Validation du partage impossible.",
        metadata: {
          recipientEmail: normalizedRecipientEmail,
          shareId: shareInsertData.id,
          copiedReportId: copiedReportResult.reportId,
        },
      });
      return NextResponse.json(
        { error: acceptError.message ?? "Validation du partage impossible." },
        { status: 400 }
      );
    }

    const reportPath = `/app/coach/rapports/${copiedReportResult.reportId}`;
    const viewFullReportUrl = `${env.NEXT_PUBLIC_SITE_URL}/login?next=${encodeURIComponent(reportPath)}`;

    try {
      await sendSharedReportEmail({
        to: normalizedRecipientEmail,
        senderName,
        reportTitle: sourceReport.title,
        studentName: sourceStudentName || "Eleve",
        viewFullReportUrl,
        pdfFileName,
        pdfBase64,
        accessMode: "view",
      });
    } catch (error) {
      console.error("[report-share] email delivery failed:", error);
      await recordActivity({
        admin,
        level: "error",
        action: "report.share.email_failed_registered",
        actorUserId: senderProfile.id,
        orgId: sourceReport.org_id,
        entityType: "report",
        entityId: sourceReport.id,
        message: "Envoi email impossible, mais copie creee.",
        metadata: {
          recipientEmail: normalizedRecipientEmail,
          shareId: shareInsertData.id,
          copiedReportId: copiedReportResult.reportId,
        },
      });
      return NextResponse.json({
        ok: true,
        delivery: "in_app",
        message:
          "Rapport partage en lecture seule. Email indisponible: le coach peut ouvrir le rapport dans son historique.",
      });
    }

    await recordActivity({
      admin,
      action: "report.share.registered_email",
      actorUserId: senderProfile.id,
      orgId: sourceReport.org_id,
      entityType: "report",
      entityId: sourceReport.id,
      message: "Rapport partage a un coach inscrit (lecture seule).",
      metadata: {
        recipientEmail: normalizedRecipientEmail,
        recipientUserId: targetProfile.id,
        copiedReportId: copiedReportResult.reportId,
      },
    });

    return NextResponse.json({
      ok: true,
      delivery: "email",
      message: "Email envoye avec le PDF et le lien de visualisation complete.",
    });
  }

  const viewFullReportUrl = `${env.NEXT_PUBLIC_SITE_URL}/login?mode=signup`;

  try {
    await sendSharedReportEmail({
      to: normalizedRecipientEmail,
      senderName,
      reportTitle: sourceReport.title,
      studentName: sourceStudentName || "Eleve",
      viewFullReportUrl,
      pdfFileName,
      pdfBase64,
      accessMode: "signup",
    });
  } catch (error) {
    console.error("[report-share] email delivery failed:", error);
    await recordActivity({
      admin,
      level: "error",
      action: "report.share.email_failed",
      actorUserId: senderProfile.id,
      orgId: sourceReport.org_id,
      entityType: "report",
      entityId: sourceReport.id,
      message: "Envoi email impossible.",
      metadata: {
        recipientEmail: normalizedRecipientEmail,
      },
    });
    return NextResponse.json(
      { error: "Envoi email impossible pour ce destinataire." },
      { status: 502 }
    );
  }

  const { error: emailedShareError } = await admin.from("report_shares").insert([
    {
      source_report_id: sourceReport.id,
      source_org_id: sourceReport.org_id,
      sender_id: senderProfile.id,
      recipient_email: normalizedRecipientEmail,
      status: "emailed",
      delivery: "email",
      payload: {
        report_title: sourceReport.title,
        source_student_name: sourceStudentName || null,
        sender_name: senderName,
      },
      decided_at: new Date().toISOString(),
    },
  ]);

  if (emailedShareError) {
    await recordActivity({
      admin,
      level: "error",
      action: "report.share.email_log_failed",
      actorUserId: senderProfile.id,
      orgId: sourceReport.org_id,
      entityType: "report",
      entityId: sourceReport.id,
      message: emailedShareError.message ?? "Enregistrement du partage impossible.",
      metadata: {
        recipientEmail: normalizedRecipientEmail,
      },
    });
    return NextResponse.json(
      { error: emailedShareError.message ?? "Enregistrement du partage impossible." },
      { status: 400 }
    );
  }

  await recordActivity({
    admin,
    action: "report.share.email",
    actorUserId: senderProfile.id,
    orgId: sourceReport.org_id,
    entityType: "report",
    entityId: sourceReport.id,
    message: "Rapport partage par email externe.",
    metadata: {
      recipientEmail: normalizedRecipientEmail,
    },
  });

  return NextResponse.json({
    ok: true,
    delivery: "email",
    message: "Email envoye avec le PDF du rapport.",
  });
}
