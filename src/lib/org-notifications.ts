"use server";

import Brevo from "@getbrevo/brevo";
import { env } from "@/env";
import type { SupabaseClient } from "@supabase/supabase-js";

type NotificationPayload = {
  orgId: string;
  userIds: string[];
  type: string;
  payload?: Record<string, unknown>;
  dedupeWindowMinutes?: number;
};

const shouldSkipEmail = async (
  admin: SupabaseClient,
  orgId: string,
  userId: string,
  type: string,
  windowMinutes: number
) => {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const { data } = await admin
    .from("org_notifications")
    .select("id, created_at")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .eq("type", type)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);
  return Boolean(data && data.length > 0);
};

const sendEmail = async (to: string, subject: string, content: string) => {
  const apiKey = env.BREVO_API_KEY;
  const senderEmail = env.BREVO_SENDER_EMAIL;
  const senderName = env.BREVO_SENDER_NAME;
  if (!apiKey || !senderEmail || !senderName) return;
  const apiInstance = new Brevo.TransactionalEmailsApi();
  apiInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, apiKey);
  await apiInstance.sendTransacEmail({
    sender: { email: senderEmail, name: senderName },
    to: [{ email: to }],
    subject,
    htmlContent: content,
  });
};

export const createOrgNotifications = async (
  admin: SupabaseClient,
  { orgId, userIds, type, payload = {}, dedupeWindowMinutes = 10 }: NotificationPayload
) => {
  const uniqueUserIds = Array.from(new Set(userIds));
  if (uniqueUserIds.length === 0) return;

  const insertPayload = uniqueUserIds.map((userId) => ({
    org_id: orgId,
    user_id: userId,
    type,
    payload,
  }));

  await admin.from("org_notifications").insert(insertPayload);

  for (const userId of uniqueUserIds) {
    const skip = await shouldSkipEmail(admin, orgId, userId, type, dedupeWindowMinutes);
    if (skip) continue;
    const { data } = await admin.auth.admin.getUserById(userId);
    const email = data?.user?.email;
    if (!email) continue;
    await sendEmail(
      email,
      "Nouvelle notification Golf Coaching",
      `<p>Une nouvelle notification est disponible dans votre espace.</p>`
    );
  }
};
