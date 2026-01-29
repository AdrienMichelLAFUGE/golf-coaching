import { NextResponse } from "next/server";
import { z } from "zod";
import Brevo from "@getbrevo/brevo";
import { env } from "@/env";
import { formatZodError, parseRequestJson } from "@/lib/validation";

const emailPayloadSchema = z.object({
  to: z.string().email(),
  studentName: z.string().optional(),
  reportTitle: z.string().optional(),
  reportUrl: z.string().url(),
});

export async function POST(request: Request) {
  const parsed = await parseRequestJson(request, emailPayloadSchema);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsed.error) },
      { status: 422 }
    );
  }
  const body = parsed.data;

  const apiKey = env.BREVO_API_KEY;
  const senderEmail = env.BREVO_SENDER_EMAIL;
  const senderName = env.BREVO_SENDER_NAME;

  const apiInstance = new Brevo.TransactionalEmailsApi();
  apiInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, apiKey);

  await apiInstance.sendTransacEmail({
    sender: { email: senderEmail, name: senderName },
    to: [{ email: body.to }],
    subject: `Votre rapport est pret${body.reportTitle ? `: ${body.reportTitle}` : ""}`,
    htmlContent: `
      <p>Bonjour ${body.studentName ?? ""},</p>
      <p>Votre rapport est pret :</p>
      <p><a href="${body.reportUrl}">Voir le rapport</a></p>
      <p>A bientot,</p>
      <p>${senderName}</p>
    `,
  });

  return NextResponse.json({ ok: true });
}
