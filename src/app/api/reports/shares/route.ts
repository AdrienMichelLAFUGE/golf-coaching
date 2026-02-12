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
}) => {
  const senderName = escapeHtml(input.senderName);
  const reportTitle = escapeHtml(input.reportTitle);
  const studentName = escapeHtml(input.studentName);
  const viewFullReportUrl = escapeHtml(input.viewFullReportUrl);

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
      <p>Pour consulter le rapport complet (images, videos, graphiques/donnees), creez un compte SwingFlow avec cet email puis ouvrez l application :</p>
      <p><a href="${viewFullReportUrl}" target="_blank" rel="noopener noreferrer">${viewFullReportUrl}</a></p>
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
    .select("id, role, org_id, full_name")
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
    .select("title, type, content, content_formatted, media_urls, radar_file_id, position")
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
    return NextResponse.json(
      { error: "Une demande de partage est deja en attente pour cet email." },
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
        full_name: string | null;
      }
    | null = null;

  if (targetUserId) {
    const { data } = await admin
      .from("profiles")
      .select("id, role, org_id, full_name")
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

  if (
    targetProfile &&
    targetProfile.role !== "student" &&
    targetProfile.id !== senderProfile.id
  ) {
    const { error: shareInsertError } = await admin.from("report_shares").insert([
      {
        source_report_id: sourceReport.id,
        source_org_id: sourceReport.org_id,
        sender_id: senderProfile.id,
        recipient_email: normalizedRecipientEmail,
        recipient_user_id: targetProfile.id,
        recipient_org_id: targetProfile.org_id,
        status: "pending",
        delivery: "in_app",
        payload: {
          report_title: sourceReport.title,
          source_student_name: sourceStudentName || null,
          sender_name: senderName,
        },
      },
    ]);

    if (shareInsertError) {
      return NextResponse.json(
        { error: shareInsertError.message ?? "Creation de la demande impossible." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      delivery: "in_app",
      message: "Demande envoyee dans la cloche du coach.",
    });
  }

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
  const viewFullReportUrl = `${env.NEXT_PUBLIC_SITE_URL}/login`;

  try {
    await sendSharedReportEmail({
      to: normalizedRecipientEmail,
      senderName,
      reportTitle: sourceReport.title,
      studentName: sourceStudentName || "Eleve",
      viewFullReportUrl,
      pdfFileName,
      pdfBase64,
    });
  } catch (error) {
    console.error("[report-share] email delivery failed:", error);
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
    return NextResponse.json(
      { error: emailedShareError.message ?? "Enregistrement du partage impossible." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    delivery: "email",
    message: "Email envoye avec le PDF du rapport.",
  });
}
