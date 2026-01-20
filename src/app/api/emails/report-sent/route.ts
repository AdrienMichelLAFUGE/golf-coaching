import { NextResponse } from "next/server";
import Brevo from "@getbrevo/brevo";

type Payload = {
  to: string;
  studentName?: string;
  reportTitle?: string;
  reportUrl: string;
};

export async function POST(request: Request) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME;

  if (!apiKey || !senderEmail || !senderName) {
    return NextResponse.json(
      { error: "Missing Brevo env vars." },
      { status: 500 }
    );
  }

  const body = (await request.json()) as Payload;

  if (!body?.to || !body?.reportUrl) {
    return NextResponse.json(
      { error: "Missing required fields." },
      { status: 400 }
    );
  }

  const apiInstance = new Brevo.TransactionalEmailsApi();
  apiInstance.setApiKey(
    Brevo.TransactionalEmailsApiApiKeys.apiKey,
    apiKey
  );

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
