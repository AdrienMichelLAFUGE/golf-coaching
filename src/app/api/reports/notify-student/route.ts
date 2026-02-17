import { NextResponse } from "next/server";
import Brevo from "@getbrevo/brevo";
import { z } from "zod";
import { env } from "@/env";
import { recordActivity } from "@/lib/activity-log";
import { buildSharedReportPdf } from "@/lib/report-share";
import {
  createSupabaseAdminClient,
  createSupabaseServerClientFromRequest,
} from "@/lib/supabase/server";
import { formatZodError, parseRequestJson } from "@/lib/validation";

export const runtime = "nodejs";

const notifyStudentSchema = z.object({
  reportId: z.string().uuid(),
  sendToLinkedParents: z.boolean().optional().default(false),
});

type StudentRef =
  | {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    }
  | {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    }[]
  | null;

const studentSchema = z.object({
  id: z.string().min(1),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  email: z.string().email().nullable(),
});

const reportRowSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  org_id: z.string().min(1),
  student_id: z.string().min(1).nullable(),
  sent_at: z.string().nullable(),
  report_date: z.string().nullable(),
  created_at: z.string().min(1),
  origin_share_id: z.string().nullable(),
  students: z.union([studentSchema, z.array(studentSchema), z.null()]),
});

const reportSectionRowSchema = z.object({
  title: z.string().nullable(),
  type: z.string().nullable(),
  content: z.string().nullable(),
  content_formatted: z.string().nullable(),
  media_urls: z.array(z.string()).nullable(),
  radar_file_id: z.string().nullable(),
  position: z.number().nullable(),
});

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

const buildStudentReportLoginUrl = (reportId: string) => {
  const baseUrl = env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  const reportPath = `/app/eleve/rapports/${reportId}`;
  return `${baseUrl}/login?next=${encodeURIComponent(reportPath)}`;
};

const sendStudentReportNotificationEmail = async (input: {
  to: string;
  recipientKind: "student" | "parent";
  studentName: string;
  coachName: string;
  reportTitle: string;
  reportUrl: string;
  pdfFileName: string;
  pdfBase64: string;
}) => {
  const reportUrl = escapeHtml(input.reportUrl);
  const studentName = escapeHtml(input.studentName);
  const coachName = escapeHtml(input.coachName);
  const reportTitle = escapeHtml(input.reportTitle);
  const greeting = input.recipientKind === "parent" ? "Bonjour," : `Bonjour ${studentName},`;
  const opening =
    input.recipientKind === "parent"
      ? `${coachName} a publie un nouveau rapport pour ${studentName} sur SwingFlow.`
      : `${coachName} a publie un nouveau rapport sur SwingFlow.`;

  const apiInstance = new Brevo.TransactionalEmailsApi();
  apiInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, env.BREVO_API_KEY);

  await apiInstance.sendTransacEmail({
    sender: { email: env.BREVO_SENDER_EMAIL, name: env.BREVO_SENDER_NAME },
    to: [{ email: input.to }],
    subject: `Nouveau rapport SwingFlow: ${input.reportTitle}`,
    htmlContent: `
      <p>${greeting}</p>
      <p>${opening}</p>
      <p>Le PDF est joint pour une lecture rapide. Pour consulter la version complete (media, graphiques, historique), connectez-vous a votre espace eleve :</p>
      <p style="margin: 24px 0;">
        <a
          href="${reportUrl}"
          target="_blank"
          rel="noopener noreferrer"
          style="display:inline-block;padding:12px 20px;border-radius:999px;background:#34d399;color:#0a0f14;text-decoration:none;font-weight:600;"
        >
          Voir mon rapport
        </a>
      </p>
      <p style="margin-top: 16px;">Rapport : <strong>${reportTitle}</strong></p>
      <p style="margin-top: 16px;">Si le bouton ne fonctionne pas, copiez ce lien :</p>
      <p><a href="${reportUrl}" target="_blank" rel="noopener noreferrer">${reportUrl}</a></p>
      <p>A bientot,</p>
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
  const parsed = await parseRequestJson(request, notifyStudentSchema);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }

  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;
  if (userError || !userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: senderProfile } = await admin
    .from("profiles")
    .select("id, role, org_id, active_workspace_id, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (!senderProfile || senderProfile.role === "student") {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const { data: report, error: reportError } = await supabase
    .from("reports")
    .select(
      "id, title, org_id, student_id, sent_at, report_date, created_at, origin_share_id, students(id, first_name, last_name, email)"
    )
    .eq("id", parsed.data.reportId)
    .maybeSingle();

  if (reportError || !report) {
    return NextResponse.json({ error: "Rapport introuvable." }, { status: 404 });
  }
  const parsedReport = reportRowSchema.safeParse(report);
  if (!parsedReport.success) {
    return NextResponse.json(
      {
        error: "Rapport invalide.",
        details: formatZodError(parsedReport.error),
      },
      { status: 500 }
    );
  }
  const reportRow = parsedReport.data;

  const activeOrgId = senderProfile.active_workspace_id ?? senderProfile.org_id;
  if (!activeOrgId || reportRow.org_id !== activeOrgId) {
    return NextResponse.json(
      {
        error:
          "Ce rapport a ete cree dans un autre workspace. Bascule sur ce workspace pour notifier l eleve.",
      },
      { status: 403 }
    );
  }

  if (!reportRow.sent_at) {
    return NextResponse.json(
      { error: "Publiez d abord le rapport avant d envoyer un email." },
      { status: 400 }
    );
  }

  if (reportRow.origin_share_id) {
    return NextResponse.json(
      { error: "Ce rapport partage est en lecture seule." },
      { status: 400 }
    );
  }

  if (!reportRow.student_id) {
    return NextResponse.json(
      { error: "Ce rapport n est pas associe a un eleve." },
      { status: 400 }
    );
  }

  const student = getStudentRef(reportRow.students as StudentRef);
  const studentEmail = student?.email?.trim().toLowerCase() ?? "";
  if (!studentEmail) {
    return NextResponse.json(
      { error: "Cet eleve n a pas d email." },
      { status: 400 }
    );
  }

  const studentName = [student?.first_name, student?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const coachName = senderProfile.full_name?.trim() || "Votre coach";
  const sendToLinkedParents = parsed.data.sendToLinkedParents;

  const { data: sectionsData, error: sectionsError } = await supabase
    .from("report_sections")
    .select("title, type, content, content_formatted, media_urls, radar_file_id, position")
    .eq("report_id", reportRow.id)
    .order("position", { ascending: true });

  if (sectionsError) {
    return NextResponse.json(
      { error: sectionsError.message ?? "Chargement des sections impossible." },
      { status: 400 }
    );
  }
  const parsedSections = z
    .array(reportSectionRowSchema)
    .safeParse(sectionsData ?? []);
  if (!parsedSections.success) {
    return NextResponse.json(
      {
        error: "Sections invalides.",
        details: formatZodError(parsedSections.error),
      },
      { status: 500 }
    );
  }

  const sectionsForPdf = parsedSections.data.map((section) => ({
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

  const reportDate = reportRow.report_date ?? reportRow.created_at.slice(0, 10);
  const pdfBuffer = buildSharedReportPdf({
    title: reportRow.title,
    reportDate,
    studentName: studentName || "Eleve",
    sections: sectionsForPdf,
  });

  const safeBaseName = reportRow.title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  const pdfFileName = `${safeBaseName || "rapport-swingflow"}.pdf`;
  const reportUrl = buildStudentReportLoginUrl(reportRow.id);
  let parentRecipients: string[] = [];

  if (sendToLinkedParents) {
    const { data: parentsData, error: parentsError } = await admin
      .from("parent_child_links")
      .select("parent_email")
      .eq("student_id", reportRow.student_id);

    if (parentsError) {
      return NextResponse.json(
        { error: "Chargement des parents rattaches impossible." },
        { status: 400 }
      );
    }

    parentRecipients = Array.from(
      new Set(
        ((parentsData ?? []) as Array<{ parent_email: string | null }>)
          .map((row) => row.parent_email?.trim().toLowerCase() ?? "")
          .filter((email) => Boolean(email) && email !== studentEmail)
      )
    );
  }

  const recipients = [
    { email: studentEmail, recipientKind: "student" as const },
    ...parentRecipients.map((email) => ({
      email,
      recipientKind: "parent" as const,
    })),
  ];

  try {
    for (const recipient of recipients) {
      await sendStudentReportNotificationEmail({
        to: recipient.email,
        recipientKind: recipient.recipientKind,
        studentName: studentName || "Eleve",
        coachName,
        reportTitle: reportRow.title,
        reportUrl,
        pdfFileName,
        pdfBase64: pdfBuffer.toString("base64"),
      });
    }
  } catch (error) {
    await recordActivity({
      admin,
      level: "error",
      action: "report.notify_student.failed",
      actorUserId: userId,
      orgId: reportRow.org_id,
      entityType: "report",
      entityId: reportRow.id,
      message: "Notification eleve impossible.",
      metadata: {
        studentId: reportRow.student_id,
        studentEmail,
        parentRecipientsCount: parentRecipients.length,
        reason: error instanceof Error ? error.message : String(error),
      },
    });
    return NextResponse.json({ error: "Envoi email impossible." }, { status: 502 });
  }

  await recordActivity({
    admin,
    action: "report.notify_student.sent",
    actorUserId: userId,
    orgId: reportRow.org_id,
    entityType: "report",
    entityId: reportRow.id,
    message: "Notification rapport envoyee a l eleve.",
    metadata: {
      studentId: reportRow.student_id,
      studentEmail,
      parentRecipientsCount: parentRecipients.length,
      recipientsCount: recipients.length,
    },
  });

  const recipientsLabel =
    parentRecipients.length > 0
      ? `${studentEmail} + ${parentRecipients.length} parent(s)`
      : studentEmail;

  return NextResponse.json({
    ok: true,
    message: `Notification envoyee a ${recipientsLabel}.`,
    recipientsCount: recipients.length,
    parentRecipientsCount: parentRecipients.length,
  });
}
